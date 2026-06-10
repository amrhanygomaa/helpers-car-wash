# 01 — نظرة تفصيلية على المشروع

> **تاريخ:** 2026-06-10 | إصدار التطبيق: 1.0.2

---

## 1. ما هو المشروع

نظام سطح مكتب أوف-لاين كامل لإدارة المخازن والمبيعات والمشتريات والخزنة للشركات الصغيرة والمتوسطة، من تطوير Helpers Technologies. يُوزَّع كمثبّت Windows (NSIS) مع ترخيص مشفّر مرتبط بالجهاز، وقاعدة بيانات محلية مشفّرة بالكامل.

| البند | التفاصيل |
|---|---|
| الاسم التجاري | Helpers warehouse system |
| الإصدار | 1.0.2 (`package.json`) |
| المنصة | Windows 10/11 x64 |
| نموذج التوزيع | مثبّت NSIS + ترخيص Ed25519 مرتبط بالجهاز + شهادة توقيع ذاتية |
| اللغة | واجهة عربية RTL بالكامل |

---

## 2. الحزمة التقنية (Tech Stack)

| الطبقة | التقنية | الإصدار |
|---|---|---|
| Desktop shell | Electron | 39 |
| Renderer | React | 19.2 |
| اللغة | TypeScript | 6.0 |
| Build | Vite 8 + electron-builder 26 | |
| التنسيق | Tailwind CSS 3.4 + Radix UI + lucide-react | |
| قاعدة البيانات | SQLite مشفّرة (SQLCipher عبر `better-sqlite3-multiple-ciphers`) | 12.9 |
| كلمات المرور | `argon2` (argon2id) | 0.44 |
| الرسوم البيانية | recharts | 3.8 |
| Routing | react-router-dom | 6.30 |
| الاختبارات | Vitest 4 + Testing Library + Playwright 1.60 + fast-check | |

---

## 3. بنية المشروع

```
helpers-warehouse-system/
├── electron/               العملية الرئيسية (1467 سطر main.cjs) + preload + أمان التخزين + rate-limit
├── src/
│   ├── pages/              29 صفحة (كل الشاشات)
│   ├── store/              9 ملفات — AppContext (~2000 سطر) + 7 شرائح Context + _pure.ts
│   ├── lib/                12 وحدة مساعدة (xlsx, barcode, permissions, numberInput, codes, ...)
│   ├── components/         ui (10) + layout (4)
│   ├── features/           products / invoices / returns / drivers
│   ├── types/              نموذج البيانات الكامل (types/index.ts)
│   └── data/seed.ts        بذور فارغة (لا بيانات تجريبية في الإنتاج ✅)
├── tests/                  21 ملف اختبار → 435 اختبار (unit/component/integration/e2e)
├── scripts/                تجهيز التوزيع + after-pack
└── .github/workflows/ci.yml   CI على windows-latest (lint+build / tests+coverage)
```

---

## 4. الوحدات الوظيفية (كما هي اليوم)

| الوحدة | الصفحات | أبرز القدرات |
|---|---|---|
| لوحة التحكم | DashboardPage | KPIs + نشاط حديث (محسّنة بـ useMemo) |
| المنتجات | ProductsPage + ProductForm + Drawer | كود تلقائي، باركود، فئة Combobox، وحدة جملة/قطاعي (`piecesPerUnit`)، صلاحية، حد أدنى |
| المخزون | InventoryPage | حركات المخزون، تسويات يدوية (+/-) |
| المشتريات | 5 صفحات (قائمة/جديد/تفاصيل/تعديل/طباعة) | ترقيم تلقائي، دفعات، مرتجع من الفاتورة، تعديل كامل |
| المبيعات | 5 صفحات | جملة/تجزئة، خصم، آجل بتاريخ استحقاق، سائق، باركود، Draft تلقائي، إلغاء/حذف بصلاحيات |
| المرتجعات | ReturnsPage + Dialogs | من الفاتورة الأصلية بكميات مضبوطة، رد نقدي أو خصم من المديونية |
| الخزنة | CashboxPage | رصيد افتتاحي، إيداع/صرف/تسوية، التزامات الموردين، أرصدة العملاء الدائنة |
| المستحقات | DuesPage (698 سطر) | ذمم العملاء + التزامات الموردين + تسوية الرصيد الدائن بضغطة + تصدير |
| التقارير | ReportsPage (1621 سطر) + EmployeeReportPage | مبيعات/مشتريات/مخزون/عمولات موردين/مستحقات + عمولة موظف ربع سنوية على التحصيل |
| التنبيهات | AlertsPage | نقص مخزون، قرب انتهاء صلاحية، متأخرات، أرصدة دائنة |
| السائقين | DriversPage | سجلات مرتبطة بفواتير البيع |
| المستخدمين | UsersPage + EmployeeProfilePage | مالك/موظف + 11 وحدة صلاحيات بأفعال دقيقة (view/add/edit/delete/pay/receive/cancel...) |
| سجل التدقيق | AuditLogPage (owner-only) | 15 نوع عملية حساسة، آخر 1000 قيد |
| الإعدادات | SettingsPage (owner-only) | بيانات الشركة، طباعة A4/A5، نسخ احتياطي يدوي/تلقائي/لمسار شبكة، تصدير XLSX |

