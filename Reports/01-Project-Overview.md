# 01 — نظرة تفصيلية على المشروع

> **Helpers Warehouse System** | الإصدار 1.0.1 | تاريخ التقرير: 2026-06-09

---

## 1. هوية المشروع

| الخاصية | القيمة |
|---|---|
| اسم المشروع | Helpers Warehouse System |
| الشركة المطوِّرة | Helpers Technologies |
| الإصدار الحالي | 1.0.1 |
| نوع التطبيق | تطبيق سطح مكتب Windows (Electron) — أوف‑لاين كامل |
| الجمهور المستهدف | الشركات الصغيرة والمتوسطة في مجال المخازن والتوزيع |
| نظام التشغيل المدعوم | Windows 10/11 — 64-bit |
| معرّف التطبيق | `com.helperstechnologies.warehouse` |

---

## 2. المكدس التقني (Tech Stack)

| الطبقة | التقنية | الإصدار |
|---|---|---|
| Shell سطح المكتب | Electron | 39 |
| واجهة المستخدم | React | 19 |
| لغة البرمجة | TypeScript | 6 |
| أداة البناء | Vite | 8 |
| أنماط CSS | Tailwind CSS | 3.4 |
| مكتبة المكوّنات | Radix UI (headless) | متعددة |
| رسوم بيانية | Recharts | 3.8 |
| قاعدة البيانات | SQLite مشفّرة (SQLCipher) | — |
| مشغّل قاعدة البيانات | better-sqlite3-multiple-ciphers | 12.9 |
| تشفير كلمات المرور | Argon2id | — |
| التحقق من الشكل | Zod | 4.4 |
| التوجيه (Routing) | React Router DOM | 6.30 |
| أداة الحزم | electron-builder | 26 |
| الاختبارات الوحدوية | Vitest | 4.1 |
| الاختبارات الشاملة (E2E) | Playwright | 1.60 |

---

## 3. هيكل المشروع

```
helpers-warehouse-system/
│
├── electron/                   # عملية Electron الرئيسية (Node.js)
│   ├── main.cjs                # نقطة الدخول الرئيسية (1549 سطر)
│   ├── preload.cjs             # جسر IPC المحدود (contextBridge)
│   ├── print-preload.cjs       # preload مخصص لنافذة الطباعة
│   ├── storage-security.cjs    # حماية مفاتيح التخزين وإخفاء الهاشات
│   ├── rate-limit.cjs          # حماية brute-force (state machine)
│   └── license-public-key.cjs  # مفتاح Ed25519 العام (خارج الـ repo)
│
├── src/                        # تطبيق React (المُصيِّر)
│   ├── main.tsx                # نقطة الدخول للـ renderer
│   ├── App.tsx                 # التوجيه الرئيسي + AppProvider
│   │
│   ├── store/
│   │   ├── AppContext.tsx       # State الشامل + جميع Actions (1840 سطر)
│   │   └── _pure.ts            # دوال منطق صرفة (133 سطر) — قابلة للاختبار
│   │
│   ├── types/
│   │   └── index.ts            # جميع الأنواع (289 سطر)
│   │
│   ├── lib/
│   │   ├── auth.ts             # hashing كلمات المرور (fallback للويب)
│   │   ├── codes.ts            # توليد أكواد الموردين
│   │   ├── format.ts           # تنسيق العملة والتواريخ
│   │   ├── numberInput.ts      # معالجة إدخال الأرقام العربية/الفارسية
│   │   ├── permissions.ts      # نظام الصلاحيات (312 سطر)
│   │   ├── print.ts            # دوال الطباعة
│   │   ├── stockMovement.ts    # مرجع حركات المخزون
│   │   ├── storage.ts          # wrapper للتخزين (IPC أو localStorage)
│   │   └── utils.ts            # uid(), formatDate(), إلخ
│   │
│   ├── pages/                  # 28 صفحة (11,517 سطر إجمالي)
│   ├── features/               # مكوّنات الميزات المتخصصة
│   ├── components/
│   │   ├── layout/             # AppLayout, Sidebar, Topbar, ProtectedShell
│   │   └── ui/                 # Button, Card, Table, Toast, إلخ
│   └── data/
│       └── seed.ts             # بيانات أولية للتطوير/Demo
│
├── tests/
│   ├── unit/                   # اختبارات وحدوية للـ lib والـ store
│   ├── component/              # اختبارات مكوّنات React
│   ├── integration/            # اختبارات تدفقات كاملة
│   └── e2e/                    # اختبارات Playwright
│
├── scripts/                    # سكربتات البناء والتوزيع
├── docs/                       # دليل التثبيت للعملاء (عربي)
└── release/                    # مخرجات البناء (مستبعد من git)
```

