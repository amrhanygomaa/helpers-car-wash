export type ID = string;

export type PaymentStatus = "paid" | "partial" | "unpaid";
export type SalesPaymentType = "cash" | "account";

export interface Supplier {
  id: ID;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  commissionNote?: string;
  createdAt: string;
}

export interface Customer {
  id: ID;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  createdAt: string;
}

export interface Product {
  id: ID;
  code: string;
  name: string;
  category: string;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
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
  driverName?: string;
  lines: InvoiceLine[];
  total: number;
  amountReceived: number;
  remaining: number;
  paymentType: SalesPaymentType;
  status: PaymentStatus;
  notes?: string;
  cancelled?: boolean;
  createdAt: string;
}

export type StockMovementType =
  | "purchase"
  | "sale"
  | "adjustment-in"
  | "adjustment-out"
  | "return";

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
