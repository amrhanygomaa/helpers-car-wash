# 07 — خطة الإصلاحات والتوصيات

> **تاريخ التقرير:** 2026-06-09
> هذا الملف هو **دليل تنفيذ** — كل بند يحتوي على الملف والسطر والكود الدقيق المطلوب.

---

## المرحلة الأولى — إصلاحات فورية (قبل أي إصدار جديد)

### FIX-01 — إصلاح تجميع أسطر المنتج المكرر (BUG-01)

**الأثر إذا لم يُصلَح:** أرقام مخزون خاطئة عند وجود نفس المنتج في سطرين بنفس الفاتورة

**الملفات:**
- [`src/store/AppContext.tsx`](../src/store/AppContext.tsx) — يُطبَّق في: `addPurchaseInvoice`, `addSalesInvoice`, `updatePurchaseInvoice`, `updateSalesInvoice`, `cancelSalesInvoice`, `deletePurchaseInvoice`, `deleteSalesInvoice`

**النمط المطلوب في كل موضع:**

```typescript
// ❌ الكود الحالي (مثال من addPurchaseInvoice — سطر 1010)
const line = inv.lines.find((l) => l.productId === p.id);
if (!line) return p;
const patch = { quantity: p.quantity + line.quantity };

// ✅ الإصلاح — تجميع كل الكميات للمنتج
const totalQty = inv.lines
  .filter((l) => l.productId === p.id)
  .reduce((sum, l) => sum + l.quantity, 0);
if (totalQty === 0) return p;
const patch = { quantity: p.quantity + totalQty };
```

**ملاحظة:** نفس النمط يُطبَّق في جميع المواضع التي تستخدم `.find(l => l.productId === p.id)` لتحديث المخزون.

**الاختبار:** يُضاف اختبار في `tests/integration/` يُنشئ فاتورة بنفس المنتج في سطرين ويتحقق من الكمية.

---

### FIX-02 — إصلاح حركة المخزون عند إلغاء الفاتورة (BUG-03)

