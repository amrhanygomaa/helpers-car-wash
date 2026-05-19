# Tasks: Bugs & Features — Helpers Inventory System

> **Project:** `src/` — React + TypeScript + Electron  
> **State file:** `src/store/AppContext.tsx`  
> **Types file:** `src/types/index.ts`

---

## 1. صفحة المنتجات — `ProductsPage` / `ProductForm`

### 1.1 Bug: حقول ناقصة في فورم إضافة المنتج

**المشكلة:** فورم إضافة المنتج مش بيعرض كل الحقول المهمة.

**المطلوب:** تأكد إن الحقول دي موجودة وبتتحفظ في `addProduct`:

| الحقل | Field Name | النوع |
|---|---|---|
| سعر الشراء الأساسي | `purchasePrice` | `number` |
| الكمية الحالية | `quantity` | `number` |
| الحد الأدنى للخزون | `minStock` | `number` |

**ملف:** `src/features/products/ProductForm.tsx`

---

### 1.2 Feature: حقل الفئة — Combobox بدل Input عادي

**المشكلة:** حقل الفئة (`category`) بيسمح بكتابة حرة بس مش بيعرض الفئات الموجودة.

**المطلوب:**
- حقل الفئة يكون **Combobox** — يسمح بكتابة فئة جديدة أو اختيار من الفئات الموجودة فعلاً في المنتجات
- الفئات الموجودة تُجمع dynamically من `products.map(p => p.category)` وتُزال المكررات

**ملف:** `src/features/products/ProductForm.tsx`

```ts
// مثال على استخراج الفئات الموجودة
const existingCategories = [...new Set(products.map(p => p.category).filter(Boolean))];
```

---

## 2. صفحة الموردين — `SuppliersPage`

### 2.1 Feature: إضافة حقل كود المورد

**المطلوب:**
- إضافة `code?: string` في `interface Supplier` في `src/types/index.ts`
- إضافة حقل **كود المورد** في فورم إضافة/تعديل المورد
- عرض الكود في جدول الموردين

**ملفات:**
- `src/types/index.ts` ← أضف `code?: string` في `Supplier`
- فورم الموردين (داخل `SuppliersPage.tsx` أو ملف منفصل)

---

## 3. صفحة العملاء — `CustomersPage`

### 3.1 Feature: إضافة حقل كود العميل

**المطلوب:**
- إضافة `code?: string` في `interface Customer` في `src/types/index.ts`
- إضافة حقل **كود العميل** في فورم إضافة/تعديل العميل
- عرض الكود في جدول العملاء

---

### 3.2 Feature: إضافة اتجاه الشحن للعميل (قبلي / بحري)

**المطلوب:**
- إضافة حقل اتجاه الشحن في `interface Customer` في `src/types/index.ts`:

```ts
shippingDirection?: "qibli" | "bahri"; // قبلي = جنوب | بحري = شمال
```

- في فورم إضافة/تعديل العميل: حقل **اتجاه الشحن** بخيارين:
  - 🔽 **قبلي** (جنوب)
  - 🔼 **بحري** (شمال)
- يظهر الاتجاه في جدول العملاء كـ Badge أو نص واضح
- يُستخدم لاحقاً في فلترة العملاء أو تقارير التوزيع حسب الاتجاه

**ملفات:**
- `src/types/index.ts` ← أضف `shippingDirection`
- فورم العملاء (داخل `CustomersPage.tsx`)

---

## 4. صفحة فواتير المشتريات — `PurchaseInvoicesPage`

### 4.1 Bug: رقم الفاتورة مش بيتغير (Auto-increment مكسور)

**المشكلة:** رقم الفاتورة (`invoiceNumber`) بيظل ثابت أو مش بيتحدث عند إضافة فاتورة جديدة.

**المطلوب:**
- التأكد إن `invoiceNumber` بيتولّد تلقائياً عند كل فاتورة جديدة
- المنطق المفروض:

```ts
const lastNumber = purchaseInvoices
  .map(inv => parseInt(inv.invoiceNumber.replace(/\D/g, ""), 10))
  .filter(n => !isNaN(n));

const nextNumber = lastNumber.length > 0 ? Math.max(...lastNumber) + 1 : 1;
const invoiceNumber = `PO-${String(nextNumber).padStart(5, "0")}`;
```

**ملف:** `src/store/AppContext.tsx` — دالة `addPurchaseInvoice`

---

## 5. صفحة فواتير المبيعات — `SalesInvoicesPage` / `SalesInvoiceNewPage`

### 5.1 Bug: لما بتضيف منتج، الكمية والسعر مش بيتحسبوا في السطر (Line Subtotal)

**المشكلة:** عند إضافة منتج للفاتورة، حقل `subtotal` في الـ `InvoiceLine` مش بيتحسب أوتوماتيك.

**المطلوب:**
- `subtotal` يتحسب تلقائياً عند أي تغيير في `quantity` أو `price`:

```ts
const subtotal = quantity * price;
```

