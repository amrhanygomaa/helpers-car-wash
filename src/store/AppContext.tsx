import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  CashEntry,
  Customer,
  Product,
  PurchaseInvoice,
  SalesInvoice,
  Settings,
  StockMovement,
  Supplier,
  AppUser,
  SalesReturn,
  PurchaseReturn,
  Driver,
  CommissionTier,
  CommissionType,
  LicenseStatus,
} from "../types";
import { lsClearAll, lsGet, lsSet } from "../lib/storage";
import { verifyFallbackPassword } from "../lib/auth";
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
} from "../data/seed";
import { uid } from "../lib/utils";

interface AuthState {
  isAuthenticated: boolean;
  username?: string;
}

interface AppState {
  auth: AuthState;
  licenseStatus: LicenseStatus | null;
  isDesktop: boolean;
  ownerExists: boolean;
  settings: Settings;
  products: Product[];
  suppliers: Supplier[];
  customers: Customer[];
  purchaseInvoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
  stockMovements: StockMovement[];
  cashEntries: CashEntry[];
  nextProductCode: number;
  users: AppUser[];
  currentUser: AppUser | null;
  salesReturns: SalesReturn[];
  purchaseReturns: PurchaseReturn[];
  drivers: Driver[];
}

interface AppActions {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  refreshLicenseStatus: () => Promise<LicenseStatus | null>;
  activateLicense: (serial: string) => Promise<{ ok: boolean; status: LicenseStatus }>;
  createOwner: (username: string, password: string) => Promise<boolean>;
  resetDemo: () => void;
  updateSettings: (patch: Partial<Settings>) => void;

  // Users
  addUser: (u: Omit<AppUser, "id" | "createdAt">) => AppUser;
  updateUser: (id: string, patch: Partial<AppUser>) => void;
  deleteUser: (id: string) => boolean;

