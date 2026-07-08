export type ID = string;

export type PaymentStatus = "paid" | "partial" | "unpaid";
export type SalesPaymentType = "cash" | "account";
export type SalesPriceType = "wholesale" | "retail";
export type LoginResult = {
  ok: boolean;
  error?: "invalid_credentials" | "rate_limited";
  remainSeconds?: number;
  attemptsRemaining?: number;
};

export type UserRole = "owner" | "cashier" | "employee";
export type ActivationState =
  | "inactive"
  | "active"
  | "expired"
  | "machine_mismatch"
  | "clock_tampered";

export interface LicensePayload {
  licenseId: string;
  machineHash: string;
  subscriptionType: "limited" | "lifetime";
  subscriptionStartDate: string;
  subscriptionExpiresAt: string | null;
  warrantyStartDate: string | null;
  warrantyExpiresAt: string | null;
  /** Optional package label (informational), e.g. "basic" | "pro". */
  plan?: string;
  /**
   * Optional whitelist of enabled feature keys (the package the client bought).
   * Signed into the serial, so it is tamper-proof. Absent/empty ⇒ all features
   * allowed (back-compat with serials issued before feature packaging).
   */
  features?: string[];
  issuedAt: string;
  signature: string;
}

export interface LicenseStatus {
  state: ActivationState;
  machineCode: string;
  machineHash: string;
  license?: LicensePayload;
  message?: string;
}

export interface UserPermissions {
  products: { view: boolean; add: boolean; edit: boolean; delete: boolean };
  inventory: { view: boolean; adjust: boolean };
  purchaseInvoices: { view: boolean; add: boolean; edit: boolean; pay: boolean; delete: boolean };
  salesInvoices: { view: boolean; add: boolean; edit: boolean; receive: boolean; cancel: boolean; delete: boolean };
  customers: { view: boolean; add: boolean; edit: boolean; delete: boolean };
  suppliers: { view: boolean; add: boolean; edit: boolean; delete: boolean; commissions: boolean };
  drivers: { view: boolean; add: boolean; edit: boolean; delete: boolean };
  returns: { view: boolean; add: boolean };
  alerts: { view: boolean };
  cashbox: { view: boolean; add: boolean; spend: boolean; editOpeningBalance: boolean };
  reports: { view: boolean };
  // ── Car Wash modules ──
  vehicles: { view: boolean; add: boolean; edit: boolean; delete: boolean };
  washServices: { view: boolean; add: boolean; edit: boolean; delete: boolean };
  queue: { view: boolean; add: boolean; edit: boolean; cancel: boolean };
  pricing: { override: boolean };
  payroll: { view: boolean; manage: boolean };
  workers: { view: boolean; manage: boolean };
  settings: { view: boolean; manage: boolean };
  users: { view: boolean; manage: boolean };
}

export interface MonthlyEmployeeConfig {
  target?: number;
  commissionPct?: number;
}

export interface AppUser {
  id: ID;
  name: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  roleId?: "owner" | "cashier" | "custom";
  permissions: UserPermissions;
  monthlySalary?: number;
  salesCommissionPct?: number;
  monthlySalesTarget?: number;
  monthlyConfigs?: Record<string, MonthlyEmployeeConfig>;
  createdAt: string;
}

export type CommissionType = "percentage" | "fixed";

export interface CommissionTier {
  id: ID;
  threshold: number;
  commissionType: CommissionType;
  commissionValue: number;
  periodDays: number;
}

export interface Supplier {
  id: ID;
  code?: string;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  commissionNote?: string;
  commissionTiers?: CommissionTier[];
  archived?: boolean;
  createdAt: string;
}

export interface Customer {
  id: ID;
  code?: string;
  name: string;
  phone?: string;
  address?: string;
  shippingDirection?: "qibli" | "bahri";
  notes?: string;
  /** Loyalty points balance (Car Wash). Earned on finalized service invoices. */
  loyaltyPoints?: number;
  archived?: boolean;
  createdAt: string;
}

/**
 * A car belonging to a customer. A customer can own multiple vehicles
 * (Car Wash MVP — feature 2). Plate number is the human-friendly identifier.
 */
export interface Vehicle {
  id: ID;
  customerId: ID;
  brand: string;
  model?: string;
  plateNumber: string;
  color?: string;
  notes?: string;
  archived?: boolean;
  createdAt: string;
}

export interface Driver {
  id: ID;
  name: string;
  phone?: string;
  licenseNumber?: string;
  createdAt: string;
}

