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
  companyName: "Helpers Distribution",
  companyNameAr: "شركة الهلبرز للتوزيع",
  invoiceFooter: "شكراً لتعاملكم معنا — يرجى مراجعة الفاتورة قبل الاستلام.",
  currency: "ج.م",
  lowStockThreshold: 10,
  arabicLabels: true,
  openingBalance: 0,
  printPaperSize: "A4",
  logoText: "HD",
  logoImage: "",
  autoBackupEnabled: true,
  autoBackupFrequency: "daily",
  lastBackupDate: "",
  invoicesSavePath: "",
  subscriptionType: "limited",
  subscriptionStartDate: today,
  subscriptionMonths: 0,
  warrantyType: "none",
  warrantyStartDate: "",
  warrantyMonths: 0,
};

export const seedUsers: AppUser[] = [];
export const seedSuppliers: Supplier[] = [];
export const seedCustomers: Customer[] = [];
export const seedProducts: Product[] = [];
export const seedPurchaseInvoices: PurchaseInvoice[] = [];
export const seedSalesInvoices: SalesInvoice[] = [];
export const seedStockMovements: StockMovement[] = [];
export const seedCashEntries: CashEntry[] = [];
