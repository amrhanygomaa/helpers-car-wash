# 02 — الأخطاء والمشاكل المنطقية

> **تاريخ التقرير:** 2026-06-09 | كل خطأ موثّق بملف + سطر من الكود الفعلي

---

## مقياس الخطورة

| الرمز | المعنى |
|---|---|
| 🔴 حرج | يُفسد بيانات مالية أو مخزن مباشرة — يجب إصلاحه قبل أي إصدار |
| 🟠 عالٍ | يؤثر على دقة البيانات في سيناريوهات محددة |
| 🟡 متوسط | خطر محتمل عند توسّع البيانات أو حالات حافة |
| 🟢 منخفض | تحسين أو احتياط إضافي |

---

## BUG-01 🔴 — تجميع أسطر المنتج المكرر يُفسد حسابات المخزون

**الملف:** [`src/store/AppContext.tsx:1007-1018`](../src/store/AppContext.tsx#L1007)
**يؤثر على:** `addPurchaseInvoice`, `addSalesInvoice`, `updatePurchaseInvoice`, `updateSalesInvoice`, `cancelSalesInvoice`, `deletePurchaseInvoice`, `deleteSalesInvoice`

### الوصف

عند إضافة/تعديل/حذف فاتورة، يُستخدم `.find()` لتحديد كمية المنتج:

```typescript
// AppContext.tsx:1010 — مثال من addPurchaseInvoice
const line = inv.lines.find((l) => l.productId === p.id); // ← يأخذ أول سطر فقط!
if (!line) return p;
const patch: Partial<Product> = { quantity: p.quantity + line.quantity };
```

بينما حركات المخزون تُنشأ لجميع الأسطر بـ `.map()`:

```typescript
// AppContext.tsx:1023 — ينشئ حركات لكل الأسطر
const movements: StockMovement[] = inv.lines.map((l, idx) => ({ ... }));
```

### الأثر

إذا كانت فاتورة المشتريات أو المبيعات تحتوي على **نفس المنتج في سطرين** (وهو سيناريو ممكن — مثل نفس المنتج بتاريخ صلاحية مختلف):
- **المخزون** يُحدَّث بكمية السطر الأول فقط
- **حركات المخزون** تُنشأ بالكميات الكاملة لجميع الأسطر
- **نتيجة:** تعارض دائم بين رصيد المخزون وسجل الحركات — أرقام المخزون خاطئة

### الإصلاح المقترح

```typescript
// تجميع الكميات لنفس المنتج قبل تحديث المخزون
setProducts((list) =>
  list.map((p) => {
    // جمع كميات جميع الأسطر لهذا المنتج
    const totalQty = inv.lines
      .filter((l) => l.productId === p.id)
      .reduce((sum, l) => sum + l.quantity, 0);
    if (totalQty === 0) return p;
    return { ...p, quantity: p.quantity + totalQty };
  })
);
```

**الجهد:** متوسط — يحتاج تعديل في 7+ مواضع
**الأولوية:** فورية

---

## BUG-02 🔴 — عمولة الموظف على أساس الاستحقاق الشهري لا التحصيل الربعي

**الملف:** [`src/store/AppContext.tsx:1558-1588`](../src/store/AppContext.tsx#L1558)
**الملف المرجعي:** [`task-quarterly-cash-commission.md`](../task-quarterly-cash-commission.md)

### الوصف

الكود الحالي يحسب عمولة الموظف هكذا:

```typescript
// AppContext.tsx:1562-1569 — المنطق الحالي الخاطئ
const totalSales = salesInvoices
  .filter(
    (inv) =>
      inv.createdByUserId === userId &&
      !inv.cancelled &&
      inv.date.slice(0, 7) === monthKey  // ← بتاريخ البيع الشهري
  )
  .reduce((sum, inv) => sum + inv.total, 0); // ← على إجمالي الفاتورة (وليس المُحصَّل)
```

### الأثر الفعلي

| السيناريو | المتوقع | الفعلي |
|---|---|---|
| فاتورة آجل 10,000 ج.م — لم تُدفع بعد | عمولة = صفر | عمولة = 10,000 × % (تُصرف قبل التحصيل!) |
| فاتورة آجل دُفعت في الربع التالي | تُحتسب في الربع الجديد | لا تُحتسب أبداً في الربع الجديد |
| فاتورة نقدية في نفس الشهر | تُحتسب | ✅ صحيح |

**النتيجة:** تُصرف عمولات على فلوس لم تُحصَّل بعد، ومدفوعات الآجل المتأخرة تضيع من حساب العمولة.

### القاعدة التجارية الصحيحة

العمولة يجب أن تكون **ربع سنوية** و**على التحصيل الفعلي** من `cashEntries`:

```typescript
// الإصلاح: استخدام cashEntries بدلاً من salesInvoices
const totalCollected = cashEntries
  .filter(
    (ce) =>
      ce.type === "sales-receipt" &&
      ce.referenceId &&
      empInvoiceIds.has(ce.referenceId) &&  // فواتير هذا الموظف فقط
      ce.date >= quarterStart &&             // ربع السنة المحدد
      ce.date <= quarterEnd
  )
  .reduce((sum, ce) => sum + ce.amount, 0);
```

**الجهد:** متوسط — تغيير `employeeSalesStats` + `EmployeeReportPage.tsx` + `AppActions` interface
**الأولوية:** فورية — خسارة مالية مباشرة

---

## BUG-03 🔴 — حركة مخزون وهمية عند إلغاء فاتورة المبيعات

**الملف:** [`src/store/AppContext.tsx:1327-1338`](../src/store/AppContext.tsx#L1327)

### الوصف

```typescript
// AppContext.tsx:1327-1338 — cancelSalesInvoice
const mv: StockMovement = {
  id: uid("mov_ret"),
  productId: inv.lines[0]?.productId ?? "",  // ← أول منتج فقط!
  productName: "إلغاء فاتورة " + inv.invoiceNumber, // ← اسم مضلِّل
  type: "return",
  quantity: inv.lines.reduce((a, b) => a + b.quantity, 0), // ← مجموع كل الأسطر!
  // ...
};
```

### الأثر

- تظهر حركة مخزون واحدة بمجموع كميات الفاتورة كلها، لكنها منسوبة لـ **أول منتج فقط**
- المنتجات الأخرى في الفاتورة لا يوجد لها سجل إلغاء في حركة المخزون
- **المخزون الفعلي يُعاد صحيحاً** (لأن `.map` في الأعلى يعالج كل المنتجات)، لكن **سجل الحركات مشوَّه**
- تقارير حركة المخزون ستُظهر أرقاماً غير منطقية

### الإصلاح المقترح

```typescript
// إنشاء حركة منفصلة لكل منتج في الفاتورة الملغاة
const movements: StockMovement[] = inv.lines.map((l, idx) => ({
  id: uid(`mov_cancel_${idx}`),
  productId: l.productId,
  productName: l.productName,
  type: "return" as const,
  quantity: l.quantity,
  reason: `إلغاء فاتورة مبيعات ${inv.invoiceNumber}`,
  referenceId: id,
  referenceType: "sale" as const,
  date: new Date().toISOString().slice(0, 10),
}));
setStockMovements((list) => [...movements, ...list]);
```

**الجهد:** صغير — سطور قليلة
**الأولوية:** عالية

---

## BUG-04 🔴 — الرصيد الدائن للعميل (Overpayment) محبوس على الفاتورة

**الملف:** [`src/store/AppContext.tsx:1212-1240`](../src/store/AppContext.tsx#L1212) و [`src/pages/SalesInvoiceNewPage.tsx`](../src/pages/SalesInvoiceNewPage.tsx)

### الوصف

عندما يدفع العميل أكثر من قيمة الفاتورة، يُحفظ الفائض في `overpayment` على الفاتورة:

```typescript
// AppContext.tsx:1218-1225 — recordSalesReceipt
const cappedAmount = Math.min(amount, inv.remaining);
const excess = amount - cappedAmount;
// ...
overpayment: excess > 0 ? (inv.overpayment ?? 0) + excess : inv.overpayment,
```

**لكن لا يوجد مسار لـ:**
1. ظهور الرصيد الدائن للعميل في فاتورة جديدة كخيار دفع
2. تسوية جميع مستحقات عميل بدفعة واحدة ("صالح كل المستحقات")
3. إعادة الرصيد الدائن كاش للعميل عند الطلب

### الأثر

- فلوس العميل الزائدة موجودة في النظام لكنها "مجمّدة" على الفواتير القديمة
- لا رؤية واضحة للعملاء ذوي الأرصدة الدائنة في لوحة التحكم أو التنبيهات
- المحاسبة غير مكتملة

### الإصلاح المقترح (ملخص)

1. إضافة `creditBalance?: number` لـ `Customer` في `types/index.ts`
2. في `recordSalesReceipt`: إذا كان `excess > 0`، يُضاف لـ `customer.creditBalance`
3. في `SalesInvoiceNewPage`: إظهار رصيد العميل الدائن وخيار استخدامه
4. إضافة دالة `settleAllDues(customerId)` في `AppContext`

**الجهد:** كبير — يمسّ عدة ملفات وصفحات
**الأولوية:** عالية

---

## BUG-05 🟠 — استعادة النسخة الاحتياطية تتجاهل `nextCustomerCode`

**الملف:** [`src/store/AppContext.tsx:1612-1653`](../src/store/AppContext.tsx#L1612)

### الوصف

```typescript
// AppContext.tsx — importBackup
if (typeof s.nextProductCode === "number") setNextProductCode(s.nextProductCode); // ✅ موجود
if (typeof s.nextSupplierCode === "number") {                                      // ✅ موجود
  setNextSupplierCode(Math.max(s.nextSupplierCode, nextSupplierCodeFromExisting(...)));
}
// ❌ nextCustomerCode غائب تماماً!
```

### الأثر

بعد استعادة نسخة احتياطية، `nextCustomerCode` يبدأ من القيمة المحفوظة قبل الاستعادة (أو يبقى بقيمته القديمة في الذاكرة)، مما يؤدي لـ:
- إنشاء عملاء بأكواد **CUS-0001, CUS-0002, ...** مكررة مع عملاء موجودين
- تعارض في البيانات يصعب اكتشافه لاحقاً

### الإصلاح

```typescript
// إضافة بعد معالجة nextSupplierCode في importBackup
if (typeof s.nextCustomerCode === "number") {
  setNextCustomerCode(s.nextCustomerCode);
} else if (Array.isArray(s.customers) && s.customers.length > 0) {
  // استنتاج من الأكواد الموجودة
  const maxCode = s.customers.reduce((max: number, c: { code?: string }) => {
    const match = /^CUS-(\d+)$/i.exec((c.code ?? "").trim());
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  setNextCustomerCode(maxCode + 1);
}
```

**الجهد:** صغير جداً
**الأولوية:** عالية

---

## BUG-06 🟠 — تصدير CSV بدون Escaping للمحتوى

**الملف:** [`src/store/AppContext.tsx:1716`](../src/store/AppContext.tsx#L1716)

### الوصف

```typescript
// AppContext.tsx:1716
const csvContent = "﻿" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
```

### الأثر

- أي حقل يحتوي على **فاصلة** (مثل `اسم شركة, فرع القاهرة`) يكسر الأعمدة
- أي حقل يحتوي على **سطر جديد** في الملاحظات يكسر الصفوف
- أي حقل يحتوي على **علامة اقتباس** `"` يكسر التنسيق

### الإصلاح

```typescript
function escapeCsvField(value: string | number | undefined): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
// ثم:
const csvContent = "﻿" + [
  headers.join(","),
  ...rows.map(r => r.map(escapeCsvField).join(","))
].join("\n");
```

**الجهد:** صغير جداً
**الأولوية:** عالية

---

## BUG-07 🟠 — `parseNumericInput` يُحوّل الفاصلة إلى نقطة عشرية

**الملف:** [`src/lib/numberInput.ts:9`](../src/lib/numberInput.ts#L9)

### الوصف

```typescript
// numberInput.ts:9
.replace(/,/g, ".")  // ← يحوّل كل فاصلة إلى نقطة
```

### الأثر

- المستخدم يكتب `1,500` (ألف وخمسمائة) → يُقرأ كـ `1.5` (واحد ونصف)
- يؤثر على إدخال الأسعار والكميات والمبالغ عبر الواجهة كاملة
- **هذا خطر مالي حقيقي** في حالة كتابة مبالغ كبيرة بالفاصلة كفاصل آلاف

### السياق

الفاصلة المقصودة للإزالة هي فاصل الآلاف في الأرقام العربية (مثل `١٬٥٠٠`)، لكن التعبير الحالي يزيل **أي فاصلة** بما فيها الفاصلة كفاصل آلاف إنجليزي.

### الإصلاح المقترح

خيار أ — منع الفاصلة كلياً وإرشاد المستخدم:
```typescript
// إزالة الفاصلة بدلاً من تحويلها (أو رفض الإدخال)
.replace(/,/g, "")  // أزل الفاصلة تماماً
```

خيار ب — التمييز بين الفاصلة العشرية والآلاف:
```typescript
// إذا كان الرقم يتبع نمط أرقام + فاصلة + 3 أرقام، فهي فاصل آلاف
.replace(/(\d),(\d{3})/g, "$1$2")  // أزل فاصل الآلاف فقط
.replace(/,/, ".")                  // حوّل الفاصلة العشرية الأولى فقط
```

**الجهد:** صغير
**الأولوية:** عالية

---

## BUG-08 🟠 — حذف فاتورة مدفوعة يمسح قيود الخزنة بصمت

**الملف:** [`src/store/AppContext.tsx:1141-1156`](../src/store/AppContext.tsx#L1141) و `1340-1358`

### الوصف

```typescript
// deletePurchaseInvoice — AppContext.tsx:1153-1155
setPurchaseInvoices((list) => list.filter((i) => i.id !== id));
setStockMovements((list) => list.filter((m) => m.referenceId !== id));
setCashEntries((list) => list.filter((c) => c.referenceId !== id)); // ← تُمسح الدفعات كلها!
```

### الأثر

- إذا دُفعت الفاتورة جزئياً أو كلياً، وتم حذفها:
  - **المخزون يُعاد** (صحيح)
  - **قيود الخزنة تُمسح** → رصيد الخزنة يتغير بأثر رجعي بدون أي أثر
  - لا سجل تدقيق يشير لأن الخزنة تغيرت بسبب حذف الفاتورة
- في حالة فاتورة آجل مدفوعة جزئياً: رصيد الخزنة يرتفع وكأن الدفعة لم تحدث أبداً

### الإصلاح المقترح

بدلاً من مسح قيود الخزنة، إنشاء قيد عكسي:
```typescript
// إنشاء قيد تصحيح بدلاً من المسح
if (inv.amountPaid > 0) {
  const correctionEntry: CashEntry = {
    id: uid("cash_del"),
    type: "adjustment",
    amount: inv.amountPaid,  // عكس المبلغ المدفوع
    description: `تصحيح: حذف فاتورة مشتريات ${inv.invoiceNumber} — ${inv.supplierName}`,
    referenceId: id,
    date: new Date().toISOString().slice(0, 10),
  };
  setCashEntries((list) => [correctionEntry, ...list]);
}
// ثم مسح القيود القديمة (أو الاحتفاظ بها كسجل)
```

**الجهد:** متوسط
**الأولوية:** عالية

---

## BUG-09 🟡 — ترقيم المرتجعات بطول المصفوفة (قابل للتكرار)

**الملف:** [`src/store/AppContext.tsx:1364`](../src/store/AppContext.tsx#L1364) و `1432`

### الوصف

```typescript
// addSalesReturn — AppContext.tsx:1364
const num = `SR-${(salesReturns.length + 1).toString().padStart(4, "0")}`;
// addPurchaseReturn — AppContext.tsx:1432
const num = `PR-${(purchaseReturns.length + 1).toString().padStart(4, "0")}`;
```

### الأثر

- إذا تم حذف مرتجع (إن أُضيف هذا الخيار لاحقاً) ثم إنشاء جديد → نفس الرقم
- إذا استُعيدت نسخة احتياطية بعد حذف بعض المرتجعات → أرقام مكررة
- في الوقت الحالي (لا يوجد حذف مرتجعات) التأثير محدود، لكنه خطر معماري

### الإصلاح

استخدام نفس نهج الفواتير (max + 1):
```typescript
const nums = salesReturns.map(r => parseInt(r.returnNumber.replace(/\D/g, ""), 10)).filter(n => !isNaN(n));
const next = nums.length ? Math.max(...nums) + 1 : 1;
const num = `SR-${next.toString().padStart(4, "0")}`;
```

**الجهد:** صغير
**الأولوية:** متوسطة

---

## BUG-10 🟡 — قيم Overpayment في فاتورة المبيعات الجديدة قد تُزدوج

**الملف:** [`src/store/AppContext.tsx:1159-1210`](../src/store/AppContext.tsx#L1159)

### الوصف

```typescript
// addSalesInvoice — AppContext.tsx:1198-1208
const totalCashReceived = inv.amountReceived + (inv.overpayment ?? 0);
if (totalCashReceived > 0) {
  const ce: CashEntry = {
    amount: totalCashReceived,  // ← يُدرج الـ overpayment في الخزنة
    // ...
  };
}
```

وفي `SalesInvoiceNewPage`, يُمرَّر `overpayment: customerChange > 0 ? customerChange : undefined` صراحةً:

```typescript
// SalesInvoiceNewPage.tsx:282
const customerChange = Math.max(0, amountReceived - invoiceNet);
// ...
overpayment: customerChange > 0 ? customerChange : undefined,
```

### الأثر

القيد المحاسبي في الخزنة يتضمن المبلغ الزائد (Overpayment) كجزء من التحصيل — وهذا **صحيح** من منظور الخزنة (الكاش دخل فعلاً). لكن لأن الـ `overpayment` يُحسب مرة أخرى في `recordSalesReceipt`، إذا تم استدعاؤه لاحقاً قد يحدث ازدواج في `CashEntry`.

**هذا البند يحتاج تدقيقاً إضافياً** في السيناريو التفصيلي قبل اعتباره خطأ مؤكداً.

**الجهد:** يحتاج تحقيق
**الأولوية:** متوسطة

---

## BUG-11 🟢 — طبقة الـ Fallback للمصادقة تستخدم `btoa` غير آمن

**الملف:** [`src/lib/auth.ts:20-22`](../src/lib/auth.ts#L20)

### الوصف

```typescript
// auth.ts:20-22 — verifyFallbackPassword
export async function verifyFallbackPassword(storedHash: string, password: string) {
  if (storedHash.startsWith("sha256:")) {
    return (await hashPassword(password)) === storedHash;
  }
  return storedHash === btoa(password); // ← base64 مجرد تشفير، ليس hashing!
}
```

### الأثر

- في وضع الويب/التطوير (بدون Electron/argon2): من يصل للـ localStorage يمكنه فك تشفير `btoa` بـ `atob()` مباشرة
- لا أثر في الإنتاج حيث argon2id عبر IPC هو المسار الحقيقي
- **مسار غير مستخدم في المنتج الفعلي** لكنه خطر إذا نُشر التطبيق كويب

### التوصية

استبدال `btoa(password)` بـ SHA-256 على الأقل (موجود في `hashPassword`) كـ fallback آمن لمستوى الويب.

**الجهد:** صغير
**الأولوية:** منخفضة (لا أثر في الإنتاج المُحزَّم)

---

## ملخص سريع

| الكود | الخطورة | الملف الرئيسي | حالة الإصلاح |
|---|---|---|---|
| BUG-01 | 🔴 حرج | AppContext.tsx:1007 | مطلوب |
| BUG-02 | 🔴 حرج | AppContext.tsx:1558 | مطلوب |
| BUG-03 | 🔴 حرج | AppContext.tsx:1327 | مطلوب |
| BUG-04 | 🔴 حرج | AppContext.tsx:1212 | مطلوب |
| BUG-05 | 🟠 عالٍ | AppContext.tsx:1633 | مطلوب |
| BUG-06 | 🟠 عالٍ | AppContext.tsx:1716 | مطلوب |
| BUG-07 | 🟠 عالٍ | lib/numberInput.ts:9 | مطلوب |
| BUG-08 | 🟠 عالٍ | AppContext.tsx:1154 | مطلوب |
| BUG-09 | 🟡 متوسط | AppContext.tsx:1364 | مقترح |
| BUG-10 | 🟡 متوسط | AppContext.tsx:1198 | يحتاج تحقيق |
| BUG-11 | 🟢 منخفض | lib/auth.ts:20 | اختياري |
