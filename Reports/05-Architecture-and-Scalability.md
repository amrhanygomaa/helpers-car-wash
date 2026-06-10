# 05 — المعمارية وقابلية التوسّع والأداء

> **تاريخ التقرير:** 2026-06-09

---

## نقاط القوة المعمارية ✅

### 1. فصل المنطق النقي عن الـ State

```
src/store/_pure.ts  (133 سطر — دوال نقية بدون جانب-effects)
src/store/AppContext.tsx (1840 سطر — state management)
```

- `computeStatus`, `applyPieceDeduction`, `settleSalesInvoiceReturn`, إلخ موجودة في `_pure.ts`
- تُستدعى من `AppContext.tsx` لكنها قابلة للاختبار بشكل مستقل
- **هذا نمط ممتاز** يجعل الاختبارات قابلة للتنفيذ بدون بيئة React

### 2. طبقة التخزين المجردة

```typescript
// src/lib/storage.ts — wrapper موحّد
export function lsGet<T>(key: string, fallback: T): T {
  if (window.desktopAPI?.storage) {
    return window.desktopAPI.storage.get(key); // IPC → SQLite
  }
  return localStorage.getItem(key); // Fallback للويب
}
```

نفس الكود يعمل في البيئتين: Electron (SQLite) والمتصفح (localStorage) — مما يُسهّل التطوير والاختبار.

### 3. نظام الصلاحيات المرن

```typescript
// src/lib/permissions.ts — نظام صلاحيات مُدار + migration تلقائي للصلاحيات القديمة
export function normalizePermissions(input?: Partial<UserPermissions>): UserPermissions
export function hasPermission(user, module, action): boolean
export function setPermission(permissions, module, action, value): UserPermissions
```

- Migration تلقائي للصلاحيات القديمة (Legacy permissions backfill)
- قابل للتوسيع بوحدات جديدة بسهولة

### 4. تجميع الكتابات (Debounced Storage)

```typescript
// AppContext.tsx:571-589
useEffect(() => {
  const timer = window.setTimeout(() => {
    lsSet("settings", settings);
    lsSet("products", products);
    // ... كل state في flush واحد
  }, 400);
  return () => window.clearTimeout(timer);
}, [settings, products, ...]);
```

بدلاً من 14 effect منفصلة تكتب فوراً، تجميع في flush واحد كل 400ms — يُقلل عدد عمليات IPC + SQLite بشكل كبير.

### 5. البنية الاختبارية

- unit tests لـ `lib/` و`store/` (Vitest)
- component tests للصفحات الحساسة
- integration tests لدورة حياة الفواتير
- E2E tests (Playwright) لسيناريوهات المستخدم
- اختبار أمان النسخ الاحتياطي

---

## الملاحظات المعمارية

### ARCH-01 🟠 — SQLite كمخزن JSON Blob لا كقاعدة علائقية

