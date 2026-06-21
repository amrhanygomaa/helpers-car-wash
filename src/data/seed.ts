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
  WashService,
} from "../types";
import { todayISO } from "../lib/utils";

const today = todayISO();

export const seedSettings: Settings = {
  companyName: "Top Gear",
  companyNameAr: "توب جير لغسيل السيارات",
  invoiceFooter: "شكراً لاختياركم توب جير لغسيل السيارات.",
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
  paymentTermDays: 7,
  backupOnClose: true,
  // Car-wash profile for the Top Gear build: car-wash modules on, warehouse-only
  // modules hidden (code untouched — the owner can re-enable any of these in
  // Settings). salesInvoices/products/inventory stay on because service invoices
  // and material consumption depend on them.
  features: {
    carwashQueue: true,
    vehicles: true,
    washServices: true,
    salesInvoices: true,
    products: true,
    inventory: true,
    customers: true,
    cashbox: true,
    reports: true,
    employeesReport: true,
    alerts: true,
    purchaseInvoices: false,
    suppliers: false,
    drivers: false,
    returns: false,
    quotations: false,
    stocktakes: false,
    dues: false,
  },
};

// ── Seed consumable products (referenced by wash service BOM) ────────────────
// IDs are stable so BOM references survive a resetDemo.

const PROD_SHAMPOO = "seed-prod-shampoo";
const PROD_FRESHENER = "seed-prod-freshener";
const PROD_POLISH = "seed-prod-polish";
const PROD_TOWEL = "seed-prod-towel";

export const seedProducts: Product[] = [
  {
    id: PROD_SHAMPOO,
    code: "1000",
    name: "شامبو غسيل سيارات",
    category: "مستهلكات",
    unit: "لتر",
    purchasePrice: 15,
    wholesalePrice: 20,
    retailPrice: 25,
    quantity: 50,
    minStock: 5,
    hasExpiry: false,
    createdAt: today,
  },
  {
    id: PROD_FRESHENER,
    code: "1001",
    name: "معطر داخلي",
    category: "مستهلكات",
    unit: "علبة",
    purchasePrice: 10,
    wholesalePrice: 15,
    retailPrice: 20,
    quantity: 30,
    minStock: 5,
    hasExpiry: false,
    createdAt: today,
  },
  {
    id: PROD_POLISH,
    code: "1002",
    name: "كريم تلميع",
    category: "مستهلكات",
    unit: "علبة",
    purchasePrice: 40,
    wholesalePrice: 60,
    retailPrice: 80,
    quantity: 20,
    minStock: 3,
    hasExpiry: false,
    createdAt: today,
  },
  {
    id: PROD_TOWEL,
    code: "1003",
    name: "مناشف مايكروفايبر",
    category: "مستهلكات",
    unit: "قطعة",
    purchasePrice: 8,
    wholesalePrice: 12,
    retailPrice: 15,
    quantity: 100,
    minStock: 10,
    hasExpiry: false,
    createdAt: today,
  },
];

// ── Seed wash services (pre-configured menu for the owner) ───────────────────

export const seedWashServices: WashService[] = [
  {
    id: "seed-svc-ext",
    code: "W01",
    name: "غسيل خارجي",
    category: "wash",
    defaultPrice: 40,
    active: true,
    materials: [
      { id: "seed-mat-ext-1", productId: PROD_SHAMPOO, quantity: 0.2 },
      { id: "seed-mat-ext-2", productId: PROD_TOWEL, quantity: 2 },
    ],
    createdAt: today,
  },
  {
    id: "seed-svc-full",
    code: "W02",
    name: "غسيل خارجي وداخلي",
    category: "wash",
    defaultPrice: 70,
    active: true,
    materials: [
      { id: "seed-mat-full-1", productId: PROD_SHAMPOO, quantity: 0.3 },
      { id: "seed-mat-full-2", productId: PROD_TOWEL, quantity: 3 },
      { id: "seed-mat-full-3", productId: PROD_FRESHENER, quantity: 1 },
    ],
    createdAt: today,
  },
  {
    id: "seed-svc-deep",
    code: "W03",
    name: "غسيل عميق شامل",
    category: "wash",
    defaultPrice: 120,
    active: true,
    materials: [
      { id: "seed-mat-deep-1", productId: PROD_SHAMPOO, quantity: 0.5 },
      { id: "seed-mat-deep-2", productId: PROD_TOWEL, quantity: 5 },
      { id: "seed-mat-deep-3", productId: PROD_FRESHENER, quantity: 1 },
    ],
    createdAt: today,
  },
  {
    id: "seed-svc-polish",
    code: "W04",
    name: "تلميع وتشميع",
    category: "extra",
    defaultPrice: 200,
    active: true,
    materials: [
      { id: "seed-mat-polish-1", productId: PROD_POLISH, quantity: 0.5 },
      { id: "seed-mat-polish-2", productId: PROD_TOWEL, quantity: 4 },
    ],
    createdAt: today,
  },
  {
    id: "seed-svc-fresh",
    code: "W05",
    name: "تعطير داخلي",
    category: "extra",
    defaultPrice: 30,
    active: true,
    materials: [
      { id: "seed-mat-fresh-1", productId: PROD_FRESHENER, quantity: 1 },
    ],
    createdAt: today,
  },
  {
    id: "seed-svc-engine",
    code: "W06",
    name: "غسيل محرك",
    category: "extra",
    defaultPrice: 80,
    active: true,
    createdAt: today,
  },
];

export const seedUsers: AppUser[] = [];
export const seedSuppliers: Supplier[] = [];
export const seedCustomers: Customer[] = [];
export const seedPurchaseInvoices: PurchaseInvoice[] = [];
export const seedSalesInvoices: SalesInvoice[] = [];
export const seedStockMovements: StockMovement[] = [];
export const seedCashEntries: CashEntry[] = [];
