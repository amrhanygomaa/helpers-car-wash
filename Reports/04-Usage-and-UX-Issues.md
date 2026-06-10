# 04 — مشاكل الاستخدام وتجربة المستخدم (UX)

> **تاريخ التقرير:** 2026-06-09

---

## UX-01 🟠 — عرض "المتبقي" في فاتورة المبيعات مضلِّل

**الملف:** [`src/pages/SalesInvoiceNewPage.tsx:596-616`](../src/pages/SalesInvoiceNewPage.tsx#L596)

### الوصف

```typescript
// SalesInvoiceNewPage.tsx:121-122
const remainingDue = Math.max(0, invoiceNet - amountReceived);   // متبقي على العميل
const customerChange = Math.max(0, amountReceived - invoiceNet); // فائض دفعه العميل

// SalesInvoiceNewPage.tsx:600-609 — كلاهما يُعرض كـ "المتبقي"
<Row
  label="المتبقي"
  value={formatCurrency(
    customerChange > 0 ? customerChange : remainingDue,  // ← نفس التسمية لمفهومين مختلفين!
    settings.currency
  )}
  tone={remainingDue > 0 ? "amber" : "green"}
/>
```

### الأثر

- عندما يدفع العميل أكثر: `customerChange = 5` يُعرض كـ **"المتبقي: 5"** — وهو في الواقع **"باقي للعميل"** وليس متبقياً عليه
- لا فرق بصري واضح بين "المتبقي على العميل" و"الباقي للعميل"
- يُربك المستخدم عند تسجيل فواتير الدفع النقدي

### الإصلاح المقترح

```tsx
{customerChange > 0 ? (
  <Row label="باقي للعميل" value={formatCurrency(customerChange, settings.currency)} tone="green" />
) : (
  <Row label="المتبقي" value={formatCurrency(remainingDue, settings.currency)} tone={remainingDue > 0 ? "amber" : "green"} bold />
)}
```

---

## UX-02 🟠 — صفحة التقارير (ReportsPage) ضخمة جداً وصعبة التنقل

**الملف:** [`src/pages/ReportsPage.tsx`](../src/pages/ReportsPage.tsx) — **1681 سطر**

### الوصف

صفحة التقارير أكبر ملف في المشروع (1681 سطر). تحتوي على 8+ أقسام مختلفة في صفحة واحدة:
- تقرير المبيعات
- تقرير المشتريات
- تقرير المخزون
- تقرير عمولات الموردين
- مستحقات الموردين
- مستحقات العملاء
- إلخ

### الأثر

- صعوبة في التنقل بين التقارير في شاشة واحدة
- بطء تحميل مُحتمل بسبب حساب كل التقارير في وقت واحد
- صعوبة إضافة تقارير جديدة بدون تعقيد المزيد من الكود

### التوصية

تقسيم التقارير لأقسام واضحة بالـ tabs أو تقسيم الصفحة لمكوّنات منفصلة `React.lazy` محمّلة عند الطلب.

---

## UX-03 🟠 — لا يوجد تأكيد عند الحذف في بعض المسارات

**الملفات:** متعددة في `src/pages/`

### الوصف

بعض صفحات الحذف تعرض تأكيداً (`confirm()`), لكن التطبيق يستخدم `window.confirm()` الـ native المتوافق مع Electron بدون تخصيص أو Dialog مخصص.

### الأثر

- حذف عميل/مورد/منتج/فاتورة بدون رسالة تأكيد ذات سياق واضح
- لا وصف للعواقب (مثل "حذف هذا العميل سيمنعك من عرض تاريخه")
- المستخدمون قد يضغطون الحذف عن طريق الخطأ

### التوصية

استخدام `Dialog` مخصص (موجود في `components/ui/Dialog.tsx`) مع عرض اسم العنصر المحذوف وتحذير من العواقب.

---

## UX-04 🟡 — حقل الفئة (Category) في المنتجات لا يقترح الفئات الموجودة

**الملف:** [`src/features/products/ProductForm.tsx`](../src/features/products/ProductForm.tsx)

### الوصف

حقل `category` هو `Input` نصي عادي. لا يعرض الفئات الموجودة فعلاً في المنتجات.

### الأثر

- يكتب كل مستخدم أسماء فئات مختلفة ("مشروبات", "مشروبـات", "مشروبات كولا" ← 3 فئات مختلفة!)
- يُصعّب الفلترة والتقارير حسب الفئة
- تراكم فئات متشابهة بمسميات مختلفة

### الإصلاح المقترح

Combobox يسمح بالكتابة الحرة ويقترح الفئات الموجودة:

```tsx
const existingCategories = [...new Set(products.map(p => p.category).filter(Boolean))];
// استخدام datalist أو Combobox مخصص
<Input list="categories-list" ... />
<datalist id="categories-list">
  {existingCategories.map(cat => <option key={cat} value={cat} />)}
</datalist>
```

---

## UX-05 🟡 — اتجاه الشحن (قبلي/بحري) موجود في الأنواع لكن يحتاج تأكيد في الـ UI

**الملف:** [`src/types/index.ts:96-97`](../src/types/index.ts#L96) و [`src/pages/CustomersPage.tsx`](../src/pages/CustomersPage.tsx)

### الوصف

```typescript
// types/index.ts:96-97 — مُضاف للنوع
interface Customer {
  shippingDirection?: "qibli" | "bahri"; // موجود في الأنواع
}
```

يحتاج التحقق من أنه:
1. ظاهر في فورم إضافة/تعديل العميل
2. ظاهر في جدول العملاء (كـ Badge أو نص)
3. قابل للفلترة

### التوصية

إضافة Select في فورم العميل:
```tsx
<Select value={shippingDirection} onChange={...}>
  <option value="">— غير محدد —</option>
  <option value="qibli">↓ قبلي (جنوب)</option>
  <option value="bahri">↑ بحري (شمال)</option>
</Select>
```

---

## UX-06 🟡 — لا تنبيهات للعملاء ذوي الرصيد الدائن

**الملف:** [`src/pages/AlertsPage.tsx`](../src/pages/AlertsPage.tsx)

### الوصف

صفحة التنبيهات تعرض:
- منتجات نقص مخزونها
- منتجات قرب انتهاء صلاحيتها
- فواتير متأخرة

**لكن لا تعرض:** العملاء الذين دفعوا مبالغ زائدة (overpayment) وعندهم رصيد محبوس.

### الأثر

- لا يعلم صاحب المحل بالعملاء الذين يستحقون استرداد أو رصيد
- رصيد العميل الدائن قد يتراكم بدون علم أحد

### التوصية

```typescript
const customerCreditAlerts = salesInvoices
  .filter(inv => !inv.cancelled && (inv.overpayment ?? 0) > 0)
  .reduce((acc, inv) => {
    const existing = acc.get(inv.customerId);
    acc.set(inv.customerId, (existing ?? 0) + inv.overpayment!);
    return acc;
  }, new Map<string, number>());
```

---

## UX-07 🟡 — تجربة إدخال الأرقام في الجداول

**الملف:** [`src/pages/SalesInvoiceNewPage.tsx:470-493`](../src/pages/SalesInvoiceNewPage.tsx#L470) وصفحات أخرى

### الوصف

حقول الكمية والسعر في أسطر الفاتورة تستخدم `Input type="number"` مع معالجة `onChange`. تجربة الإدخال تواجه مشاكل شائعة:
- الضغط على السهم لأعلى/أسفل يغير القيمة بدون إشعار
- لا يوجد `onBlur` لتصحيح قيمة `0` للقيمة الفارغة
- القيم الكسرية (مثل 0.001 في بعض السلع) قد تسبب نتائج غير متوقعة مع `Math.max(0, ...)`

### التوصية

تحويل حقول الأرقام لمكوّن `NumberInput` مخصص يعالج:
- التحويل عند `onBlur` بدلاً من `onChange` لمنع تجميد المؤشر
- ضبط `step` مناسب لكل حقل (كمية = 1, سعر = 0.01)

---

## UX-08 🟡 — قائمة المنتجات في السطر لا تحمل معلومات كافية

**الملف:** [`src/pages/SalesInvoiceNewPage.tsx:628-648`](../src/pages/SalesInvoiceNewPage.tsx#L628)

### الوصف

```tsx
// ProductCombo — يعرض اسم المنتج + الكود فقط
{products.map((p) => (
  <option key={p.id} value={p.id}>
    {p.name} — {p.code}
  </option>
))}
```

### الأثر

- لا يعرض سعر الجملة/التجزئة للمرجعية
- لا يعرض الكمية المتاحة
- لا يعرض الفئة للتمييز بين منتجات بنفس الاسم
- في قوائم المنتجات الكبيرة، يصعب تمييز المنتجات

### التوصية

إضافة سطر ثانٍ (optgroup أو tooltip) يعرض: السعر | الكمية المتاحة | الوحدة.

---

## UX-09 🟢 — رسائل الخطأ لا تحدد حقل المشكلة في بعض الأماكن

**الملف:** [`src/pages/SalesInvoiceNewPage.tsx:211-249`](../src/pages/SalesInvoiceNewPage.tsx#L211) وصفحات أخرى

### الوصف

```typescript
const invalid = lines.find((l) => !l.productId || l.quantity <= 0);
if (invalid) {
  toast.error("تأكد من اختيار المنتج وإدخال كمية صحيحة لكل سطر");
  // ← لا يُشير لرقم السطر المحدد
}
```

### التوصية

```typescript
const invalidIdx = lines.findIndex((l) => !l.productId || l.quantity <= 0);
if (invalidIdx >= 0) {
  toast.error(`السطر ${invalidIdx + 1}: تأكد من اختيار المنتج وإدخال كمية صحيحة`);
}
```

---

## UX-10 🟢 — لا حفظ تلقائي للمسودات في صفحات التعديل

**الملفات:** [`src/pages/SalesInvoiceEditPage.tsx`](../src/pages/SalesInvoiceEditPage.tsx), [`src/pages/PurchaseInvoiceEditPage.tsx`](../src/pages/PurchaseInvoiceEditPage.tsx)

### الوصف

صفحة إنشاء الفاتورة الجديدة تحفظ مسودة في `sessionStorage` تلقائياً. لكن صفحات **التعديل** لا تفعل ذلك.

### الأثر

إذا أغلق المستخدم النافذة أو انتقل بالخطأ أثناء تعديل فاتورة، تضيع التعديلات.

### التوصية

إضافة نفس آلية الـ draft في صفحات التعديل، أو على الأقل تحذير `beforeunload` بوجود تعديلات غير محفوظة.

---

## UX-11 🟢 — قائمة العملاء/الموردين بدون بحث سريع

**الملفات:** [`src/pages/CustomersPage.tsx`](../src/pages/CustomersPage.tsx), [`src/pages/SuppliersPage.tsx`](../src/pages/SuppliersPage.tsx)

### الوصف

صناديق البحث موجودة في أعلى الصفحة، لكن لا يوجد اختصار لوحة مفاتيح (مثل `/` أو `Ctrl+F`) للتركيز على صندوق البحث مباشرة.

### التوصية

إضافة `useEffect` للـ keyboard shortcut:
```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.key === "/" || (e.ctrlKey && e.key === "f")) && searchRef.current) {
      e.preventDefault();
      searchRef.current.focus();
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);
```

---

## UX-12 🟢 — صفحة لوحة التحكم (Dashboard) تُحسب مشتقاتها في كل render

**الملف:** [`src/pages/DashboardPage.tsx`](../src/pages/DashboardPage.tsx) — **685 سطر**

### الوصف

بعض الحسابات المكثّفة في Dashboard تُعاد عند كل render بدون تذكير (useMemo). مع نمو البيانات، قد يُسبب هذا بطئاً ملحوظاً في تحميل الصفحة.

### التوصية

مراجعة الحسابات الثقيلة (مثل إجمالي المبيعات الشهرية، حسابات التقارير) وتغليفها بـ `useMemo`.

---

## ملخص مشاكل UX

| الكود | الخطورة | الوصف | الصفحة |
|---|---|---|---|
| UX-01 | 🟠 | تسمية "المتبقي" مضلِّلة | SalesInvoiceNewPage |
| UX-02 | 🟠 | صفحة التقارير ضخمة جداً | ReportsPage |
| UX-03 | 🟠 | لا تأكيد مخصص عند الحذف | متعدد |
| UX-04 | 🟡 | حقل الفئة لا يقترح الموجودة | ProductForm |
| UX-05 | 🟡 | اتجاه الشحن يحتاج تأكيد UI | CustomersPage |
| UX-06 | 🟡 | لا تنبيهات رصيد دائن للعملاء | AlertsPage |
| UX-07 | 🟡 | تجربة إدخال الأرقام تحتاج تحسين | متعدد |
| UX-08 | 🟡 | قائمة المنتجات في السطر محدودة المعلومات | SalesInvoiceNewPage |
| UX-09 | 🟢 | رسائل الخطأ لا تحدد السطر | متعدد |
| UX-10 | 🟢 | لا draft في صفحات التعديل | EditPages |
| UX-11 | 🟢 | لا اختصار للبحث | CustomersPage/SuppliersPage |
| UX-12 | 🟢 | Dashboard يحتاج useMemo | DashboardPage |
