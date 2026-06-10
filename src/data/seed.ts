import type {
  AppUser,
  CashEntry,
  Customer,
  Product,
  PurchaseInvoice,
  SalesInvoice,
  Settings,
  StockMovement,
  Supplier,
} from "../types";

const today = new Date().toISOString().slice(0, 10);

export const seedSettings: Settings = {
  companyName: "Helpers Technology",
  companyNameAr: "شركة هيلبيرز تيكنولوجي",
  invoiceFooter: "شكراً لتعاملكم معنا — يرجى مراجعة الفاتورة قبل الاستلام.",
  currency: "ج.م",
  lowStockThreshold: 10,
  arabicLabels: true,
  openingBalance: 0,
  printPaperSize: "A4",
  logoText: "HT",
  logoImage: "./helpers_tech_logo.png",
  autoBackupEnabled: true,
  autoBackupFrequency: "daily",
  lastBackupDate: "",
  backupPath: "",
  invoicesSavePath: "",
  subscriptionType: "limited",
  subscriptionStartDate: today,
  subscriptionMonths: 0,
  warrantyType: "none",
  warrantyStartDate: "",
  warrantyMonths: 0,
  idleLockMinutes: 0,
};

export const seedUsers: AppUser[] = [];
export const seedSuppliers: Supplier[] = [];
export const seedCustomers: Customer[] = [];
export const seedProducts: Product[] = [];
export const seedPurchaseInvoices: PurchaseInvoice[] = [];
export const seedSalesInvoices: SalesInvoice[] = [];
export const seedStockMovements: StockMovement[] = [];
export const seedCashEntries: CashEntry[] = [];