export interface Product {
  id: ID;
  code: string;
  name: string;
  /** Optional scannable barcode (EAN/UPC/Code-128). Used by the POS scan input. */
  barcode?: string;
  category: string;
  unit: string;
  retailUnit?: string;
  purchasePrice: number;
  wholesalePrice: number;
  retailPrice: number;
  piecesPerUnit?: number;
  quantity: number;
  looseQuantity?: number;
  minStock: number;
  hasExpiry: boolean;
  expiryDate?: string;
  supplierId?: ID;
  notes?: string;
  archived?: boolean;
  createdAt: string;
}

export interface InvoiceLine {
  id: ID;
  productId: ID;
  productName: string;
  unit: string;
  quantity: number;
  price: number;
  /** Purchase cost per unit at time of sale — used for gross profit calculation. */
  costPrice?: number;
  expiryDate?: string;
  subtotal: number;
  isRetailUnit?: boolean;
  /**
   * Line kind (Car Wash MVP). Absent/"product" ⇒ a normal warehouse stock line
   * (deducts the product). "service" ⇒ a car-wash service line: it carries a
   * serviceId and the employee who performed it, and consumes inventory through
   * the service's linked materials (BOM) rather than via productId.
   */
  kind?: "product" | "service";
  serviceId?: ID;
  /**
   * Employee who performed this service (feature 5 — per-service attribution).
   * Legacy single-worker field: kept for backward compatibility and display.
   * When {@link InvoiceLine.workers} has entries it is the source of truth and
   * `employeeId` mirrors the first worker.
   */
  employeeId?: ID;
  employeeName?: string;
  /**
   * Multiple صنايعية who performed this service, each with their commission
   * share. When present, this is authoritative for payroll/stats; the sum of
   * shares equals {@link InvoiceLine.commissionAmount}.
   */
  workers?: LineWorker[];
  /** Total Car Wash commission for the line (sum of all workers' shares), in EGP. */
  commissionAmount?: number;
  commissionInTotal?: boolean;
}

/** One صنايعي assigned to a service line and their commission share (EGP). */
export interface LineWorker {
  workerId: ID;
  workerName?: string;
  commissionAmount: number;
}

export type DiscountCodeType = "fixed_amount" | "percent" | "override";

export interface DiscountCode {
  id: ID;
  code: string;
  type: DiscountCodeType;
  value: number;
  active: boolean;
  createdAt: string;
}

export interface PurchaseInvoice {
  id: ID;
  invoiceNumber: string;
  date: string;
  supplierId: ID;
  supplierName: string;
  lines: InvoiceLine[];
  total: number;
  amountPaid: number;
  remaining: number;
  overpayment?: number;
  status: PaymentStatus;
  notes?: string;
  paymentLog?: PaymentLogEntry[];
  createdAt: string;
}

export interface SalesInvoice {
  id: ID;
  invoiceNumber: string;
  date: string;
  customerId: ID;
  customerName: string;
  driverId?: ID;
  driverName?: string;
  lines: InvoiceLine[];
  subtotal?: number;
  total: number;
  discount?: number;
  discountCodeId?: ID;
  discountCode?: string;
  discountCodeType?: DiscountCodeType;
  discountCodeValue?: number;
  amountReceived: number;
  remaining: number;
  overpayment?: number;
  paymentType: SalesPaymentType;
  paymentMethod?: PaymentMethod;
  paymentMethodLabel?: string;
  priceType: SalesPriceType;
  paymentDueDate?: string;
  status: PaymentStatus;
  notes?: string;
  cancelled?: boolean;
  paymentLog?: PaymentLogEntry[];
  createdByUserId?: ID;
  /**
   * Invoice kind (Car Wash MVP). Absent/"product" ⇒ standard warehouse sales
   * invoice. "service" ⇒ a car-wash service invoice tied to a vehicle, whose
   * service lines consume inventory via their linked materials.
   */
  invoiceKind?: "product" | "service";
  vehicleId?: ID;
  /** Denormalized vehicle label e.g. "Toyota Corolla · ABC-123" for printing/listing. */
  vehicleLabel?: string;
  /** Queue ticket this invoice was created from, if any. */
  queueId?: ID;
  commissionInTotal?: boolean;
  commissionTotal?: number;
  /** Loyalty points awarded to the customer when this service invoice finalized. */
  loyaltyPointsEarned?: number;
  /** Loyalty points the customer redeemed on this invoice (applied as a discount). */
  loyaltyPointsRedeemed?: number;
  finalizedAt?: string;
  createdAt: string;
}

// ── Car Wash MVP ────────────────────────────────────────────────────────────

export type WashServiceCategory = "wash" | "chemical" | "extra";

