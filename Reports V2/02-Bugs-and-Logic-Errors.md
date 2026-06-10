# 02 — الأخطاء والمشاكل المنطقية (V2)

> **تاريخ:** 2026-06-10 | كل خطأ موثّق بملف + سطر من الكود الفعلي الحالي
> أخطاء V1 المُصلَحة لم تُكرَّر هنا — انظر جدول الحالة في [00-INDEX.md](00-INDEX.md)

| الرمز | المعنى |
|---|---|
| 🔴 حرج | يُفسد بيانات مالية/مخزنية مباشرة — قبل أي إصدار |
| 🟠 عالٍ | يؤثر على دقة البيانات في سيناريوهات واقعية |
| 🟡 متوسط | حالات حافة أو قرار بيزنس ناقص |
| 🟢 منخفض | تحسين/احتياط |

---

## V2-B01 🔴 — حذف فاتورة مدفوعة يُحرّك الخزنة ضعف القيمة (ازدواج قيد العكس)

**الملفات:** [`src/store/AppContext.tsx:1166-1192`](../src/store/AppContext.tsx#L1166) (`deletePurchaseInvoice`) و [`1382-1413`](../src/store/AppContext.tsx#L1382) (`deleteSalesInvoice`)

### الوصف

تنفيذ FIX-07 من خطة V1 طبّق **الأمرين معاً** بينما الصحيح أحدهما فقط:

```typescript
// deleteSalesInvoice — الحالي
if (inv.amountReceived > 0) {
  const reversalEntry: CashEntry = {
    id: uid("cash_del_s"),
    type: "adjustment",
    amount: -inv.amountReceived,          // ① قيد عكسي بالسالب
    ...
  };
  setCashEntries((list) => [reversalEntry, ...list]);
}
...
setCashEntries((list) => list.filter((c) => c.referenceId !== id)); // ② ومسح القيود الأصلية الموجبة أيضاً!
```

### الحساب الفعلي

فاتورة مبيعات مدفوعة 1,000 ج.م — رصيد الخزنة قبل الحذف يتضمن +1,000:

| الخطوة | أثرها على الرصيد |
|---|---|
| ② مسح القيود الأصلية (+1,000) | −1,000 |
| ① القيد العكسي (−1,000) | −1,000 |
| **النتيجة** | **−2,000 بدلاً من −1,000** |

ونفس الازدواج بالعكس في المشتريات: حذف فاتورة شراء مدفوعة 1,000 **يرفع** الخزنة +2,000 بدلاً من +1,000.

**مشكلة إضافية في نفس الموضع:** القيد العكسي للمبيعات يتجاهل `overpayment` — لو الفاتورة عليها رصيد دائن، حتى بعد إصلاح الازدواج سيبقى فرق بقيمة الـ overpayment (القيود الأصلية تتضمنه).

### الإصلاح المقترح (اختيار سياسة واحدة)

**الخيار الموصى به — "الحذف = تراجع كامل" مع أثر تدقيقي:**
- **الإبقاء** على القيد العكسي (لأنه يوثّق العملية في كشف الخزنة) بقيمة `amountReceived + (overpayment ?? 0)` للمبيعات و`amountPaid + (overpayment ?? 0)` للمشتريات.
- **عدم مسح** القيود الأصلية المرتبطة بالفاتورة (إزالة سطر الـ filter على `cashEntries`) — أو على الأقل عدم مسحها مالياً.
- النتيجة: صافي صفر صحيح؟ لا — انتبه: مع بقاء الأصلية (+1,000) والعكسي (−1,000) يصبح صافي أثر الحذف = 0، أي «الفلوس لم تُرَدّ». **القرار البيزنس:** هل حذف فاتورة مدفوعة يعني ردّ الفلوس للعميل؟
  - إن **نعم** (الافتراض الطبيعي): امسح الأصلية فقط **بدون** قيد عكسي، أو أبقِ الأصلية + قيد عكسي **مضاعف التوضيح**؛ الأبسط والأصح محاسبياً: **امسح الأصلية فقط** ودوّن القيمة في سجل التدقيق (موجود فعلاً عبر `logAudit`).
  - إن **لا** (الفلوس تبقى بالخزنة): أبقِ الأصلية بدون قيد عكسي وافصلها عن `referenceId` المحذوف.

**الأبسط للتنفيذ والاختبار:** احذف القيد العكسي نهائياً وأبقِ سطر الـ filter (سلوك V1 الأصلي) + سجّل القيمة في الـ audit log — ثم أضف اختبار integration يثبت أن أثر الحذف على `currentCashBalance()` = −(amountReceived+overpayment) للمبيعات و +(amountPaid+overpayment) للمشتريات بالضبط.

**الجهد:** صغير (حذف 10 أسطر) + اختباران
**الأولوية:** فورية — كل عملية حذف فاتورة مدفوعة تُفسد رصيد الخزنة الآن

---

## V2-B02 🔴 — تعديل فاتورة المبيعات يغيّر المُحصَّل بدون أي قيد خزنة

**الملفات:** [`src/store/AppContext.tsx:1279-1347`](../src/store/AppContext.tsx#L1279) (`updateSalesInvoice`) + [`src/pages/SalesInvoiceEditPage.tsx:45,180-193`](../src/pages/SalesInvoiceEditPage.tsx#L180)

### الوصف

صفحة التعديل تسمح بتغيير `amountReceived` بحرّية (حقل إدخال عادي)، و`updateSalesInvoice` يحدّث الفاتورة والمخزون وحركاته، **لكنه لا يلمس `cashEntries` إطلاقاً**:

```typescript
// updateSalesInvoice — يحدّث الفاتورة فقط
const cappedReceived = Math.min(patch.amountReceived, newTotal);
setSalesInvoices(...); // ← لا يوجد أي setCashEntries هنا
```

### الأثر

- فاتورة أُنشئت بمُحصَّل 0 ثم عُدّلت إلى مُحصَّل 1,000 → الفاتورة "مدفوعة" لكن الخزنة لم تستلم شيئاً.
- والعكس: تخفيض المُحصَّل من 1,000 إلى 0 → الفلوس تبقى في الخزنة بينما الفاتورة "غير مدفوعة" → ازدواج عند التحصيل مرة أخرى عبر `recordSalesReceipt`.
- **النتيجة:** `currentCashBalance()` ينفصل عن واقع الفواتير مع أول تعديل، ولا يمكن تتبّع السبب.

ملاحظة إضافية: الصفحة تمرّر `receivedForInvoice = Math.min(amountReceived, invoiceNet)` فلا يمكن تسجيل overpayment من مسار التعديل أصلاً (تناقض مع مسار الإنشاء).

### الإصلاح المقترح

في `updateSalesInvoice`: احسب فرق المُحصَّل وأنشئ قيد خزنة بالفرق:

```typescript
const prevReceived = inv.amountReceived + (inv.overpayment ?? 0);
const nextReceived = patch.amountReceived; // قبل الـ cap
const delta = nextReceived - prevReceived;
if (delta !== 0) {
  setCashEntries((list) => [{
    id: uid("cash_edit_s"),
    type: delta > 0 ? "sales-receipt" : "adjustment",
    amount: delta,
    description: `تعديل تحصيل فاتورة مبيعات ${inv.invoiceNumber} — ${inv.customerName}`,
    referenceId: id,
    date: new Date().toISOString().slice(0, 10),
  }, ...list]);
}
```

(بديل أكثر تحفظاً: منع تعديل `amountReceived` في صفحة التعديل نهائياً وإجبار المرور بـ "تسجيل دفعة" — قرار بيزنس، الحل أعلاه يحافظ على المرونة الحالية.)

**الجهد:** متوسط (منطق + اختبارات + مراجعة `updatePurchaseInvoice` الذي لا يسمح بتعديل المدفوع أصلاً فهو سليم)
**الأولوية:** فورية

---

## V2-B03 🟠 — الدفعة الزائدة للمورد تضيع من التتبع

**الملف:** [`src/store/AppContext.tsx:1136-1165`](../src/store/AppContext.tsx#L1136) (`recordPurchasePayment`)

### الوصف

```typescript
const paid = Math.min(inv.total, inv.amountPaid + amount); // ← يقصّ عند الإجمالي
// ... لا تسجيل لـ overpayment
const ce: CashEntry = { amount: -amount, ... };            // ← لكن الخزنة تُخصم بالكامل
```

عكس `recordSalesReceipt` الذي يسجّل الفائض في `overpayment`. هنا: لو المتبقي 200 ودفعت 500 → الخزنة −500، الفاتورة "مسددة"، والـ 300 الزائدة **لا أثر لها** في `supplierBalance` (الذي يحسب `remaining - overpayment`).

### الإصلاح

نفس نمط المبيعات:

```typescript
const cappedAmount = Math.min(amount, inv.remaining);
const excess = amount - cappedAmount;
// ... داخل الـ map:
overpayment: excess > 0 ? (inv.overpayment ?? 0) + excess : inv.overpayment,
```

**الجهد:** صغير + اختبار
**الأولوية:** عالية

---

## V2-B04 🟠 — النسخ الاحتياطية ناقصة: `auditLogs` و`nextCustomerCode` غير مشمولين

**المواضع:**
- [`buildBackupData` — AppContext.tsx:1726-1737](../src/store/AppContext.tsx#L1726) (التصدير اليدوي + النسخ لمجلد)
- [`liveStateRef` — AppContext.tsx:498-509](../src/store/AppContext.tsx#L498) (النسخ التلقائي الداخلي)
- [نسخة الجلسة beforeunload — AppContext.tsx:549-564](../src/store/AppContext.tsx#L549)
- [`importBackup` — AppContext.tsx:1788-1839](../src/store/AppContext.tsx#L1788) — لا يستعيد `auditLogs`

### الأثر

1. **سجل التدقيق يضيع نهائياً** عند الاستعادة من أي نسخة — وهو سجل المساءلة الوحيد (مفارقة: حذف فاتورة يُسجَّل في التدقيق، لكن استعادة نسخة تمسح السجل كله بصمت).
2. `nextCustomerCode` غير محفوظ — يوجد fallback يستنتجه من أكواد `CUS-`، لكنه يفشل لو عُدّلت الأكواد يدوياً، والأنظف حفظه.

### الإصلاح

إضافة `nextCustomerCode` و`auditLogs` إلى الكائنات الثلاثة (buildBackupData / liveStateRef / beforeunload) وإلى `importBackup`:

```typescript
if (typeof s.nextCustomerCode === "number") setNextCustomerCode(s.nextCustomerCode); // موجود فعلاً
if (Array.isArray(s.auditLogs)) setAuditLogs(s.auditLogs); // ← المطلوب إضافته
```

**الجهد:** صغير جداً
**الأولوية:** عالية

---

## V2-B05 🟠 — إلغاء فاتورة مدفوعة: فلوس العميل تختفي من كل الحسابات

**الملف:** [`src/store/AppContext.tsx:1349-1381`](../src/store/AppContext.tsx#L1349) (`cancelSalesInvoice`)

### الوصف

الإلغاء يُعيد المخزون ويُعلّم الفاتورة `cancelled: true` فقط. لكن:
- قيود التحصيل تبقى في الخزنة (+amountReceived).
- `customerBalance` و`customerCredit` يستثنيان الفواتير الملغاة كلياً.

**النتيجة:** فلوس عميل دفع 1,000 ثم أُلغيت فاتورته: موجودة في الخزنة، غير ظاهرة كرصيد دائن له، ولا يوجد قيد ردّ — منطقة عمياء محاسبياً.

### الإصلاح (✅ القرار معتمد من المالك 2026-06-10: Dialog يسأل المستخدم)

عند إلغاء فاتورة عليها تحصيل، تظهر رسالة تخيّر المستخدم (نفس نمط المرتجع):
1. **ردّ نقدي:** إنشاء `CashEntry` بسالب `amountReceived + overpayment` ("ردّ نقدية لإلغاء فاتورة...").
2. **تحويل لرصيد دائن:** إبقاء الفلوس وعدّ الفاتورة الملغاة ضمن مصادر `customerCredit` (تعديل الفلتر ليشمل الملغاة ذات `overpayment`/تحصيل، أو نقل المبلغ كـ overpayment لفاتورة أخرى مفتوحة).

**الجهد:** متوسط (UI Dialog + منطق + اختبارات)
**الأولوية:** عالية

---

## V2-B06 🟠 — موظف "عرض فقط" يستطيع تعديل فواتير المبيعات

**الملفات:** [`src/App.tsx:159-166`](../src/App.tsx#L159) + [`src/pages/SalesInvoiceEditPage.tsx`](../src/pages/SalesInvoiceEditPage.tsx)

### الوصف

```tsx
// مسار المشتريات — صحيح:
<ProtectedShell permission="purchaseInvoices" permissionAction="edit">

// مسار المبيعات — ناقص (الافتراضي view):
<Route path="/sales/:id/edit" element={
  <ProtectedShell permission="salesInvoices">   // ← بدون permissionAction="edit"
    <SalesInvoiceEditPage />
```

زرّ التعديل مخفي في صفحة التفاصيل لمن لا يملك الصلاحية، لكن **الوصول المباشر للمسار `/sales/:id/edit` يعمل** لأي موظف يملك `salesInvoices.view`، والصفحة نفسها لا تتحقق داخلياً.

### الإصلاح

إضافة `permissionAction="edit"` للمسار. (سطر واحد.)

**الجهد:** دقيقة واحدة + اختبار component لـ ProtectedShell موجود نمطه
**الأولوية:** عالية (نزاهة الصلاحيات)

---

## V2-B07 🟡 — خطأ ESLint واحد يُفشل الـ CI كاملاً

**الملف:** [`src/pages/EmployeeReportPage.tsx:39`](../src/pages/EmployeeReportPage.tsx#L39)

```typescript
const quarterOptions = useMemo(buildQuarterOptions, []);
// error: Expected the first argument to be an inline function expression (react-hooks/use-memo)
```

**الإصلاح:** `useMemo(() => buildQuarterOptions(), [])`.
كذلك يُستحسن إنهاء التحذيرين المزمنين بلفّ `logAudit` و`updateCurrentUserProfile` في `useCallback` ([AppContext.tsx:399](../src/store/AppContext.tsx#L399) و[750](../src/store/AppContext.tsx#L750)).

**الجهد:** دقائق | **الأولوية:** فورية (CI أحمر)

---

## V2-B08 🟡 — حركة التسوية اليدوية للمخزون: تاريخ بصيغة مختلفة وكمية ناقصة

**الملف:** [`src/store/AppContext.tsx:880-913`](../src/store/AppContext.tsx#L880) (`adjustStock`)

ثلاث مشاكل صغيرة في نفس الموضع:
1. `date: new Date().toISOString()` — **timestamp كامل** بينما كل الحركات الأخرى بصيغة `YYYY-MM-DD`. الفلاتر النصية بالتاريخ (مقارنات `>=`/`<=`) قد تتصرف بشكل غير متسق.
2. `quantity: delta` — لو التسوية بالقطع فقط (`looseDelta` بدون delta) تُسجَّل حركة بكمية **0**.
3. `type` يُحدَّد من `totalDelta` (الكراتين + كسور القطع) لكن الكمية المسجلة لا تعكس القطع.

**الإصلاح:** توحيد التاريخ على `slice(0, 10)`، وتسجيل الكمية الفعلية (مثلاً حقل reason يتضمن تفصيل القطع، أو كمية عشرية `totalDelta`).

**الجهد:** صغير | **الأولوية:** متوسطة

---

## V2-B09 🟡 — `resetDemo` لا يمسح سجل التدقيق

**الملف:** [`src/store/AppContext.tsx:687-705`](../src/store/AppContext.tsx#L687)

كل الحالات تُعاد للبذور إلا `auditLogs` — تبقى قيود تخص بيانات لم تعد موجودة. إضافة `setAuditLogs([])`.

**الجهد:** سطر واحد | **الأولوية:** متوسطة

---

## V2-B10 🟡 — حواف عمولة الموظف (قرارات بيزنس ينبغي توثيقها)

**الملف:** [`src/store/AppContext.tsx:1683-1722`](../src/store/AppContext.tsx#L1683) (`employeeSalesStats`)

المنطق الأساسي صحيح (تحصيل فعلي × ربع سنة). حالتا حافة تحتاجان قراراً صريحاً:
1. **المرتجع بردّ نقدي لا يُخصم من التحصيل** — قيد الردّ نوعه `adjustment` وليس `sales-receipt`، فالموظف يأخذ عمولة على مبلغ رُدَّ للعميل.
2. **إلغاء فاتورة بعد التحصيل** يُسقطها من `empInvoiceIds` → تحصيلاتها تختفي من أرباع سابقة بأثر رجعي (قد يكون مقصوداً).

**التوصية:** خصم قيود الردّ المرتبطة بمرتجعات فواتير الموظف من `totalCollected`، وتثبيت قرار الإلغاء في تعليق + اختبار.

**الجهد:** صغير-متوسط | **الأولوية:** متوسطة

---

## V2-B11 🟡 — استعادة النسخة تكتب فوق إعدادات الترخيص مؤقتاً

**الملف:** [`src/store/AppContext.tsx:1799`](../src/store/AppContext.tsx#L1799)

`importBackup` ينفّذ `setSettings(s.settings)` كما هي — متضمنة حقول الاشتراك/الضمان المُدارة بالترخيص، حتى يصحّحها الـ refresh الدوري (≤ 60 ثانية). الأنظف: `setSettings(applyLicenseSettings(s.settings, licenseStatus))`.

**الجهد:** سطر واحد | **الأولوية:** متوسطة

---

## V2-B12 🟢 — تصدير مبيعات XLSX يتضمن الفواتير الملغاة

**الملف:** [`src/store/AppContext.tsx:1854-1856`](../src/store/AppContext.tsx#L1854)

`exportToExcel("sales")` لا يستثني `cancelled` ولا يعرض المُحصَّل/المتبقي، فمجاميع الشيت تُضخَّم. إضافة فلتر أو عمود "الحالة: ملغاة" + عمودي المُحصَّل والمتبقي.

---

## V2-B13 🟢 — `print:route` بلا فحص جلسة (SEC-06 من V1 — ما زال مفتوحاً)

**الملف:** [`electron/main.cjs:1478`](../electron/main.cjs#L1478)

```javascript
ipcMain.handle("print:route", (_event, route) => printRoute(route));
```
أي كود في الـ renderer يستطيع فتح نافذة طباعة لأي فاتورة دون مصادقة. الإصلاح: `if (!getSession(event)) return { ok:false, error:"not_authenticated" };`

---

## V2-B14 🟢 — نسخة الجلسة المتزامنة عند الإغلاق (ARCH-05 من V1 — ما زال مفتوحاً)

**الملف:** [`AppContext.tsx:549-564`](../src/store/AppContext.tsx#L549)

كتابة كامل الحالة synchronously في `beforeunload` — مع بيانات كبيرة قد يتجمّد الإغلاق. مع وجود debounce 2 ثانية للكتابة العادية + auto-backup، يمكن الاستغناء عنها أو تقليصها لقائمة المفاتيح "المتسخة" فقط.

---

## V2-B15 🟢 — حساب شهور الترخيص بتقريب 30 يوماً

**الملف:** [`AppContext.tsx:209-218`](../src/store/AppContext.tsx#L209) — `monthsBetween` يقسم على 30 يوماً؛ اشتراك 12 شهراً تقويمياً قد يُعرض 12.2→12. عرضي فقط (الترخيص الفعلي يُتحقق منه بالتواريخ في main). تحسين اختياري بـ date-fns `differenceInCalendarMonths`.

---

## V2-B16 🟢 — بقايا `confirm()` الأصلي

- [`UsersPage.tsx:315`](../src/pages/UsersPage.tsx#L315) — حذف مستخدم بـ `confirm("تأكيد الحذف؟")`.
- [`SalesInvoiceNewPage.tsx:209`](../src/pages/SalesInvoiceNewPage.tsx#L209) — تغيير نوع السعر.

باقي التطبيق انتقل لـ Dialogs مخصصة — توحيد هذين الموضعين (F2-3 من V1).

---

## ملخص سريع

| الكود | الخطورة | الموضع | النوع |
|---|:---:|---|---|
| V2-B01 | 🔴 | AppContext 1166 / 1382 | خزنة — ازدواج عكس |
| V2-B02 | 🔴 | AppContext 1279 + EditPage | خزنة — انفصال عن الفواتير |
| V2-B03 | 🟠 | AppContext 1136 | خزنة — فقد رصيد مورد |
| V2-B04 | 🟠 | AppContext 1726/498/549/1788 | نسخ احتياطي ناقص |
| V2-B05 | 🟠 | AppContext 1349 | بيزنس — إلغاء مدفوعة |
| V2-B06 | 🟠 | App.tsx 159 | صلاحيات |
| V2-B07 | 🟡 | EmployeeReportPage 39 | CI/lint |
| V2-B08 | 🟡 | AppContext 880 | حركات مخزون |
| V2-B09 | 🟡 | AppContext 687 | resetDemo |
| V2-B10 | 🟡 | AppContext 1683 | بيزنس — عمولة |
| V2-B11 | 🟡 | AppContext 1799 | استعادة/ترخيص |
| V2-B12 | 🟢 | AppContext 1854 | تصدير |
| V2-B13 | 🟢 | main.cjs 1478 | أمان طباعة |
| V2-B14 | 🟢 | AppContext 549 | أداء إغلاق |
| V2-B15 | 🟢 | AppContext 209 | عرض ترخيص |
| V2-B16 | 🟢 | UsersPage 315 + NewPage 209 | UX |