---

## 4. الوحدات الوظيفية

| الوحدة | الصفحات | الوصف |
|---|---|---|
| **المنتجات** | `ProductsPage`, `ProductForm`, `ProductDetailsDrawer` | كتالوج المنتجات، الأسعار، المخزون، الصلاحية |
| **المخزون** | `InventoryPage` | كميات المخزون، حركات الدخول/الخروج، التسوية |
| **العملاء** | `CustomersPage` | بيانات العملاء، الأرصدة، تاريخ التعاملات |
| **الموردين** | `SuppliersPage` | بيانات الموردين، مستويات العمولة، المستحقات |
| **فواتير المبيعات** | `SalesInvoicesPage`, `SalesInvoiceNewPage`, `SalesInvoiceDetailPage`, `SalesInvoiceEditPage`, `SalesInvoicePrintPage` | فواتير البيع، الجملة/التجزئة، الآجل/النقدي، الخصومات |
| **فواتير المشتريات** | `PurchaseInvoicesPage`, `PurchaseInvoiceNewPage`, `PurchaseInvoiceDetailPage`, `PurchaseInvoiceEditPage` | فواتير الشراء، تتبع الدفعات للموردين |
| **المرتجعات** | `ReturnsPage`, `SalesReturnDialog`, `PurchaseReturnDialog` | مرتجعات البيع والشراء مع إعادة المخزون |
| **الخزنة** | `CashboxPage` | الرصيد، الحركات اليدوية، الرصيد الافتتاحي |
| **المستحقات** | `DuesPage` | الآجل والمدفوع والمتبقي للعملاء والموردين |
| **التقارير** | `ReportsPage` (1681 سطر!) | 8+ تقارير: مبيعات، مشتريات، مخزون، عمولات، إلخ |
| **الموظفون** | `UsersPage`, `EmployeeProfilePage`, `EmployeeReportPage` | إدارة المستخدمين، الصلاحيات، العمولات، الراتب |
| **السائقون** | `DriversPage`, `DriverDialog` | سجل السائقين، ربطهم بفواتير المبيعات |
| **التنبيهات** | `AlertsPage` | نقص المخزون، قرب الصلاحية، الديون المتأخرة |
| **الإعدادات** | `SettingsPage` | إعدادات الشركة، النسخ الاحتياطي، الطباعة، الاشتراك |
| **الترخيص** | `ActivationPage`, `FirstRunSetupPage` | تفعيل الجهاز، إنشاء حساب المالك |
| **الدخول** | `LoginPage` | تسجيل الدخول مع حماية brute-force |

---

## 5. نموذج البيانات (Data Model)

```
Product ──────────────────────────────────────────────────┐
  id, code, name, category, unit, retailUnit              │
  purchasePrice, wholesalePrice, retailPrice              │
  quantity, looseQuantity, piecesPerUnit                  │
  minStock, hasExpiry, expiryDate                         │
  supplierId ──────────────────────────── Supplier        │
                                            id, code      │
                                            name, phone   │
                                            commissionTiers│
                                                           │
SalesInvoice ────────────────────────────────────────────┐│
  id, invoiceNumber, date                                ││
  customerId ─── Customer                                ││
  driverId ────── Driver                                 ││
  lines[] ──────── InvoiceLine ────────────── Product ←──┘│
    id, productId, productName, unit                      │
    quantity, price, subtotal, isRetailUnit               │
  total, discount, amountReceived, remaining              │
  overpayment, paymentType (cash|account)                 │
  priceType (wholesale|retail)                            │
  status (paid|partial|unpaid), cancelled                 │
  createdByUserId ──── AppUser                            │
                                                          │
PurchaseInvoice ─────────────────────────────────────────┘
  id, invoiceNumber, supplierId, lines[]
  total, amountPaid, remaining, overpayment, status

SalesReturn / PurchaseReturn
  originalInvoiceId, lines[] (ReturnLine), total, refundCash

StockMovement
  productId, type, quantity, referenceId, referenceType, date

CashEntry
  type (sales-receipt|purchase-payment|manual-add|manual-remove|adjustment)
  amount, referenceId, date

Settings
  companyName, currency, openingBalance, lowStockThreshold
  autoBackupEnabled/Frequency, invoicesSavePath
  subscriptionType/StartDate/Months (من الترخيص)
```