---

## 5. نموذج البيانات (types/index.ts)

الكيانات الرئيسية: `Product`, `Supplier` (+`CommissionTier`), `Customer` (+`shippingDirection`), `Driver`, `PurchaseInvoice`, `SalesInvoice` (+`InvoiceLine`), `SalesReturn`/`PurchaseReturn` (+`ReturnLine` مع `sourceLineId`), `StockMovement`, `CashEntry`, `AppUser` (+`UserPermissions`), `AuditLog`, `Settings`, `LicensePayload`.

نقاط تصميم مهمة:
- **الرصيد الدائن** لا يُخزَّن على العميل بل كـ `overpayment` على كل فاتورة، ويُجمَّع بـ `customerCredit(customerId)` — قرار سليم يحافظ على أثر كل مبلغ.
- **الوحدة المزدوجة** (كرتونة/قطعة): `piecesPerUnit` + `looseQuantity` مع دوال نقية `applyPieceDeduction/Addition` مُختبَرة.
- **حالة السداد** مشتقة دائماً عبر `computeStatus(total, paid)` — مصدر حقيقة واحد.

---

## 6. المعمارية

### تدفق البيانات
```
React Pages → useCatalog/useInvoicing/useReporting/... (7 شرائح Context)
           → AppProvider (كل الحالة + الأكشنز في مكان واحد — الكتابات الذرّية عبر الكيانات)
           → debounce 2000ms → lsSetBatch → IPC واحد → SQLite transaction واحدة (kv_store)
```

- **kv_store**: جدول واحد `key/value` — كل مجموعة (products, salesInvoices, ...) صف JSON واحد. (انظر القيود في تقرير 05).
- **تقسيم F3-6 مكتمل**: كل صفحة تستهلك شريحتها فقط فتُعاد رسمها عند تغيّر شريحتها فقط؛ `useApp()` باقٍ للتوافق ويستخدمه فقط `SettingsPage` (لعمليات النسخ الاحتياطي الشاملة).
- **العملية الرئيسية (electron/main.cjs)**: الترخيص + المصادقة (argon2id + rate limiting) + التخزين المُؤمَّن بالجلسات + الطباعة (توليد HTML للفاتورة في الـ main مباشرة من القاعدة) + النسخ الاحتياطي للمجلدات.

### نموذج الأمان (ملخص — التفاصيل في تقرير 03)
تشفير القاعدة بمفتاح مشتق من الجهاز، argon2id، عزل كامل للـ renderer (contextIsolation + sandbox)، جلسات IPC لكل WebContents تُقيِّد قراءة/كتابة التخزين، ترخيص Ed25519، Electron Fuses، CSP صارم في الإنتاج.

---

## 7. الاختبارات والجودة

| الطبقة | الملفات | ملاحظات |
|---|---|---|
| Unit (lib + store النقي) | 15 ملف | تشمل property-based بـ fast-check؛ عتبة تغطية 80% على `src/lib/**` و`_pure.ts` |
| Component | LoginPage, ProtectedShell | بمحاكاة الشرائح (vi.mock للـ context hooks) |
| Integration | دورة حياة فاتورتي البيع والشراء + أمان النسخ الاحتياطي | **تختبر الدوال النقية فقط — لا تغطي أكشنز الـ store الكاملة** (فجوة مذكورة في 05) |
| E2E (Playwright) | first-run, login rate-limit, permissions, boot smoke | على تطبيق Electron حقيقي |

**أوامر التحقق الفعلية** (vitest لا يفحص الأنواع):
```powershell
node_modules/.bin/tsc.cmd -b tsconfig.json --force     # الأنواع
node_modules/.bin/eslint.cmd .                          # من داخل مجلد المشروع
node_modules/.bin/vitest.cmd run                        # 435 اختبار
```

### CI (GitHub Actions)
وظيفتان على windows-latest: **Lint & Build** و**Tests + Coverage** (مع JUnit annotations وأرشفة التغطية 14 يوم). ⚠️ حالياً **سيفشل CI** بسبب خطأ ESLint الوحيد (انظر V2-B07).

---

## 8. حالة المستودع الآن

- آخر commit: `b25d420` — لكن يوجد **حجم كبير من التعديلات غير المُكوميتة** (الـ store، electron، أغلب الصفحات) تمثل كل إصلاحات وميزات ما بعد V1.
- **توصية فورية:** بعد إصلاح خطأ الـ lint، عمل commit (أو سلسلة commits منطقية) لتثبيت هذا التقدم قبل أي شغل جديد.
