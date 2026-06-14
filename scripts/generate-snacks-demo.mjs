#!/usr/bin/env node
/**
 * generate-snacks-demo.mjs
 * ========================
 * يُنشئ ملف JSON كامل لبيانات ديمو لتاجر توريد تسالي وحلاويات مصري.
 * الفترة: سنة كاملة (يوليو 2025 – يونيو 2026)
 * 
 * الملف الناتج يتوافق مع صيغة importBackup في السيستم ويمكن
 * استيراده من صفحة الإعدادات ← "استيراد نسخة احتياطية".
 * 
 * Usage:  node scripts/generate-snacks-demo.mjs
 * Output: demo-data/ديمو_تسالي_وحلاويات.json
 */

import { writeFileSync } from "fs";
import { createHash } from "crypto";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "..", "demo-data", "ديمو_تسالي_وحلاويات.json");

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _idCounter = 0;
function uid(prefix = "id") {
  _idCounter++;
  return `${prefix}_demo_${_idCounter.toString(36).padStart(6, "0")}`;
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoTimestamp(d) {
  return d.toISOString();
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function randomInt(min, max) {
  return Math.floor(Math.random() + (max - min + 1)) + min;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function computeStatus(total, paid) {
  if (total <= 0) return "paid";
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partial";
}

function settleSalesInvoiceReturn(invoice, ret) {
  const returnTotal = Math.min(invoice.total, ret.total);
  const paidAndCredit = invoice.amountReceived + (invoice.overpayment || 0);
  const cashRefund = ret.refundCash ? Math.min(returnTotal, paidAndCredit) : 0;
  const paidAndCreditAfterReturn = Math.max(0, paidAndCredit - cashRefund);
  const effectiveTotal = Math.max(0, invoice.total - returnTotal);
  const amountReceived = Math.min(effectiveTotal, paidAndCreditAfterReturn);
  const overpayment = Math.max(0, paidAndCreditAfterReturn - amountReceived);
  const remaining = Math.max(0, effectiveTotal - amountReceived);

  return {
    invoice: {
      ...invoice,
      amountReceived,
      remaining,
      status: computeStatus(effectiveTotal, amountReceived),
      overpayment: overpayment > 0 ? overpayment : undefined,
      paymentDueDate: remaining > 0 ? invoice.paymentDueDate : undefined,
    },
    cashRefund,
  };
}

function settlePurchaseInvoiceReturn(invoice, ret) {
  // In demo script, we don't recalculate lines, just the totals
  const effectiveTotal = Math.max(0, invoice.total - ret.total);
  const paidAndCredit = invoice.amountPaid + (invoice.remaining < 0 ? Math.abs(invoice.remaining) : 0);
  const amountPaid = Math.min(effectiveTotal, paidAndCredit);
  const overpayment = Math.max(0, paidAndCredit - amountPaid);
  const remaining = Math.max(0, effectiveTotal - amountPaid);

  return {
    ...invoice,
    total: effectiveTotal,
    amountPaid,
    remaining,
    status: computeStatus(effectiveTotal, amountPaid),
    overpayment: overpayment > 0 ? overpayment : undefined,
  };
}

// ─── Date Range ───────────────────────────────────────────────────────────────

const DEMO_START = new Date(2025, 6, 1);   // 1 يوليو 2025
const DEMO_END = new Date(2026, 5, 10);  // 10 يونيو 2026

function datesBetween(start, end) {
  const dates = [];
  let d = new Date(start);
  while (d <= end) {
    dates.push(new Date(d));
    d = addDays(d, 1);
  }
  return dates;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const settings = {
  companyName: "Al-Baraka Snacks Trading",
  companyNameAr: "البركة لتجارة التسالي والحلويات",
  invoiceFooter: "شكراً لتعاملكم معنا — بضاعة مباعة لا ترد ولا تستبدل إلا في حالة عيوب التصنيع.",
  currency: "ج.م",
  lowStockThreshold: 10,
  arabicLabels: true,
  openingBalance: 25000,
  printPaperSize: "A4",
  logoText: "البركة",
  logoImage: "",
  autoBackupEnabled: true,
  autoBackupFrequency: "daily",
  lastBackupDate: "",
  backupPath: "",
  invoicesSavePath: "",
  subscriptionType: "limited",
  subscriptionStartDate: "2025-07-01",
  subscriptionMonths: 12,
  warrantyType: "none",
  warrantyStartDate: "",
  warrantyMonths: 0,
  idleLockMinutes: 0,
};

// ─── Products (50 منتج تسالي وحلاويات) ─────────────────────────────────────

const productDefs = [
  // === تسالي ومكسرات ===
  { code: "SN001", name: "لب سوري محمص 100 جم — كرتونة 50 كيس", category: "تسالي", unit: "كرتونة", pp: 380, wp: 420, rp: 460, min: 15, qty: 85, hasExpiry: true, expiryDate: "2026-03-15" },
  { code: "SN002", name: "لب سوبر مملح 100 جم — كرتونة 50 كيس", category: "تسالي", unit: "كرتونة", pp: 400, wp: 440, rp: 480, min: 15, qty: 70 },
  { code: "SN003", name: "فول سوداني محمص 150 جم — كرتونة 40 كيس", category: "تسالي", unit: "كرتونة", pp: 520, wp: 570, rp: 620, min: 10, qty: 60 },
  { code: "SN004", name: "سوداني مغلف بالعسل 100 جم — كرتونة 48 كيس", category: "تسالي", unit: "كرتونة", pp: 680, wp: 740, rp: 800, min: 8, qty: 40 },
  { code: "SN005", name: "كاجو محمص 50 جم — كرتونة 24 كيس", category: "مكسرات", unit: "كرتونة", pp: 1200, wp: 1320, rp: 1440, min: 5, qty: 25 },
  { code: "SN006", name: "لوز محمص 50 جم — كرتونة 24 كيس", category: "مكسرات", unit: "كرتونة", pp: 1100, wp: 1210, rp: 1320, min: 5, qty: 20 },
  { code: "SN007", name: "مكسرات مشكلة 100 جم — كرتونة 30 كيس", category: "مكسرات", unit: "كرتونة", pp: 1500, wp: 1650, rp: 1800, min: 5, qty: 18 },
  { code: "SN008", name: "بذر قرع محمص 80 جم — كرتونة 50 كيس", category: "تسالي", unit: "كرتونة", pp: 450, wp: 500, rp: 550, min: 12, qty: 55 },
  { code: "SN009", name: "حمص الشام المحمص 100 جم — كرتونة 48 كيس", category: "تسالي", unit: "كرتونة", pp: 360, wp: 400, rp: 440, min: 12, qty: 65 },
  { code: "SN010", name: "ترمس جاهز 200 جم — كرتونة 24 كيس", category: "تسالي", unit: "كرتونة", pp: 310, wp: 350, rp: 390, min: 10, qty: 50 },

  // === شيبسي وسناكس ===
  { code: "SN011", name: "شيبسي بالجبنة 25 جم — كرتونة 60 كيس", category: "شيبسي", unit: "كرتونة", pp: 230, wp: 260, rp: 290, min: 20, qty: 120 },
  { code: "SN012", name: "شيبسي بالفلفل 25 جم — كرتونة 60 كيس", category: "شيبسي", unit: "كرتونة", pp: 230, wp: 260, rp: 290, min: 20, qty: 110 },
  { code: "SN013", name: "شيبسي كبير 70 جم — كرتونة 24 كيس", category: "شيبسي", unit: "كرتونة", pp: 280, wp: 310, rp: 345, min: 15, qty: 90 },
  { code: "SN014", name: "بفك بالكاتشب — كرتونة 48 كيس", category: "سناكس", unit: "كرتونة", pp: 190, wp: 215, rp: 240, min: 20, qty: 130 },
  { code: "SN015", name: "كيرلي فرايز — كرتونة 48 كيس", category: "سناكس", unit: "كرتونة", pp: 200, wp: 225, rp: 250, min: 18, qty: 100 },
  { code: "SN016", name: "كورن ستيكس بالجبنة — كرتونة 60 كيس", category: "سناكس", unit: "كرتونة", pp: 175, wp: 200, rp: 225, min: 18, qty: 140 },

  // === شيكولاتة ===
  { code: "SN017", name: "شيكولاتة مولتن كيك 30 جم — شد 24 قطعة", category: "شيكولاتة", unit: "شد", pp: 310, wp: 345, rp: 380, min: 12, qty: 75 },
  { code: "SN018", name: "شيكولاتة ويفر بالبندق — شد 24 قطعة", category: "شيكولاتة", unit: "شد", pp: 290, wp: 325, rp: 360, min: 12, qty: 80 },
  { code: "SN019", name: "شيكولاتة سادة 50 جم — كرتونة 48 قطعة", category: "شيكولاتة", unit: "كرتونة", pp: 580, wp: 640, rp: 700, min: 8, qty: 45 },
  { code: "SN020", name: "شيكولاتة بالحليب 30 جم — شد 36 قطعة", category: "شيكولاتة", unit: "شد", pp: 420, wp: 465, rp: 510, min: 10, qty: 60 },
  { code: "SN021", name: "شيكولاتة كرات بالكراميل — كرتونة 36 قطعة", category: "شيكولاتة", unit: "كرتونة", pp: 480, wp: 530, rp: 580, min: 8, qty: 35 },

  // === بسكويت وكيك ===
  { code: "SN022", name: "بسكويت محشو شيكولاتة — كرتونة 24 باكو", category: "بسكويت", unit: "كرتونة", pp: 310, wp: 345, rp: 380, min: 15, qty: 95 },
  { code: "SN023", name: "بسكويت محشو فانيليا — كرتونة 24 باكو", category: "بسكويت", unit: "كرتونة", pp: 290, wp: 325, rp: 360, min: 15, qty: 100 },
  { code: "SN024", name: "بسكويت سادة 80 جم — كرتونة 48 باكو", category: "بسكويت", unit: "كرتونة", pp: 240, wp: 270, rp: 300, min: 12, qty: 110 },
  { code: "SN025", name: "كيك بالشيكولاتة — كرتونة 24 قطعة", category: "بسكويت", unit: "كرتونة", pp: 350, wp: 390, rp: 430, min: 10, qty: 55 },
  { code: "SN026", name: "كرواسون بالشيكولاتة — كرتونة 36 قطعة", category: "بسكويت", unit: "كرتونة", pp: 410, wp: 455, rp: 500, min: 10, qty: 48 },

  // === حلاويات وملبس ===
  { code: "SN027", name: "حلاوة طحينية 500 جم — كرتونة 12 علبة", category: "حلاويات", unit: "كرتونة", pp: 690, wp: 760, rp: 830, min: 8, qty: 38 },
  { code: "SN028", name: "حلاوة طحينية بالمكسرات 350 جم — كرتونة 12 علبة", category: "حلاويات", unit: "كرتونة", pp: 780, wp: 860, rp: 940, min: 6, qty: 28 },
  { code: "SN029", name: "ملبس بالسكر الملون — كرتونة 24 كيس", category: "حلاويات", unit: "كرتونة", pp: 260, wp: 290, rp: 320, min: 10, qty: 45 },
  { code: "SN030", name: "حلقوم تركي مشكل 200 جم — كرتونة 20 علبة", category: "حلاويات", unit: "كرتونة", pp: 850, wp: 940, rp: 1030, min: 5, qty: 22 },
  { code: "SN031", name: "بسبوسة جاهزة 300 جم — كرتونة 12 علبة", category: "حلاويات", unit: "كرتونة", pp: 420, wp: 465, rp: 510, min: 8, qty: 30, hasExpiry: true, expiryDate: "2026-01-20" },
  { code: "SN032", name: "كنافة نابلسية مجمدة 500 جم — كرتونة 8 علب", category: "حلاويات", unit: "كرتونة", pp: 640, wp: 710, rp: 780, min: 5, qty: 20, hasExpiry: true, expiryDate: "2025-12-30" },

  // === لبان وحلوى ===
  { code: "SN033", name: "لبان نعناع — شد 30 باكو", category: "لبان", unit: "شد", pp: 155, wp: 175, rp: 195, min: 20, qty: 150 },
  { code: "SN034", name: "لبان فواكه — شد 30 باكو", category: "لبان", unit: "شد", pp: 155, wp: 175, rp: 195, min: 20, qty: 140 },
  { code: "SN035", name: "بونبون فراولة — كرتونة 48 كيس", category: "حلوى", unit: "كرتونة", pp: 210, wp: 235, rp: 260, min: 15, qty: 90 },
  { code: "SN036", name: "تافي كراميل — كرتونة 48 كيس", category: "حلوى", unit: "كرتونة", pp: 195, wp: 220, rp: 245, min: 15, qty: 85 },
  { code: "SN037", name: "مصاصة فواكه — كرتونة 100 قطعة", category: "حلوى", unit: "كرتونة", pp: 180, wp: 205, rp: 230, min: 12, qty: 70 },

  // === عصائر ومشروبات ===
  { code: "SN038", name: "عصير مانجو 200 مل — كرتونة 24 عبوة", category: "مشروبات", unit: "كرتونة", pp: 260, wp: 290, rp: 320, min: 15, qty: 80 },
  { code: "SN039", name: "عصير برتقال 200 مل — كرتونة 24 عبوة", category: "مشروبات", unit: "كرتونة", pp: 240, wp: 270, rp: 300, min: 15, qty: 75 },
  { code: "SN040", name: "عصير جوافة 1 لتر — كرتونة 12 عبوة", category: "مشروبات", unit: "كرتونة", pp: 490, wp: 540, rp: 590, min: 10, qty: 42 },
  { code: "SN041", name: "مياه معدنية 600 مل — شد 12 زجاجة", category: "مشروبات", unit: "شد", pp: 55, wp: 65, rp: 75, min: 25, qty: 180 },
  { code: "SN042", name: "مشروب غازي كولا 330 مل — شد 24 عبوة", category: "مشروبات", unit: "شد", pp: 320, wp: 360, rp: 400, min: 12, qty: 65 },

  // === وافل وكريب ===
  { code: "SN043", name: "وافل بالشيكولاتة — كرتونة 24 قطعة", category: "وافل", unit: "كرتونة", pp: 330, wp: 370, rp: 410, min: 10, qty: 50 },
  { code: "SN044", name: "كريب بالنوتيلا — كرتونة 20 قطعة", category: "وافل", unit: "كرتونة", pp: 380, wp: 420, rp: 460, min: 8, qty: 35 },

  // === منتجات موسمية / رمضان ===
  { code: "SN045", name: "ياميش رمضان مشكل 500 جم — كرتونة 12 كيس", category: "موسمي", unit: "كرتونة", pp: 1400, wp: 1540, rp: 1680, min: 5, qty: 15 },
  { code: "SN046", name: "قمر الدين 400 جم — كرتونة 20 لفة", category: "موسمي", unit: "كرتونة", pp: 560, wp: 620, rp: 680, min: 8, qty: 25 },
  { code: "SN047", name: "تمر سكري فاخر 500 جم — كرتونة 12 علبة", category: "موسمي", unit: "كرتونة", pp: 920, wp: 1010, rp: 1100, min: 5, qty: 18 },

  // === منتجات مخزونها منخفض/نفد عمداً ===
  { code: "SN048", name: "شيكولاتة فاخرة بالبندق 100 جم — كرتونة 24", category: "شيكولاتة", unit: "كرتونة", pp: 960, wp: 1060, rp: 1160, min: 8, qty: 5 },
  { code: "SN049", name: "بسكويت ديجستيف بالشيكولاتة — كرتونة 24 باكو", category: "بسكويت", unit: "كرتونة", pp: 380, wp: 420, rp: 460, min: 10, qty: 3 },
  { code: "SN050", name: "كاكاو خام 200 جم — كرتونة 24 علبة", category: "شيكولاتة", unit: "كرتونة", pp: 720, wp: 795, rp: 870, min: 6, qty: 0 },
];

const NOW = new Date(2026, 5, 10, 14, 0); // 10 June 2026 14:00

const products = productDefs.map((p) => ({
  id: uid("prod"),
  code: p.code,
  name: p.name,
  barcode: undefined,
  category: p.category,
  unit: p.unit,
  retailUnit: undefined,
  purchasePrice: p.pp,
  wholesalePrice: p.wp,
  retailPrice: p.rp,
  piecesPerUnit: undefined,
  quantity: p.qty,
  looseQuantity: 0,
  minStock: p.min,
  hasExpiry: p.hasExpiry ?? false,
  expiryDate: p.expiryDate ?? undefined,
  supplierId: undefined, // will be set after suppliers
  notes: undefined,
  archived: false,
  createdAt: isoTimestamp(DEMO_START),
}));

// ─── Suppliers (8 موردين) ─────────────────────────────────────────────────────

const supplierDefs = [
  { name: "شركة النيل للتسالي", phone: "01001234501", address: "المنطقة الصناعية — العاشر من رمضان", notes: "مورد رئيسي — لب وتسالي", commission: true },
  { name: "مصنع الأمير للشيكولاتة", phone: "01112345502", address: "المنطقة الصناعية — 6 أكتوبر", notes: "شيكولاتة وحلاويات", commission: true },
  { name: "شركة المحصول للسناكس", phone: "01223456503", address: "شبرا الخيمة — القليوبية", notes: "شيبسي وبفك وسناكس" },
  { name: "مصنع الهنا للبسكويت", phone: "01534567504", address: "العبور — القليوبية", notes: "بسكويت وكيك ووافل" },
  { name: "شركة فريش للعصائر", phone: "01045678505", address: "بدر — القاهرة", notes: "عصائر ومشروبات" },
  { name: "مخازن الشرق للحلويات", phone: "01156789506", address: "مدينة السلام — القاهرة", notes: "حلقوم وملبس وحلاويات شرقية" },
  { name: "شركة رمضان للمواسم", phone: "01267890507", address: "العبور — القليوبية", notes: "ياميش وتمور وقمر الدين — موسمي" },
  { name: "مصنع الرواد للبان والحلوى", phone: "01578901508", address: "السادس من أكتوبر — الجيزة", notes: "لبان — بونبون — مصاصات" },
];

const suppliers = supplierDefs.map((s, i) => ({
  id: uid("sup"),
  code: `SUP-${String(i + 1).padStart(4, "0")}`,
  name: s.name,
  phone: s.phone,
  address: s.address,
  notes: s.notes,
  commissionNote: s.commission ? "عمولة ربع سنوية على المشتريات" : undefined,
  commissionTiers: s.commission ? [
    {
      id: uid("tier"),
      threshold: 50000,
      commissionType: "percentage",
      commissionValue: 2,
      periodDays: 90,
    },
    {
      id: uid("tier"),
      threshold: 100000,
      commissionType: "percentage",
      commissionValue: 3.5,
      periodDays: 90,
    },
  ] : undefined,
  archived: false,
  createdAt: isoTimestamp(DEMO_START),
}));

// Map products to suppliers
const supplierProductMap = {
  0: ["SN001", "SN002", "SN003", "SN004", "SN005", "SN006", "SN007", "SN008", "SN009", "SN010"], // النيل للتسالي
  1: ["SN017", "SN018", "SN019", "SN020", "SN021", "SN048", "SN050"], // الأمير للشيكولاتة
  2: ["SN011", "SN012", "SN013", "SN014", "SN015", "SN016"], // المحصول للسناكس
  3: ["SN022", "SN023", "SN024", "SN025", "SN026", "SN043", "SN044", "SN049"], // الهنا للبسكويت
  4: ["SN038", "SN039", "SN040", "SN041", "SN042"], // فريش للعصائر
  5: ["SN027", "SN028", "SN029", "SN030", "SN031", "SN032"], // الشرق للحلويات
  6: ["SN045", "SN046", "SN047"], // رمضان للمواسم
  7: ["SN033", "SN034", "SN035", "SN036", "SN037"], // الرواد للبان
};

for (const [supIdx, codes] of Object.entries(supplierProductMap)) {
  for (const code of codes) {
    const prod = products.find(p => p.code === code);
    if (prod) prod.supplierId = suppliers[Number(supIdx)].id;
  }
}

// ─── Customers (20 عميل) ──────────────────────────────────────────────────────

const customerDefs = [
  { name: "سوبر ماركت الأمل — ياسر عبد الله", phone: "01012345601", address: "شارع فيصل — الجيزة", notes: "عميل جملة كبير — سداد أسبوعي", dir: "qibli" },
  { name: "بقالة الريحان — هشام حسنين", phone: "01112345602", address: "المرج — القاهرة", notes: "عميل جملة", dir: "bahri" },
  { name: "ماركت الأندلس — أشرف سالم", phone: "01212345603", address: "شبرا الخيمة — القليوبية", notes: "عميل جملة — يطلب كميات كبيرة شهرياً", dir: "bahri" },
  { name: "سوبر ماركت الحرمين — محمود فوزي", phone: "01512345604", address: "المعادي — القاهرة", notes: "عميل تجزئة", dir: "qibli" },
  { name: "بقالة أبو حسن — حسن الشناوي", phone: "01012345605", address: "إمبابة — الجيزة", notes: "عميل جملة — حد ائتمان 15000", dir: "qibli" },
  { name: "ماركت السعادة — سعيد إبراهيم", phone: "01112345606", address: "حلوان — القاهرة", notes: "عميل جملة", dir: "qibli" },
  { name: "سوبر ماركت الشمس — ممدوح عبد الفتاح", phone: "01212345607", address: "مدينة نصر — القاهرة", notes: "عميل جملة كبير", dir: "bahri" },
  { name: "بقالة العائلة — إيهاب فريد", phone: "01512345608", address: "بولاق الدكرور — الجيزة", notes: "سداد نقدي فقط", dir: "qibli" },
  { name: "ماركت الياسمين — عادل محمد", phone: "01012345609", address: "المنيب — الجيزة", notes: "عميل جملة — أجل 15 يوم", dir: "qibli" },
  { name: "سوبر ماركت الزهراء — وائل سمير", phone: "01112345610", address: "عين شمس — القاهرة", notes: "عميل تجزئة كبير", dir: "bahri" },
  { name: "بقالة الإيمان — رمضان أحمد", phone: "01212345611", address: "المطرية — القاهرة", notes: "عميل جملة — أجل 30 يوم", dir: "bahri" },
  { name: "ماركت الوفاء — شريف عادل", phone: "01512345612", address: "6 أكتوبر — الجيزة", notes: "عميل جديد", dir: "qibli" },
  { name: "سوبر ماركت النصر — هاني رشاد", phone: "01012345613", address: "الزيتون — القاهرة", notes: "عميل جملة متوسط", dir: "bahri" },
  { name: "بقالة عم فتحي — فتحي عبد الحميد", phone: "01112345614", address: "الوراق — الجيزة", notes: "عميل قديم — منذ 2020", dir: "qibli" },
  { name: "ماركت المستقبل — كريم منصور", phone: "01212345615", address: "الهرم — الجيزة", notes: "عميل جملة — يطلب فاتورة ضريبية", dir: "qibli" },
  { name: "كشك أبو علي — علي حسين", phone: "01512345616", address: "الدقي — الجيزة", notes: "عميل تجزئة صغير", dir: "qibli" },
  { name: "سوبر ماركت الأصيل — عمرو خالد", phone: "01012345617", address: "مصر الجديدة — القاهرة", notes: "عميل جملة — دفع شهري", dir: "bahri" },
  { name: "بقالة السلام — محمد سعد", phone: "01112345618", address: "العجوزة — الجيزة", notes: "عميل جملة", dir: "qibli" },
  { name: "ماركت الطيبين — أحمد عبد الرحمن", phone: "01212345619", address: "شبين الكوم — المنوفية", notes: "عميل جملة — محافظة خارجية", dir: "bahri" },
  { name: "سوبر ماركت الفردوس — خالد محمد", phone: "01512345620", address: "بنها — القليوبية", notes: "عميل جملة — توصيل بحري", dir: "bahri" },
];

const customers = customerDefs.map((c, i) => ({
  id: uid("cust"),
  code: `CUS-${String(i + 1).padStart(4, "0")}`,
  name: c.name,
  phone: c.phone,
  address: c.address,
  shippingDirection: c.dir,
  notes: c.notes,
  archived: false,
  createdAt: isoTimestamp(DEMO_START),
}));

// ─── Drivers (4 سائقين) ──────────────────────────────────────────────────────

const drivers = [
  { id: uid("drv"), name: "سائق: محمد عبد الرازق", phone: "01098765401", licenseNumber: "123456", createdAt: isoTimestamp(DEMO_START) },
  { id: uid("drv"), name: "سائق: أحمد سيد", phone: "01198765402", licenseNumber: "234567", createdAt: isoTimestamp(DEMO_START) },
  { id: uid("drv"), name: "سائق: إسلام فتحي", phone: "01298765403", licenseNumber: "345678", createdAt: isoTimestamp(DEMO_START) },
  { id: uid("drv"), name: "سائق: عبد الله حسن", phone: "01598765404", licenseNumber: "456789", createdAt: isoTimestamp(DEMO_START) },
];

// ─── Users (1 مالك + 3 موظفين) — كلمة السر: 1234 ─────────────────────────────

function sha256Hash(password) {
  return "sha256:" + createHash("sha256").update(password).digest("hex");
}

const PASSWORD_HASH = sha256Hash("1234");

const allPerms = (enabled) => ({
  products: { view: enabled, add: enabled, edit: enabled, delete: enabled },
  inventory: { view: enabled, adjust: enabled },
  purchaseInvoices: { view: enabled, add: enabled, edit: enabled, pay: enabled, delete: enabled },
  salesInvoices: { view: enabled, add: enabled, edit: enabled, receive: enabled, cancel: enabled, delete: enabled },
  customers: { view: enabled, add: enabled, edit: enabled, delete: enabled },
  suppliers: { view: enabled, add: enabled, edit: enabled, delete: enabled, commissions: enabled },
  drivers: { view: enabled, add: enabled, edit: enabled, delete: enabled },
  returns: { view: enabled, add: enabled },
  alerts: { view: enabled },
  cashbox: { view: enabled, add: enabled, spend: enabled, editOpeningBalance: enabled },
  reports: { view: enabled },
});

const users = [
  // ── صاحب المخزن (owner) ── كامل الصلاحيات
  {
    id: uid("user"),
    name: "محمد البركة",
    username: "owner",
    passwordHash: PASSWORD_HASH,
    role: "owner",
    permissions: allPerms(true),
    monthlySalary: undefined,
    salesCommissionPct: undefined,
    monthlySalesTarget: undefined,
    createdAt: isoTimestamp(DEMO_START),
  },

  // ── موظف 1: أحمد (مبيعات + تحصيل) ── مندوب مبيعات
  {
    id: uid("user"),
    name: "أحمد حسن",
    username: "ahmed",
    passwordHash: PASSWORD_HASH,
    role: "employee",
    permissions: {
      products: { view: true, add: false, edit: false, delete: false },
      inventory: { view: true, adjust: false },
      purchaseInvoices: { view: false, add: false, edit: false, pay: false, delete: false },
      salesInvoices: { view: true, add: true, edit: false, receive: true, cancel: false, delete: false },
      customers: { view: true, add: true, edit: true, delete: false },
      suppliers: { view: false, add: false, edit: false, delete: false, commissions: false },
      drivers: { view: true, add: false, edit: false, delete: false },
      returns: { view: true, add: true },
      alerts: { view: true },
      cashbox: { view: false, add: false, spend: false, editOpeningBalance: false },
      reports: { view: false },
    },
    monthlySalary: 4500,
    salesCommissionPct: 1.5,
    monthlySalesTarget: 200000,
    createdAt: isoTimestamp(DEMO_START),
  },

  // ── موظف 2: منى (محاسبة / مشتريات) ── مسؤولة المشتريات والخزينة
  {
    id: uid("user"),
    name: "منى إبراهيم",
    username: "mona",
    passwordHash: PASSWORD_HASH,
    role: "employee",
    permissions: {
      products: { view: true, add: true, edit: true, delete: false },
      inventory: { view: true, adjust: true },
      purchaseInvoices: { view: true, add: true, edit: true, pay: true, delete: false },
      salesInvoices: { view: true, add: false, edit: false, receive: true, cancel: false, delete: false },
      customers: { view: true, add: false, edit: false, delete: false },
      suppliers: { view: true, add: true, edit: true, delete: false, commissions: true },
      drivers: { view: true, add: false, edit: false, delete: false },
      returns: { view: true, add: true },
      alerts: { view: true },
      cashbox: { view: true, add: true, spend: true, editOpeningBalance: false },
      reports: { view: true },
    },
    monthlySalary: 5000,
    salesCommissionPct: undefined,
    monthlySalesTarget: undefined,
    createdAt: isoTimestamp(addDays(DEMO_START, 15)),
  },

  // ── موظف 3: خالد (مبيعات ميداني) ── مندوب توصيل ومبيعات
  {
    id: uid("user"),
    name: "خالد سعيد",
    username: "khaled",
    passwordHash: PASSWORD_HASH,
    role: "employee",
    permissions: {
      products: { view: true, add: false, edit: false, delete: false },
      inventory: { view: true, adjust: false },
      purchaseInvoices: { view: false, add: false, edit: false, pay: false, delete: false },
      salesInvoices: { view: true, add: true, edit: false, receive: true, cancel: false, delete: false },
      customers: { view: true, add: true, edit: false, delete: false },
      suppliers: { view: false, add: false, edit: false, delete: false, commissions: false },
      drivers: { view: true, add: false, edit: false, delete: false },
      returns: { view: true, add: false },
      alerts: { view: true },
      cashbox: { view: false, add: false, spend: false, editOpeningBalance: false },
      reports: { view: false },
    },
    monthlySalary: 4000,
    salesCommissionPct: 2.0,
    monthlySalesTarget: 150000,
    createdAt: isoTimestamp(addDays(DEMO_START, 45)),
  },
];

// ─── Generate Transactions ───────────────────────────────────────────────────

const purchaseInvoices = [];
const salesInvoices = [];
const stockMovements = [];
const cashEntries = [];
const salesReturns = [];
const purchaseReturns = [];
const quotations = [];
const auditLogs = [];
const stocktakes = [];

let purchaseInvNum = 1;
let salesInvNum = 1;
let returnNum = 1;
let purchaseReturnNum = 1;
let quotationNum = 1;

// ─── Purchase Invoices (weekly cycles) ───────────────────────────────────────

const allDates = datesBetween(DEMO_START, DEMO_END);

// Generate purchase invoices ~every 5-10 days per supplier
for (const [supIdx, supplier] of suppliers.entries()) {
  const productCodes = supplierProductMap[supIdx] || [];
  const supProducts = products.filter(p => productCodes.includes(p.code));
  if (supProducts.length === 0) continue;

  let d = new Date(DEMO_START);
  // Stagger start by supplier index
  d = addDays(d, supIdx * 2);

  while (d <= DEMO_END) {
    // Pick 2-5 products from this supplier
    const nProducts = Math.min(supProducts.length, 2 + Math.floor(Math.random() * 4));
    const picked = pickRandomN(supProducts, nProducts);

    const lines = picked.map(p => {
      const qty = 5 + Math.floor(Math.random() * 30);
      return {
        id: uid("line"),
        productId: p.id,
        productName: p.name,
        unit: p.unit,
        quantity: qty,
        price: p.purchasePrice,
        subtotal: qty * p.purchasePrice,
      };
    });

    const total = lines.reduce((s, l) => s + l.subtotal, 0);

    // Payment patterns: 60% paid in full, 25% partial, 15% unpaid
    const payRoll = Math.random();
    let amountPaid, status;
    if (payRoll < 0.60) {
      amountPaid = total;
      status = "paid";
    } else if (payRoll < 0.85) {
      amountPaid = Math.round(total * (0.3 + Math.random() * 0.5));
      status = "partial";
    } else {
      amountPaid = 0;
      status = "unpaid";
    }

    const invId = uid("pinv");
    const invNum = `PUR-${String(purchaseInvNum++).padStart(5, "0")}`;
    const dateStr = isoDate(d);

    purchaseInvoices.push({
      id: invId,
      invoiceNumber: invNum,
      date: dateStr,
      supplierId: supplier.id,
      supplierName: supplier.name,
      lines,
      total,
      amountPaid,
      remaining: Math.max(0, total - amountPaid),
      status,
      notes: undefined,
      createdAt: isoTimestamp(d),
    });

    // Stock movements for purchase
    for (const line of lines) {
      stockMovements.push({
        id: uid("sm"),
        productId: line.productId,
        productName: line.productName,
        type: "purchase",
        quantity: line.quantity,
        referenceId: invId,
        referenceType: "purchase",
        date: dateStr,
      });
    }

    // Cash entry for payment
    if (amountPaid > 0) {
      cashEntries.push({
        id: uid("cash"),
        type: "purchase-payment",
        amount: -amountPaid,
        description: `دفع فاتورة شراء ${invNum} — ${supplier.name}`,
        referenceId: invId,
        date: dateStr,
        paymentMethod: Math.random() > 0.3 ? "cash" : pickRandom(["bank", "vodafone", "instapay"]),
      });
    }

    // Next purchase date for this supplier (7-14 days)
    d = addDays(d, 7 + Math.floor(Math.random() * 8));
  }
}

// ─── Sales Invoices (daily, multiple per day) ────────────────────────────────

// Higher volume during Ramadan (Feb 28 – Mar 29, 2026) and summer/Eid
function isRamadan(d) {
  const m = d.getMonth();
  const day = d.getDate();
  return (m === 1 && day >= 28) || (m === 2); // rough Ramadan 2026
}

function isSummer(d) {
  return d.getMonth() >= 5 && d.getMonth() <= 7;
}

for (const day of allDates) {
  // Skip Fridays (low activity)
  if (day.getDay() === 5) {
    // Still occasionally sell on Friday
    if (Math.random() > 0.3) continue;
  }

  // Number of invoices per day
  let nInvoices = 2 + Math.floor(Math.random() * 4); // 2-5
  if (isRamadan(day)) nInvoices += 2; // more in Ramadan
  if (isSummer(day)) nInvoices += 1; // more in summer

  for (let inv = 0; inv < nInvoices; inv++) {
    const customer = pickRandom(customers);
    const driver = Math.random() > 0.4 ? pickRandom(drivers) : null;

    // Pick 2-8 products
    const nProducts = 2 + Math.floor(Math.random() * 7);
    const picked = pickRandomN(products.filter(p => p.quantity > 0 || Math.random() > 0.8), nProducts);
    if (picked.length === 0) continue;

    // Price type: 75% wholesale, 25% retail
    const priceType = Math.random() > 0.25 ? "wholesale" : "retail";

    const lines = picked.map(p => {
      const qty = 1 + Math.floor(Math.random() * 10);
      const price = priceType === "wholesale" ? p.wholesalePrice : p.retailPrice;
      return {
        id: uid("line"),
        productId: p.id,
        productName: p.name,
        unit: p.unit,
        quantity: qty,
        price,
        costPrice: p.purchasePrice,
        subtotal: qty * price,
        isRetailUnit: false,
      };
    });

    const grossTotal = lines.reduce((s, l) => s + l.subtotal, 0);

    // Discount: 20% of invoices get a small discount
    let discount = 0;
    if (Math.random() < 0.20) {
      discount = Math.round(grossTotal * (0.02 + Math.random() * 0.05)); // 2-7%
    }
    const total = grossTotal - discount;

    // Payment type: 55% cash, 45% account (on credit)
    const paymentType = Math.random() > 0.45 ? "cash" : "account";

    let amountReceived, status;
    if (paymentType === "cash") {
      amountReceived = total;
      status = "paid";
    } else {
      const payRoll = Math.random();
      if (payRoll < 0.3) {
        amountReceived = total;
        status = "paid";
      } else if (payRoll < 0.7) {
        amountReceived = Math.round(total * (0.2 + Math.random() * 0.6));
        status = "partial";
      } else {
        amountReceived = 0;
        status = "unpaid";
      }
    }

    const invId = uid("sinv");
    const invNum = `INV-${String(salesInvNum++).padStart(5, "0")}`;
    const dateStr = isoDate(day);

    // Payment due date for credit sales
    const paymentDueDate = paymentType === "account"
      ? isoDate(addDays(day, 15 + Math.floor(Math.random() * 30)))
      : undefined;

    salesInvoices.push({
      id: invId,
      invoiceNumber: invNum,
      date: dateStr,
      customerId: customer.id,
      customerName: customer.name,
      driverId: driver?.id,
      driverName: driver?.name,
      lines,
      total,
      discount: discount > 0 ? discount : undefined,
      amountReceived,
      remaining: Math.max(0, total - amountReceived),
      overpayment: undefined,
      paymentType,
      priceType,
      paymentDueDate,
      status,
      notes: undefined,
      cancelled: false,
      createdByUserId: pickRandom(users.filter(u => u.permissions.salesInvoices.add)).id,
      createdAt: isoTimestamp(day),
    });

    // Stock movements for sale
    for (const line of lines) {
      stockMovements.push({
        id: uid("sm"),
        productId: line.productId,
        productName: line.productName,
        type: "sale",
        quantity: -line.quantity,
        referenceId: invId,
        referenceType: "sale",
        date: dateStr,
      });
    }

    // Cash entry for receipt
    if (amountReceived > 0) {
      cashEntries.push({
        id: uid("cash"),
        type: "sales-receipt",
        amount: amountReceived,
        description: `تحصيل فاتورة ${invNum} — ${customer.name}`,
        referenceId: invId,
        date: dateStr,
        paymentMethod: paymentType === "cash" ? "cash" : pickRandom(["cash", "bank", "vodafone", "instapay"]),
      });
    }
  }
}

// ─── Some cancelled invoices (3-5) ───────────────────────────────────────────

const cancelIndices = [];
for (let i = 0; i < 4; i++) {
  const idx = 50 + Math.floor(Math.random() * (salesInvoices.length - 100));
  if (!cancelIndices.includes(idx)) {
    cancelIndices.push(idx);
    salesInvoices[idx].cancelled = true;
    salesInvoices[idx].notes = "ملغاة — العميل أرجع الطلبية كاملة";
  }
}

// ─── Sales Returns (8-12) ───────────────────────────────────────────────────

const paidSalesInvoices = salesInvoices.filter(s => !s.cancelled && s.lines.length > 0);
const returnCandidates = pickRandomN(paidSalesInvoices.slice(30), 10);

for (const inv of returnCandidates) {
  const returnLines = inv.lines.slice(0, 1 + Math.floor(Math.random() * 2)).map(l => ({
    id: uid("rline"),
    sourceLineId: l.id,
    productId: l.productId,
    productName: l.productName,
    unit: l.unit,
    quantity: Math.max(1, Math.floor(l.quantity * (0.3 + Math.random() * 0.4))),
    price: l.price,
    subtotal: 0,
    isRetailUnit: false,
  }));
  returnLines.forEach(rl => { rl.subtotal = rl.quantity * rl.price; });

  const retTotal = returnLines.reduce((s, l) => s + l.subtotal, 0);
  const retDate = addDays(new Date(inv.date), 1 + Math.floor(Math.random() * 5));

  salesReturns.push({
    id: uid("sret"),
    returnNumber: `SRET-${String(returnNum++).padStart(4, "0")}`,
    date: isoDate(retDate),
    originalInvoiceId: inv.id,
    originalInvoiceNumber: inv.invoiceNumber,
    customerId: inv.customerId,
    customerName: inv.customerName,
    lines: returnLines,
    total: retTotal,
    refundCash: Math.random() > 0.5,
    notes: pickRandom([
      "بضاعة قريبة من انتهاء الصلاحية",
      "منتج مش مطابق للمواصفات",
      "العميل طلب كمية أقل",
      "كرتونة مفتوحة",
    ]),
    createdAt: isoTimestamp(retDate),
  });

  const { invoice: updatedInv, cashRefund } = settleSalesInvoiceReturn(inv, { total: retTotal, refundCash: salesReturns[salesReturns.length - 1].refundCash });
  Object.assign(inv, updatedInv);

  if (salesReturns[salesReturns.length - 1].refundCash && cashRefund > 0) {
    cashEntries.push({
      id: uid("cash"),
      type: "adjustment",
      amount: -cashRefund,
      description: `رد نقدية لمرتجع مبيعات ${salesReturns[salesReturns.length - 1].returnNumber} — ${inv.customerName}`,
      referenceId: salesReturns[salesReturns.length - 1].id,
      date: isoDate(retDate),
      paymentMethod: "cash",
    });
  }

  // Stock return movements
  for (const rl of returnLines) {
    stockMovements.push({
      id: uid("sm"),
      productId: rl.productId,
      productName: rl.productName,
      type: "return",
      quantity: rl.quantity,
      date: isoDate(retDate),
    });
  }
}

// ─── Purchase Returns (3-5) ─────────────────────────────────────────────────

const purchaseReturnCandidates = pickRandomN(purchaseInvoices.slice(10), 4);

for (const inv of purchaseReturnCandidates) {
  const returnLines = inv.lines.slice(0, 1).map(l => ({
    id: uid("prline"),
    sourceLineId: l.id,
    productId: l.productId,
    productName: l.productName,
    unit: l.unit,
    quantity: Math.max(1, Math.floor(l.quantity * 0.3)),
    price: l.price,
    subtotal: 0,
    isRetailUnit: false,
  }));
  returnLines.forEach(rl => { rl.subtotal = rl.quantity * rl.price; });

  const retTotal = returnLines.reduce((s, l) => s + l.subtotal, 0);
  const retDate = addDays(new Date(inv.date), 2 + Math.floor(Math.random() * 5));

  purchaseReturns.push({
    id: uid("pret"),
    returnNumber: `PRET-${String(purchaseReturnNum++).padStart(4, "0")}`,
    date: isoDate(retDate),
    originalInvoiceId: inv.id,
    originalInvoiceNumber: inv.invoiceNumber,
    supplierId: inv.supplierId,
    supplierName: inv.supplierName,
    lines: returnLines,
    total: retTotal,
    notes: pickRandom([
      "بضاعة تالفة أثناء النقل",
      "منتج منتهي الصلاحية",
      "خطأ في التوريد — منتج غلط",
    ]),
    createdAt: isoTimestamp(retDate),
  });

  const updatedInv = settlePurchaseInvoiceReturn(inv, { total: retTotal });
  Object.assign(inv, updatedInv);
}

// ─── Stock Adjustments (monthly) ─────────────────────────────────────────────

const adjustmentMonths = [
  new Date(2025, 8, 1),   // Sept 2025
  new Date(2025, 11, 1),  // Dec 2025
  new Date(2026, 2, 1),   // March 2026
  new Date(2026, 5, 1),   // June 2026
];

for (const adjDate of adjustmentMonths) {
  // Adjust 3-5 products
  const adjProducts = pickRandomN(products, 3 + Math.floor(Math.random() * 3));
  for (const p of adjProducts) {
    const delta = Math.random() > 0.5
      ? -(1 + Math.floor(Math.random() * 3))  // shrinkage
      : (1 + Math.floor(Math.random() * 5));    // found extra

    stockMovements.push({
      id: uid("sm"),
      productId: p.id,
      productName: p.name,
      type: delta > 0 ? "adjustment-in" : "adjustment-out",
      quantity: delta,
      reason: delta > 0 ? "فحص مخزون — وجدنا كميات إضافية" : pickRandom([
        "تالف — كرتونة مبلولة",
        "عجز جرد",
        "منتهي الصلاحية — إتلاف",
        "كسر أثناء النقل",
      ]),
      referenceType: "manual",
      date: isoDate(adjDate),
    });
  }
}

// ─── Manual Cash Entries (expenses, deposits) ────────────────────────────────

const expenseDates = [
  { date: new Date(2025, 7, 15), desc: "إيجار المخزن — أغسطس 2025", amount: -8000 },
  { date: new Date(2025, 8, 15), desc: "إيجار المخزن — سبتمبر 2025", amount: -8000 },
  { date: new Date(2025, 9, 15), desc: "إيجار المخزن — أكتوبر 2025", amount: -8000 },
  { date: new Date(2025, 10, 15), desc: "إيجار المخزن — نوفمبر 2025", amount: -8000 },
  { date: new Date(2025, 11, 15), desc: "إيجار المخزن — ديسمبر 2025", amount: -8000 },
  { date: new Date(2026, 0, 15), desc: "إيجار المخزن — يناير 2026", amount: -8000 },
  { date: new Date(2026, 1, 15), desc: "إيجار المخزن — فبراير 2026", amount: -8000 },
  { date: new Date(2026, 2, 15), desc: "إيجار المخزن — مارس 2026", amount: -8000 },
  { date: new Date(2026, 3, 15), desc: "إيجار المخزن — أبريل 2026", amount: -8000 },
  { date: new Date(2026, 4, 15), desc: "إيجار المخزن — مايو 2026", amount: -8000 },
  { date: new Date(2026, 5, 1), desc: "إيجار المخزن — يونيو 2026", amount: -8000 },
  { date: new Date(2025, 7, 1), desc: "شراء ثلاجة عرض جديدة", amount: -15000 },
  { date: new Date(2025, 9, 10), desc: "صيانة سيارة التوصيل", amount: -3500 },
  { date: new Date(2025, 11, 25), desc: "بونص للموظفين — نهاية السنة", amount: -5000 },
  { date: new Date(2026, 1, 1), desc: "إيداع نقدي من المالك", amount: 50000 },
  { date: new Date(2026, 2, 20), desc: "شراء باليتات خشبية", amount: -2500 },
  { date: new Date(2026, 3, 5), desc: "تصليح رفوف المخزن", amount: -1800 },
  { date: new Date(2026, 4, 1), desc: "إيداع نقدي من المالك", amount: 30000 },
  { date: new Date(2026, 0, 5), desc: "مصروف نقل وشحن بضاعة", amount: -4200 },
  { date: new Date(2025, 8, 20), desc: "فاتورة كهرباء المخزن", amount: -2800 },
  { date: new Date(2026, 2, 10), desc: "فاتورة كهرباء المخزن", amount: -3100 },
  { date: new Date(2025, 10, 5), desc: "مصاريف طباعة فواتير وأوراق", amount: -1200 },
];

for (const exp of expenseDates) {
  cashEntries.push({
    id: uid("cash"),
    type: exp.amount > 0 ? "manual-add" : "manual-remove",
    amount: exp.amount,
    description: exp.desc,
    date: isoDate(exp.date),
    paymentMethod: "cash",
  });
}

// ─── Quotations (5-8 عروض أسعار) ────────────────────────────────────────────

const quotationDates = [
  new Date(2025, 8, 5),
  new Date(2025, 10, 15),
  new Date(2026, 0, 10),
  new Date(2026, 1, 20),
  new Date(2026, 3, 5),
  new Date(2026, 4, 15),
];

for (let qi = 0; qi < quotationDates.length; qi++) {
  const qDate = quotationDates[qi];
  const customer = pickRandom(customers);
  const picked = pickRandomN(products, 3 + Math.floor(Math.random() * 5));

  const lines = picked.map(p => ({
    id: uid("line"),
    productId: p.id,
    productName: p.name,
    unit: p.unit,
    quantity: 3 + Math.floor(Math.random() * 15),
    price: p.wholesalePrice,
    subtotal: 0,
  }));
  lines.forEach(l => { l.subtotal = l.quantity * l.price; });

  const total = lines.reduce((s, l) => s + l.subtotal, 0);
  const converted = qi < 3; // first 3 converted to invoices

  quotations.push({
    id: uid("quot"),
    quotationNumber: `QUO-${String(quotationNum++).padStart(4, "0")}`,
    date: isoDate(qDate),
    validUntil: isoDate(addDays(qDate, 15)),
    customerId: customer.id,
    customerName: customer.name,
    lines,
    total,
    discount: undefined,
    notes: converted ? "تم التحويل إلى فاتورة" : undefined,
    status: converted ? "converted" : "draft",
    convertedInvoiceId: undefined, // would need to link to actual invoice
    createdAt: isoTimestamp(qDate),
  });
}

// ─── Stocktakes (quarterly) ─────────────────────────────────────────────────

const stocktakeDates = [
  new Date(2025, 9, 1),   // Oct 2025
  new Date(2026, 0, 5),   // Jan 2026
  new Date(2026, 3, 1),   // Apr 2026
];

for (const stDate of stocktakeDates) {
  const items = products.map(p => ({
    productId: p.id,
    productName: p.name,
    systemQty: p.quantity + Math.floor(Math.random() * 10) - 3,
    countedQty: p.quantity + Math.floor(Math.random() * 6) - 3,
    piecesPerUnit: undefined,
    systemLoose: undefined,
    countedLoose: undefined,
  }));

  stocktakes.push({
    id: uid("stkk"),
    date: isoDate(stDate),
    status: "applied",
    notes: `جرد ربع سنوي — ${isoDate(stDate)}`,
    items,
    appliedAt: isoTimestamp(addDays(stDate, 1)),
    createdAt: isoTimestamp(stDate),
  });
}

// ─── Audit Logs (sample) ────────────────────────────────────────────────────

const auditSamples = [
  { action: "invoice_sale_created", label: "INV-00001", details: "فاتورة بيع جديدة", date: new Date(2025, 6, 2) },
  { action: "cash_manual_add", label: "إيداع نقدي", details: "إيداع بمبلغ 50,000 ج.م", date: new Date(2026, 1, 1) },
  { action: "stock_adjusted", label: "لب سوري محمص", details: "تعديل مخزون: -2 (تالف)", date: new Date(2025, 8, 1) },
  { action: "invoice_purchase_created", label: "PUR-00001", details: "فاتورة شراء من شركة النيل للتسالي", date: new Date(2025, 6, 3) },
  { action: "return_sale_created", label: "SRET-0001", details: "مرتجع بيع — بضاعة قريبة من انتهاء الصلاحية", date: new Date(2025, 7, 10) },
  { action: "cash_manual_remove", label: "إيجار المخزن", details: "دفع إيجار 8,000 ج.م", date: new Date(2025, 7, 15) },
  { action: "invoice_sale_cancelled", label: "INV-00055", details: "إلغاء فاتورة — العميل أرجع الطلبية", date: new Date(2025, 9, 5) },
  { action: "return_purchase_created", label: "PRET-0001", details: "مرتجع شراء — بضاعة تالفة", date: new Date(2025, 10, 20) },
];

for (const al of auditSamples) {
  auditLogs.push({
    id: uid("audit"),
    action: al.action,
    entityLabel: al.label,
    userId: users[0].id,
    userName: users[0].name,
    timestamp: isoTimestamp(al.date),
    details: al.details,
  });
}

// ─── Build Final JSON ────────────────────────────────────────────────────────

const backup = {
  version: "1.0",
  timestamp: isoTimestamp(NOW),
  state: {
    settings,
    products,
    suppliers,
    customers,
    purchaseInvoices,
    salesInvoices,
    stockMovements,
    cashEntries,
    nextProductCode: 2000,
    nextSupplierCode: suppliers.length + 1,
    nextCustomerCode: customers.length + 1,
    // IMPORTANT: users must NOT be included in demo backup — importing users
    // replaces the currently logged-in owner and breaks desktop auth.
    // Users should be created manually via the app's user management.
    users: [],
    salesReturns,
    purchaseReturns,
    drivers,
    auditLogs,
    quotations,
    stocktakes,
  },
};

// ─── Summary Stats ──────────────────────────────────────────────────────────

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║     ديمو التسالي والحلاويات — ملخص البيانات المُولَّدة     ║");
console.log("╠════════════════════════════════════════════════════════════╣");
console.log(`║  المنتجات:            ${String(products.length).padStart(6)}                            ║`);
console.log(`║  الموردون:            ${String(suppliers.length).padStart(6)}                            ║`);
console.log(`║  العملاء:             ${String(customers.length).padStart(6)}                            ║`);
console.log(`║  السائقون:            ${String(drivers.length).padStart(6)}                            ║`);
console.log(`║  المستخدمون:          ${String(users.length).padStart(6)}  (1 مالك + ${users.length - 1} موظفين)             ║`);
console.log(`║  فواتير الشراء:       ${String(purchaseInvoices.length).padStart(6)}                            ║`);
console.log(`║  فواتير البيع:        ${String(salesInvoices.length).padStart(6)}                            ║`);
console.log(`║  مرتجعات البيع:       ${String(salesReturns.length).padStart(6)}                            ║`);
console.log(`║  مرتجعات الشراء:      ${String(purchaseReturns.length).padStart(6)}                            ║`);
console.log(`║  حركات المخزون:       ${String(stockMovements.length).padStart(6)}                            ║`);
console.log(`║  حركات الصندوق:       ${String(cashEntries.length).padStart(6)}                            ║`);
console.log(`║  عروض الأسعار:        ${String(quotations.length).padStart(6)}                            ║`);
console.log(`║  الجرد:               ${String(stocktakes.length).padStart(6)}                            ║`);
console.log(`║  سجل المراجعة:        ${String(auditLogs.length).padStart(6)}                            ║`);
console.log("╠════════════════════════════════════════════════════════════╣");

const totalPurchases = purchaseInvoices.reduce((s, p) => s + p.total, 0);
const totalSales = salesInvoices.filter(s => !s.cancelled).reduce((s, i) => s + i.total, 0);
const totalCash = settings.openingBalance + cashEntries.reduce((s, c) => s + c.amount, 0);
console.log(`║  إجمالي المشتريات:   ${String(totalPurchases.toLocaleString()).padStart(12)} ج.م                  ║`);
console.log(`║  إجمالي المبيعات:     ${String(totalSales.toLocaleString()).padStart(12)} ج.م                  ║`);
console.log(`║  رصيد الصندوق:        ${String(totalCash.toLocaleString()).padStart(12)} ج.م                  ║`);
console.log("╚════════════════════════════════════════════════════════════╝");

// ─── Write File ──────────────────────────────────────────────────────────────

writeFileSync(OUTPUT, JSON.stringify(backup, null, 2), "utf-8");
console.log(`\n✅ تم حفظ الملف: ${OUTPUT}`);
console.log("📦 يمكن استيراده من: الإعدادات ← استيراد نسخة احتياطية");