---

## 6. نموذج الأمان

```
┌─────────────────────────────────────────────────────────────┐
│                    طبقة Electron (Node.js)                  │
│  ┌───────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │ SQLite مشفّرة │  │  Argon2id hash  │  │ Ed25519 ترخيص │  │
│  │ مفتاح مشتق   │  │  ≥ 65536 mem    │  │  machine-bound │  │
│  │ من بصمة الجهاز│  │  ≥ 3 timeCost  │  │  clock-tamper  │  │
│  └───────────────┘  └─────────────────┘  └───────────────┘  │
│           │                   │                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  IPC Bridge (preload.cjs — contextBridge فقط)          │ │
│  │  • مفاتيح تخزين مُقيَّدة (isRendererStorageKey)       │ │
│  │  • هاشات كلمات المرور مُخفاة عن الـ renderer          │ │
│  │  • Rate limiting: 5 محاولات / 60 ثانية (دخول)         │ │
│  │  • Rate limiting: 5 محاولات / 10 دقائق (دعم فني)       │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                         ↕ IPC
┌─────────────────────────────────────────────────────────────┐
│              طبقة Renderer (React — مُعزول)                 │
│  • لا nodeIntegration    • sandbox: true                   │
│  • contextIsolation: true • CSP headers                     │
│  • devTools محجوب في الإنتاج                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. نموذج الصلاحيات

| الدور | الوصف | الصلاحيات |
|---|---|---|
| `owner` | المالك | كل الصلاحيات بدون استثناء |
| `employee` | موظف | صلاحيات قابلة للتخصيص لكل وحدة وكل إجراء |

**الوحدات القابلة للتحكم:** products, inventory, purchaseInvoices, salesInvoices, customers, suppliers, drivers, returns, alerts, cashbox, reports

**الإجراءات للمبيعات مثلاً:** view, add, edit, receive, cancel, delete

---

## 8. دورة الحياة من البناء للتوزيع

```
المطوّر                         الجهاز
   │                               │
   ├─ npm run build ──────────────→│ Vite → dist/
   ├─ npm run dist:win ────────────│ electron-builder → release/Setup.exe
   ├─ توقيع رقمي (شهادة ذاتية) ──→│ يُثبَّت على جهاز العميل
   ├─ generate-license ───────────→│ رمز ترخيص مرتبط بـ machine hash
   └─ USB Package ─────────────────→│ التثبيت الميداني
```

---

## 9. حالة الاختبارات

| النوع | الملفات | التغطية المقدّرة |
|---|---|---|
| وحدوية (Unit) | 9 ملفات في `tests/unit/` | منطق lib والـ store والصلاحيات |
| مكوّنات (Component) | 2 ملفات | LoginPage, ProtectedShell |
| تكاملية (Integration) | 3 ملفات | دورة حياة الفواتير، أمان النسخ الاحتياطي |
| شاملة (E2E — Playwright) | 4 ملفات | boot, first-run, login-rate-limit, permissions |

> التغطية الكاملة: `npm run test:coverage` — يُنتج تقرير V8 في `coverage/`

---

## 10. معلومات التواصل

| القناة | التفاصيل |
|---|---|
| الشركة | Helpers Technologies |
| واتساب | +201118445625 |
| الموقع | helpers-tech.com |
| البريد الإلكتروني | Claude@helpers-tech.com |