  // Products
  addProduct: (p: Omit<Product, "id" | "createdAt">) => Product;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  deleteProduct: (id: string) => boolean;
  adjustStock: (
    productId: string,
    delta: number,
    reason: string
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
  recordPurchasePayment: (id: string, amount: number) => void;
  deletePurchaseInvoice: (id: string) => boolean;

  // Sales invoices
  addSalesInvoice: (
    inv: Omit<SalesInvoice, "id" | "createdAt" | "status" | "remaining">
  ) => SalesInvoice;
  recordSalesReceipt: (id: string, amount: number) => void;
  cancelSalesInvoice: (id: string) => void;
  deleteSalesInvoice: (id: string) => boolean;

  // Returns
  addSalesReturn: (
    r: Omit<SalesReturn, "id" | "createdAt" | "returnNumber">
  ) => SalesReturn;
  addPurchaseReturn: (
    r: Omit<PurchaseReturn, "id" | "createdAt" | "returnNumber">
  ) => PurchaseReturn;

  // Cashbox
  addCashEntry: (
    entry: Omit<CashEntry, "id"> & { id?: string }
  ) => CashEntry;

  // Derived
  currentCashBalance: () => number;
  customerBalance: (customerId: string) => number;
  supplierBalance: (supplierId: string) => number;
  calculateSupplierCommission: (supplierId: string) => { 
    tierId: string; 
    threshold: number; 
    periodDays: number; 
    totalPurchases: number; 
    earned: number;
    commissionType: CommissionType;
    commissionValue: number;
  }[];

  // Backup & Import
  exportBackup: () => void;
  importBackup: (file: File) => Promise<boolean>;
  exportToCSV: (dataType: "products" | "customers" | "suppliers" | "sales" | "purchases" | "stock" | "commissions") => void;
}

type AppContextValue = AppState & AppActions;

const AppContext = createContext<AppContextValue | null>(null);

function computeStatus(
  total: number,
  paid: number
): "paid" | "partial" | "unpaid" {
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partial";
}

function monthsBetween(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.max(
    0,
    Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
  );
}

function applyLicenseSettings(settings: Settings, status: LicenseStatus | null): Settings {
  if (!status?.license) return settings;
  const license = status.license;
  return {
    ...settings,
    subscriptionType: license.subscriptionType,
    subscriptionStartDate: license.subscriptionStartDate.slice(0, 10),
    subscriptionMonths:
      license.subscriptionType === "limited"
        ? monthsBetween(license.subscriptionStartDate, license.subscriptionExpiresAt)
        : 0,
    warrantyType: license.warrantyExpiresAt ? "limited" : "none",
    warrantyStartDate: license.warrantyStartDate?.slice(0, 10) || "",
    warrantyMonths: monthsBetween(license.warrantyStartDate, license.warrantyExpiresAt),
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
  const [auth, setAuth] = useState<AuthState>(() =>
    lsGet<AuthState>("auth", { isAuthenticated: false })
  );
  const [settings, setSettings] = useState<Settings>(() =>
    lsGet<Settings>("settings", seedSettings)
  );
  const [products, setProducts] = useState<Product[]>(() =>
    lsGet<Product[]>("products", seedProducts)
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
    lsGet<SalesInvoice[]>("salesInvoices", seedSalesInvoices)
  );
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() =>
    lsGet<StockMovement[]>("stockMovements", seedStockMovements)
  );
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(() =>
    lsGet<CashEntry[]>("cashEntries", seedCashEntries)
  );
  const [nextProductCode, setNextProductCode] = useState<number>(() =>
    lsGet<number>("nextProductCode", 1000)
  );
  const [users, setUsers] = useState<AppUser[]>(() =>
    lsGet<AppUser[]>("users", seedUsers)
  );
  const [salesReturns, setSalesReturns] = useState<SalesReturn[]>(() =>
    lsGet<SalesReturn[]>("salesReturns", [])
  );
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>(() =>
    lsGet<PurchaseReturn[]>("purchaseReturns", [])
  );
  const [drivers, setDrivers] = useState<Driver[]>(() => lsGet("drivers", []));

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

  // --- Auto Backup Logic ---
  useEffect(() => {
    if (!settings.autoBackupEnabled) return;

    const now = new Date();
    const lastBackup = settings.lastBackupDate;

    let shouldBackup = false;
    if (!lastBackup) {
      shouldBackup = true;
    } else {
      const last = new Date(lastBackup);
      const diffMs = now.getTime() - last.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (settings.autoBackupFrequency === "daily" && diffDays >= 1) shouldBackup = true;
      if (settings.autoBackupFrequency === "weekly" && diffDays >= 7) shouldBackup = true;
      if (settings.autoBackupFrequency === "monthly" && diffDays >= 30) shouldBackup = true;
    }

    if (shouldBackup) {
      const data = {
        version: "1.0",
        timestamp: now.toISOString(),
        state: {
          settings, products, suppliers, customers, purchaseInvoices, salesInvoices,
          stockMovements, cashEntries, nextProductCode, users, salesReturns, purchaseReturns, drivers
        }
      };
      lsSet("inventory_auto_backup_internal", data);
      setSettings((current) => ({ ...current, lastBackupDate: now.toISOString() }));
      // SECURITY: Use a non-sensitive log message
      void 0; // Auto-backup performed silently
    }
  }, [settings, products, suppliers, customers, purchaseInvoices, salesInvoices, stockMovements, cashEntries, nextProductCode, users, salesReturns, purchaseReturns, drivers]);

  // Session backup
  useEffect(() => {
    const handleBeforeUnload = () => {
      const data = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        state: {
          settings, products, suppliers, customers, purchaseInvoices, salesInvoices,
          stockMovements, cashEntries, nextProductCode, users, salesReturns, purchaseReturns, drivers
        }
      };
      lsSet("inventory_last_session_backup", data);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [settings, products, suppliers, customers, purchaseInvoices, salesInvoices, stockMovements, cashEntries, nextProductCode, users, salesReturns, purchaseReturns, drivers]);
  
  const currentUser = useMemo(() => {
    if (!auth.isAuthenticated || !auth.username) return null;
    return users.find((u) => u.username === auth.username) || null;
  }, [users, auth]);
  const ownerExists = useMemo(() => users.some((u) => u.role === "owner"), [users]);

  useEffect(() => lsSet("auth", auth), [auth]);
  useEffect(() => lsSet("settings", settings), [settings]);
  useEffect(() => lsSet("products", products), [products]);
  useEffect(() => lsSet("suppliers", suppliers), [suppliers]);
  useEffect(() => lsSet("customers", customers), [customers]);
  useEffect(
    () => lsSet("purchaseInvoices", purchaseInvoices),
    [purchaseInvoices]
  );
  useEffect(() => lsSet("salesInvoices", salesInvoices), [salesInvoices]);
  useEffect(() => lsSet("stockMovements", stockMovements), [stockMovements]);
  useEffect(() => lsSet("cashEntries", cashEntries), [cashEntries]);
  useEffect(() => lsSet("nextProductCode", nextProductCode), [nextProductCode]);
  useEffect(() => lsSet("users", users), [users]);
  useEffect(() => lsSet("salesReturns", salesReturns), [salesReturns]);
  useEffect(() => lsSet("purchaseReturns", purchaseReturns), [purchaseReturns]);
  useEffect(() => lsSet("drivers", drivers), [drivers]);

  const login = useCallback(async (username: string, passwordRaw: string) => {
    if (window.desktopAPI?.auth) {
      const result = await window.desktopAPI.auth.login(username, passwordRaw);
      if (!result.ok) return false;
      if (result.user) {
        const updatedUser = result.user;
        setUsers((list) =>
          list.map((u) => (u.id === updatedUser.id ? updatedUser : u))
        );
      }
      setAuth({ isAuthenticated: true, username });
      return true;
    }

    const user = users.find((u) => u.username === username);
    if (!user) return false;
    if (!(await verifyFallbackPassword(user.passwordHash, passwordRaw))) return false;
    setAuth({ isAuthenticated: true, username });
    return true;
  }, [users]);
  const logout = useCallback(() => {
    setAuth({ isAuthenticated: false });
  }, []);

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
    const result = await window.desktopAPI.license.activate(serial);
    setLicenseStatus(result.status);
    setSettings((current) => applyLicenseSettings(current, result.status));
    return result;
  }, []);