- التأكد إن الـ total بتاع الفاتورة كمان بيتحدث:

```ts
const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
```

**ملف:** `src/pages/SalesInvoiceNewPage.tsx`

---

### 5.2 Bug: المبلغ المستلم مش بيتسجل صح

**المشكلة:** `amountReceived` عند إنشاء الفاتورة مش بيتحفظ أو بيتغلط في الحساب.

**المطلوب:**
- التأكد إن `amountReceived` بيتبعت صح في `addSalesInvoice`
- `status` يتحدد بناءً على:

```ts
function computeStatus(total: number, received: number): PaymentStatus {
  if (received <= 0) return "unpaid";
  if (received >= total) return "paid";
  return "partial";
}
```

- `remaining = Math.max(0, total - amountReceived)`

**ملف:** `src/store/AppContext.tsx` — دالة `addSalesInvoice`

---

### 5.3 Bug: السعر بيتحسب بالجملة مش بالتجزئة في حالة معينة

**المشكلة:** عند إضافة منتج في فاتورة المبيعات، السعر بيجي دايماً `wholesalePrice` حتى لو نوع الفاتورة `retail`.

**المطلوب:**
- السعر اللي بيتسحب للـ `InvoiceLine` يعتمد على `priceType` بتاع الفاتورة:

```ts
const price = priceType === "retail"
  ? product.retailPrice
  : product.wholesalePrice;
```

**ملف:** `src/pages/SalesInvoiceNewPage.tsx`

---

### 5.4 Feature: تسجيل المبالغ الزيادة كمستحقات للعميل (Overpayment → Customer Credit)

**المشكلة:** لو العميل دفع أكتر من قيمة الفاتورة، الزيادة بتضيع مش بتتسجل.

**المطلوب:**

#### في `src/types/index.ts`:
```ts
interface Customer {
  // ... existing fields
  creditBalance?: number; // الرصيد المتراكم للعميل
}
```

#### في `src/store/AppContext.tsx` — دالة `recordSalesReceipt`:
```ts
// لو المبلغ المدفوع أكبر من المتبقي
const overpayment = amount - inv.remaining;
if (overpayment > 0) {
  // أضف الزيادة لرصيد العميل
  updateCustomer(inv.customerId, {
    creditBalance: (customer.creditBalance ?? 0) + overpayment,
  });
}
```

#### في فاتورة المبيعات الجديدة:
- لو العميل عنده `creditBalance > 0`، يظهر خيار "استخدام الرصيد المتاح"
- تُخصم قيمة الرصيد من `amountReceived` تلقائياً

---

### 5.5 Feature: زر "صالح كل المستحقات" — Settle All Dues

**المطلوب:**
- في صفحة تفاصيل الفاتورة أو صفحة العميل: زر **"صالح كل المستحقات"**
- عند الضغط: يتحصل الـ `remaining` الكامل لكل الفواتير غير المدفوعة لهذا العميل دفعة واحدة
- يُنشئ `CashEntry` لكل فاتورة

```ts
const settleAllDues = (customerId: ID) => {
  const unpaidInvoices = salesInvoices.filter(
    inv => inv.customerId === customerId &&
    inv.status !== "paid" &&
    !inv.cancelled
  );
  unpaidInvoices.forEach(inv => {
    recordSalesReceipt(inv.id, inv.remaining);
  });
};
```

---

### 5.6 Feature: إنشاء المرتجع من الفاتورة مباشرة (المنتجات والكميات)

**المشكلة:** عند إنشاء مرتجع، المستخدم بيضيف المنتجات يدوياً مش من الفاتورة.

**المطلوب:**
- في صفحة تفاصيل فاتورة المبيعات: زر **"إنشاء مرتجع"**
- يفتح dialog فيه المنتجات والكميات من الفاتورة الأصلية جاهزة
- المستخدم يختار الكميات المرتجعة من بين الكميات الأصلية
- القيم تُحسب تلقائياً من الفاتورة (`price` من `InvoiceLine`)

**ملفات:**
- `src/features/returns/SalesReturnDialog.tsx`
- `src/pages/SalesInvoiceDetailPage.tsx`

---

### 5.7 Feature: إعادة تصميم عرض قائمة الفواتير (Layout)

**المطلوب:**
- إعادة ترتيب أعمدة جدول الفواتير بحيث تكون أوضح وأقصر
- الأعمدة المقترحة: رقم الفاتورة | التاريخ | العميل | الإجمالي | المحصّل | المتبقي | الحالة | إجراءات

---

## 6. الموظف — Employee Commission

### 6.1 Feature: العمولة على الفلوس المحصلة مش الآجل (Cash Basis)

> **ملاحظة:** هذه المهمة موثقة بالتفصيل في ملف `task-quarterly-cash-commission.md` — راجعه للتنفيذ الكامل.

**ملخص:** `employeeSalesStats` تتحسب على أساس `CashEntry` بتاريخ التحصيل الفعلي، مش `inv.total`.

---

