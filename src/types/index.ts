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

export type UserRole = "owner" | "employee";
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
  purchaseInvoices: { view: boolean; add: boolean; pay: boolean; delete: boolean };
  salesInvoices: { view: boolean; add: boolean; edit: boolean; receive: boolean; cancel: boolean; delete: boolean };
  customers: { view: boolean; add: boolean; edit: boolean; delete: boolean };
  suppliers: { view: boolean; add: boolean; edit: boolean; delete: boolean; commissions: boolean };
  drivers: { view: boolean; add: boolean; edit: boolean; delete: boolean };
  returns: { view: boolean; add: boolean };
  alerts: { view: boolean };
  cashbox: { view: boolean; add: boolean; spend: boolean; editOpeningBalance: boolean };
  reports: { view: boolean };
}

export interface AppUser {
  id: ID;
  name: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  permissions: UserPermissions;
  monthlySalary?: number;
  salesCommissionPct?: number;
  monthlySalesTarget?: number;
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
  createdAt: string;
}

export interface InvoiceLine {
  id: ID;
  productId: ID;
  productName: string;
  unit: string;
  quantity: number;
  price: number;
  expiryDate?: string;
  subtotal: number;
  isRetailUnit?: boolean;
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
  total: number;
  amountReceived: number;
  remaining: number;
  overpayment?: number;
  paymentType: SalesPaymentType;
  priceType: SalesPriceType;
  paymentDueDate?: string;
  status: PaymentStatus;
  notes?: string;
  cancelled?: boolean;
  createdByUserId?: ID;
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

export type CashEntryType =
  | "sales-receipt"
  | "purchase-payment"
  | "manual-add"
  | "manual-remove"
  | "adjustment";

export interface CashEntry {
  id: ID;
  type: CashEntryType;
  amount: number;
  description: string;
  referenceId?: ID;
  date: string;
}

export interface Settings {
  companyName: string;
  companyNameAr: string;
  invoiceFooter: string;
  currency: string;
  lowStockThreshold: number;
  arabicLabels: boolean;
  openingBalance: number;
  printPaperSize: "A4" | "A5";
  logoText: string;
  logoImage: string;
  autoBackupEnabled: boolean;
  autoBackupFrequency: "daily" | "weekly" | "monthly";
  lastBackupDate: string;
  invoicesSavePath: string;
  subscriptionType: "limited" | "lifetime";
  subscriptionStartDate: string;
  subscriptionMonths: number;
  warrantyType: "none" | "limited";
  warrantyStartDate: string;
  warrantyMonths: number;
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