**الملف:** [`src/store/AppContext.tsx:1327-1338`](../src/store/AppContext.tsx#L1327)

```typescript
// ❌ الكود الحالي — حركة واحدة لأول منتج بمجموع الكميات
const mv: StockMovement = {
  id: uid("mov_ret"),
  productId: inv.lines[0]?.productId ?? "",
  quantity: inv.lines.reduce((a, b) => a + b.quantity, 0),
  ...
};
setStockMovements((list) => [mv, ...list]);

// ✅ الإصلاح — حركة منفصلة لكل منتج
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

---

### FIX-03 — إصلاح `nextCustomerCode` في استعادة النسخة الاحتياطية (BUG-05)

**الملف:** [`src/store/AppContext.tsx`](../src/store/AppContext.tsx) — داخل `importBackup` بعد سطر ~1638

```typescript
// أضف هذا الكود بعد معالجة nextSupplierCode
if (typeof s.nextCustomerCode === "number") {
  setNextCustomerCode(s.nextCustomerCode);
} else if (Array.isArray(s.customers) && s.customers.length > 0) {
  const maxCode = (s.customers as { code?: string }[]).reduce((max, c) => {
    const match = /^CUS-(\d+)$/i.exec((c.code ?? "").trim());
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  setNextCustomerCode(maxCode + 1);
}
```

---

### FIX-04 — إصلاح تصدير CSV (BUG-06)

**الملف:** [`src/store/AppContext.tsx:1655-1724`](../src/store/AppContext.tsx#L1655) — داخل `exportToCSV`

```typescript
// أضف هذه الدالة قبل exportToCSV أو داخله
function escapeCsvField(value: string | number | undefined): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ثم عدّل السطر 1716 من:
const csvContent = "﻿" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
// إلى:
const csvContent = "﻿" + [headers.join(","), ...rows.map(r => r.map(escapeCsvField).join(","))].join("\n");
```

---

### FIX-05 — إصلاح `parseNumericInput` والفاصلة (BUG-07)

**الملف:** [`src/lib/numberInput.ts:9`](../src/lib/numberInput.ts#L9)

```typescript
// ❌ الحالي — يحوّل الفاصلة لنقطة (1,500 → 1.5)
.replace(/,/g, ".")

// ✅ الإصلاح — أزل فاصل الآلاف فقط (1,500 → 1500)
.replace(/(\d),(\d{3})(?!\d)/g, "$1$2")  // أزل فاصل الآلاف
// إذا أراد المستخدم الفاصلة العشرية، يجب أن يكتب نقطة
```

> **ملاحظة:** بديلاً لذلك يمكن إزالة الفاصلة تماماً: `.replace(/,/g, "")` — الأبسط والأأمن إذا لم يكن الاستخدام العشري متوقعاً.

---

### FIX-06 — إصلاح عمولة الموظف (BUG-02)

**الملف:** [`src/store/AppContext.tsx:1558-1588`](../src/store/AppContext.tsx#L1558)

**الخطوات:**

**أ) تحديث `AppActions` interface (سطر ~193)**

```typescript
// من:
employeeSalesStats: (userId: ID, month: string) => {
  totalSales: number;
  target: number;
  remaining: number;
  achieved: boolean;
  commissionEarned: number;
  salary: number;
  totalEarnings: number;
};

// إلى:
employeeSalesStats: (userId: ID, quarter: string) => {
  totalCollected: number;
  commissionEarned: number;
  salary: number;
  totalEarnings: number;
  quarterLabel: string;
};
```

**ب) إعادة كتابة `employeeSalesStats` (سطر ~1558)**

```typescript
const employeeSalesStats: AppActions["employeeSalesStats"] = useCallback(
  (userId, quarter) => {
    const employee = users.find((u) => u.id === userId);
    const [yearStr, qStr] = quarter.split("-Q");
    const year = parseInt(yearStr, 10);
    const q = parseInt(qStr, 10);
    const quarterStart = new Date(year, (q - 1) * 3, 1).toISOString().slice(0, 10);
    const quarterEnd = new Date(year, q * 3, 0).toISOString().slice(0, 10);

    const empInvoiceIds = new Set(
      salesInvoices
        .filter((inv) => inv.createdByUserId === userId && !inv.cancelled)
        .map((inv) => inv.id)
    );

    const totalCollected = cashEntries
      .filter(
        (ce) =>
          ce.type === "sales-receipt" &&
          ce.referenceId &&
          empInvoiceIds.has(ce.referenceId) &&
          ce.date >= quarterStart &&
          ce.date <= quarterEnd
      )
      .reduce((sum, ce) => sum + ce.amount, 0);

    const commissionPct = employee?.salesCommissionPct ?? 0;
    const commissionEarned = (totalCollected * commissionPct) / 100;
    const salary = employee?.monthlySalary ?? 0;

    return {
      totalCollected,
      commissionEarned,
      salary,
      totalEarnings: salary + commissionEarned,
      quarterLabel: `Q${q} ${year}`,
    };
  },
  [users, salesInvoices, cashEntries]  // ← cashEntries مُضاف للـ deps
);
```

**ج) تحديث `EmployeeReportPage.tsx`**

```typescript
// من:
const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
const stats = employeeSalesStats(employee.id, month);

// إلى:
const [quarter, setQuarter] = useState(() => {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${q}`;
});
const stats = employeeSalesStats(employee.id, quarter);
```

**تحديث JSX:** استبدال `stats.totalSales` → `stats.totalCollected` و`stats.target/remaining/achieved` → إزالتها أو عرضها من مصدر آخر.

---

## المرحلة الثانية — إصلاحات عالية الأولوية

### FIX-07 — إصلاح حذف الفاتورة المدفوعة (BUG-08)

**الملف:** [`src/store/AppContext.tsx:1141`](../src/store/AppContext.tsx#L1141)

```typescript
// في deletePurchaseInvoice — قبل سطر filter cashEntries
if (inv.amountPaid > 0) {
  const correctionEntry: CashEntry = {
    id: uid("cash_del_p"),
    type: "adjustment",
    amount: inv.amountPaid,  // عكسي — يُعيد المبلغ للخزنة
    description: `تصحيح: حذف فاتورة مشتريات ${inv.invoiceNumber} — ${inv.supplierName}`,
    referenceId: id,
    date: new Date().toISOString().slice(0, 10),
  };
  setCashEntries((list) => [correctionEntry, ...list]);
}
// ثم أبقِ مسح قيود الفاتورة الأصلية
setCashEntries((list) => list.filter((c) => c.referenceId !== id));
```

نفس المنطق لـ `deleteSalesInvoice` مع `inv.amountReceived`.

---

### FIX-08 — إصلاح ترقيم المرتجعات (BUG-09)

**الملف:** [`src/store/AppContext.tsx:1364`](../src/store/AppContext.tsx#L1364) و `1432`

```typescript
// salesReturn
const salesNums = salesReturns
  .map(r => parseInt(r.returnNumber.replace(/\D/g, ""), 10))
  .filter(n => !isNaN(n));
const nextSR = salesNums.length ? Math.max(...salesNums) + 1 : 1;
const num = `SR-${nextSR.toString().padStart(4, "0")}`;

// purchaseReturn
const purchaseNums = purchaseReturns
  .map(r => parseInt(r.returnNumber.replace(/\D/g, ""), 10))
  .filter(n => !isNaN(n));
const nextPR = purchaseNums.length ? Math.max(...purchaseNums) + 1 : 1;
const num = `PR-${nextPR.toString().padStart(4, "0")}`;
```

---

## التوصيات العامة

### T-01 — اختبارات وحدوية للمنطق المُصلَح

بعد تطبيق كل FIX، يجب إضافة اختبارات في:
- `tests/unit/store/` — للمنطق الحسابي
- `tests/integration/` — للتدفقات الكاملة

**الأولوية الاختبارية:**
1. FIX-01 — أسطر مكررة في الفاتورة
2. FIX-06 — عمولة الموظف (ربع سنوي vs شهري)
3. FIX-03 — nextCustomerCode بعد الاستعادة

### T-02 — فحص التوافق بعد FIX-05 (parseNumericInput)

FIX-05 قد يؤثر على كل حقل رقمي في التطبيق. بعد التطبيق:
1. اختبر إدخال أسعار بأرقام كبيرة (مثل `10,500`)
2. اختبر إدخال كميات عشرية (مثل `1.5`)
3. اختبر الأرقام العربية (مثل `١٫٥`)
4. تأكد من سلوك حقل الخصم والمبلغ المستلم

### T-03 — مراجعة ميدانية بعد FIX-06 (عمولة)

تغيير حساب العمولة من شهري إلى ربعي قد يُقلّل/يُغيّر الأرقام الموجودة. يُنصح بـ:
1. إشعار المستخدمين قبل التحديث
2. مقارنة الأرقام القديمة والجديدة لشهر واحد سابق كـ sanity check

---

## ترتيب التنفيذ المقترح

```
الأسبوع الأول:
  └── FIX-03 (nextCustomerCode) ← 30 دقيقة
  └── FIX-04 (CSV Escaping)     ← 30 دقيقة
  └── FIX-05 (parseNumericInput) ← 1 ساعة + اختبار
  └── FIX-02 (حركة إلغاء)       ← 1 ساعة

الأسبوع الثاني:
  └── FIX-01 (أسطر مكررة)       ← نصف يوم + اختبارات
  └── FIX-07 (حذف مع دفعات)     ← نصف يوم
  └── FIX-08 (ترقيم مرتجعات)    ← 1 ساعة

الأسبوع الثالث:
  └── FIX-06 (عمولة ربعية)      ← يوم كامل + اختبارات + UI
  └── مراجعة ميدانية للعمولة
```

---

## قائمة مراجعة قبل الإصدار التالي (Release Checklist)

- [ ] FIX-01: أسطر مكررة في الفاتورة مُصلَحة
- [ ] FIX-02: حركة مخزون الإلغاء مُصلَحة
- [ ] FIX-03: `nextCustomerCode` في استعادة النسخة مُصلَح
- [ ] FIX-04: CSV escaping مُطبَّق
- [ ] FIX-05: `parseNumericInput` مُصلَح ومُختبَر
- [ ] FIX-06: عمولة الموظف ربعية ومبنية على التحصيل
- [ ] FIX-07: حذف الفاتورة المدفوعة ينشئ قيد تصحيح
- [ ] FIX-08: ترقيم المرتجعات بـ max + 1
- [ ] اختبارات وحدوية جديدة تغطي FIX-01، FIX-06، FIX-03
- [ ] `npm run test` يمر بنجاح
- [ ] `npm run build` يمر بنجاح
- [ ] مراجعة ميدانية على بيانات حقيقية قبل التوزيع

---

## ملاحظة ختامية

التطبيق مبني بجودة هندسية جيدة ويُطبّق ممارسات أمنية سليمة. الأخطاء المكتشفة تتركّز في **منطق العمل** (Business Logic) وليس في البنية أو الأمان. الإصلاحات الفورية (المرحلة الأولى) يجب أن تكون الأولوية القصوى لأنها تمسّ صحة البيانات المالية والمخزون مباشرة.

---

*انتهى التقرير — Helpers Technologies | 2026-06-09*
