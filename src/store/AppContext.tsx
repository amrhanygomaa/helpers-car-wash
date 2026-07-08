import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AuditAction,
  AuditLog,
  AuditSnapshot,
  CashEntry,
  Customer,
  Product,
  PurchaseInvoice,
  Quotation,
  SalesInvoice,
  Settings,
  Stocktake,
  StocktakeItem,
  StockMovement,
  Supplier,
  AppUser,
  SalesReturn,
  PurchaseReturn,
  Driver,
  CommissionTier,
  CommissionType,
  LicenseStatus,
  ID,
  InvoiceLine,
  LoginResult,
  Vehicle,
  WashService,
  QueueTicket,
  QueueStatus,
  DiscountCode,
} from "../types";
import { lsClearAll, lsGet, lsRemove, lsSet, lsSetBatch, reloadStorageCache } from "../lib/storage";
import { hashPassword, verifyFallbackPassword } from "../lib/auth";
import { normalizeUser } from "../lib/permissions";
import { FEATURES, isAllowedByLicense } from "../lib/features";
import { formatSupplierCode, nextSupplierCodeFromExisting } from "../lib/codes";
import {
  seedCashEntries,
  seedCustomers,
  seedProducts,
  seedPurchaseInvoices,
  seedSalesInvoices,
  seedSettings,
  seedStockMovements,
  seedSuppliers,
  seedUsers,
  seedWashServices,
  seedDiscountCodes,
} from "../data/seed";
import { localISODate, todayISO, uid } from "../lib/utils";
import { buildXlsx } from "../lib/xlsx";
import { isAutoBackupDue, backupFileName } from "../lib/backupSchedule";
import {
  computeStatus,
  applyPieceDeduction,
  applyPieceAddition,
  settleSalesInvoiceReturn,
  settlePurchaseInvoiceReturn,
  quotationConversionFields,
  employeeCollectedCash,
  computeLoyaltyEarned,
} from "./_pure";
import { SettingsContext } from "./SettingsContext";
import { AuditLogContext } from "./AuditLogContext";
import { AuthContext, type AuthState, type UpdateCurrentUserProfileResult } from "./AuthContext";
import { CatalogContext } from "./CatalogContext";
import { CarwashContext } from "./CarwashContext";
import { InvoicingContext } from "./InvoicingContext";
import { ReportingContext } from "./ReportingContext";
import { UsersContext } from "./UsersContext";

interface AppState {
  auth: AuthState;
  licenseStatus: LicenseStatus | null;
  isDesktop: boolean;
  ownerExists: boolean;
  ownerCheckPending: boolean;
  settings: Settings;
  products: Product[];
  suppliers: Supplier[];
  customers: Customer[];
  purchaseInvoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
  stockMovements: StockMovement[];
  cashEntries: CashEntry[];
  nextProductCode: number;
  nextSupplierCode: number;
  nextCustomerCode: number;
  users: AppUser[];
  currentUser: AppUser | null;
  salesReturns: SalesReturn[];
  purchaseReturns: PurchaseReturn[];
  drivers: Driver[];
  auditLogs: AuditLog[];
  quotations: Quotation[];
  stocktakes: Stocktake[];
  discountCodes: DiscountCode[];
}

interface AppActions {
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  refreshLicenseStatus: () => Promise<LicenseStatus | null>;
  activateLicense: (serial: string) => Promise<{ ok: boolean; status: LicenseStatus }>;
  createOwner: (username: string, password: string) => Promise<boolean>;
  resetDemo: () => void;
  updateSettings: (patch: Partial<Settings>) => void;

  // Users
  addUser: (u: Omit<AppUser, "id" | "createdAt">) => AppUser;
  updateUser: (id: string, patch: Partial<AppUser>) => void;
  updateCurrentUserProfile: (patch: {
    name: string;
    currentPassword?: string;
    newPassword?: string;
  }) => Promise<UpdateCurrentUserProfileResult>;
  deleteUser: (id: string) => boolean;

  // Products
  addProduct: (p: Omit<Product, "id" | "createdAt">) => Product;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  deleteProduct: (id: string) => boolean;
  adjustStock: (
    productId: string,
    delta: number,
    reason: string,
    looseDelta?: number
  ) => void;

  // Suppliers
  addSupplier: (s: Omit<Supplier, "id" | "createdAt">) => Supplier;
  updateSupplier: (id: string, patch: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => boolean;
  addCommissionTier: (supplierId: string, tier: Omit<CommissionTier, "id">) => void;
  updateCommissionTier: (supplierId: string, tierId: string, patch: Partial<CommissionTier>) => void;
  deleteCommissionTier: (supplierId: string, tierId: string) => void;

  // Customers
  addCustomer: (c: Omit<Customer, "id" | "createdAt">) => Customer;
  updateCustomer: (id: string, patch: Partial<Customer>) => void;
  deleteCustomer: (id: string) => boolean;

  // Drivers
  addDriver: (d: Omit<Driver, "id" | "createdAt">) => Driver;
  updateDriver: (id: string, patch: Partial<Driver>) => void;
  deleteDriver: (id: string) => boolean;

  // Purchase invoices
  addPurchaseInvoice: (
    inv: Omit<PurchaseInvoice, "id" | "createdAt" | "status" | "remaining">
  ) => PurchaseInvoice;
  updatePurchaseInvoice: (
    id: string,
    patch: { lines: InvoiceLine[]; date: string; notes?: string }
  ) => void;
  recordPurchasePayment: (id: string, amount: number, paymentMethod?: import("../types").PaymentMethod, notes?: string) => void;
  deletePurchaseInvoice: (id: string) => boolean;

  // Sales invoices
  addSalesInvoice: (
    inv: Omit<SalesInvoice, "id" | "createdAt" | "status" | "remaining">
  ) => SalesInvoice;
  updateSalesInvoice: (
    id: string,
    patch: Omit<SalesInvoice, "id" | "createdAt" | "customerId" | "customerName" | "status" | "remaining">
  ) => void;
  recordSalesReceipt: (id: string, amount: number, paymentMethod?: import("../types").PaymentMethod, notes?: string) => void;
  cancelSalesInvoice: (id: string, refundMode?: "cash" | "credit") => void;
  deleteSalesInvoice: (id: string) => boolean;
  applyCustomerCredit: (customerId: string, invoiceId: string, amount: number) => void;
  settleAllDues: (customerId: ID) => number;
  settleSupplierDues: (supplierId: string) => number;

  // Returns
  addSalesReturn: (
    r: Omit<SalesReturn, "id" | "createdAt" | "returnNumber">
  ) => SalesReturn;
  addPurchaseReturn: (
    r: Omit<PurchaseReturn, "id" | "createdAt" | "returnNumber">
  ) => PurchaseReturn;

  // Stocktakes
  addStocktake: (s: Omit<Stocktake, "id" | "createdAt" | "status">) => Stocktake;
  updateStocktakeItems: (stocktakeId: string, items: StocktakeItem[]) => void;
  applyStocktake: (stocktakeId: string) => void;
  deleteStocktake: (stocktakeId: string) => void;

  // Quotations
  addQuotation: (q: Omit<Quotation, "id" | "createdAt" | "status">) => Quotation;
  updateQuotation: (id: string, patch: Pick<import("../types").Quotation, "date" | "validUntil" | "customerId" | "customerName" | "lines" | "total" | "discount" | "notes">) => void;
  convertQuotation: (
    quotationId: string,
    opts: {
      invoiceNumber: string;
      date: string;
      paymentType: import("../types").SalesPaymentType;
      priceType: import("../types").SalesPriceType;
      amountReceived: number;
      paymentDueDate?: string;
      driverId?: string;
      driverName?: string;
    }
  ) => SalesInvoice;
  deleteQuotation: (id: string) => void;

  // Cashbox
  addCashEntry: (
    entry: Omit<CashEntry, "id"> & { id?: string }
  ) => CashEntry;

  // Audit-log restore
  restoreDeletedInvoice: (auditId: string) => boolean;

  // Derived
  currentCashBalance: () => number;
  customerBalance: (customerId: string) => number;
  customerCredit: (customerId: string) => number;
  supplierBalance: (supplierId: string) => number;
  supplierCredit: (supplierId: string) => number;
  calculateSupplierCommission: (supplierId: string) => {
    tierId: string;
    threshold: number;
    periodDays: number;
    totalPurchases: number;
    earned: number;
    commissionType: CommissionType;
    commissionValue: number;
  }[];
  employeeSalesStats: (userId: ID, month: string) => {
    totalCollected: number;
    commissionEarned: number;
    commissionPct: number;
    target: number;
    salary: number;
    totalEarnings: number;
    monthLabel: string;
  };

  // Backup & Import
  exportBackup: () => void;
  importBackup: (file: File) => Promise<boolean>;
  backupToPath: (dirOverride?: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  exportToExcel: (dataType: "products" | "customers" | "suppliers" | "sales" | "purchases" | "stock" | "supplierDues" | "commissions") => void;
}

type AppContextValue = AppState & AppActions;

const AppContext = createContext<AppContextValue | null>(null);

function monthsBetween(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  // Calendar months, rounded to the nearest month by day-of-month — a
  // 12-calendar-month license shows exactly 12 (the old ÷30-days approximation
  // drifted on long subscriptions).
  let months =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth());
  const dayDelta = endDate.getDate() - startDate.getDate();
  if (dayDelta < -15) months -= 1;
  else if (dayDelta > 15) months += 1;
  return Math.max(0, months);
}

function applyLicenseSettings(settings: Settings, status: LicenseStatus | null): Settings {
  if (!status?.license) return settings;
  const license = status.license;
  return {
    ...settings,
    subscriptionType: license.subscriptionType,
    subscriptionStartDate: license.subscriptionStartDate?.slice(0, 10) || settings.subscriptionStartDate,
    subscriptionMonths:
      license.subscriptionType === "limited"
        ? monthsBetween(license.subscriptionStartDate, license.subscriptionExpiresAt)
        : 0,
    warrantyType: license.warrantyExpiresAt ? "limited" : "none",
    warrantyStartDate: license.warrantyStartDate?.slice(0, 10) || "",
    warrantyMonths: monthsBetween(license.warrantyStartDate, license.warrantyExpiresAt),
  };
}

function redactUserPasswordHashes(users: AppUser[]): AppUser[] {
  return users.map(({ passwordHash: _passwordHash, ...user }) => ({
    ...user,
    passwordHash: "[REDACTED]",
  }));
}

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 60 * 1000;
const fallbackLoginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function loginAttemptKey(username: string) {
  return username.trim().toLowerCase();
}

function getRateLimitResult(key: string): LoginResult | null {
  const now = Date.now();
  const entry = fallbackLoginAttempts.get(key);
  if (!entry) return null;
  if (entry.lockedUntil > now) {
    return {
      ok: false,
      error: "rate_limited",
      remainSeconds: Math.ceil((entry.lockedUntil - now) / 1000),
      attemptsRemaining: 0,
    };
  }
  if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
    fallbackLoginAttempts.delete(key);
  }
  return null;
}

function registerFailedLogin(key: string): LoginResult {
  const rateLimited = getRateLimitResult(key);
  if (rateLimited) return rateLimited;

  const current = fallbackLoginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  current.count += 1;
  if (current.count >= LOGIN_MAX_ATTEMPTS) {
    current.count = 0;
    current.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    fallbackLoginAttempts.set(key, current);
    return {
      ok: false,
      error: "rate_limited",
      remainSeconds: Math.ceil(LOGIN_LOCKOUT_MS / 1000),
      attemptsRemaining: 0,
    };
  }

  fallbackLoginAttempts.set(key, current);
  return {
    ok: false,
    error: "invalid_credentials",
    attemptsRemaining: Math.max(0, LOGIN_MAX_ATTEMPTS - current.count),
  };
}

type LegacyProduct = Omit<Product, "wholesalePrice" | "retailPrice"> &
  Partial<Pick<Product, "wholesalePrice" | "retailPrice">> & {
    sellingPrice?: number;
  };

// Merges feature keys and forces car-wash core features to their seed values.
// Handles two cases: (a) pre-carwash installs that never had these keys, and
// (b) old installs that had them explicitly as false from the warehouse defaults.
function normalizeSettings(s: Settings): Settings {
  const carwashOverrides = {
    carwashQueue: seedSettings.features?.carwashQueue ?? true,
    vehicles: seedSettings.features?.vehicles ?? true,
    washServices: seedSettings.features?.washServices ?? true,
  };
  const legacyWarehouseOverrides = {
    products: false,
    inventory: false,
    stocktakes: false,
    dues: false,
    alerts: false,
  };
  const merged = {
    ...seedSettings.features,
    ...(s.features ?? {}),
    ...carwashOverrides, // always take seed values for car-wash keys
    ...legacyWarehouseOverrides, // Top Gear should not feel like a warehouse system
  };
  return { ...seedSettings, ...s, features: merged };
}

const legacySeedWashServiceIds = new Set([
  "seed-svc-ext",
  "seed-svc-full",
  "seed-svc-deep",
  "seed-svc-polish",
  "seed-svc-fresh",
  "seed-svc-engine",
]);