**الملف:** [`electron/main.cjs:256-258`](../electron/main.cjs#L256)

```javascript
// main.cjs:256-258 — جدول واحد فقط!
db.prepare("CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
```

### البنية الفعلية

```
kv_store table:
┌─────────────────────────────┬────────────────────────────────────────┐
│ key                         │ value                                  │
├─────────────────────────────┼────────────────────────────────────────┤
│ helpers_inventory_v1::products  │ [{"id":"prd_...", "name":"..."}, ...] │  ← JSON array كامل
│ helpers_inventory_v1::sales    │ [{"id":"sal_...", ...}, ...]          │  ← JSON array كامل
│ helpers_inventory_v1::customers │ [{"id":"cus_...", ...}, ...]          │  ← JSON array كامل
└─────────────────────────────┴────────────────────────────────────────┘
```

كل مجموعة بيانات = **صف واحد** = JSON مُسلسَل للمصفوفة كاملة.

### أثر الأداء

| عملية | السلوك الحالي | السلوك المثالي (علائقي) |
|---|---|---|
| إضافة فاتورة | إعادة كتابة المصفوفة الكاملة | INSERT صف واحد |
| البحث عن فاتورة | قراءة كل الفواتير في الذاكرة + .find() | SELECT WHERE id = ? |
| تقرير مبيعات الشهر | قراءة كل الفواتير + filter في JS | SELECT WHERE date BETWEEN |
| أعداد كبيرة (10K+ فاتورة) | 🐌 يبطئ تدريجياً | ثابت بالفهارس |

### حدود عملية

- حتى ~5,000 فاتورة: الأداء مقبول
- من 5,000 إلى ~15,000 فاتورة: بطء ملحوظ عند التحميل
- فوق 15,000 فاتورة: قد يتجمّد الـ renderer

> **الحل المؤقت المطبّق:** WAL checkpoint كل 10 دقائق + debounced writes — يُقلل الأعراض لكن لا يحل الجذر.

### التوصية طويلة المدى

الانتقال لبنية جداول SQLite علائقية:
```sql
CREATE TABLE invoices (id TEXT PRIMARY KEY, customer_id TEXT, date TEXT, total REAL, ...);
CREATE TABLE invoice_lines (id TEXT PRIMARY KEY, invoice_id TEXT REFERENCES invoices(id), ...);
CREATE INDEX idx_invoices_date ON invoices(date);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
```

---

### ARCH-02 🟠 — لا ذرّية للعمليات (No Transactions Across Entities)

**الملف:** [`src/store/AppContext.tsx`](../src/store/AppContext.tsx) — مُوزَّع

### الوصف

عملية `addSalesInvoice` تُنفّذ 4 `setState` منفصلة:
```typescript
setSalesInvoices(...)   // 1
setProducts(...)        // 2
setStockMovements(...)  // 3
setCashEntries(...)     // 4
// ← إذا انقطع التيار بين 2 و3: فاتورة موجودة + المخزون خُصم + لا حركة!
```

### الأثر

- في حالة توقّف مفاجئ بين عمليات الـ setState، قد تبقى البيانات غير متسقة
- الـ debounced flush (400ms) يُقلل الخطر، لكن لا يلغيه
- React Batching (v18+) يُجمّع setState في نفس الـ event handler، مما يُقلل الخطر فعلياً — لكن ليس مضموناً في جميع السيناريوهات

### التوصية

في المدى القريب: التحقق من صحة البيانات عند بدء التشغيل (consistency check).
في المدى البعيد: استخدام SQLite transactions الحقيقية عند الانتقال للبنية العلائقية.

---

### ARCH-03 🟡 — `AppContext.tsx` بحجم 1840 سطر — ملف "God Object"

**الملف:** [`src/store/AppContext.tsx`](../src/store/AppContext.tsx)

### الوصف

ملف واحد يحتوي على:
- State لجميع الكيانات (15+ كيان)
- جميع Actions (50+ دالة)
- منطق النسخ الاحتياطي
- منطق الترخيص
- منطق المصادقة

### الأثر

- صعوبة القراءة والصيانة
- أي تغيير في أي جزء يُعيد render المكوّنات التي تستهلك الـ context كاملة (ما لم تكون محمية بـ memo/selector)
- صعوبة الاختبار المعزول

### التوصية (تدريجي)

تقسيم `AppContext` لـ contexts متخصصة:
```
AppContext (auth + license)
ProductsContext (products + stock)
InvoicesContext (sales + purchases)
CashboxContext (cashbox + dues)
SettingsContext (settings)
```

---

### ARCH-04 🟡 — stale-closure محتملة في بعض Actions

**الملف:** [`src/store/AppContext.tsx:706-714`](../src/store/AppContext.tsx#L706)

### الوصف

```typescript
// AppContext.tsx:706-714 — addUser بدون useCallback
const addUser: AppActions["addUser"] = (u) => {
  // ...
  setUsers((list) => [user, ...list]);
  return user;
};
```

معظم دوال الـ store ليست مُغلَّفة بـ `useCallback`، وإن كانت داخل `useMemo` يتضمنها كـ dependencies.

### الأثر

- عملياً: لا أثر لأن `value` (useMemo) يُعاد عند أي تغيير في الـ state
- نظرياً: المعامل المُمرَّر لـ Context consumers قد يتغير بدون ضرورة، مما يُسبب re-renders غير ضرورية
- الحل الكامل: `useCallback` لكل Action + تقسيم Context

---

### ARCH-05 🟢 — تحذير: حجم بيانات الـ Session Backup

**الملف:** [`src/store/AppContext.tsx:533-548`](../src/store/AppContext.tsx#L533)

```typescript
// session backup عند إغلاق النافذة — قد يكون ضخماً جداً
const data = {
  state: { settings, products, suppliers, customers, purchaseInvoices, salesInvoices,
           stockMovements, cashEntries, ... }
};
lsSet("inventory_last_session_backup", data); // كتابة synchronous في beforeunload!
```

### الأثر

- في `beforeunload`: النافذة تنتظر اكتمال الكتابة قبل الإغلاق
- مع بيانات كبيرة (آلاف الفواتير)، قد يبدو التطبيق "متجمداً" لحظة الإغلاق
- IPC call متزامنة من `lsSet` في هذا السياق

### التوصية

استخدام الـ auto-backup الموجود (timer-based) بدلاً من session backup في beforeunload، أو حذف session backup إذا كان auto-backup كافياً.

---

## مقارنة: الحالة الحالية vs المثالية

| الجانب | الحالة الحالية | المثالية مستقبلاً |
|---|---|---|
| تخزين البيانات | JSON blob في SQLite | جداول SQLite علائقية |
| بحث/فلترة | في الذاكرة (JS .filter) | SQL queries + indexes |
| Transactions | متعدد setState | SQLite BEGIN TRANSACTION |
| State Management | Context ضخم واحد | Contexts متخصصة |
| حجم البيانات المقبول | ~5,000 فاتورة | غير محدود عملياً |
| أداء التحميل مع بيانات كبيرة | يتدهور | ثابت |

---

## توصية أداء فورية

يمكن تحسين أداء الفلترة في التقارير والصفحات بـ `useMemo` للقوائم المُشتقة:

```typescript
// بدلاً من حساب unpaid invoices في كل render
const unpaidPurchases = useMemo(() =>
  purchaseInvoices.filter(inv => inv.status !== "paid"),
  [purchaseInvoices]
);
```

هذا ممكن تنفيذه تدريجياً بدون إعادة هيكلة المعمارية.