/**
 * A material consumed when a wash service is performed (BOM line). Quantity is
 * expressed in the product's base unit, or in pieces when isRetailUnit is set
 * (mirrors InvoiceLine semantics so the same piece-aware deduction applies).
 */
export interface ServiceMaterial {
  id: ID;
  /** References a raw material (rawMaterials.id) consumed when the service is performed. */
  materialId: ID;
  quantity: number;
  isRetailUnit?: boolean;
}

/**
 * A car-wash service offered to customers (feature 3). Replaces "products only"
 * for the wash business: exterior/interior/chemical/engine/upholstery washes
 * plus extras (wax, trunk cleaning, polish). The default price can be overridden
 * per invoice line.
 */
/** How this service contributes to the interior/exterior wash classification in reports. */
export type WashType = "exterior" | "interior" | "full" | "none";

export interface WashService {
  id: ID;
  code?: string;
  name: string;
  category: WashServiceCategory;
  defaultPrice: number;
  hasCommission?: boolean;
  /** @deprecated Legacy percentage commission. The commission is now a fixed EGP amount entered per invoice line. */
  commissionPct?: number;
  pricingMode?: "variable" | "fixed";
  active: boolean;
  sortOrder?: number;
  /** Explicit wash type for report classification. Overrides the name-based regex. */
  washType?: WashType;
  /** Linked inventory materials consumed when the service is performed (feature 7). */
  materials?: ServiceMaterial[];
  notes?: string;
  createdAt: string;
}

export type QueueStatus = "waiting" | "in_progress" | "done" | "delivered" | "cancelled";

/**
 * A car in the wash queue (feature 1). Supports walk-ins (customerName without a
 * customer record) and links to a saved Customer/Vehicle when available. Key
 * tracking (feature 6) is embedded: who received/delivered the keys and when.
 */
export interface QueueTicket {
  id: ID;
  /** Daily ticket number, reset per businessDate. */
  number: number;
  businessDate?: string;
  queuePosition?: number;
  customerId?: ID;
  customerName: string;
  phone?: string;
  vehicleId?: ID;
  vehicleBrand?: string;
  vehicleLabel?: string;
  serviceIds?: ID[];
  serviceNames?: string[];
  arrivalTime: string;
  requestedPickupAt?: string;
  note?: string;
  delayNote?: string;
  status: QueueStatus;
  missedTurn?: boolean;
  /** Pre-existing damage areas noted at intake (liability protection). */
  damageAreas?: string[];
  /** Free-text condition notes recorded at intake. */
  conditionNotes?: string;
  keyReceived?: boolean;
  // Key tracking
  keyReceivedBy?: ID;
  keyReceivedByName?: string;
  keyReceivedAt?: string;
  keyDeliveredBy?: ID;
  keyDeliveredByName?: string;
  keyDeliveredAt?: string;
  /** Service invoice created from this ticket, if any. */
  invoiceId?: ID;
  createdAt: string;
}

export type StockMovementType =
  | "purchase"
  | "sale"
  | "adjustment-in"
  | "adjustment-out"
  | "return";

export interface ReturnLine {
  id: ID;
  sourceLineId?: ID;
  productId: ID;
  productName: string;
  unit: string;
  quantity: number;
  price: number;
  subtotal: number;
  isRetailUnit?: boolean;
}

export interface SalesReturn {
  id: ID;
  returnNumber: string;
  date: string;
  originalInvoiceId: ID;
  originalInvoiceNumber: string;
  customerId: ID;
  customerName: string;
  lines: ReturnLine[];
  total: number;
  refundCash: boolean;
  notes?: string;
  createdAt: string;
}

export interface PurchaseReturn {
  id: ID;
  returnNumber: string;
  date: string;
  originalInvoiceId: ID;
  originalInvoiceNumber: string;
  supplierId: ID;
  supplierName: string;
  lines: ReturnLine[];
  total: number;
  notes?: string;
  createdAt: string;
}

export interface StockMovement {
  id: ID;
  productId: ID;
  productName: string;
  type: StockMovementType;
  quantity: number;
  reason?: string;
  referenceId?: ID;
  referenceType?: "purchase" | "sale" | "manual";
  date: string;
}

export interface StocktakeItem {
  productId: ID;
  productName: string;
  systemQty: number;
  countedQty: number | null;
  /** Snapshot of the product's piecesPerUnit — set only for piece-enabled products. */
  piecesPerUnit?: number;
  /** Loose pieces in the system at snapshot time (piece-enabled products only). */
  systemLoose?: number;
  /** Counted loose pieces (piece-enabled products only). */
  countedLoose?: number | null;
}

export type StocktakeStatus = "draft" | "applied";