function normalizeWashServices(list: WashService[]): WashService[] {
  if (!Array.isArray(list) || list.length === 0) return seedWashServices;

  const looksLikeOldDemoCatalog =
    list.length <= legacySeedWashServiceIds.size &&
    list.every((service) => legacySeedWashServiceIds.has(service.id));
  if (looksLikeOldDemoCatalog) return seedWashServices;

  const existingIds = new Set(list.map((service) => service.id));
  const existingNames = new Set(list.map((service) => service.name.trim()));
  const normalized: WashService[] = list.map((service) => {
    const category: WashService["category"] =
      service.category === "chemical" ? "chemical" : service.category === "extra" ? "extra" : "wash";
    return {
      ...service,
      category,
      hasCommission: service.hasCommission ?? category !== "wash",
      pricingMode: service.pricingMode ?? "variable",
      defaultPrice: Number.isFinite(service.defaultPrice) ? service.defaultPrice : 0,
      active: service.active ?? true,
    };
  });

  for (const seed of seedWashServices) {
    if (existingIds.has(seed.id) || existingNames.has(seed.name.trim())) continue;
    normalized.push(seed);
  }

  // Backfill codes for services that don't have one yet.
  let maxCode = normalized.reduce((max, svc) => {
    const m = svc.code?.match(/^SVC-(\d+)$/);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  for (const svc of normalized) {
    if (!svc.code) {
      maxCode++;
      svc.code = `SVC-${String(maxCode).padStart(3, "0")}`;
    }
  }

  return normalized.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
}

function normalizeQueueStatus(status: QueueStatus | "washing" | "completed" | string | undefined): QueueStatus {
  if (status === "washing") return "in_progress";
  if (status === "completed") return "done";
  if (
    status === "waiting" ||
    status === "in_progress" ||
    status === "done" ||
    status === "delivered" ||
    status === "cancelled"
  ) {
    return status;
  }
  return "waiting";
}

function dateFromTicket(ticket: Partial<QueueTicket>): string {
  if (typeof ticket.businessDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ticket.businessDate)) {
    return ticket.businessDate;
  }
  const raw = ticket.arrivalTime ?? ticket.createdAt;
  if (typeof raw === "string") {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return localISODate(d);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  }
  return todayISO();
}

function isQueueActive(status: QueueStatus): boolean {
  return status === "waiting" || status === "in_progress";
}

function queuePosition(ticket: QueueTicket): number {
  return ticket.queuePosition ?? ticket.number;
}

function compactQueuePositions(list: QueueTicket[]): QueueTicket[] {
  const active = [...list]
    .filter((ticket) => isQueueActive(ticket.status))
    .sort((a, b) => queuePosition(a) - queuePosition(b) || a.number - b.number);
  const positionById = new Map(active.map((ticket, index) => [ticket.id, index + 1]));
  return list.map((ticket) => {
    const position = positionById.get(ticket.id);
    return position ? { ...ticket, queuePosition: position } : { ...ticket, queuePosition: undefined };
  });
}

function normalizeQueueTickets(list: QueueTicket[]): QueueTicket[] {
  if (!Array.isArray(list)) return [];
  const normalized = list.map((ticket) => {
    const status = normalizeQueueStatus(ticket.status);
    const businessDate = dateFromTicket(ticket);
    const note = ticket.note ?? ticket.delayNote;
    return {
      ...ticket,
      number: Number.isFinite(ticket.number) ? ticket.number : 0,
      status,
      businessDate,
      serviceIds: Array.isArray(ticket.serviceIds) ? ticket.serviceIds : [],
      serviceNames: Array.isArray(ticket.serviceNames) ? ticket.serviceNames : [],
      keyReceived: ticket.keyReceived ?? Boolean(ticket.keyReceivedAt),
      note,
      delayNote: ticket.delayNote ?? note,
      arrivalTime: ticket.arrivalTime || ticket.createdAt || new Date().toISOString(),
      createdAt: ticket.createdAt || ticket.arrivalTime || new Date().toISOString(),
    };
  });
  return compactQueuePositions(normalized);
}

function nextDailyQueueNumber(list: QueueTicket[], businessDate = todayISO()): number {
  const max = list.reduce((current, ticket) => {
    if (dateFromTicket(ticket) !== businessDate) return current;
    return Math.max(current, ticket.number);
  }, 0);
  return max + 1;
}

function nextActiveQueuePosition(list: QueueTicket[]): number {
  const max = list.reduce((current, ticket) => {
    if (!isQueueActive(ticket.status)) return current;
    return Math.max(current, queuePosition(ticket));
  }, 0);
  return max + 1;
}

// If the ticket has a requested pickup time, suggest inserting it early enough
// so it is likely done before that time. Uses 30 min/car estimate. Returns 1
// (front) when pickup is already past or very soon. Falls back to end-of-queue
// when no pickup time is given.
function pickupAwareQueuePosition(list: QueueTicket[], requestedPickupAt?: string): number {
  const active = [...list]
    .filter((t) => isQueueActive(t.status))
    .sort((a, b) => queuePosition(a) - queuePosition(b) || a.number - b.number);
  const endPos = active.length + 1;
  if (!requestedPickupAt) return endPos;
  const pickupMs = new Date(requestedPickupAt).getTime();
  if (Number.isNaN(pickupMs)) return endPos;
  const remainingMs = pickupMs - Date.now();
  if (remainingMs <= 0) return 1;
  const AVG_MS_PER_CAR = 30 * 60 * 1000;
  // We need (carsAhead + 1) * avgTime <= remainingMs
  // => carsAhead <= remainingMs/avgTime - 1
  const maxCarsAhead = Math.max(0, Math.floor(remainingMs / AVG_MS_PER_CAR) - 1);
  return Math.min(maxCarsAhead + 1, endPos);
}

function normalizeProduct(product: LegacyProduct): Product {
  const wholesalePrice = product.wholesalePrice ?? product.sellingPrice ?? 0;
  const retailPrice =
    product.retailPrice ?? Math.round(wholesalePrice * 1.12 * 100) / 100;
  const {
    sellingPrice: _legacySellingPrice,
    wholesalePrice: _wholesalePrice,
    retailPrice: _retailPrice,
    ...rest
  } = product;
  void _legacySellingPrice;
  void _wholesalePrice;
  void _retailPrice;
  return {
    ...rest,
    wholesalePrice,
    retailPrice,
  };
}

type LegacySalesInvoice = Omit<SalesInvoice, "priceType"> &
  Partial<Pick<SalesInvoice, "priceType">>;

function normalizeSalesInvoice(invoice: LegacySalesInvoice): SalesInvoice {
  return {
    ...invoice,
    priceType: invoice.priceType === "retail" ? "retail" : "wholesale",
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const isDesktop = Boolean(window.desktopAPI);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(
    () =>
      isDesktop
        ? null
        : {
          state: "active",
          machineCode: "WEB-DEVELOPMENT",
          machineHash: "WEB-DEVELOPMENT",
        }
  );
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false });
  const [isLocked, setIsLocked] = useState(false);
  const [desktopOwnerExists, setDesktopOwnerExists] = useState<boolean | null>(
    () => (isDesktop ? null : false)
  );
  const [settings, setSettings] = useState<Settings>(() =>
    normalizeSettings(lsGet<Settings>("settings", seedSettings))
  );
  const [products, setProducts] = useState<Product[]>(() =>
    lsGet<LegacyProduct[]>("products", seedProducts).map(normalizeProduct)
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>(() =>
    lsGet<Supplier[]>("suppliers", seedSuppliers)
  );
  const [customers, setCustomers] = useState<Customer[]>(() =>
    lsGet<Customer[]>("customers", seedCustomers)
  );
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>(
    () => lsGet<PurchaseInvoice[]>("purchaseInvoices", seedPurchaseInvoices)
  );
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>(() =>
    lsGet<LegacySalesInvoice[]>("salesInvoices", seedSalesInvoices).map(
      normalizeSalesInvoice
    )
  );
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() =>
    lsGet<StockMovement[]>("stockMovements", seedStockMovements)
  );
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(() =>
    lsGet<CashEntry[]>("cashEntries", seedCashEntries)
  );
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>(() =>
    lsGet<DiscountCode[]>("discountCodes", seedDiscountCodes)
  );
  const [nextProductCode, setNextProductCode] = useState<number>(() =>
    lsGet<number>("nextProductCode", 1000)
  );
  const [nextSupplierCode, setNextSupplierCode] = useState<number>(() => {
    const storedSuppliers = lsGet<Supplier[]>("suppliers", seedSuppliers);
    return Math.max(
      lsGet<number>("nextSupplierCode", 1),
      nextSupplierCodeFromExisting(storedSuppliers)
    );
  });
  const [nextCustomerCode, setNextCustomerCode] = useState<number>(() =>
    lsGet<number>("nextCustomerCode", 1)
  );
  const [users, setUsers] = useState<AppUser[]>(() =>
    lsGet<AppUser[]>("users", seedUsers).map(normalizeUser)
  );
  const [salesReturns, setSalesReturns] = useState<SalesReturn[]>(() =>
    lsGet<SalesReturn[]>("salesReturns", [])
  );
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>(() =>
    lsGet<PurchaseReturn[]>("purchaseReturns", [])
  );
  const [drivers, setDrivers] = useState<Driver[]>(() => lsGet("drivers", []));
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => lsGet<AuditLog[]>("auditLogs", []));
  const [quotations, setQuotations] = useState<Quotation[]>(() => lsGet<Quotation[]>("quotations", []));
  const [stocktakes, setStocktakes] = useState<Stocktake[]>(() => lsGet<Stocktake[]>("stocktakes", []));
  // ── Car Wash collections ──
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => lsGet<Vehicle[]>("vehicles", []));
  const [washServices, setWashServices] = useState<WashService[]>(() =>
    normalizeWashServices(lsGet<WashService[]>("washServices", seedWashServices))
  );
  const [queueTickets, setQueueTickets] = useState<QueueTicket[]>(() =>
    normalizeQueueTickets(lsGet<QueueTicket[]>("queueTickets", []))
  );
  const [nextQueueNumber, setNextQueueNumber] = useState<number>(() => {
    const tickets = normalizeQueueTickets(lsGet<QueueTicket[]>("queueTickets", []));
    return nextDailyQueueNumber(tickets);
  });
  const currentUserRef = useRef<AppUser | null>(null);
  // BUG-01: code counters mirrored in refs so several add* calls inside ONE
  // event handler (CSV bulk import) each get a distinct code — the state value
  // alone is frozen for the whole render. Synced back whenever state changes
  // externally (login load, backup import, demo reset).
  const nextProductCodeRef = useRef(nextProductCode);
  const nextSupplierCodeRef = useRef(nextSupplierCode);
  const nextCustomerCodeRef = useRef(nextCustomerCode);
  const nextQueueNumberRef = useRef(nextQueueNumber);
  useEffect(() => {
    nextProductCodeRef.current = nextProductCode;
  }, [nextProductCode]);
  useEffect(() => {
    nextSupplierCodeRef.current = nextSupplierCode;
  }, [nextSupplierCode]);
  useEffect(() => {
    nextCustomerCodeRef.current = nextCustomerCode;
  }, [nextCustomerCode]);
  useEffect(() => {
    nextQueueNumberRef.current = nextQueueNumber;
  }, [nextQueueNumber]);

  const logAudit = useCallback((action: AuditAction, entityLabel: string, details?: string, snapshot?: AuditSnapshot) => {
    const user = currentUserRef.current;
    if (!user) return;
    const entry: AuditLog = {
      id: uid("audit"),
      action,
      entityLabel,
      userId: user.id,
      userName: user.name,
      timestamp: new Date().toISOString(),
      details,
      snapshot,
    };
    setAuditLogs((list) => [entry, ...list].slice(0, 1000));
  }, []);

  const loadStoredStateFromDesktop = useCallback(() => {
    const storedSettings = normalizeSettings(lsGet<Settings>("settings", seedSettings));
    setSettings(applyLicenseSettings(storedSettings, licenseStatus));
    setProducts(lsGet<LegacyProduct[]>("products", seedProducts).map(normalizeProduct));
    const storedSuppliers = lsGet<Supplier[]>("suppliers", seedSuppliers);
    setSuppliers(storedSuppliers);
    setCustomers(lsGet<Customer[]>("customers", seedCustomers));
    setPurchaseInvoices(lsGet<PurchaseInvoice[]>("purchaseInvoices", seedPurchaseInvoices));
    setSalesInvoices(
      lsGet<LegacySalesInvoice[]>("salesInvoices", seedSalesInvoices).map(
        normalizeSalesInvoice
      )
    );
    setStockMovements(lsGet<StockMovement[]>("stockMovements", seedStockMovements));
    setCashEntries(lsGet<CashEntry[]>("cashEntries", seedCashEntries));
    setDiscountCodes(lsGet<DiscountCode[]>("discountCodes", seedDiscountCodes));
    setNextProductCode(lsGet<number>("nextProductCode", 1000));
    setNextSupplierCode(
      Math.max(
        lsGet<number>("nextSupplierCode", 1),
        nextSupplierCodeFromExisting(storedSuppliers)
      )
    );
    setNextCustomerCode(lsGet<number>("nextCustomerCode", 1));
    setUsers(lsGet<AppUser[]>("users", []).map(normalizeUser));
    setSalesReturns(lsGet<SalesReturn[]>("salesReturns", []));
    setPurchaseReturns(lsGet<PurchaseReturn[]>("purchaseReturns", []));
    setDrivers(lsGet<Driver[]>("drivers", []));
    setAuditLogs(lsGet<AuditLog[]>("auditLogs", []));
    setQuotations(lsGet<Quotation[]>("quotations", []));
    setStocktakes(lsGet<Stocktake[]>("stocktakes", []));
    setVehicles(lsGet<Vehicle[]>("vehicles", []));
    setWashServices(normalizeWashServices(lsGet<WashService[]>("washServices", seedWashServices)));
    const tickets = normalizeQueueTickets(lsGet<QueueTicket[]>("queueTickets", []));
    setQueueTickets(tickets);
    setNextQueueNumber(nextDailyQueueNumber(tickets));
  }, [licenseStatus]);

  const clearDesktopRendererState = useCallback(() => {
    setSettings(applyLicenseSettings(seedSettings, licenseStatus));
    setProducts(seedProducts.map(normalizeProduct));
    setSuppliers(seedSuppliers);
    setCustomers(seedCustomers);
    setPurchaseInvoices(seedPurchaseInvoices);
    setSalesInvoices(seedSalesInvoices.map(normalizeSalesInvoice));
    setStockMovements(seedStockMovements);
    setCashEntries(seedCashEntries);
    setDiscountCodes(seedDiscountCodes);
    setNextProductCode(1000);
    setNextSupplierCode(nextSupplierCodeFromExisting(seedSuppliers));
    setNextCustomerCode(1);
    setUsers([]);
    setSalesReturns([]);
    setPurchaseReturns([]);
    setDrivers([]);
    setAuditLogs([]);
    setQuotations([]);
    setStocktakes([]);
    setVehicles([]);
    setWashServices([]);
    setQueueTickets([]);
    setNextQueueNumber(1);
  }, [licenseStatus]);

  const refreshLicenseStatus = useCallback(async () => {
    if (!window.desktopAPI?.license) return null;
    const status = await window.desktopAPI.license.getStatus();
    setLicenseStatus(status);
    setSettings((current) => applyLicenseSettings(current, status));
    return status;
  }, []);

  useEffect(() => {
    if (!window.desktopAPI?.license) return;
    void refreshLicenseStatus();
    const timer = window.setInterval(() => {
      void refreshLicenseStatus();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [refreshLicenseStatus]);

  useEffect(() => {
    if (!window.desktopAPI?.setup) return;
    let cancelled = false;
    void window.desktopAPI.setup
      .hasOwner()
      .then((exists) => {
        if (!cancelled) setDesktopOwnerExists(exists);
      })
      .catch(() => {
        if (!cancelled) setDesktopOwnerExists(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep a ref to the latest state so the auto-backup timer can read it without
  // being listed as a dependency (avoids re-scheduling the interval on every change).
  const liveStateRef = useRef({
    settings, products, suppliers, customers, purchaseInvoices, salesInvoices,
    stockMovements, cashEntries, discountCodes, nextProductCode, nextSupplierCode, nextCustomerCode, users,
    salesReturns, purchaseReturns, drivers, auditLogs, quotations, stocktakes,
    vehicles, washServices, queueTickets, nextQueueNumber,
  });
  // True while state has changed but the 2s-debounced flush hasn't run yet —
  // lets the shutdown handler skip its synchronous full-state write when
  // everything is already persisted.
  const unflushedChangesRef = useRef(false);
  useEffect(() => {
    liveStateRef.current = {
      settings, products, suppliers, customers, purchaseInvoices, salesInvoices,
      stockMovements, cashEntries, discountCodes, nextProductCode, nextSupplierCode, nextCustomerCode, users,
      salesReturns, purchaseReturns, drivers, auditLogs, quotations, stocktakes,
      vehicles, washServices, queueTickets, nextQueueNumber,
    };
    unflushedChangesRef.current = true;
  }, [settings, products, suppliers, customers, purchaseInvoices, salesInvoices, stockMovements, cashEntries, discountCodes, nextProductCode, nextSupplierCode, nextCustomerCode, users, salesReturns, purchaseReturns, drivers, auditLogs, quotations, stocktakes, vehicles, washServices, queueTickets, nextQueueNumber]);

  // --- Auto Backup Logic (timer-based — never blocks on state changes) ---
  useEffect(() => {
    if (!settings.autoBackupEnabled) return;

    function checkAndBackup() {
      // Only back up while authenticated — otherwise we'd snapshot the empty
      // pre-login seed and stamp lastBackupDate against it.
      if (isDesktop && !currentUserRef.current) return;
      const s = liveStateRef.current;
      if (!s.settings.autoBackupEnabled) return;

      const now = new Date();
      const lastBackup = s.settings.lastBackupDate;
      let shouldBackup = false;
      if (!lastBackup) {
        shouldBackup = true;
      } else {
        const diffDays = (now.getTime() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24);
        if (s.settings.autoBackupFrequency === "daily" && diffDays >= 1) shouldBackup = true;
        if (s.settings.autoBackupFrequency === "weekly" && diffDays >= 7) shouldBackup = true;
        if (s.settings.autoBackupFrequency === "monthly" && diffDays >= 30) shouldBackup = true;
      }

      if (shouldBackup) {
        const safeUsers = redactUserPasswordHashes(s.users);
        const data = {
          version: "1.0",
          timestamp: now.toISOString(),
          state: { ...s, users: safeUsers },
        };
        lsSet("inventory_auto_backup_internal", data);
        setSettings((current) => ({ ...current, lastBackupDate: now.toISOString() }));
      }
    }

    checkAndBackup(); // run once immediately on mount / when enabled
    const timer = window.setInterval(checkAndBackup, 30 * 60 * 1000); // then every 30 min
    return () => window.clearInterval(timer);
  }, [settings.autoBackupEnabled, isDesktop]); // isDesktop is constant at runtime; effectively re-schedules only when the user toggles the setting

  // Session backup — uses liveStateRef so the handler always reads current
  // state without needing to re-register on every state change.
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Everything already flushed by the debounced batch write — skip the
      // synchronous full-state serialization so shutdown stays instant.
      if (!unflushedChangesRef.current) return;
      try {
        const s = liveStateRef.current;
        const safeUsers = redactUserPasswordHashes(s.users);
        const data = {
          version: "1.0",
          timestamp: new Date().toISOString(),
          state: { ...s, users: safeUsers },
        };
        lsSet("inventory_last_session_backup", data);
      } catch {
        // Ignore serialization errors during shutdown
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const currentUser = useMemo(() => {
    if (!auth.isAuthenticated) return null;
    if (auth.userId) {
      const byId = users.find((u) => u.id === auth.userId);
      if (byId) return byId;
    }
    if (!auth.username) return null;
    return users.find((u) => u.username === auth.username) || null;
  }, [users, auth]);
  // Keep the audit-log ref in sync with the current user so logAudit (which runs
  // from action callbacks, after commit) always reads the latest identity.
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
  const localOwnerExists = useMemo(() => users.some((u) => u.role === "owner"), [users]);
  const ownerExists = isDesktop ? desktopOwnerExists === true : localOwnerExists;
  const ownerCheckPending = isDesktop && desktopOwnerExists === null;

  useEffect(() => {
    lsRemove("auth");
  }, []);

  // Batch all storage writes into a single debounced flush.
  // Uses lsSetBatch to write all keys in ONE SQLite transaction via a
  // single async IPC call — previously this was 16 separate IPC calls
  // that kept the main process busy and caused sync reads to block.
  useEffect(() => {
    // Never persist before the user is authenticated. Pre-login the renderer
    // state is the empty seed, the main process rejects the write anyway, and
    // the optimistic cache update would poison the cache with empty arrays —
    // which previously led to the real data being overwritten on disk after login.
    if (isDesktop && !auth.isAuthenticated) return;
    const timer = window.setTimeout(() => {
      lsSetBatch({
        settings,
        products,
        suppliers,
        customers,
        purchaseInvoices,
        salesInvoices,
        stockMovements,
        cashEntries,
        discountCodes,
        nextProductCode,
        nextSupplierCode,
        nextCustomerCode,
        users,
        salesReturns,
        purchaseReturns,
        drivers,
        auditLogs,
        quotations,
        stocktakes,
        vehicles,
        washServices,
        queueTickets,
        nextQueueNumber,
      });
      unflushedChangesRef.current = false;
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [isDesktop, auth.isAuthenticated, settings, products, suppliers, customers, purchaseInvoices, salesInvoices, stockMovements, cashEntries, discountCodes, nextProductCode, nextSupplierCode, nextCustomerCode, users, salesReturns, purchaseReturns, drivers, auditLogs, quotations, stocktakes, vehicles, washServices, queueTickets, nextQueueNumber]);

  const login = useCallback(async (username: string, passwordRaw: string) => {
    const attemptKey = loginAttemptKey(username);
    if (window.desktopAPI?.auth) {
      const result = await window.desktopAPI.auth.login(username, passwordRaw);
      if (!result.ok) return result;
      // Refresh the cache from the DB now that a session exists — the startup
      // cache was loaded pre-session (empty / possibly poisoned). Without this,
      // loadStoredStateFromDesktop could read empty arrays and a later flush
      // would overwrite the real data on disk.
      await reloadStorageCache();
      loadStoredStateFromDesktop();
      if (result.user) {
        const updatedUser = normalizeUser(result.user);
        setUsers((list) =>
          list.some((u) => u.id === updatedUser.id)
            ? list.map((u) => (u.id === updatedUser.id ? updatedUser : u))
            : [updatedUser, ...list]
        );
      }
      setAuth({ isAuthenticated: true, username, userId: result.user?.id });
      return { ok: true };
    }

    const rateLimited = getRateLimitResult(attemptKey);
    if (rateLimited) return rateLimited;
    const user = users.find((u) => u.username === username);
    if (!user) return registerFailedLogin(attemptKey);
    if (!(await verifyFallbackPassword(user.passwordHash, passwordRaw))) {
      return registerFailedLogin(attemptKey);
    }
    fallbackLoginAttempts.delete(attemptKey);
    setAuth({ isAuthenticated: true, username, userId: user.id });
    return { ok: true };
  }, [loadStoredStateFromDesktop, users]);

  const devLogin = useCallback(async () => {
    if (window.desktopAPI?.auth.devLogin) {
      const result = await window.desktopAPI.auth.devLogin();
      if (!result.ok) return result;
      await reloadStorageCache();
      loadStoredStateFromDesktop();
      if (result.user) {
        const updatedUser = normalizeUser(result.user);
        setUsers((list) =>
          list.some((u) => u.id === updatedUser.id)
            ? list.map((u) => (u.id === updatedUser.id ? updatedUser : u))
            : [updatedUser, ...list]
        );
      }
      setAuth({ isAuthenticated: true, username: result.user?.username || "dev", userId: result.user?.id });
      return { ok: true };
    }
    return { ok: false, error: "not_available" };
  }, [loadStoredStateFromDesktop]);

  const logout = useCallback(() => {
    if (window.desktopAPI?.auth.logout) {
      void window.desktopAPI.auth.logout();
      clearDesktopRendererState();
    }
    setIsLocked(false);
    setAuth({ isAuthenticated: false });
  }, [clearDesktopRendererState]);

  const lockSession = useCallback(() => {
    setIsLocked(true);
  }, []);

  const unlockSession = useCallback(async (username: string, password: string) => {
    const result = await login(username, password);
    if (result.ok) setIsLocked(false);
    return result;
  }, [login]);

  const activateLicense = useCallback(async (serial: string) => {
    if (!window.desktopAPI?.license) {
      const status: LicenseStatus = {
        state: "active",
        machineCode: "WEB-DEVELOPMENT",
        machineHash: "WEB-DEVELOPMENT",
      };
      setLicenseStatus(status);
      return { ok: true, status };
    }
    const prevLicense = licenseStatus?.license ?? null;
    const result = await window.desktopAPI.license.activate(serial);
    setLicenseStatus(result.status);
    setSettings((current) => {
      let next = applyLicenseSettings(current, result.status);
      // On upgrade, auto-enable modules the new license unlocks that the previous
      // one didn't — so an upgraded package works immediately without the owner
      // toggling each feature. Features already allowed keep the owner's choice.
      const newLicense = result.status.license;
      if (newLicense) {
        const features: Record<string, boolean> = { ...(next.features ?? {}) };
        let changed = false;
        for (const f of FEATURES) {
          if (isAllowedByLicense(f.key, newLicense) && !isAllowedByLicense(f.key, prevLicense)) {
            features[f.key] = true;
            changed = true;
          }
        }
        if (changed) next = { ...next, features };
      }
      return next;
    });
    return result;
  }, [licenseStatus]);

  const createOwner = useCallback(async (username: string, password: string) => {
    if (window.desktopAPI?.setup) {
      const result = await window.desktopAPI.setup.createOwner(username, password);
      if (!result.ok || !result.user) return false;
      setDesktopOwnerExists(true);
      await reloadStorageCache();
      loadStoredStateFromDesktop();
      const owner = normalizeUser(result.user);
      setUsers((list) => [owner, ...list.filter((u) => u.id !== owner.id)]);
      setAuth({
        isAuthenticated: true,
        username: owner.username,
        userId: owner.id,
      });
      return true;
    }
    return false;
  }, [loadStoredStateFromDesktop]);

  const resetDemo = useCallback(() => {
    lsClearAll();
    setAuth({ isAuthenticated: false });
    setSettings(seedSettings);
    setProducts(seedProducts);
    setSuppliers(seedSuppliers);
    setCustomers(seedCustomers);
    setPurchaseInvoices(seedPurchaseInvoices);
    setSalesInvoices(seedSalesInvoices);
    setStockMovements(seedStockMovements);
    setCashEntries(seedCashEntries);
    setNextProductCode(1000);
    setNextSupplierCode(nextSupplierCodeFromExisting(seedSuppliers));
    setNextCustomerCode(1);
    setUsers(seedUsers.map(normalizeUser));
    setSalesReturns([]);
    setPurchaseReturns([]);
    setDrivers([]);
    setAuditLogs([]);
    setQuotations([]);
    setStocktakes([]);
    setVehicles([]);
    setWashServices(seedWashServices);
    setQueueTickets([]);
    setNextQueueNumber(1);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    if (window.desktopAPI) {
      const {
        subscriptionType: _subscriptionType,
        subscriptionStartDate: _subscriptionStartDate,
        subscriptionMonths: _subscriptionMonths,
        warrantyType: _warrantyType,
        warrantyStartDate: _warrantyStartDate,
        warrantyMonths: _warrantyMonths,
        ...safePatch
      } = patch;
      void _subscriptionType;
      void _subscriptionStartDate;
      void _subscriptionMonths;
      void _warrantyType;
      void _warrantyStartDate;
      void _warrantyMonths;
      setSettings((s) => ({ ...s, ...safePatch }));
      return;
    }
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  // Users
  const addUser: AppActions["addUser"] = (u) => {
    const user: AppUser = {
      ...normalizeUser(u as AppUser),
      permissions: normalizeUser(u as AppUser).permissions,
      id: uid("usr"),
      createdAt: new Date().toISOString(),
    };
    setUsers((list) => [user, ...list]);
    return user;
  };
  const updateUser: AppActions["updateUser"] = (id, patch) => {
    setUsers((list) =>
      list.map((u) =>
        u.id === id
          ? normalizeUser({ ...u, ...patch, permissions: patch.permissions ?? u.permissions })
          : u
      )
    );
  };
  const updateCurrentUserProfile: AppActions["updateCurrentUserProfile"] = useCallback(async ({
    name,
    currentPassword,
    newPassword,
  }) => {
    if (!currentUser) return { ok: false, error: "not_authenticated" };

    const cleanName = name.trim();
    if (!cleanName) return { ok: false, error: "invalid_name" };

    if (window.desktopAPI?.auth.updateProfile) {
      const result = await window.desktopAPI.auth.updateProfile(
        currentUser.id,
        cleanName,
        currentPassword || "",
        newPassword || ""
      );
      if (!result.ok) {
        return {
          ok: false,
          error:
            result.error === "invalid_current_password"
              ? "invalid_current_password"
              : result.error === "user_missing"
                ? "user_missing"
                : result.error === "not_authorized"
                  ? "not_authenticated"
                  : "password_too_short",
        };
      }
      if (result.user) {
        const updatedUser = normalizeUser(result.user);
        setUsers((list) =>
          list.map((user) => (user.id === updatedUser.id ? updatedUser : user))
        );
      }
      return { ok: true };
    }

    let nextPasswordHash: string | undefined;
    const wantsPasswordChange = Boolean(newPassword);
    if (wantsPasswordChange) {
      if (!newPassword || newPassword.length < 4) {
        return { ok: false, error: "password_too_short" };
      }
      if (window.desktopAPI?.auth.changePassword) {
        const result = await window.desktopAPI.auth.changePassword(
          currentUser.id,
          currentPassword || "",
          newPassword
        );
        if (!result.ok) {
          return {
            ok: false,
            error:
              result.error === "invalid_current_password"
                ? "invalid_current_password"
                : result.error === "user_missing"
                  ? "user_missing"
                  : "password_too_short",
          };
        }
        nextPasswordHash = result.user?.passwordHash;
      } else {
        const validCurrentPassword = await verifyFallbackPassword(
          currentUser.passwordHash,
          currentPassword || ""
        );
        if (!validCurrentPassword) {
          return { ok: false, error: "invalid_current_password" };
        }
        nextPasswordHash = await hashPassword(newPassword);
      }
    }

    setUsers((list) =>
      list.map((user) =>
        user.id === currentUser.id
          ? normalizeUser({
            ...user,
            name: cleanName,
            passwordHash: nextPasswordHash ?? user.passwordHash,
          })
          : user
      )
    );

    return { ok: true };
  }, [currentUser]);
  const deleteUser: AppActions["deleteUser"] = (id) => {
    const u = users.find((x) => x.id === id);
    if (u?.role === "owner") return false;
    setUsers((list) => list.filter((x) => x.id !== id));
    return true;
  };

  // Products
  const addProduct: AppActions["addProduct"] = (p) => {
    // BUG-01: respect an explicitly provided code (CSV import); otherwise
    // auto-generate from the ref-mirrored counter so bulk adds stay distinct.
    const provided = p.code?.trim();
    let code: string;
    if (provided) {
      code = provided;
      const num = Number(provided);
      if (Number.isInteger(num) && num >= nextProductCodeRef.current) {
        nextProductCodeRef.current = num + 1;
        setNextProductCode(num + 1);
      }
    } else {
      code = nextProductCodeRef.current.toString();
      nextProductCodeRef.current += 1;
      setNextProductCode(nextProductCodeRef.current);
    }
    const product: Product = {
      ...p,
      code,
      id: uid("prd"),
      createdAt: new Date().toISOString(),
    };
    setProducts((list) => [product, ...list]);
    return product;
  };
  const updateProduct: AppActions["updateProduct"] = (id, patch) => {
    setProducts((list) =>
      list.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  };
  const deleteProduct: AppActions["deleteProduct"] = (id) => {
    // prevent deletion if used in invoices, draft quotations or draft stocktakes
    // (BUG-07: a draft quotation would otherwise convert into an invoice whose
    // stock deduction is silently skipped for the missing product)
    const used =
      purchaseInvoices.some((inv) =>
        inv.lines.some((l) => l.productId === id)
      ) ||
      salesInvoices.some((inv) =>
        inv.lines.some((l) => l.productId === id)
      ) ||
      quotations.some(
        (q) => q.status === "draft" && q.lines.some((l) => l.productId === id)
      ) ||
      stocktakes.some(
        (s) => s.status === "draft" && s.items.some((i) => i.productId === id)
      );
    if (used) return false;
    const name = products.find((p) => p.id === id)?.name ?? id;
    setProducts((list) => list.filter((p) => p.id !== id));
    logAudit("product_deleted", name);
    return true;
  };

  const archiveProduct = useCallback((id: string, archived: boolean) => {
    setProducts((list) => list.map((p) => (p.id === id ? { ...p, archived } : p)));
    const name = products.find((p) => p.id === id)?.name ?? id;
    logAudit(archived ? "product_archived" : "product_restored", name);
  }, [products, logAudit]);



  const adjustStock: AppActions["adjustStock"] = (productId, delta, reason, looseDelta) => {
    setProducts((list) =>
      list.map((p) => {
        if (p.id !== productId) return p;
        const newQty = Math.max(0, p.quantity + delta);
        if (looseDelta !== undefined && p.piecesPerUnit) {
          const newLoose = Math.max(0, (p.looseQuantity ?? 0) + looseDelta);
          const fullCartons = Math.floor(newLoose / p.piecesPerUnit);
          return {
            ...p,
            quantity: newQty + fullCartons,
            looseQuantity: newLoose - fullCartons * p.piecesPerUnit,
          };
        }
        return { ...p, quantity: newQty };
      })
    );
    const prod = products.find((x) => x.id === productId);
    if (prod) {
      const totalDelta = delta + (looseDelta && prod.piecesPerUnit ? looseDelta / prod.piecesPerUnit : 0);
      const mv: StockMovement = {
        id: uid("mov"),
        productId,
        productName: prod.name,
        type: totalDelta >= 0 ? "adjustment-in" : "adjustment-out",
        quantity: totalDelta,
        reason,
        referenceType: "manual",
        date: todayISO(),
      };
      setStockMovements((l) => [mv, ...l]);
      const looseNote =
        looseDelta !== undefined && looseDelta !== 0
          ? ` و${looseDelta > 0 ? "+" : ""}${looseDelta} قطعة`
          : "";
      logAudit("stock_adjusted", prod.name, `${delta > 0 ? "+" : ""}${delta} ${prod.unit}${looseNote} — ${reason}`);
    }
  };

  // Suppliers
  const addSupplier: AppActions["addSupplier"] = (s) => {
    // BUG-01: counter via ref — bulk adds in one handler get distinct codes.
    const sup: Supplier = {
      ...s,
      code: formatSupplierCode(nextSupplierCodeRef.current),
      id: uid("sup"),
      createdAt: new Date().toISOString(),
    };
    nextSupplierCodeRef.current += 1;
    setNextSupplierCode(nextSupplierCodeRef.current);
    setSuppliers((list) => [sup, ...list]);
    return sup;
  };
  const updateSupplier: AppActions["updateSupplier"] = (id, patch) => {
    setSuppliers((list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        const editablePatch = { ...patch };
        delete editablePatch.code;
        return { ...s, ...editablePatch };
      })
    );
  };
  const deleteSupplier: AppActions["deleteSupplier"] = (id) => {
    const hasInvoices = purchaseInvoices.some((inv) => inv.supplierId === id);
    const hasProducts = products.some((p) => p.supplierId === id);
    if (hasInvoices || hasProducts) return false;
    const name = suppliers.find((s) => s.id === id)?.name ?? id;
    setSuppliers((list) => list.filter((s) => s.id !== id));
    logAudit("supplier_deleted", name);
    return true;
  };

  const archiveSupplier = useCallback((id: string, archived: boolean) => {
    setSuppliers((list) => list.map((s) => (s.id === id ? { ...s, archived } : s)));
    const name = suppliers.find((s) => s.id === id)?.name ?? id;
    logAudit(archived ? "supplier_archived" : "supplier_restored", name);
  }, [suppliers, logAudit]);

  const addCommissionTier: AppActions["addCommissionTier"] = (supplierId, tier) => {
    setSuppliers(list => list.map(s => {
      if (s.id !== supplierId) return s;
      const newTier: CommissionTier = { ...tier, id: uid("tier") };
      return { ...s, commissionTiers: [...(s.commissionTiers || []), newTier] };
    }));
  };

  const updateCommissionTier: AppActions["updateCommissionTier"] = (supplierId, tierId, patch) => {
    setSuppliers(list => list.map(s => {
      if (s.id !== supplierId) return s;
      return {
        ...s,
        commissionTiers: (s.commissionTiers || []).map(t => t.id === tierId ? { ...t, ...patch } : t)
      };
    }));
  };

  const deleteCommissionTier: AppActions["deleteCommissionTier"] = (supplierId, tierId) => {
    setSuppliers(list => list.map(s => {
      if (s.id !== supplierId) return s;
      return {
        ...s,
        commissionTiers: (s.commissionTiers || []).filter(t => t.id !== tierId)
      };
    }));
  };

  // Customers
  const addCustomer: AppActions["addCustomer"] = (c) => {
    // BUG-01: respect a provided code, else generate from the ref-mirrored counter.
    const provided = c.code?.trim();
    let code: string;
    if (provided) {
      code = provided;
      const match = /^CUS-(\d+)$/i.exec(provided);
      if (match && Number(match[1]) >= nextCustomerCodeRef.current) {
        nextCustomerCodeRef.current = Number(match[1]) + 1;
        setNextCustomerCode(nextCustomerCodeRef.current);
      }
    } else {
      code = `CUS-${String(nextCustomerCodeRef.current).padStart(4, "0")}`;
      nextCustomerCodeRef.current += 1;
      setNextCustomerCode(nextCustomerCodeRef.current);
    }
    const cus: Customer = {
      ...c,
      code,
      id: uid("cus"),
      createdAt: new Date().toISOString(),
    };
    setCustomers((list) => [cus, ...list]);
    return cus;
  };
  const updateCustomer: AppActions["updateCustomer"] = (id, patch) => {
    setCustomers((list) =>
      list.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  };
  const deleteCustomer: AppActions["deleteCustomer"] = (id) => {
    const hasInvoices = salesInvoices.some((inv) => inv.customerId === id);
    if (hasInvoices) return false;
    const name = customers.find((c) => c.id === id)?.name ?? id;
    setCustomers((list) => list.filter((c) => c.id !== id));
    logAudit("customer_deleted", name);
    return true;
  };

  const archiveCustomer = useCallback((id: string, archived: boolean) => {
    setCustomers((list) => list.map((c) => (c.id === id ? { ...c, archived } : c)));
    const name = customers.find((c) => c.id === id)?.name ?? id;
    logAudit(archived ? "customer_archived" : "customer_restored", name);
  }, [customers, logAudit]);

  // Drivers
  const addDriver: AppActions["addDriver"] = (d) => {
    const drv: Driver = {
      ...d,
      id: uid("drv"),
      createdAt: new Date().toISOString(),
    };
    setDrivers((list) => [drv, ...list]);
    return drv;
  };
  const updateDriver: AppActions["updateDriver"] = (id, patch) => {
    setDrivers((list) =>
      list.map((d) => (d.id === id ? { ...d, ...patch } : d))
    );
  };
  const deleteDriver: AppActions["deleteDriver"] = (id) => {
    const hasInvoices = salesInvoices.some((inv) => inv.driverId === id);
    if (hasInvoices) return false;
    setDrivers((list) => list.filter((d) => d.id !== id));
    return true;
  };

  // ── Car Wash: Vehicles ──
  const addVehicle = (v: Omit<Vehicle, "id" | "createdAt">): Vehicle => {
    const vehicle: Vehicle = { ...v, id: uid("veh"), createdAt: new Date().toISOString() };
    setVehicles((list) => [vehicle, ...list]);
    return vehicle;
  };
  const updateVehicle = (id: string, patch: Partial<Vehicle>) => {
    setVehicles((list) => list.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };
  const deleteVehicle = (id: string): boolean => {
    // Block deletion if the vehicle is referenced by an invoice or a queue ticket.
    const used =
      salesInvoices.some((inv) => inv.vehicleId === id) ||
      queueTickets.some((t) => t.vehicleId === id);
    if (used) return false;
    const label = vehicles.find((v) => v.id === id)?.plateNumber ?? id;
    setVehicles((list) => list.filter((v) => v.id !== id));
    logAudit("vehicle_deleted", label);
    return true;
  };
  const archiveVehicle = (id: string, archived: boolean) => {
    setVehicles((list) => list.map((v) => (v.id === id ? { ...v, archived } : v)));
  };

  // ── Car Wash: Services ──
  const addWashService = (s: Omit<WashService, "id" | "createdAt">): WashService => {
    const maxCode = washServices.reduce((max, svc) => {
      const m = svc.code?.match(/^SVC-(\d+)$/);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0);
    const code = s.code || `SVC-${String(maxCode + 1).padStart(3, "0")}`;
    const service: WashService = { ...s, code, id: uid("svc"), createdAt: new Date().toISOString() };
    setWashServices((list) => [service, ...list]);
    return service;
  };
  const updateWashService = (id: string, patch: Partial<WashService>) => {
    setWashServices((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const deleteWashService = (id: string): boolean => {
    // Block deletion if referenced by any invoice line; deactivate instead.
    const used = salesInvoices.some((inv) => inv.lines.some((l) => l.serviceId === id));
    if (used) return false;
    const name = washServices.find((s) => s.id === id)?.name ?? id;
    setWashServices((list) => list.filter((s) => s.id !== id));
    logAudit("service_deleted", name);
    return true;
  };

  // ── Car Wash: Queue ──
  type QueueTicketInput = Omit<QueueTicket, "id" | "number" | "createdAt" | "status"> & {
    status?: QueueStatus;
  };
  const addQueueTickets = (inputs: QueueTicketInput[]): QueueTicket[] => {
    let updated = normalizeQueueTickets(queueTickets);
    const created: QueueTicket[] = [];

    for (const input of inputs) {
      const now = new Date().toISOString();
      const arrivalTime = input.arrivalTime || now;
      const businessDate = input.businessDate ?? dateFromTicket({ arrivalTime });
      const status = normalizeQueueStatus(input.status);
      const number = nextDailyQueueNumber(updated, businessDate);
      const desiredPos = isQueueActive(status)
        ? pickupAwareQueuePosition(updated, input.requestedPickupAt)
        : undefined;
      const shifted =
        desiredPos !== undefined
          ? updated.map((entry) =>
              isQueueActive(entry.status) && queuePosition(entry) >= desiredPos
                ? { ...entry, queuePosition: queuePosition(entry) + 1 }
                : entry
            )
          : updated;
      const ticket: QueueTicket = {
        ...input,
        id: uid("queue"),
        number,
        businessDate,
        queuePosition: desiredPos,
        status,
        keyReceived: input.keyReceived ?? Boolean(input.keyReceivedAt),
        serviceIds: input.serviceIds ?? [],
        serviceNames: input.serviceNames ?? [],
        arrivalTime,
        createdAt: now,
      };
      created.push(ticket);
      updated = compactQueuePositions([ticket, ...shifted]);
    }

    nextQueueNumberRef.current = nextDailyQueueNumber(updated);
    setNextQueueNumber(nextQueueNumberRef.current);
    setQueueTickets(updated);
    return created;
  };
  const addQueueTicket = (input: QueueTicketInput): QueueTicket => {
    return addQueueTickets([input])[0];
  };
  const updateQueueTicket = (id: string, patch: Partial<QueueTicket>) => {
    setQueueTickets((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };
  const setQueueStatus = (id: string, status: QueueStatus) => {
    const normalizedStatus = normalizeQueueStatus(status);
    setQueueTickets((list) =>
      compactQueuePositions(
        list.map((t) =>
          t.id === id
            ? {
                ...t,
                status: normalizedStatus,
                queuePosition: isQueueActive(normalizedStatus) ? t.queuePosition : undefined,
              }
            : t
        )
      )
    );
    if (status === "cancelled") {
      const t = queueTickets.find((x) => x.id === id);
      logAudit("queue_ticket_cancelled", t ? `#${t.number} — ${t.customerName}` : id);
    }
  };
  const reorderQueueTicket = (id: string, direction: "up" | "down") => {
    setQueueTickets((list) => {
      const compacted = compactQueuePositions(normalizeQueueTickets(list));
      const active = compacted
        .filter((ticket) => isQueueActive(ticket.status))
        .sort((a, b) => queuePosition(a) - queuePosition(b) || a.number - b.number);
      const index = active.findIndex((ticket) => ticket.id === id);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= active.length) return list;
      const reordered = [...active];
      [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
      const positionById = new Map(reordered.map((ticket, i) => [ticket.id, i + 1]));
      return compacted.map((ticket) =>
        positionById.has(ticket.id) ? { ...ticket, queuePosition: positionById.get(ticket.id)! } : ticket
      );
    });
  };
  const requeueTicket = (id: string) => {
    setQueueTickets((list) => {
      const compacted = compactQueuePositions(normalizeQueueTickets(list));
      const nextPosition = nextActiveQueuePosition(compacted);
      return compactQueuePositions(
        compacted.map((ticket) =>
          ticket.id === id
            ? { ...ticket, status: "waiting", queuePosition: nextPosition, missedTurn: true }
            : ticket
        )
      );
    });
  };
  const receiveVehicleKey = (id: string) => {
    const user = currentUserRef.current;
    setQueueTickets((list) =>
      list.map((t) =>
        t.id === id
          ? {
              ...t,
              keyReceivedBy: user?.id,
              keyReceivedByName: user?.name,
              keyReceivedAt: new Date().toISOString(),
              keyReceived: true,
            }
          : t
      )
    );
  };
  const deliverVehicleKey = (id: string) => {
    const user = currentUserRef.current;
    setQueueTickets((list) =>
      compactQueuePositions(
        list.map((t) =>
          t.id === id
            ? {
                ...t,
                status: "delivered",
                queuePosition: undefined,
                keyDeliveredBy: user?.id,
                keyDeliveredByName: user?.name,
                keyDeliveredAt: new Date().toISOString(),
              }
            : t
        )
      )
    );
  };

  // Purchase invoices
  const addPurchaseInvoice: AppActions["addPurchaseInvoice"] = (inv) => {
    const id = uid("pur");
    const status = computeStatus(inv.total, inv.amountPaid);
    const remaining = Math.max(0, inv.total - inv.amountPaid);
    const full: PurchaseInvoice = {
      ...inv,
      id,
      status,
      remaining,
      createdAt: new Date().toISOString(),
    };
    setPurchaseInvoices((list) => [full, ...list]);
    logAudit("invoice_purchase_created", `${full.invoiceNumber} — ${full.supplierName}`, `الإجمالي: ${full.total}`);

    // stock increments
    setProducts((list) =>
      list.map((p) => {
        const matchingLines = inv.lines.filter((l) => l.productId === p.id);
        if (matchingLines.length === 0) return p;
        const totalQty = matchingLines.reduce((sum, l) => sum + l.quantity, 0);
        const lastExpiry = matchingLines.filter((l) => l.expiryDate).pop()?.expiryDate;
        const patch: Partial<Product> = { quantity: p.quantity + totalQty };
        if (lastExpiry && p.hasExpiry) patch.expiryDate = lastExpiry;
        return { ...p, ...patch };
      })
    );

    // stock movements
    const movements: StockMovement[] = inv.lines.map((l, idx) => ({
      id: uid(`mov_p_${idx}`),
      productId: l.productId,
      productName: l.productName,
      type: "purchase",
      quantity: l.quantity,
      reason: `فاتورة مشتريات ${inv.invoiceNumber}`,
      referenceId: id,
      referenceType: "purchase",
      date: inv.date,
    }));
    setStockMovements((list) => [...movements, ...list]);

    // cash entry if paid
    if (inv.amountPaid > 0) {
      const ce: CashEntry = {
        id: uid("cash_p"),
        type: "purchase-payment",
        amount: -inv.amountPaid,
        description: `سداد فاتورة مشتريات ${inv.invoiceNumber} — ${inv.supplierName}`,
        referenceId: id,
        date: inv.date,
      };
      setCashEntries((list) => [ce, ...list]);
    }
    return full;
  };
  const updatePurchaseInvoice: AppActions["updatePurchaseInvoice"] = (id, patch) => {
    const inv = purchaseInvoices.find((i) => i.id === id);
    if (!inv) return;

    // Reverse old stock, apply new stock in one pass
    setProducts((list) =>
      list.map((p) => {
        const oldQty = inv.lines.filter((l) => l.productId === p.id).reduce((sum, l) => sum + l.quantity, 0);
        const newQty = patch.lines.filter((l) => l.productId === p.id).reduce((sum, l) => sum + l.quantity, 0);
        let qty = p.quantity;
        if (oldQty > 0) qty = Math.max(0, qty - oldQty);
        if (newQty > 0) qty = qty + newQty;
        const lastNewExpiry = patch.lines.filter((l) => l.productId === p.id && l.expiryDate).pop()?.expiryDate;
        const expiryDate = lastNewExpiry && p.hasExpiry ? lastNewExpiry : p.expiryDate;
        return qty !== p.quantity || expiryDate !== p.expiryDate
          ? { ...p, quantity: qty, expiryDate }
          : p;
      })
    );

    // Replace stock movements
    setStockMovements((list) => {
      const kept = list.filter((m) => !(m.referenceId === id && m.type === "purchase"));
      const next: StockMovement[] = patch.lines.map((l, i) => ({
        id: uid(`mov_upd_p_${i}`),
        productId: l.productId,
        productName: l.productName,
        type: "purchase",
        quantity: l.quantity,
        reason: `فاتورة مشتريات ${inv.invoiceNumber}`,
        referenceId: id,
        referenceType: "purchase",
        date: patch.date,
      }));
      return [...kept, ...next];
    });

    const newTotal = patch.lines.reduce((a, l) => a + l.subtotal, 0);
    const cappedPaid = Math.min(inv.amountPaid, newTotal);
    const overpayment = Math.max(0, inv.amountPaid - newTotal);
    const newRemaining = Math.max(0, newTotal - cappedPaid);

    setPurchaseInvoices((list) =>
      list.map((i) =>
        i.id === id
          ? {
              ...i,
              lines: patch.lines,
              total: newTotal,
              date: patch.date,
              notes: patch.notes,
              amountPaid: cappedPaid,
              remaining: newRemaining,
              status: computeStatus(newTotal, cappedPaid),
              overpayment: overpayment > 0 ? overpayment : undefined,
            }
          : i
      )
    );
    if (inv) logAudit("invoice_purchase_updated", `${inv.invoiceNumber} — ${inv.supplierName}`, `تعديل الفاتورة`);
  };

  const recordPurchasePayment: AppActions["recordPurchasePayment"] = (
    id,
    amount,
    paymentMethod,
    notes
  ) => {
    if (amount <= 0) return;
    const entry: import("../types").PaymentLogEntry = {
      id: uid("plog"),
      date: todayISO(),
      amount,
      paymentMethod: paymentMethod ?? "cash",
      notes: notes?.trim() || undefined,
    };
    setPurchaseInvoices((list) =>
      list.map((inv) => {
        if (inv.id !== id) return inv;
        const cappedAmount = Math.min(amount, inv.remaining);
        const excess = amount - cappedAmount;
        const paid = inv.amountPaid + cappedAmount;
        return {
          ...inv,
          amountPaid: paid,
          remaining: Math.max(0, inv.total - paid),
          status: computeStatus(inv.total, paid),
          overpayment: excess > 0 ? (inv.overpayment ?? 0) + excess : inv.overpayment,
          paymentLog: [...(inv.paymentLog ?? []), entry],
        };
      })
    );
    const inv = purchaseInvoices.find((i) => i.id === id);
    if (inv) {
      const ce: CashEntry = {
        id: uid("cash_p"),
        type: "purchase-payment",
        amount: -amount,
        description: `دفعة على فاتورة مشتريات ${inv.invoiceNumber} — ${inv.supplierName}`,
        referenceId: id,
        date: todayISO(),
        paymentMethod,
      };
      setCashEntries((list) => [ce, ...list]);
      logAudit("invoice_purchase_updated", `${inv.invoiceNumber} — ${inv.supplierName}`, `دفعة: ${amount}`);
    }
  };
  const deletePurchaseInvoice: AppActions["deletePurchaseInvoice"] = (id) => {
    const inv = purchaseInvoices.find((i) => i.id === id);
    if (!inv) return false;
    // FIX-06: Block deleting purchase invoices that have returns (mirrors sales logic)
    if (purchaseReturns.some((r) => r.originalInvoiceId === id)) return false;
    // revert stock
    setProducts((list) =>
      list.map((p) => {
        const totalQty = inv.lines.filter((x) => x.productId === p.id).reduce((sum, l) => sum + l.quantity, 0);
        if (totalQty === 0) return p;
        return { ...p, quantity: Math.max(0, p.quantity - totalQty) };
      })
    );
    setPurchaseInvoices((list) => list.filter((i) => i.id !== id));
    setStockMovements((list) => list.filter((m) => m.referenceId !== id));
    setCashEntries((list) => list.filter((c) => c.referenceId !== id));
    logAudit(
      "invoice_purchase_deleted",
      `${inv.invoiceNumber} — ${inv.supplierName}`,
      `المدفوع: ${inv.amountPaid}`,
      {
        kind: "purchase-invoice",
        invoice: inv,
        cashEntries: cashEntries.filter((c) => c.referenceId === id),
        stockMovements: stockMovements.filter((m) => m.referenceId === id),
      }
    );
    return true;
  };

  // Car Wash: deduct/restore inventory for a service invoice's linked materials
  // (feature 7). Shared by create (consume) / cancel + delete (restore). Movement
  // quantities are stored in base units (pieces ÷ piecesPerUnit when piece-based),
  // matching how adjustStock records fractional unit movements.
  // Sales invoices
  const addSalesInvoice: AppActions["addSalesInvoice"] = (inv) => {
    const id = uid("sal");
    const status = computeStatus(inv.total, inv.amountReceived);
    const remaining = Math.max(0, inv.total - inv.amountReceived);
    const enrichedLines = inv.lines.map((l) => {
      if (l.costPrice !== undefined) return l;
      const prod = products.find((p) => p.id === l.productId);
      return prod ? { ...l, costPrice: prod.purchasePrice } : l;
    });
    // Loyalty: award points on finalized service invoices; net out any redeemed.
    const loyaltyPointsEarned =
      inv.invoiceKind === "service"
        ? computeLoyaltyEarned(inv.total, {
            enabled: settings.loyaltyEnabled,
            egpPerPoint: settings.loyaltyEgpPerPoint,
          })
        : 0;
    const loyaltyPointsRedeemed = inv.loyaltyPointsRedeemed ?? 0;
    const full: SalesInvoice = {
      ...inv,
      lines: enrichedLines,
      id,
      priceType: inv.priceType ?? "wholesale",
      createdByUserId: inv.createdByUserId ?? currentUser?.id,
      status,
      remaining,
      loyaltyPointsEarned: loyaltyPointsEarned > 0 ? loyaltyPointsEarned : inv.loyaltyPointsEarned,
      createdAt: new Date().toISOString(),
    };
    setSalesInvoices((list) => [full, ...list]);
    const pointsDelta = loyaltyPointsEarned - loyaltyPointsRedeemed;
    if (inv.customerId && pointsDelta !== 0) {
      setCustomers((list) =>
        list.map((c) =>
          c.id === inv.customerId
            ? { ...c, loyaltyPoints: Math.max(0, (c.loyaltyPoints ?? 0) + pointsDelta) }
            : c
        )
      );
    }
    logAudit("invoice_sale_created", `${full.invoiceNumber} — ${full.customerName}`, `الإجمالي: ${full.total}`);

    // stock decrements
    setProducts((list) =>
      list.map((p) => {
        const matchingLines = inv.lines.filter((x) => x.productId === p.id);
        if (matchingLines.length === 0) return p;
        const totalQty = matchingLines.reduce((sum, l) => sum + l.quantity, 0);
        if (matchingLines.some((l) => l.isRetailUnit) && p.piecesPerUnit) {
          return { ...p, ...applyPieceDeduction(p, totalQty) };
        }
        return { ...p, quantity: Math.max(0, p.quantity - totalQty) };
      })
    );
    const movements: StockMovement[] = inv.lines
      .filter((l) => l.kind !== "service" && l.productId)
      .map((l, idx) => ({
        id: uid(`mov_s_${idx}`),
        productId: l.productId,
        productName: l.productName,
        type: "sale",
        quantity: -l.quantity,
        reason: `فاتورة مبيعات ${inv.invoiceNumber}`,
        referenceId: id,
        referenceType: "sale",
        date: inv.date,
      }));
    setStockMovements((list) => [...movements, ...list]);

    // Car Wash: BOM raw materials are consumed from the relational DB inventory in
    // CarwashInvoiceNewPage (recordMaterialConsumption), not from the KV product store.

    const totalCashReceived = inv.amountReceived + (inv.overpayment ?? 0);
    if (totalCashReceived > 0) {
      const ce: CashEntry = {
        id: uid("cash_s"),
        type: "sales-receipt",
        amount: totalCashReceived,
        description: `تحصيل فاتورة مبيعات ${inv.invoiceNumber} — ${inv.customerName}`,
        referenceId: id,
        date: inv.date,
        paymentMethod: inv.paymentMethod,
      };
      setCashEntries((list) => [ce, ...list]);
    }
    // Worker commission is paid from the drawer and must reduce its balance.
    if ((inv.commissionTotal ?? 0) > 0) {
      const commissionEntry: CashEntry = {
        id: uid("cash_commission"),
        type: "manual-remove",
        amount: -(inv.commissionTotal ?? 0),
        description: `عمولة صنايعي — فاتورة ${inv.invoiceNumber}`,
        referenceId: id,
        date: inv.date,
        paymentMethod: "cash",
      };
      setCashEntries((list) => [commissionEntry, ...list]);
    }
    if (inv.amountReceived > 0) {
      const initEntry: import("../types").PaymentLogEntry = {
        id: uid("slog"),
        date: inv.date,
        amount: inv.amountReceived,
        paymentMethod: inv.paymentMethod ?? "cash",
      };
      setSalesInvoices((list) =>
        list.map((s) => s.id === id ? { ...s, paymentLog: [initEntry] } : s)
      );
    }
    return full;
  };
  const recordSalesReceipt: AppActions["recordSalesReceipt"] = (id, amount, paymentMethod, notes) => {
    if (amount <= 0) return;
    const entry: import("../types").PaymentLogEntry = {
      id: uid("slog"),
      date: todayISO(),
      amount,
      paymentMethod: paymentMethod ?? "cash",
      notes: notes?.trim() || undefined,
    };
    setSalesInvoices((list) =>
      list.map((inv) => {
        if (inv.id !== id) return inv;
        const cappedAmount = Math.min(amount, inv.remaining);
        const excess = amount - cappedAmount;
        const received = inv.amountReceived + cappedAmount;
        // Decrement the OUTSTANDING balance, not total − received. A sales return
        // keeps inv.total at the original amount but lowers inv.remaining to the
        // net owed; computing from total here would re-add the returned amount
        // (paying the remaining would wrongly leave the return still due).
        const newRemaining = Math.max(0, inv.remaining - cappedAmount);
        return {
          ...inv,
          amountReceived: received,
          remaining: newRemaining,
          status: newRemaining <= 0 ? "paid" : "partial",
          overpayment: excess > 0 ? (inv.overpayment ?? 0) + excess : inv.overpayment,
          paymentLog: [...(inv.paymentLog ?? []), entry],
        };
      })
    );
    const inv = salesInvoices.find((i) => i.id === id);
    if (inv) {
      const ce: CashEntry = {
        id: uid("cash_s"),
        type: "sales-receipt",
        amount,
        description: `دفعة على فاتورة مبيعات ${inv.invoiceNumber} — ${inv.customerName}`,
        referenceId: id,
        date: todayISO(),
        paymentMethod,
      };
      setCashEntries((list) => [ce, ...list]);
      logAudit("invoice_sale_updated", `${inv.invoiceNumber} — ${inv.customerName}`, `دفعة: ${amount}`);
    }
  };
  const updateSalesInvoice: AppActions["updateSalesInvoice"] = (id, patch) => {
    const inv = salesInvoices.find((s) => s.id === id);
    if (!inv || inv.cancelled) return;

    // Atomic stock update: restore old quantities and deduct new ones in a
    // single setProducts call to avoid intermediate re-renders with wrong
    // stock values (FIX-01: race condition).
    setProducts((list) =>
      list.map((p) => {
        const oldLines = inv.lines.filter((l) => l.productId === p.id);
        const newLines = patch.lines.filter((l) => l.productId === p.id);
        if (oldLines.length === 0 && newLines.length === 0) return p;

        const oldQty = oldLines.reduce((sum, l) => sum + l.quantity, 0);
        const newQty = newLines.reduce((sum, l) => sum + l.quantity, 0);
        const oldIsRetail = oldLines.some((l) => l.isRetailUnit) && p.piecesPerUnit;
        const newIsRetail = newLines.some((l) => l.isRetailUnit) && p.piecesPerUnit;

        // When either side uses retail (piece) math we must go through the
        // piece helpers to keep looseQuantity correct.
        if (oldIsRetail || newIsRetail) {
          let updated = { ...p };
          if (oldQty > 0) updated = { ...updated, ...applyPieceAddition(updated, oldQty) };
          if (newQty > 0) updated = { ...updated, ...applyPieceDeduction(updated, newQty) };
          return updated;
        }

        // Simple whole-unit delta
        const delta = oldQty - newQty;
        if (delta === 0) return p;
        return { ...p, quantity: Math.max(0, p.quantity + delta) };
      })
    );

    // Replace stock movements for this invoice
    setStockMovements((list) => {
      const kept = list.filter((m) => !(m.referenceId === id && m.type === "sale"));
      const next: StockMovement[] = patch.lines.map((l, i) => ({
        id: uid(`mov_upd_${i}`),
        productId: l.productId,
        productName: l.productName,
        type: "sale" as const,
        quantity: -l.quantity,
        referenceId: id,
        referenceType: "sale" as const,
        date: patch.date,
        reason: `فاتورة مبيعات ${inv.invoiceNumber}`,
      }));
      return [...kept, ...next];
    });

    const linesTotal = patch.lines.reduce((a, l) => a + l.subtotal, 0);
    const newTotal = Math.max(0, linesTotal - (patch.discount ?? 0));
    const cappedReceived = Math.min(patch.amountReceived, newTotal);
    const newOverpayment = Math.max(0, patch.amountReceived - newTotal);
    const newRemaining = Math.max(0, newTotal - cappedReceived);
    const newStatus = computeStatus(newTotal, cappedReceived);

    const prevCash = inv.amountReceived + (inv.overpayment ?? 0);
    const nextCash = cappedReceived + newOverpayment;
    const cashDelta = nextCash - prevCash;
    if (cashDelta !== 0) {
      const ce: CashEntry = {
        id: uid("cash_edit_s"),
        type: cashDelta > 0 ? "sales-receipt" : "adjustment",
        amount: cashDelta,
        description: `تعديل تحصيل فاتورة مبيعات ${inv.invoiceNumber} — ${inv.customerName}`,
        referenceId: id,
        date: todayISO(),
      };
      setCashEntries((list) => [ce, ...list]);
    }

    // FIX-02: Explicitly preserve paymentLog so it is never accidentally
    // overwritten by a patch that does not include it.
    setSalesInvoices((list) =>
      list.map((s) =>
        s.id === id
          ? {
              ...s, ...patch,
              paymentLog: s.paymentLog,
              amountReceived: cappedReceived,
              total: newTotal,
              remaining: newRemaining,
              status: newStatus,
              overpayment: newOverpayment > 0 ? newOverpayment : undefined,
            }
          : s
      )
    );
    logAudit("invoice_sale_updated", `${inv.invoiceNumber} — ${inv.customerName}`, `تعديل الفاتورة`);
  };

  const cancelSalesInvoice: AppActions["cancelSalesInvoice"] = (id, refundMode) => {
    const inv = salesInvoices.find((i) => i.id === id);
    if (!inv || inv.cancelled) return;
    // Loyalty: reverse the points this invoice moved (claw back earned, refund redeemed).
    const loyaltyDelta = (inv.loyaltyPointsEarned ?? 0) - (inv.loyaltyPointsRedeemed ?? 0);
    if (inv.customerId && loyaltyDelta !== 0) {
      setCustomers((list) =>
        list.map((c) =>
          c.id === inv.customerId
            ? { ...c, loyaltyPoints: Math.max(0, (c.loyaltyPoints ?? 0) - loyaltyDelta) }
            : c
        )
      );
    }
    // return stock
    setProducts((list) =>
      list.map((p) => {
        const matchingLines = inv.lines.filter((x) => x.productId === p.id);
        if (matchingLines.length === 0) return p;
        const totalQty = matchingLines.reduce((sum, l) => sum + l.quantity, 0);
        if (matchingLines.some((l) => l.isRetailUnit) && p.piecesPerUnit) {
          return { ...p, ...applyPieceAddition(p, totalQty) };
        }
        return { ...p, quantity: p.quantity + totalQty };
      })
    );
    const totalCollected = inv.amountReceived + (inv.overpayment ?? 0);
    if (totalCollected > 0 && refundMode === "cash") {
      const ce: CashEntry = {
        id: uid("cash_cancel_s"),
        type: "adjustment",
        amount: -totalCollected,
        description: `ردّ نقدية لإلغاء فاتورة مبيعات ${inv.invoiceNumber} — ${inv.customerName}`,
        referenceId: id,
        date: todayISO(),
      };
      setCashEntries((list) => [ce, ...list]);
      setSalesInvoices((list) =>
        list.map((i) => (i.id === id ? { ...i, cancelled: true } : i))
      );
    } else if (totalCollected > 0 && refundMode === "credit") {
      setSalesInvoices((list) =>
        list.map((i) =>
          i.id === id
            ? { ...i, cancelled: true, amountReceived: 0, overpayment: totalCollected }
            : i
        )
      );
    } else {
      setSalesInvoices((list) =>
        list.map((i) => (i.id === id ? { ...i, cancelled: true } : i))
      );
    }
    const auditDetails = totalCollected > 0 && refundMode
      ? refundMode === "cash"
        ? `ردّ نقدي ${totalCollected}`
        : `تحويل رصيد دائن ${totalCollected}`
      : undefined;
    logAudit("invoice_sale_cancelled", `${inv.invoiceNumber} — ${inv.customerName}`, auditDetails);
    const cancelDate = todayISO();
    const cancelMovements: StockMovement[] = inv.lines
      .filter((l) => l.kind !== "service" && l.productId)
      .map((l, idx) => ({
        id: uid(`mov_cancel_${idx}`),
        productId: l.productId,
        productName: l.productName,
        type: "return" as const,
        quantity: l.quantity,
        reason: `إلغاء فاتورة مبيعات ${inv.invoiceNumber}`,
        referenceId: id,
        referenceType: "sale" as const,
        date: cancelDate,
      }));
    setStockMovements((list) => [...cancelMovements, ...list]);

    // Car Wash: BOM raw materials physically consumed during the wash are NOT
    // auto-restored on cancel — the soap/sprays were already used. Adjust from
    // the materials page if a wash never actually happened.
  };
  const deleteSalesInvoice: AppActions["deleteSalesInvoice"] = (id) => {
    const inv = salesInvoices.find((i) => i.id === id);
    if (!inv) return false;
    // BUG-03: a return already restored part of this invoice's stock and may
    // have refunded cash; reversing the full original lines on delete would
    // double-count both. Returns must be removed first (no UI for that yet).
    if (salesReturns.some((r) => r.originalInvoiceId === id)) return false;
    if (!inv.cancelled) {
      setProducts((list) =>
        list.map((p) => {
          const matchingLines = inv.lines.filter((x) => x.productId === p.id);
          if (matchingLines.length === 0) return p;
          const totalQty = matchingLines.reduce((sum, l) => sum + l.quantity, 0);
          if (matchingLines.some((l) => l.isRetailUnit) && p.piecesPerUnit) {
            return { ...p, ...applyPieceAddition(p, totalQty) };
          }
          return { ...p, quantity: p.quantity + totalQty };
        })
      );
      // Car Wash: BOM raw materials are tracked in the relational DB and are not
      // reversed here (they were physically consumed during the wash).
    }
    setSalesInvoices((list) => list.filter((i) => i.id !== id));
    setStockMovements((list) => list.filter((m) => m.referenceId !== id));
    setCashEntries((list) => list.filter((c) => c.referenceId !== id));
    logAudit(
      "invoice_sale_deleted",
      `${inv.invoiceNumber} — ${inv.customerName}`,
      `المستلم: ${inv.amountReceived}`,
      {
        kind: "sales-invoice",
        invoice: inv,
        cashEntries: cashEntries.filter((c) => c.referenceId === id),
        stockMovements: stockMovements.filter((m) => m.referenceId === id),
      }
    );
    return true;
  };

  // Restore a deleted invoice from its audit-log snapshot: re-insert the
  // invoice, its cash entries and stock movements, and re-apply the stock
  // effect the delete reversed. The snapshot is consumed so an entry can only
  // be restored once; blocked if the id or invoice number exists again.
  const restoreDeletedInvoice = (auditId: string): boolean => {
    const entry = auditLogs.find((a) => a.id === auditId);
    const snap = entry?.snapshot;
    if (!entry || !snap) return false;
    if (snap.kind === "sales-invoice") {
      const inv = snap.invoice as SalesInvoice;
      if (salesInvoices.some((i) => i.id === inv.id || i.invoiceNumber === inv.invoiceNumber)) {
        return false;
      }
      setSalesInvoices((list) => [inv, ...list]);
      if (!inv.cancelled) {
        setProducts((list) =>
          list.map((p) => {
            const matchingLines = inv.lines.filter((l) => l.productId === p.id);
            if (matchingLines.length === 0) return p;
            const totalQty = matchingLines.reduce((sum, l) => sum + l.quantity, 0);
            if (matchingLines.some((l) => l.isRetailUnit) && p.piecesPerUnit) {
              return { ...p, ...applyPieceDeduction(p, totalQty) };
            }
            return { ...p, quantity: Math.max(0, p.quantity - totalQty) };
          })
        );
        // Car Wash: BOM raw materials live in the relational DB and are not
        // re-applied on restore (KV product store no longer tracks them).
      }
    } else {
      const inv = snap.invoice as PurchaseInvoice;
      if (purchaseInvoices.some((i) => i.id === inv.id || i.invoiceNumber === inv.invoiceNumber)) {
        return false;
      }
      setPurchaseInvoices((list) => [inv, ...list]);
      setProducts((list) =>
        list.map((p) => {
          const totalQty = inv.lines
            .filter((l) => l.productId === p.id)
            .reduce((sum, l) => sum + l.quantity, 0);
          if (totalQty === 0) return p;
          return { ...p, quantity: p.quantity + totalQty };
        })
      );
    }
    setCashEntries((list) => [...snap.cashEntries, ...list]);
    setStockMovements((list) => [...snap.stockMovements, ...list]);
    setAuditLogs((list) =>
      list.map((a) => (a.id === auditId ? { ...a, snapshot: undefined } : a))
    );
    logAudit("invoice_restored", entry.entityLabel, "استعادة من سجل التدقيق");
    return true;
  };

  // Returns
  const addSalesReturn: AppActions["addSalesReturn"] = (r) => {
    // Defense in depth (OBS-08): the UI blocks returns on cancelled invoices,
    // but a cancelled invoice already restored its stock — a return would
    // double-restore it and could refund cash from the retained credit.
    const original = salesInvoices.find((inv) => inv.id === r.originalInvoiceId);
    if (original?.cancelled) {
      throw new Error("لا يمكن إنشاء مرتجع لفاتورة ملغاة");
    }
    const id = uid("sr");
    const salesReturnNums = salesReturns.map((x) => parseInt(x.returnNumber.replace(/\D/g, ""), 10)).filter((n) => !isNaN(n));
    const currentMax = salesReturnNums.length ? salesReturnNums.reduce((a, b) => (a > b ? a : b), 0) : 0;
    const storedMax = parseInt(localStorage.getItem("seq_sales_return") || "0", 10);
    const absoluteMax = Math.max(currentMax, storedMax);
    const nextSRNum = absoluteMax + 1;
    const num = `SR-${nextSRNum.toString().padStart(4, "0")}`;

    localStorage.setItem("seq_sales_return", nextSRNum.toString());
    const full: SalesReturn = {
      ...r,
      id,
      returnNumber: num,
      createdAt: new Date().toISOString(),
    };
    setSalesReturns((l) => [full, ...l]);
    logAudit("return_sale_created", `${num} — ${r.customerName}`, `الإجمالي: ${r.total}`);

    // Update stock (increase)
    setProducts((list) =>
      list.map((p) => {
        const matchingLines = r.lines.filter((x) => x.productId === p.id);
        if (matchingLines.length === 0) return p;
        const totalQty = matchingLines.reduce((sum, l) => sum + l.quantity, 0);
        if (matchingLines.some((l) => l.isRetailUnit) && p.piecesPerUnit) {
          return { ...p, ...applyPieceAddition(p, totalQty) };
        }
        return { ...p, quantity: p.quantity + totalQty };
      })
    );

    // Stock movements
    const movements: StockMovement[] = r.lines.map((l, idx) => ({
      id: uid(`mov_sr_${idx}`),
      productId: l.productId,
      productName: l.productName,
      type: "return",
      quantity: l.quantity,
      referenceId: id,
      referenceType: "sale",
      date: r.date,
      reason: `مرتجع مبيعات ${num}`,
    }));
    setStockMovements((l) => [...movements, ...l]);

    // FIX-02 + FIX-04: Compute cashRefund and update the invoice inside a
    // single setSalesInvoices callback to avoid stale closures and to pass
    // previousReturnsTotal for correct effectiveTotal computation.
    // We capture cashRefundAmount via a mutable ref so the cash entry below
    // can use it without a second settleSalesInvoiceReturn call.
    let cashRefundAmount = 0;
    const previousReturns = salesReturns.filter(
      (sr) => sr.originalInvoiceId === r.originalInvoiceId
    );
    const previousReturnsTotal = previousReturns.reduce((sum, sr) => sum + sr.total, 0);

    setSalesInvoices((list) =>
      list.map((inv) => {
        if (inv.id !== r.originalInvoiceId || inv.cancelled) return inv;
        const result = settleSalesInvoiceReturn(inv, r, previousReturnsTotal);
        cashRefundAmount = result.cashRefund;
        return result.invoice;
      })
    );

    // If no invoice was found (edge case), fall back to simple calculation
    if (cashRefundAmount === 0 && r.refundCash) {
      cashRefundAmount = r.total;
    }

    // Cash refund if applicable
    if (r.refundCash && cashRefundAmount > 0) {
      const ce: CashEntry = {
        id: uid("cash_sr"),
        type: "adjustment",
        amount: -cashRefundAmount,
        description: `رد نقدية لمرتجع مبيعات ${num} — ${r.customerName}`,
        referenceId: id,
        date: r.date,
      };
      setCashEntries((l) => [ce, ...l]);
    }

    return full;
  };

  const addPurchaseReturn: AppActions["addPurchaseReturn"] = (r) => {
    const id = uid("pr");
    const purchaseReturnNums = purchaseReturns.map((x) => parseInt(x.returnNumber.replace(/\D/g, ""), 10)).filter((n) => !isNaN(n));
    const currentMax = purchaseReturnNums.length ? purchaseReturnNums.reduce((a, b) => (a > b ? a : b), 0) : 0;
    const storedMax = parseInt(localStorage.getItem("seq_purchase_return") || "0", 10);
    const absoluteMax = Math.max(currentMax, storedMax);
    const nextPRNum = absoluteMax + 1;
    const num = `PR-${nextPRNum.toString().padStart(4, "0")}`;

    localStorage.setItem("seq_purchase_return", nextPRNum.toString());
    const full: PurchaseReturn = {
      ...r,
      id,
      returnNumber: num,
      createdAt: new Date().toISOString(),
    };
    setPurchaseReturns((l) => [full, ...l]);
    logAudit("return_purchase_created", `${num} — ${r.supplierName}`, `الإجمالي: ${r.total}`);

    // Update stock (decrease)
    setProducts((list) =>
      list.map((p) => {
        const totalQty = r.lines.filter((x) => x.productId === p.id).reduce((sum, l) => sum + l.quantity, 0);
        if (totalQty === 0) return p;
        return { ...p, quantity: Math.max(0, p.quantity - totalQty) };
      })
    );

    // Stock movements
    const movements: StockMovement[] = r.lines.map((l, idx) => ({
      id: uid(`mov_pr_${idx}`),
      productId: l.productId,
      productName: l.productName,
      type: "return",
      quantity: -l.quantity,
      referenceId: id,
      referenceType: "purchase",
      date: r.date,
      reason: `مرتجع توريد ${num}`,
    }));
    setStockMovements((l) => [...movements, ...l]);

    // FIX-03: Settle the invoice AND create a cash entry if the return
    // creates overpayment (i.e. supplier owes us money back).
    let purchaseRefundAmount = 0;
    setPurchaseInvoices((list) =>
      list.map((inv) => {
        if (inv.id !== r.originalInvoiceId) return inv;
        const settled = settlePurchaseInvoiceReturn(inv, r);
        // If the invoice was fully paid and the return reduces the total,
        // the difference becomes overpayment (supplier credit).
        const newOverpayment = settled.overpayment ?? 0;
        const prevOverpayment = inv.overpayment ?? 0;
        purchaseRefundAmount = Math.max(0, newOverpayment - prevOverpayment);
        return settled;
      })
    );

    // Record cash entry for the refundable overpayment from the return
    if (purchaseRefundAmount > 0) {
      const ce: CashEntry = {
        id: uid("cash_pr"),
        type: "adjustment",
        amount: purchaseRefundAmount,
        description: `رصيد دائن من مرتجع توريد ${num} — ${r.supplierName}`,
        referenceId: id,
        date: r.date,
      };
      setCashEntries((l) => [ce, ...l]);
    }

    return full;
  };

  // Stocktakes
  const addStocktake: AppActions["addStocktake"] = (s) => {
    const full: Stocktake = {
      ...s,
      id: uid("stk"),
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    setStocktakes((list) => [full, ...list]);
    return full;
  };

  const updateStocktakeItems: AppActions["updateStocktakeItems"] = (stocktakeId, items) => {
    setStocktakes((list) =>
      list.map((s) => (s.id === stocktakeId ? { ...s, items } : s))
    );
  };

  const applyStocktake: AppActions["applyStocktake"] = (stocktakeId) => {
    const stk = stocktakes.find((s) => s.id === stocktakeId);
    if (!stk || stk.status !== "draft") return;
    stk.items.forEach((item) => {
      if (item.countedQty === null && item.countedLoose == null) return;
      const prod = products.find((p) => p.id === item.productId);
      if (!prod) return;
      const delta = item.countedQty !== null ? item.countedQty - prod.quantity : 0;
      const looseDelta =
        prod.piecesPerUnit && item.countedLoose != null
          ? item.countedLoose - (prod.looseQuantity ?? 0)
          : 0;
      if (delta === 0 && looseDelta === 0) return;
      adjustStock(item.productId, delta, `جرد دوري ${stk.date}`, looseDelta !== 0 ? looseDelta : undefined);
    });
    setStocktakes((list) =>
      list.map((s) =>
        s.id === stocktakeId
          ? { ...s, status: "applied", appliedAt: new Date().toISOString() }
          : s
      )
    );
  };

  const deleteStocktake: AppActions["deleteStocktake"] = (stocktakeId) => {
    setStocktakes((list) => list.filter((s) => s.id !== stocktakeId));
  };

  // Quotations
  const addQuotation: AppActions["addQuotation"] = (q) => {
    const full: Quotation = {
      ...q,
      id: uid("quot"),
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    setQuotations((list) => [full, ...list]);
    return full;
  };

  const updateQuotation: AppActions["updateQuotation"] = (id, patch) => {
    setQuotations((list) =>
      list.map((q) => (q.id === id && q.status === "draft" ? { ...q, ...patch } : q))
    );
  };

  const deleteQuotation: AppActions["deleteQuotation"] = (id) => {
    setQuotations((list) => list.filter((q) => q.id !== id));
  };

  const convertQuotation: AppActions["convertQuotation"] = (quotationId, opts) => {
    const quot = quotations.find((q) => q.id === quotationId);
    if (!quot) throw new Error("Quotation not found");
    if (quot.status === "converted") throw new Error("Quotation already converted");
    // BUG-08: enforce stock availability — the sales pages block overselling,
    // so conversion must too (addSalesInvoice clamps stock at 0 silently).
    const requiredByProduct = new Map<string, number>();
    quot.lines.forEach((l) => {
      requiredByProduct.set(l.productId, (requiredByProduct.get(l.productId) ?? 0) + l.quantity);
    });
    const shortages: string[] = [];
    requiredByProduct.forEach((required, productId) => {
      const prod = products.find((p) => p.id === productId);
      if (!prod) {
        const name = quot.lines.find((l) => l.productId === productId)?.productName ?? productId;
        shortages.push(`${name}: المنتج لم يعد موجودًا`);
      } else if (required > prod.quantity) {
        shortages.push(`${prod.name}: متاح ${prod.quantity} / مطلوب ${required}`);
      }
    });
    if (shortages.length > 0) {
      throw new Error(`المخزون غير كافٍ — ${shortages.join(" • ")}`);
    }
    const conversion = quotationConversionFields(quot, opts.amountReceived);
    const inv = addSalesInvoice({
      invoiceNumber: opts.invoiceNumber,
      date: opts.date,
      customerId: quot.customerId,
      customerName: quot.customerName,
      driverId: opts.driverId,
      driverName: opts.driverName,
      lines: quot.lines,
      total: conversion.total,
      discount: quot.discount,
      amountReceived: conversion.amountReceived,
      overpayment: conversion.overpayment,
      paymentType: opts.paymentType,
      priceType: opts.priceType,
      paymentDueDate: opts.paymentDueDate,
      notes: quot.notes,
      createdByUserId: undefined,
    });
    setQuotations((list) =>
      list.map((q) =>
        q.id === quotationId ? { ...q, status: "converted", convertedInvoiceId: inv.id } : q
      )
    );
    return inv;
  };

  // Cashbox
  const addCashEntry: AppActions["addCashEntry"] = (entry) => {
    const full: CashEntry = {
      id: entry.id ?? uid("cash"),
      type: entry.type,
      amount: entry.amount,
      description: entry.description,
      referenceId: entry.referenceId,
      date: entry.date,
      paymentMethod: entry.paymentMethod,
    };
    setCashEntries((list) => [full, ...list]);
    if (!entry.referenceId && entry.type === "adjustment") {
      const action = entry.amount >= 0 ? "cash_manual_add" : "cash_manual_remove";
      logAudit(action, entry.description ?? "", `المبلغ: ${Math.abs(entry.amount)}`);
    }
    return full;
  };

  // Derived
  const currentCashBalance = useCallback(() => {
    return (
      settings.openingBalance +
      cashEntries.reduce((a, e) => a + e.amount, 0)
    );
  }, [settings.openingBalance, cashEntries]);

  const customerBalance = useCallback(
    (customerId: string) => {
      // remaining already reflects non-cash return credits.
      // overpayment (excess payment or excess return credit) further reduces the balance.
      return salesInvoices
        .filter((s) => s.customerId === customerId && !s.cancelled)
        .reduce((a, s) => a + s.remaining - (s.overpayment ?? 0), 0);
    },
    [salesInvoices]
  );

  const customerCredit = useCallback(
    (customerId: string) => {
      return salesInvoices
        .filter((s) => s.customerId === customerId)
        .reduce((a, s) => a + (s.overpayment ?? 0), 0);
    },
    [salesInvoices]
  );

  const settleAllDues = useCallback(
    (customerId: string): number => {
      const customerInvoices = salesInvoices.filter(
        (inv) => inv.customerId === customerId
      );
      const targets = customerInvoices
        .filter((inv) => !inv.cancelled && inv.remaining > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
      const sources = customerInvoices
        .filter((inv) => (inv.overpayment ?? 0) > 0)
        .sort((a, b) => b.date.localeCompare(a.date));
      if (targets.length === 0 || sources.length === 0) return 0;

      const updates = new Map<string, Partial<SalesInvoice>>();
      let creditPool = sources.reduce((sum, inv) => sum + (inv.overpayment ?? 0), 0);
      let totalSettled = 0;

      for (const target of targets) {
        if (creditPool <= 0) break;
        const apply = Math.min(creditPool, target.remaining);
        const newReceived = target.amountReceived + apply;
        updates.set(target.id, {
          amountReceived: newReceived,
          remaining: Math.max(0, target.total - newReceived),
          status: computeStatus(target.total, newReceived),
        });
        creditPool -= apply;
        totalSettled += apply;
      }

      let toReduce = totalSettled;
      for (const source of sources) {
        if (toReduce <= 0) break;
        const credit = source.overpayment ?? 0;
        const reduced = Math.min(toReduce, credit);
        const existing = updates.get(source.id) ?? {};
        updates.set(source.id, { ...existing, overpayment: Math.max(0, credit - reduced) });
        toReduce -= reduced;
      }

      if (totalSettled === 0) return 0;

      setSalesInvoices((list) =>
        list.map((inv) => {
          const patch = updates.get(inv.id);
          return patch ? { ...inv, ...patch } : inv;
        })
      );

      const customerName =
        salesInvoices.find((inv) => inv.customerId === customerId)?.customerName ?? customerId;
      logAudit("invoice_sale_updated", customerName, `تسوية رصيد دائن: ${totalSettled}`);
      return totalSettled;
    },
    [salesInvoices, logAudit]
  );

  const applyCustomerCredit: AppActions["applyCustomerCredit"] = (customerId, invoiceId, amount) => {
    if (amount <= 0) return;
    setSalesInvoices((list) => {
      const target = list.find((inv) => inv.id === invoiceId && inv.customerId === customerId);
      if (!target || target.remaining <= 0) return list;
      const sources = list
        .filter((inv) => inv.customerId === customerId && inv.id !== invoiceId && (inv.overpayment ?? 0) > 0)
        .sort((a, b) => b.date.localeCompare(a.date));
      if (sources.length === 0) return list;
      const updates = new Map<string, Partial<import("../types").SalesInvoice>>();
      const apply = Math.min(amount, target.remaining);
      const newReceived = target.amountReceived + apply;
      const creditEntry: import("../types").PaymentLogEntry = {
        id: uid("slog_cr"),
        date: todayISO(),
        amount: apply,
        paymentMethod: "other",
        notes: "رصيد دائن مستخدم",
      };
      updates.set(invoiceId, {
        amountReceived: newReceived,
        remaining: Math.max(0, target.total - newReceived),
        status: computeStatus(target.total, newReceived),
        paymentLog: [...(target.paymentLog ?? []), creditEntry],
      });
      let toReduce = apply;
      for (const source of sources) {
        if (toReduce <= 0) break;
        const credit = source.overpayment ?? 0;
        const reduced = Math.min(toReduce, credit);
        const existing = updates.get(source.id) ?? {};
        updates.set(source.id, {
          ...existing,
          overpayment: Math.max(0, credit - reduced) || undefined,
        });
        toReduce -= reduced;
      }
      return list.map((inv) => {
        const patch = updates.get(inv.id);
        return patch ? { ...inv, ...patch } : inv;
      });
    });
  };

  const settleSupplierDues = useCallback(
    (supplierId: string): number => {
      const supplierInvoices = purchaseInvoices.filter(
        (inv) => inv.supplierId === supplierId
      );
      const targets = supplierInvoices
        .filter((inv) => inv.remaining > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
      const sources = supplierInvoices
        .filter((inv) => (inv.overpayment ?? 0) > 0)
        .sort((a, b) => b.date.localeCompare(a.date));
      if (targets.length === 0 || sources.length === 0) return 0;

      const updates = new Map<string, Partial<PurchaseInvoice>>();
      let creditPool = sources.reduce((sum, inv) => sum + (inv.overpayment ?? 0), 0);
      let totalSettled = 0;

      for (const target of targets) {
        if (creditPool <= 0) break;
        const apply = Math.min(creditPool, target.remaining);
        const newPaid = target.amountPaid + apply;
        updates.set(target.id, {
          amountPaid: newPaid,
          remaining: Math.max(0, target.total - newPaid),
          status: computeStatus(target.total, newPaid),
        });
        creditPool -= apply;
        totalSettled += apply;
      }

      let toReduce = totalSettled;
      for (const source of sources) {
        if (toReduce <= 0) break;
        const credit = source.overpayment ?? 0;
        const reduced = Math.min(toReduce, credit);
        const existing = updates.get(source.id) ?? {};
        updates.set(source.id, { ...existing, overpayment: Math.max(0, credit - reduced) || undefined });
        toReduce -= reduced;
      }

      if (totalSettled === 0) return 0;

      setPurchaseInvoices((list) =>
        list.map((inv) => {
          const patch = updates.get(inv.id);
          return patch ? { ...inv, ...patch } : inv;
        })
      );

      const supplierName =
        purchaseInvoices.find((inv) => inv.supplierId === supplierId)?.supplierName ?? supplierId;
      logAudit("invoice_purchase_updated", supplierName, `تسوية رصيد مورد دائن: ${totalSettled}`);
      return totalSettled;
    },
    [purchaseInvoices, logAudit]
  );

  const supplierBalance = useCallback(
    (supplierId: string) => {
      return purchaseInvoices
        .filter((p) => p.supplierId === supplierId)
        .reduce((a, p) => a + p.remaining - (p.overpayment ?? 0), 0);
    },
    [purchaseInvoices]
  );

  const supplierCredit = useCallback(
    (supplierId: string) => {
      return purchaseInvoices
        .filter((p) => p.supplierId === supplierId)
        .reduce((a, p) => a + (p.overpayment ?? 0), 0);
    },
    [purchaseInvoices]
  );

  const calculateSupplierCommission: AppActions["calculateSupplierCommission"] = useCallback((supplierId) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier || !supplier.commissionTiers) return [];

    const now = new Date();
    const todayStr = localISODate(now);

    return supplier.commissionTiers.map(tier => {
      const startDate = new Date();
      startDate.setDate(now.getDate() - tier.periodDays);
      const startDateStr = localISODate(startDate);

      const purchasesSum = purchaseInvoices
        .filter(inv => inv.supplierId === supplierId && inv.date >= startDateStr && inv.date <= todayStr)
        .reduce((sum, inv) => sum + inv.total, 0);

      const returnsSum = purchaseReturns
        .filter(ret => ret.supplierId === supplierId && ret.date >= startDateStr && ret.date <= todayStr)
        .reduce((sum, ret) => sum + ret.total, 0);

      const totalPurchases = Math.max(0, purchasesSum - returnsSum);

      let earned = 0;
      if (totalPurchases >= tier.threshold) {
        if (tier.commissionType === "percentage") {
          earned = (totalPurchases * tier.commissionValue) / 100;
        } else {
          earned = tier.commissionValue;
        }
      }

      return {
        tierId: tier.id,
        threshold: tier.threshold,
        periodDays: tier.periodDays,
        totalPurchases,
        earned,
        commissionType: tier.commissionType,
        commissionValue: tier.commissionValue,
      };
    });
  }, [suppliers, purchaseInvoices, purchaseReturns]);

  const employeeSalesStats: AppActions["employeeSalesStats"] = useCallback(
    (userId, month) => {
      const employee = users.find((u) => u.id === userId);
      const [yearStr, monStr] = month.split("-");
      const year = parseInt(yearStr, 10);
      const mon = parseInt(monStr, 10);
      // BUG-04: build boundaries from the LOCAL calendar
      const monthStart = localISODate(new Date(year, mon - 1, 1));
      const monthEnd = localISODate(new Date(year, mon, 0));

      const totalCollected = employeeCollectedCash(
        salesInvoices,
        salesReturns,
        cashEntries,
        userId,
        monthStart,
        monthEnd,
      );

      const monthConfig = employee?.monthlyConfigs?.[month];
      const commissionPct = monthConfig?.commissionPct ?? employee?.salesCommissionPct ?? 0;
      const target = monthConfig?.target ?? employee?.monthlySalesTarget ?? 0;
      const commissionEarned = (totalCollected * commissionPct) / 100;
      const salary = employee?.monthlySalary ?? 0;

      const MONTH_NAMES = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
      return {
        totalCollected,
        commissionEarned,
        commissionPct,
        target,
        salary,
        totalEarnings: salary + commissionEarned,
        monthLabel: `${MONTH_NAMES[mon - 1]} ${year}`,
      };
    },
    [users, salesInvoices, salesReturns, cashEntries]
  );

  // --- Backup & Export ---

  const buildBackupData = useCallback(() => {
    // SECURITY: Strip passwordHash from exported user data
    const safeUsers = redactUserPasswordHashes(users);
    return {
      version: "1.0",
      timestamp: new Date().toISOString(),
      state: {
        settings, products, suppliers, customers, purchaseInvoices, salesInvoices,
        stockMovements, cashEntries, discountCodes, nextProductCode, nextSupplierCode, nextCustomerCode, users: safeUsers, salesReturns, purchaseReturns, drivers, auditLogs, quotations, stocktakes,
        vehicles, washServices, queueTickets, nextQueueNumber,
      }
    };
  }, [settings, products, suppliers, customers, purchaseInvoices, salesInvoices, stockMovements, cashEntries, discountCodes, nextProductCode, nextSupplierCode, nextCustomerCode, users, salesReturns, purchaseReturns, drivers, auditLogs, quotations, stocktakes, vehicles, washServices, queueTickets, nextQueueNumber]);

  const exportBackup: AppActions["exportBackup"] = useCallback(() => {
    const blob = new Blob([JSON.stringify(buildBackupData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `backup_${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [buildBackupData]);

  // Write a full backup to the configured folder (local / external / network).
  // `dirOverride` lets the Settings page back up to a freshly-picked path before it is saved.
  const backupToPath: AppActions["backupToPath"] = useCallback(async (dirOverride?: string) => {
    const dir = (dirOverride ?? settings.backupPath)?.trim();
    if (!dir) return { ok: false, error: "no_path" };
    if (!window.desktopAPI?.backup) return { ok: false, error: "not_desktop" };
    const content = JSON.stringify(buildBackupData(), null, 2);
    const result = await window.desktopAPI.backup.writeFile(dir, backupFileName(new Date()), content);
    if (result.ok) {
      setSettings((s) => ({ ...s, lastBackupDate: new Date().toISOString() }));
    }
    return result;
  }, [settings.backupPath, buildBackupData]);

  // Run an automatic backup once per session, on startup, when one is due.
  const autoBackupRanRef = useRef(false);
  useEffect(() => {
    if (autoBackupRanRef.current) return;
    if (!isDesktop || currentUser?.role !== "owner") return;
    const due = isAutoBackupDue({
      enabled: settings.autoBackupEnabled,
      backupPath: settings.backupPath ?? "",
      frequency: settings.autoBackupFrequency,
      lastBackupDate: settings.lastBackupDate,
      now: Date.now(),
    });
    if (!due) return;
    autoBackupRanRef.current = true;
    void backupToPath();
  }, [
    isDesktop,
    currentUser,
    settings.autoBackupEnabled,
    settings.backupPath,
    settings.autoBackupFrequency,
    settings.lastBackupDate,
    backupToPath,
  ]);

  // Backup-on-close: when the main process is about to close the window it
  // pings us; take a backup to the configured folder (owner + path required),
  // then tell main it can finish closing.
  useEffect(() => {
    const appApi = window.desktopAPI?.app;
    if (!isDesktop || !appApi?.onRunCloseBackup) return;
    const off = appApi.onRunCloseBackup(async () => {
      try {
        if (settings.backupOnClose && settings.backupPath?.trim() && currentUser?.role === "owner") {
          await backupToPath();
        }
      } catch {
        /* never block the quit on a backup failure */
      } finally {
        appApi.closeBackupDone();
      }
    });
    return off;
  }, [isDesktop, settings.backupOnClose, settings.backupPath, currentUser, backupToPath]);

  const importBackup: AppActions["importBackup"] = useCallback(async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.state || !data.version) return false;

      // SECURITY: Validate required structure keys
      const s = data.state;
      const requiredKeys = ["products", "customers", "suppliers"];
      if (!requiredKeys.some(k => Array.isArray(s[k]))) return false;

      if (s.settings) setSettings(applyLicenseSettings(normalizeSettings(s.settings), licenseStatus));
      if (Array.isArray(s.products)) setProducts(s.products.map(normalizeProduct));
      if (Array.isArray(s.suppliers)) setSuppliers(s.suppliers);
      if (Array.isArray(s.customers)) setCustomers(s.customers);
      if (Array.isArray(s.purchaseInvoices)) setPurchaseInvoices(s.purchaseInvoices);
      if (Array.isArray(s.salesInvoices)) {
        setSalesInvoices(s.salesInvoices.map(normalizeSalesInvoice));
      }
      if (Array.isArray(s.stockMovements)) setStockMovements(s.stockMovements);
      if (Array.isArray(s.cashEntries)) setCashEntries(s.cashEntries);
      if (Array.isArray(s.discountCodes)) setDiscountCodes(s.discountCodes);
      const importedProducts: Product[] = Array.isArray(s.products) ? s.products : [];
      if (typeof s.nextProductCode === "number") {
        setNextProductCode(s.nextProductCode);
      } else if (importedProducts.length > 0) {
        // derive the counter from numeric product codes (same fallback the
        // supplier/customer counters already had) so future auto-codes can't collide
        const maxCode = importedProducts.reduce((max, p) => {
          const num = Number(String(p.code ?? "").trim());
          return Number.isInteger(num) ? Math.max(max, num) : max;
        }, 999);
        setNextProductCode(maxCode + 1);
      }
      const importedSuppliers = Array.isArray(s.suppliers) ? s.suppliers : [];
      if (typeof s.nextSupplierCode === "number") {
        setNextSupplierCode(Math.max(s.nextSupplierCode, nextSupplierCodeFromExisting(importedSuppliers)));
      } else if (importedSuppliers.length > 0) {
        setNextSupplierCode(nextSupplierCodeFromExisting(importedSuppliers));
      }
      const importedCustomers = Array.isArray(s.customers) ? s.customers : [];
      if (typeof s.nextCustomerCode === "number") {
        setNextCustomerCode(s.nextCustomerCode);
      } else if (importedCustomers.length > 0) {
        const maxCode = importedCustomers.reduce((max: number, c: Record<string, unknown>) => {
          const match = /^CUS-(\d+)$/i.exec(String(c.code ?? "").trim());
          return match ? Math.max(max, Number(match[1])) : max;
        }, 0);
        setNextCustomerCode(maxCode + 1);
      }
      // SECURITY: Users with [REDACTED] passwords are NOT imported — keep current users
      if (Array.isArray(s.users)) {
        const hasValidPasswords = s.users.every((u: Record<string, unknown>) => typeof u.passwordHash === "string" && u.passwordHash !== "[REDACTED]");
        if (hasValidPasswords) setUsers(s.users.map(normalizeUser));
      }
      if (Array.isArray(s.salesReturns)) setSalesReturns(s.salesReturns);
      if (Array.isArray(s.purchaseReturns)) setPurchaseReturns(s.purchaseReturns);
      if (Array.isArray(s.drivers)) setDrivers(s.drivers);
      if (Array.isArray(s.auditLogs)) setAuditLogs(s.auditLogs);
      if (Array.isArray(s.quotations)) setQuotations(s.quotations);
      if (Array.isArray(s.stocktakes)) setStocktakes(s.stocktakes);
      if (Array.isArray(s.vehicles)) setVehicles(s.vehicles);
      if (Array.isArray(s.washServices)) setWashServices(normalizeWashServices(s.washServices));
      if (Array.isArray(s.queueTickets)) {
        const tickets = normalizeQueueTickets(s.queueTickets);
        setQueueTickets(tickets);
        setNextQueueNumber(nextDailyQueueNumber(tickets));
      } else if (typeof s.nextQueueNumber === "number") {
        setNextQueueNumber(s.nextQueueNumber);
      }

      return true;
    } catch {
      return false;
    }
  }, [licenseStatus]);

  const exportToExcel: AppActions["exportToExcel"] = useCallback((type) => {
    let rows: (string | number | undefined)[][] = [];
    let headers: string[] = [];

    if (type === "products") {
      headers = ["الكود", "الباركود", "الاسم", "الفئة", "الكمية", "سعر الشراء", "سعر الجملة", "سعر التجزئة"];
      rows = products.map(p => [p.code, p.barcode, p.name, p.category, p.quantity, p.purchasePrice, p.wholesalePrice, p.retailPrice]);
    } else if (type === "customers") {
      headers = ["الاسم", "الهاتف", "العنوان", "الرصيد"];
      rows = customers.map(c => [c.name, c.phone, c.address, customerBalance(c.id)]);
    } else if (type === "suppliers") {
      headers = ["الاسم", "الهاتف", "الرصيد"];
      rows = suppliers.map(s => [s.name, s.phone, supplierBalance(s.id)]);
    } else if (type === "sales") {
      headers = ["رقم الفاتورة", "التاريخ", "العميل", "الإجمالي", "المُحصَّل", "المتبقي", "الحالة", "ملغاة"];
      rows = salesInvoices.map(s => [
        s.invoiceNumber, s.date, s.customerName, s.total,
        s.amountReceived + (s.overpayment ?? 0), s.remaining,
        s.status, s.cancelled ? "نعم" : "لا",
      ]);
    } else if (type === "purchases") {
      headers = ["رقم الفاتورة", "التاريخ", "المورد", "الإجمالي", "الحالة"];
      rows = purchaseInvoices.map(p => [p.invoiceNumber, p.date, p.supplierName, p.total, p.status]);
    } else if (type === "stock") {
      headers = ["الكود", "المنتج", "الكمية", "قيمة المخزون"];
      rows = products.map(p => [p.code, p.name, p.quantity, p.quantity * p.purchasePrice]);
    } else if (type === "supplierDues") {
      headers = ["رقم الفاتورة", "التاريخ", "المورد", "الهاتف", "الإجمالي", "المدفوع", "المتبقي", "الحالة", "عمر الفاتورة بالأيام"];
      rows = purchaseInvoices
        .filter((p) => p.remaining > 0)
        .sort((a, b) => {
          const byDate = a.date.localeCompare(b.date);
          return byDate !== 0 ? byDate : b.remaining - a.remaining;
        })
        .map((p) => {
          const supplier = suppliers.find((s) => s.id === p.supplierId);
          const issuedAt = new Date(p.date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          issuedAt.setHours(0, 0, 0, 0);
          const ageDays = Number.isNaN(issuedAt.getTime())
            ? 0
            : Math.max(0, Math.floor((today.getTime() - issuedAt.getTime()) / (1000 * 60 * 60 * 24)));
          return [
            p.invoiceNumber,
            p.date,
            p.supplierName,
            supplier?.phone,
            p.total,
            p.amountPaid,
            p.remaining,
            p.status,
            ageDays,
          ];
        });
    } else if (type === "commissions") {
      headers = ["المورد", "إجمالي المشتريات", "البونص المستحق"];
      rows = suppliers.map(s => {
        const comms = calculateSupplierCommission(s.id);
        const totalEarned = comms.reduce((a, c) => a + c.earned, 0);
        const totalPurch = comms[0]?.totalPurchases || 0;
        return [s.name, totalPurch, totalEarned];
      });
    }

    const sheetNames: Record<typeof type, string> = {
      products: "\u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A",
      customers: "\u0627\u0644\u0639\u0645\u0644\u0627\u0621",
      suppliers: "\u0627\u0644\u0645\u0648\u0631\u062F\u064A\u0646",
      sales: "\u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A",
      purchases: "\u0627\u0644\u0645\u0634\u062A\u0631\u064A\u0627\u062A",
      stock: "\u0627\u0644\u0645\u062E\u0632\u0648\u0646",
      supplierDues: "\u0645\u0633\u062A\u062D\u0642\u0627\u062A \u0627\u0644\u0645\u0648\u0631\u062F\u064A\u0646",
      commissions: "\u0639\u0645\u0648\u0644\u0627\u062A \u0627\u0644\u0645\u0648\u0631\u062F\u064A\u0646",
    };
    const bytes = buildXlsx([{ name: sheetNames[type], headers, rows }]);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${type}_export_${todayISO()}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }, [products, customers, suppliers, salesInvoices, purchaseInvoices, customerBalance, supplierBalance, calculateSupplierCommission]);

  const value: AppContextValue = useMemo(
    () => ({
      auth,
      licenseStatus,
      isDesktop,
      ownerExists,
      ownerCheckPending,
      settings,
      products,
      suppliers,
      customers,
      purchaseInvoices,
      salesInvoices,
      stockMovements,
      cashEntries,
      discountCodes,
      nextProductCode,
      nextSupplierCode,
      nextCustomerCode,
      salesReturns,
      purchaseReturns,
      drivers,
      users,
      currentUser,
      login,
      logout,
      refreshLicenseStatus,
      activateLicense,
      createOwner,
      resetDemo,
      updateSettings,
      addUser,
      updateUser,
      updateCurrentUserProfile,
      deleteUser,
      addProduct,
      updateProduct,
      deleteProduct,
      adjustStock,
      addSupplier,
      updateSupplier,
      deleteSupplier,
      addCommissionTier,
      updateCommissionTier,
      deleteCommissionTier,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      addDriver,
      updateDriver,
      deleteDriver,
      addPurchaseInvoice,
      updatePurchaseInvoice,
      recordPurchasePayment,
      deletePurchaseInvoice,
      addSalesInvoice,
      updateSalesInvoice,
      recordSalesReceipt,
      cancelSalesInvoice,
      deleteSalesInvoice,
      applyCustomerCredit,
      addSalesReturn,
      addPurchaseReturn,
      addCashEntry,
      restoreDeletedInvoice,
      currentCashBalance,
      customerBalance,
      customerCredit,
      settleAllDues,
      settleSupplierDues,
      supplierBalance,
      supplierCredit,
      quotations,
      addQuotation,
      updateQuotation,
      convertQuotation,
      deleteQuotation,
      stocktakes,
      addStocktake,
      updateStocktakeItems,
      applyStocktake,
      deleteStocktake,
      auditLogs,
      calculateSupplierCommission,
      employeeSalesStats,
      exportBackup,
      importBackup,
      backupToPath,
      exportToExcel,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      auth,
      licenseStatus,
      isDesktop,
      ownerExists,
      ownerCheckPending,
      settings,
      products,
      suppliers,
      customers,
      purchaseInvoices,
      salesInvoices,
      stockMovements,
      cashEntries,
      discountCodes,
      discountCodes,
      nextProductCode,
      nextSupplierCode,
      nextCustomerCode,
      salesReturns,
      purchaseReturns,
      drivers,
      auditLogs,
      quotations,
      stocktakes,
      users,
      currentUser,
      login,
      refreshLicenseStatus,
      activateLicense,
      createOwner,
      updateCurrentUserProfile,
      calculateSupplierCommission,
      settleAllDues,
      employeeSalesStats,
      exportBackup,
      importBackup,
      backupToPath,
      exportToExcel,
    ]
  );

  // F3-6: settings, the audit log, and session/auth are also exposed through
  // dedicated contexts so their consumers re-render independently of the main store.
  const settingsValue = useMemo(() => ({ settings, updateSettings }), [settings, updateSettings]);
  // restoreDeletedInvoice is a plain function (same pattern as catalog actions);
  // every path that mutates invoices also appends an audit entry, so memoizing
  // on auditLogs alone always captures fresh state.
  const auditLogValue = useMemo(
    () => ({ auditLogs, restoreDeletedInvoice }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auditLogs]
  );
  const authValue = useMemo(
    () => ({
      auth,
      currentUser,
      isDesktop,
      licenseStatus,
      ownerExists,
      ownerCheckPending,
      isLocked,
      login,
      devLogin,
      logout,
      lockSession,
      unlockSession,
      createOwner,
      activateLicense,
      refreshLicenseStatus,
      updateCurrentUserProfile,
    }),
    [
      auth,
      currentUser,
      isDesktop,
      licenseStatus,
      ownerExists,
      ownerCheckPending,
      isLocked,
      login,
      devLogin,
      logout,
      lockSession,
      unlockSession,
      createOwner,
      activateLicense,
      refreshLicenseStatus,
      updateCurrentUserProfile,
    ]
  );

  // F3-6: Users slice — users array + CRUD (plain functions, data-only deps).
  const usersValue = useMemo(
    () => ({ users, addUser, updateUser, deleteUser }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users]
  );

  // F3-6: Reporting slice — derived selectors only (all are stable useCallbacks).
  const reportingValue = useMemo(
    () => ({ customerBalance, customerCredit, supplierBalance, supplierCredit, calculateSupplierCommission, employeeSalesStats, exportToExcel }),
    [customerBalance, customerCredit, supplierBalance, supplierCredit, calculateSupplierCommission, employeeSalesStats, exportToExcel]
  );

  // F3-6: Invoicing slice — sales/purchase invoices, returns, cashbox, stock movements + actions.
  // Same intentional pattern as catalogValue: memoize on data arrays only.
  const invoicingValue = useMemo(
    () => ({
      quotations, addQuotation, updateQuotation, convertQuotation, deleteQuotation,
      salesInvoices, purchaseInvoices, salesReturns, purchaseReturns, cashEntries, stockMovements,
      discountCodes,
      addSalesInvoice, updateSalesInvoice, recordSalesReceipt, cancelSalesInvoice,
      deleteSalesInvoice, applyCustomerCredit, settleAllDues, settleSupplierDues,
      addPurchaseInvoice, updatePurchaseInvoice, recordPurchasePayment, deletePurchaseInvoice,
      addSalesReturn, addPurchaseReturn,
      addCashEntry, currentCashBalance,
    }),
    // currentCashBalance is a useCallback that also depends on settings.openingBalance,
    // so it must be a dep here — otherwise editing the opening balance leaves consumers
    // (Cashbox "الرصيد الحالي", Dashboard) holding a stale balance closure until the next
    // cash entry or a restart. Other actions are plain functions and stay omitted by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quotations, salesInvoices, purchaseInvoices, salesReturns, purchaseReturns, cashEntries, stockMovements, discountCodes, currentCashBalance]
  );

  // F3-6: Catalog slice — products / suppliers / customers / drivers + their CRUD actions.
  // Actions are plain functions (not useCallback), so we omit them from deps intentionally
  // (same pattern as the main value useMemo above) and only invalidate on data changes.
  const catalogValue = useMemo(
    () => ({
      products, suppliers, customers, drivers, stocktakes,
      nextProductCode, nextSupplierCode, nextCustomerCode,
      addProduct, updateProduct, deleteProduct, archiveProduct, adjustStock,
      addSupplier, updateSupplier, deleteSupplier, archiveSupplier,
      addCommissionTier, updateCommissionTier, deleteCommissionTier,
      addCustomer, updateCustomer, deleteCustomer, archiveCustomer,
      addDriver, updateDriver, deleteDriver,
      addStocktake, updateStocktakeItems, applyStocktake, deleteStocktake,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, suppliers, customers, drivers, stocktakes, nextProductCode, nextSupplierCode, nextCustomerCode]
  );

  // Car Wash slice — vehicles / wash services / queue + their actions.
  // Same intentional pattern as catalogValue: memoize on data arrays only
  // (actions are plain functions that read fresh state via setState updaters).
  const carwashValue = useMemo(
    () => ({
      vehicles, addVehicle, updateVehicle, deleteVehicle, archiveVehicle,
      washServices, addWashService, updateWashService, deleteWashService,
      queueTickets, nextQueueNumber,
      addQueueTicket, addQueueTickets, updateQueueTicket, setQueueStatus, reorderQueueTicket, requeueTicket,
      receiveVehicleKey, deliverVehicleKey,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicles, washServices, queueTickets, nextQueueNumber]
  );

  return (
    <SettingsContext.Provider value={settingsValue}>
      <AuditLogContext.Provider value={auditLogValue}>
        <AuthContext.Provider value={authValue}>
          <CatalogContext.Provider value={catalogValue}>
            <CarwashContext.Provider value={carwashValue}>
              <UsersContext.Provider value={usersValue}>
                <InvoicingContext.Provider value={invoicingValue}>
                  <ReportingContext.Provider value={reportingValue}>
                    <AppContext.Provider value={value}>{children}</AppContext.Provider>
                  </ReportingContext.Provider>
                </InvoicingContext.Provider>
              </UsersContext.Provider>
            </CarwashContext.Provider>
          </CatalogContext.Provider>
        </AuthContext.Provider>
      </AuditLogContext.Provider>
    </SettingsContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