  const createOwner = useCallback(async (username: string, password: string) => {
    if (window.desktopAPI?.setup) {
      const result = await window.desktopAPI.setup.createOwner(username, password);
      if (!result.ok || !result.user) return false;
      const owner = result.user;
      setUsers((list) => [owner, ...list.filter((u) => u.id !== owner.id)]);
      setAuth({ isAuthenticated: true, username: owner.username });
      return true;
    }
    return false;
  }, []);

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
    setUsers(seedUsers);
    setSalesReturns([]);
    setPurchaseReturns([]);
    setDrivers([]);
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
      ...u,
      id: uid("usr"),
      createdAt: new Date().toISOString(),
    };
    setUsers((list) => [user, ...list]);
    return user;
  };
  const updateUser: AppActions["updateUser"] = (id, patch) => {
    setUsers((list) =>
      list.map((u) => (u.id === id ? { ...u, ...patch } : u))
    );
  };
  const deleteUser: AppActions["deleteUser"] = (id) => {
    const u = users.find((x) => x.id === id);
    if (u?.role === "owner") return false;
    setUsers((list) => list.filter((x) => x.id !== id));
    return true;
  };

  // Products
  const addProduct: AppActions["addProduct"] = (p) => {
    const codeStr = nextProductCode.toString();
    const product: Product = {
      ...p,
      code: codeStr,
      id: uid("prd"),
      createdAt: new Date().toISOString(),
    };
    setNextProductCode((prev) => prev + 1);
    setProducts((list) => [product, ...list]);
    return product;
  };
  const updateProduct: AppActions["updateProduct"] = (id, patch) => {
    setProducts((list) =>
      list.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  };
  const deleteProduct: AppActions["deleteProduct"] = (id) => {
    // prevent deletion if used in invoices
    const used =
      purchaseInvoices.some((inv) =>
        inv.lines.some((l) => l.productId === id)
      ) ||
      salesInvoices.some((inv) =>
        inv.lines.some((l) => l.productId === id)
      );
    if (used) return false;
    setProducts((list) => list.filter((p) => p.id !== id));
    return true;
  };
  


  const adjustStock: AppActions["adjustStock"] = (productId, delta, reason) => {
    setProducts((list) =>
      list.map((p) =>
        p.id === productId
          ? { ...p, quantity: Math.max(0, p.quantity + delta) }
          : p
      )
    );
    const prod = products.find((x) => x.id === productId);
    if (prod) {
      const mv: StockMovement = {
        id: uid("mov"),
        productId,
        productName: prod.name,
        type: delta >= 0 ? "adjustment-in" : "adjustment-out",
        quantity: delta,
        reason,
        referenceType: "manual",
        date: new Date().toISOString(),
      };
      setStockMovements((l) => [mv, ...l]);
    }
  };

  // Suppliers
  const addSupplier: AppActions["addSupplier"] = (s) => {
    const sup: Supplier = {
      ...s,
      id: uid("sup"),
      createdAt: new Date().toISOString(),
    };
    setSuppliers((list) => [sup, ...list]);
    return sup;
  };
  const updateSupplier: AppActions["updateSupplier"] = (id, patch) => {
    setSuppliers((list) =>
      list.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };
  const deleteSupplier: AppActions["deleteSupplier"] = (id) => {
    const hasInvoices = purchaseInvoices.some((inv) => inv.supplierId === id);
    const hasProducts = products.some((p) => p.supplierId === id);
    if (hasInvoices || hasProducts) return false;
    setSuppliers((list) => list.filter((s) => s.id !== id));
    return true;
  };

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
    const cus: Customer = {
      ...c,
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
    setCustomers((list) => list.filter((c) => c.id !== id));
    return true;
  };

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

    // stock increments
    setProducts((list) =>
      list.map((p) => {
        const line = inv.lines.find((l) => l.productId === p.id);
        if (!line) return p;
        const patch: Partial<Product> = {
          quantity: p.quantity + line.quantity,
        };
        if (line.expiryDate && p.hasExpiry) {
          patch.expiryDate = line.expiryDate;
        }
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
  const recordPurchasePayment: AppActions["recordPurchasePayment"] = (
    id,
    amount
  ) => {
    if (amount <= 0) return;
    setPurchaseInvoices((list) =>
      list.map((inv) => {
        if (inv.id !== id) return inv;
        const paid = Math.min(inv.total, inv.amountPaid + amount);
        return {
          ...inv,
          amountPaid: paid,
          remaining: Math.max(0, inv.total - paid),
          status: computeStatus(inv.total, paid),
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
        date: new Date().toISOString().slice(0, 10),
      };
      setCashEntries((list) => [ce, ...list]);
    }
  };
  const deletePurchaseInvoice: AppActions["deletePurchaseInvoice"] = (id) => {
    const inv = purchaseInvoices.find((i) => i.id === id);
    if (!inv) return false;
    // revert stock
    setProducts((list) =>
      list.map((p) => {
        const l = inv.lines.find((x) => x.productId === p.id);
        if (!l) return p;
        return { ...p, quantity: Math.max(0, p.quantity - l.quantity) };
      })
    );
    setPurchaseInvoices((list) => list.filter((i) => i.id !== id));
    setStockMovements((list) => list.filter((m) => m.referenceId !== id));
    setCashEntries((list) => list.filter((c) => c.referenceId !== id));
    return true;
  };

  // Sales invoices
  const addSalesInvoice: AppActions["addSalesInvoice"] = (inv) => {
    const id = uid("sal");
    const status = computeStatus(inv.total, inv.amountReceived);
    const remaining = Math.max(0, inv.total - inv.amountReceived);
    const full: SalesInvoice = {
      ...inv,
      id,
      status,
      remaining,
      createdAt: new Date().toISOString(),
    };
    setSalesInvoices((list) => [full, ...list]);

    // stock decrements
    setProducts((list) =>
      list.map((p) => {
        const l = inv.lines.find((x) => x.productId === p.id);
        if (!l) return p;
        return { ...p, quantity: Math.max(0, p.quantity - l.quantity) };
      })
    );
    const movements: StockMovement[] = inv.lines.map((l, idx) => ({
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

    if (inv.amountReceived > 0) {
      const ce: CashEntry = {
        id: uid("cash_s"),
        type: "sales-receipt",
        amount: inv.amountReceived,
        description: `تحصيل فاتورة مبيعات ${inv.invoiceNumber} — ${inv.customerName}`,
        referenceId: id,
        date: inv.date,
      };
      setCashEntries((list) => [ce, ...list]);
    }
    return full;
  };
  const recordSalesReceipt: AppActions["recordSalesReceipt"] = (id, amount) => {
    if (amount <= 0) return;
    setSalesInvoices((list) =>
      list.map((inv) => {
        if (inv.id !== id) return inv;
        const received = Math.min(inv.total, inv.amountReceived + amount);
        return {
          ...inv,
          amountReceived: received,
          remaining: Math.max(0, inv.total - received),
          status: computeStatus(inv.total, received),
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
        date: new Date().toISOString().slice(0, 10),
      };
      setCashEntries((list) => [ce, ...list]);
    }
  };
  const cancelSalesInvoice: AppActions["cancelSalesInvoice"] = (id) => {
    const inv = salesInvoices.find((i) => i.id === id);
    if (!inv || inv.cancelled) return;
    // return stock
    setProducts((list) =>
      list.map((p) => {
        const l = inv.lines.find((x) => x.productId === p.id);
        if (!l) return p;
        return { ...p, quantity: p.quantity + l.quantity };
      })
    );
    setSalesInvoices((list) =>
      list.map((i) => (i.id === id ? { ...i, cancelled: true } : i))
    );
    const mv: StockMovement = {
      id: uid("mov_ret"),
      productId: inv.lines[0]?.productId ?? "",
      productName: "إلغاء فاتورة " + inv.invoiceNumber,
      type: "return",
      quantity: inv.lines.reduce((a, b) => a + b.quantity, 0),
      reason: `إلغاء فاتورة مبيعات ${inv.invoiceNumber}`,
      referenceId: id,
      referenceType: "sale",
      date: new Date().toISOString().slice(0, 10),
    };
    setStockMovements((list) => [mv, ...list]);
  };
  const deleteSalesInvoice: AppActions["deleteSalesInvoice"] = (id) => {
    const inv = salesInvoices.find((i) => i.id === id);
    if (!inv) return false;
    if (!inv.cancelled) {
      setProducts((list) =>
        list.map((p) => {
          const l = inv.lines.find((x) => x.productId === p.id);
          if (!l) return p;
          return { ...p, quantity: p.quantity + l.quantity };
        })
      );
    }
    setSalesInvoices((list) => list.filter((i) => i.id !== id));
    setStockMovements((list) => list.filter((m) => m.referenceId !== id));
    setCashEntries((list) => list.filter((c) => c.referenceId !== id));
    return true;
  };

  // Returns
  const addSalesReturn: AppActions["addSalesReturn"] = (r) => {
    const id = uid("sr");
    const num = `SR-${(salesReturns.length + 1).toString().padStart(4, "0")}`;
    const full: SalesReturn = {
      ...r,
      id,
      returnNumber: num,
      createdAt: new Date().toISOString(),
    };
    setSalesReturns((l) => [full, ...l]);

    // Update stock (increase)
    setProducts((list) =>
      list.map((p) => {
        const l = r.lines.find((x) => x.productId === p.id);
        if (!l) return p;
        return { ...p, quantity: p.quantity + l.quantity };
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

    // Cash refund if applicable
    if (r.refundCash && r.total > 0) {
      const ce: CashEntry = {
        id: uid("cash_sr"),
        type: "adjustment",
        amount: -r.total,
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
    const num = `PR-${(purchaseReturns.length + 1).toString().padStart(4, "0")}`;
    const full: PurchaseReturn = {
      ...r,
      id,
      returnNumber: num,
      createdAt: new Date().toISOString(),
    };
    setPurchaseReturns((l) => [full, ...l]);

    // Update stock (decrease)
    setProducts((list) =>
      list.map((p) => {
        const l = r.lines.find((x) => x.productId === p.id);
        if (!l) return p;
        return { ...p, quantity: Math.max(0, p.quantity - l.quantity) };
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

    return full;
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
    };
    setCashEntries((list) => [full, ...list]);
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
      const invoicesTotal = salesInvoices
        .filter((s) => s.customerId === customerId && !s.cancelled)
        .reduce((a, s) => a + s.remaining, 0);
      
      const returnsTotal = salesReturns
        .filter((r) => r.customerId === customerId && !r.refundCash)
        .reduce((a, r) => a + r.total, 0);

      return invoicesTotal - returnsTotal;
    },
    [salesInvoices, salesReturns]
  );

  const supplierBalance = useCallback(
    (supplierId: string) => {
      const invoicesTotal = purchaseInvoices
        .filter((p) => p.supplierId === supplierId)
        .reduce((a, p) => a + p.remaining, 0);
        
      const returnsTotal = purchaseReturns
        .filter((r) => r.supplierId === supplierId)
        .reduce((a, r) => a + r.total, 0);

      return invoicesTotal - returnsTotal;
    },
    [purchaseInvoices, purchaseReturns]
  );

  const calculateSupplierCommission: AppActions["calculateSupplierCommission"] = useCallback((supplierId) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier || !supplier.commissionTiers) return [];

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    return supplier.commissionTiers.map(tier => {
      const startDate = new Date();
      startDate.setDate(now.getDate() - tier.periodDays);
      const startDateStr = startDate.toISOString().slice(0, 10);

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

  // --- Backup & Export ---

  const exportBackup: AppActions["exportBackup"] = useCallback(() => {
    // SECURITY: Strip passwordHash from exported user data
    const safeUsers = users.map(({ passwordHash: _pw, ...rest }) => ({ ...rest, passwordHash: "[REDACTED]" }));
    const data = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      state: {
        settings, products, suppliers, customers, purchaseInvoices, salesInvoices,
        stockMovements, cashEntries, nextProductCode, users: safeUsers, salesReturns, purchaseReturns, drivers
      }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [settings, products, suppliers, customers, purchaseInvoices, salesInvoices, stockMovements, cashEntries, nextProductCode, users, salesReturns, purchaseReturns, drivers]);

  const importBackup: AppActions["importBackup"] = useCallback(async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.state || !data.version) return false;
      
      // SECURITY: Validate required structure keys
      const s = data.state;
      const requiredKeys = ["products", "customers", "suppliers"];
      if (!requiredKeys.some(k => Array.isArray(s[k]))) return false;

      if (s.settings) setSettings(s.settings);
      if (Array.isArray(s.products)) setProducts(s.products);
      if (Array.isArray(s.suppliers)) setSuppliers(s.suppliers);
      if (Array.isArray(s.customers)) setCustomers(s.customers);
      if (Array.isArray(s.purchaseInvoices)) setPurchaseInvoices(s.purchaseInvoices);
      if (Array.isArray(s.salesInvoices)) setSalesInvoices(s.salesInvoices);
      if (Array.isArray(s.stockMovements)) setStockMovements(s.stockMovements);
      if (Array.isArray(s.cashEntries)) setCashEntries(s.cashEntries);
      if (typeof s.nextProductCode === "number") setNextProductCode(s.nextProductCode);
      // SECURITY: Users with [REDACTED] passwords are NOT imported — keep current users
      if (Array.isArray(s.users)) {
        const hasValidPasswords = s.users.every((u: Record<string, unknown>) => typeof u.passwordHash === "string" && u.passwordHash !== "[REDACTED]");
        if (hasValidPasswords) setUsers(s.users);
      }
      if (Array.isArray(s.salesReturns)) setSalesReturns(s.salesReturns);
      if (Array.isArray(s.purchaseReturns)) setPurchaseReturns(s.purchaseReturns);
      if (Array.isArray(s.drivers)) setDrivers(s.drivers);
      
      return true;
    } catch {
      return false;
    }
  }, []);

  const exportToCSV: AppActions["exportToCSV"] = useCallback((type) => {
    let rows: (string | number | undefined)[][] = [];
    let headers: string[] = [];
    
    if (type === "products") {
      headers = ["الكود", "الاسم", "الفئة", "الكمية", "سعر الشراء", "سعر البيع"];
      rows = products.map(p => [p.code, p.name, p.category, p.quantity, p.purchasePrice, p.sellingPrice]);
    } else if (type === "customers") {
      headers = ["الاسم", "الهاتف", "العنوان", "الرصيد"];
      rows = customers.map(c => [c.name, c.phone, c.address, customerBalance(c.id)]);
    } else if (type === "suppliers") {
      headers = ["الاسم", "الهاتف", "الرصيد"];
      rows = suppliers.map(s => [s.name, s.phone, supplierBalance(s.id)]);
    } else if (type === "sales") {
      headers = ["رقم الفاتورة", "التاريخ", "العميل", "الإجمالي", "الحالة"];
      rows = salesInvoices.map(s => [s.invoiceNumber, s.date, s.customerName, s.total, s.status]);
    } else if (type === "purchases") {
      headers = ["رقم الفاتورة", "التاريخ", "المورد", "الإجمالي", "الحالة"];
      rows = purchaseInvoices.map(p => [p.invoiceNumber, p.date, p.supplierName, p.total, p.status]);
    } else if (type === "stock") {
      headers = ["الكود", "المنتج", "الكمية", "قيمة المخزون"];
      rows = products.map(p => [p.code, p.name, p.quantity, p.quantity * p.purchasePrice]);
    } else if (type === "commissions") {
      headers = ["المورد", "إجمالي المشتريات", "البونص المستحق"];
      rows = suppliers.map(s => {
        const comms = calculateSupplierCommission(s.id);
        const totalEarned = comms.reduce((a, c) => a + c.earned, 0);
        const totalPurch = comms[0]?.totalPurchases || 0;
        return [s.name, totalPurch, totalEarned];
      });
    }

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${type}_export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [products, customers, suppliers, salesInvoices, purchaseInvoices, customerBalance, supplierBalance, calculateSupplierCommission]);

  const value: AppContextValue = useMemo(
    () => ({
      auth,
      licenseStatus,
      isDesktop,
      ownerExists,
      settings,
      products,
      suppliers,
      customers,
      purchaseInvoices,
      salesInvoices,
      stockMovements,
      cashEntries,
      nextProductCode,
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
      recordPurchasePayment,
      deletePurchaseInvoice,
      addSalesInvoice,
      recordSalesReceipt,
      cancelSalesInvoice,
      deleteSalesInvoice,
      addSalesReturn,
      addPurchaseReturn,
      addCashEntry,
      currentCashBalance,
      customerBalance,
      supplierBalance,
      calculateSupplierCommission,
      exportBackup,
      importBackup,
      exportToCSV,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      auth,
      licenseStatus,
      isDesktop,
      ownerExists,
      settings,
      products,
      suppliers,
      customers,
      purchaseInvoices,
      salesInvoices,
      stockMovements,
      cashEntries,
      nextProductCode,
      salesReturns,
      purchaseReturns,
      drivers,
      users,
      currentUser,
      login,
      refreshLicenseStatus,
      activateLicense,
      createOwner,
      calculateSupplierCommission,
      exportBackup,
      importBackup,
      exportToCSV,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