export interface Stocktake {
  id: ID;
  date: string;
  status: StocktakeStatus;
  notes?: string;
  items: StocktakeItem[];
  appliedAt?: string;
  createdAt: string;
}

export type QuotationStatus = "draft" | "converted";

export interface Quotation {
  id: ID;
  quotationNumber: string;
  date: string;
  validUntil?: string;
  customerId: ID;
  customerName: string;
  lines: InvoiceLine[];
  total: number;
  discount?: number;
  notes?: string;
  status: QuotationStatus;
  convertedInvoiceId?: ID;
  createdAt: string;
}

export type CashEntryType =
  | "sales-receipt"
  | "purchase-payment"
  | "manual-add"
  | "manual-remove"
  | "adjustment";

export type PaymentMethod = "cash" | "bank" | "vodafone" | "instapay" | "other";

export interface PaymentLogEntry {
  id: ID;
  date: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface CashEntry {
  id: ID;
  type: CashEntryType;
  amount: number;
  description: string;
  referenceId?: ID;
  date: string;
  paymentMethod?: PaymentMethod;
}

export interface Settings {
  companyName: string;
  companyNameAr: string;
  invoiceFooter: string;
  currency: string;
  pricingMode: "variable" | "fixed";
  printerName: string;
  receiptWidthMm: number;
  branchName: string;
  currentBranchId: string;
  lowStockAlertWindowDays: number;
  timezone: string;
  lowStockThreshold: number;
  arabicLabels: boolean;
  openingBalance: number;
  printPaperSize: "A4" | "A5";
  logoText: string;
  logoImage: string;
  autoBackupEnabled: boolean;
  autoBackupFrequency: "daily" | "weekly" | "monthly";
  lastBackupDate: string;
  /** Destination folder for automatic backups (local, external drive, or network/NAS share). */
  backupPath: string;
  invoicesSavePath: string;
  subscriptionType: "limited" | "lifetime";
  subscriptionStartDate: string;
  subscriptionMonths: number;
  warrantyType: "none" | "limited";
  warrantyStartDate: string;
  warrantyMonths: number;
  /** Minutes of inactivity before session locks. 0 = disabled. */
  idleLockMinutes: number;
  /** Days after which an unpaid supplier invoice is flagged overdue in alerts. */
  paymentTermDays: number;
  /** Take an automatic backup to the configured folder when the app closes. */
  backupOnClose: boolean;
  /** Customer loyalty programme (Car Wash). */
  loyaltyEnabled?: boolean;
  /** Customer earns 1 point for each this-many EGP spent on a finalized service invoice. */
  loyaltyEgpPerPoint?: number;
  /** Redemption value: each point is worth this many EGP off a future invoice. */
  loyaltyPointValue?: number;
  /**
   * Owner-controlled per-module visibility. Keys are FeatureKey (see
   * lib/features.ts). Missing key ⇒ that module's default state. This is the
   * "hide" layer; the license still caps what can be enabled.
   */
  features?: Record<string, boolean>;
}

export interface ActivityItem {
  id: ID;
  icon: string;
  title: string;
  subtitle?: string;
  date: string;
  amount?: number;
  type: "sale" | "purchase" | "stock" | "cash" | "other";
}

export type AuditAction =
  | "invoice_sale_created"
  | "invoice_sale_updated"
  | "invoice_sale_cancelled"
  | "invoice_sale_deleted"
  | "invoice_purchase_created"
  | "invoice_purchase_updated"
  | "invoice_purchase_deleted"
  | "return_sale_created"
  | "return_purchase_created"
  | "stock_adjusted"
  | "product_deleted"
  | "product_archived"
  | "product_restored"
  | "customer_deleted"
  | "customer_archived"
  | "customer_restored"
  | "supplier_deleted"
  | "supplier_archived"
  | "supplier_restored"
  | "cash_manual_add"
  | "cash_manual_remove"
  | "invoice_restored"
  | "vehicle_deleted"
  | "service_deleted"
  | "queue_ticket_cancelled";

/**
 * Full snapshot captured when an invoice is deleted — everything the delete
 * removed (the invoice, its cash entries, its stock movements) so the audit
 * log can restore the operation exactly.
 */
export interface AuditSnapshot {
  kind: "sales-invoice" | "purchase-invoice";
  invoice: SalesInvoice | PurchaseInvoice;
  cashEntries: CashEntry[];
  stockMovements: StockMovement[];
}

export interface AuditLog {
  id: ID;
  action: AuditAction;
  entityLabel: string;
  userId: ID;
  userName: string;
  timestamp: string;
  details?: string;
  /** Present on restorable deletions; cleared once the entry is restored. */
  snapshot?: AuditSnapshot;
}