### 6.2 Feature: صفحة "الفلوس اللي هتتحصل من الآجل" — Pending Receivables

**المطلوب:**
- صفحة أو Section جديدة في تقرير الموظف أو التقارير العامة
- تعرض جدول بكل الفواتير الآجلة اللي لسه فيها متبقي:

| العمود | المصدر |
|---|---|
| اسم العميل | `inv.customerName` |
| المبلغ الكلي | `inv.total` |
| المبلغ المتبقي | `inv.remaining` |
| تاريخ الاستحقاق | `inv.paymentDueDate` |

- تُرتب تصاعدياً حسب `paymentDueDate`
- تُفلتر على الفواتير: `status !== "paid"` و `paymentType === "account"` و `!cancelled`

**ملف:** يُضاف في `src/pages/ReportsPage.tsx` أو صفحة جديدة `src/pages/ReceivablesPage.tsx`

---

## 7. صفحة التقارير — `ReportsPage`

### 7.1 Feature: إضافة قسم "المستحقات للموردين" — Payables to Suppliers

**المطلوب:**
- Section جديدة في صفحة التقارير تعرض الفواتير المشتريات اللي عليها متبقي:

| العمود | المصدر |
|---|---|
| اسم المورد | `inv.supplierName` |
| رقم الفاتورة | `inv.invoiceNumber` |
| الإجمالي | `inv.total` |
| المدفوع | `inv.amountPaid` |
| المتبقي | `inv.remaining` |
| التاريخ | `inv.date` |

- الفلتر: `purchaseInvoices.filter(inv => inv.status !== "paid")`
- الإجمالي الكلي يظهر في الأسفل

**ملف:** `src/pages/ReportsPage.tsx`

---

## 8. صفحة الخزنة — `CashboxPage`

### 8.1 Feature: إضافة مستحقات الموردين الآجلة في الخزنة

**المطلوب:**
- في صفحة الخزنة: إضافة بطاقة أو section يوضح **إجمالي المبالغ المستحقة للموردين** (المشتريات الآجلة غير المسددة)

```ts
const totalPayablesToSuppliers = purchaseInvoices
  .filter(inv => inv.status !== "paid")
  .reduce((sum, inv) => sum + inv.remaining, 0);
```

- يظهر بلون مميز (أحمر أو برتقالي) عشان واضح إنها التزامات

**ملف:** `src/pages/CashboxPage.tsx`

---

## 9. صفحة التنبيهات — `AlertsPage`

### 9.1 Bug: تنبيهات العملاء اللي ليهم رصيد (Credit Balance) مش شغالة

**المشكلة:** التنبيهات المتعلقة بالعملاء اللي عندهم رصيد متراكم (`creditBalance > 0`) مش بتظهر.

**المطلوب:**
- إضافة نوع تنبيه جديد للعملاء اللي عندهم رصيد:

```ts
const customerCreditAlerts = customers
  .filter(c => (c.creditBalance ?? 0) > 0)
  .map(c => ({
    id: uid("alert"),
    type: "customer-credit",
    title: `رصيد متاح للعميل: ${c.name}`,
    subtitle: `رصيد: ${formatCurrency(c.creditBalance!, settings.currency)}`,
    date: new Date().toISOString(),
  }));
```

**ملف:** `src/pages/AlertsPage.tsx` أو `src/store/AppContext.tsx`

---

## ترتيب الأولوية المقترح

| # | المهمة | النوع | الأولوية |
|---|---|---|---|
| 1 | 5.1 — Subtotal مش بيتحسب | Bug 🔴 | عاجل |
| 2 | 5.2 — المبلغ المستلم مش بيتسجل | Bug 🔴 | عاجل |
| 3 | 4.1 — رقم فاتورة المشتريات | Bug 🔴 | عاجل |
| 4 | 5.3 — سعر الجملة/التجزئة | Bug 🔴 | عاجل |
| 5 | 6.1 — Commission Cash Basis | Feature 🟡 | مهم |
| 6 | 5.4 — Overpayment Credit | Feature 🟡 | مهم |
| 7 | 5.5 — صالح كل المستحقات | Feature 🟡 | مهم |
| 8 | 5.6 — مرتجع من الفاتورة | Feature 🟡 | مهم |
| 9 | 6.2 — صفحة الآجل | Feature 🟢 | عادي |
| 10 | 7.1 — مستحقات الموردين | Feature 🟢 | عادي |
| 11 | 8.1 — الخزنة والموردين | Feature 🟢 | عادي |
| 12 | 1.2 — Combobox الفئة | Feature 🟢 | عادي |
| 13 | 2.1 — كود المورد | Feature 🟢 | عادي |
| 14 | 3.1 — كود العميل | Feature 🟢 | عادي |
| 15 | 3.2 — اتجاه الشحن (قبلي/بحري) | Feature 🟢 | عادي |
| 16 | 9.1 — تنبيهات الرصيد | Bug 🟡 | عادي |
| 17 | 5.7 — Layout الفواتير | UI 🟢 | منخفض |
