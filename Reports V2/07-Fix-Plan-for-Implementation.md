# 07 — خطة الإصلاح التنفيذية (جاهزة للتنفيذ)

> **تاريخ:** 2026-06-10
> هذا الملف دليل تنفيذ خطوة-بخطوة. كل FIX مستقل وقابل للتسليم منفرداً بالترتيب المذكور.
> **مهم للمنفِّذ:** اقرأ قسم "أوامر التحقق" بالأسفل — `vitest` وحده لا يكشف أخطاء الأنواع.

---

## المرحلة 0 — تجهيز (قبل أي تعديل)

1. شغّل الثلاثي للتحقق من خط الأساس (المتوقع: tsc ✅، vitest 435 ✅، eslint ❌ خطأ واحد).
2. **لا تعمل refactor عام** — التعديلات جراحية في المواضع المذكورة فقط.

---

## FIX-V2-01 — إصلاح ESLint وإعادة CI أخضر (15 دقيقة)

**الملف:** `src/pages/EmployeeReportPage.tsx:39`

```typescript
// قبل:
const quarterOptions = useMemo(buildQuarterOptions, []);
// بعد:
const quarterOptions = useMemo(() => buildQuarterOptions(), []);
```

**اختياري ضمن نفس الـ FIX (يزيل التحذيرين المزمنين):**
- لفّ `logAudit` في `useCallback` ([AppContext.tsx:399](../src/store/AppContext.tsx#L399)) — انتبه: تستخدم `currentUserRef` فلا تحتاج deps غير فارغة.
- لفّ `updateCurrentUserProfile` في `useCallback` ([AppContext.tsx:750](../src/store/AppContext.tsx#L750)) بـ deps `[currentUser]`.

**قبول:** `eslint .` بلا أخطاء.

---

## FIX-V2-02 — ازدواج عكس الخزنة عند حذف الفواتير 🔴 (الأهم)

**الملفات:** `src/store/AppContext.tsx` — `deletePurchaseInvoice` (1166-1192) و`deleteSalesInvoice` (1382-1413)

**السياسة المعتمدة:** الحذف = تراجع كامل (كأن الفاتورة لم تحدث). مسح القيود المرتبطة يكفي؛ **القيد العكسي الإضافي هو الخطأ**.

**الخطوات:**
1. في `deletePurchaseInvoice`: احذف بلوك `reversalEntry` بالكامل (الأسطر ~1177-1186). يبقى `setCashEntries(filter)` كما هو. سجل التدقيق موجود فعلاً ويذكر المدفوع.
2. في `deleteSalesInvoice`: احذف بلوك `reversalEntry` (~1398-1407). يبقى الـ filter.
3. **اختبارات جديدة** في `tests/integration/store/` (ملف جديد `invoice-deletion-cash.test.tsx`) باستخدام `renderHook` مع `AppProvider` (انظر `tests/helpers/render.tsx` و`ipc-mock.ts`):
   - إنشاء فاتورة مبيعات كاش 1000 → الرصيد +1000 → حذفها → **الرصيد يعود للصفر بالضبط**.
   - فاتورة مبيعات بمُحصَّل 500 من 1000 + دفعة 200 → حذف → الرصيد يعود للصفر.
   - فاتورة بها overpayment (دفع 1200 لفاتورة 1000) → حذف → الرصيد صفر (يتأكد أن الـ overpayment ضمن القيود الممسوحة).
   - نفس السيناريوهات للمشتريات بالاتجاه المعاكس.
   - حذف فاتورة **ملغاة** مبيعات: المخزون لا يُعاد مرتين (الـ guard موجود — ثبّته باختبار).

**قبول:** الاختبارات الجديدة + الـ 435 القديمة كلها خضراء.

---

## FIX-V2-03 — مزامنة الخزنة عند تعديل المُحصَّل 🔴

**الملفات:** `src/store/AppContext.tsx` — `updateSalesInvoice` (1279-1347)، و`src/pages/SalesInvoiceEditPage.tsx` (180-193)

**الخطوات:**
1. في `updateSalesInvoice`، بعد حساب `cappedReceived/newOverpayment`، أضف قيد فرق:

```typescript
const prevCash = inv.amountReceived + (inv.overpayment ?? 0);
const nextCash = cappedReceived + newOverpayment;
const cashDelta = nextCash - prevCash;
if (cashDelta !== 0) {
  const ce: CashEntry = {
    id: uid("cash_edit_s"),
    type: cashDelta > 0 ? "sales-receipt" : "adjustment",
    amount: cashDelta,
    description: `تعديل تحصيل فاتورة مبيعات ${inv.invoiceNumber} — ${inv.customerName}`,
    referenceId: id,
    date: new Date().toISOString().slice(0, 10),
  };
  setCashEntries((list) => [ce, ...list]);
}
```

2. في `SalesInvoiceEditPage`: المرّر حالياً `receivedForInvoice = Math.min(amountReceived, invoiceNet)` — مرّر `amountReceived` الخام بدلاً منه ليتولى الـ store تسجيل الفائض overpayment (نفس سلوك الإنشاء)، أو أبقِ الـ cap واقبل أن التعديل لا يولّد رصيداً دائناً (قرار — الافتراضي: مرّر الخام).
3. **انتبه للتفاعل مع FIX-V2-02:** قيد التعديل يحمل `referenceId: id` فسيُمسح تلقائياً عند حذف الفاتورة لاحقاً — متسق.
4. **اختبارات** (نفس ملف integration الجديد):
   - فاتورة بمُحصَّل 0 → تعديل لمُحصَّل 400 → الرصيد +400 وقيد جديد نوعه sales-receipt.
   - تخفيض المُحصَّل 400→100 → قيد −300.
   - تعديل لا يغيّر المُحصَّل → لا قيود جديدة.
   - تعديل ثم `recordSalesReceipt` → لا ازدواج.

---

## FIX-V2-04 — رصيد المورد الدائن في `recordPurchasePayment` 🟠

**الملف:** `src/store/AppContext.tsx:1136-1165`

```typescript
// داخل الـ map:
const cappedAmount = Math.min(amount, inv.remaining);
const excess = amount - cappedAmount;
const paid = inv.amountPaid + cappedAmount;
return {
  ...inv,
  amountPaid: paid,
  remaining: Math.max(0, inv.total - paid),
  status: computeStatus(inv.total, paid),
  overpayment: excess > 0 ? (inv.overpayment ?? 0) + excess : inv.overpayment,
};
```

(قيد الخزنة `-amount` الكامل يبقى كما هو — صحيح لأن الكاش خرج فعلاً، والزيادة الآن متتبَّعة كرصيد لدى المورد ويعكسها `supplierBalance` تلقائياً.)

**اختبار:** متبقي 200، دفع 500 → amountPaid=total، overpayment=300، `supplierBalance` يعكس −300، الخزنة −500.

---

## FIX-V2-05 — اكتمال النسخ الاحتياطي 🟠

**الملف:** `src/store/AppContext.tsx`

1. أضف `nextCustomerCode` و`auditLogs` إلى:
   - `liveStateRef` init + الـ effect المُحدِّث (498-509) — وأضفهما لقائمة deps الـ effect.
   - كائن `state` في النسخة التلقائية الداخلية (536) — يأتي تلقائياً من liveStateRef.
   - نسخة الجلسة beforeunload (556-558) + قائمة deps (564).
   - `buildBackupData` (1733-1735) + قائمة deps الـ useCallback (1737).
2. في `importBackup` أضف: `if (Array.isArray(s.auditLogs)) setAuditLogs(s.auditLogs);`
3. (V2-B11 معه) غيّر سطر 1799 إلى `setSettings(applyLicenseSettings(s.settings, licenseStatus));` وأضف `licenseStatus` لـ deps الـ useCallback.
4. **اختبار:** يوجد نمط جاهز في `tests/integration/ipc/backup-security.test.ts` — أضف حالة: تصدير ثم استيراد يحافظ على auditLogs وnextCustomerCode.

---

## FIX-V2-06 — صلاحية مسار تعديل المبيعات 🟠

**الملف:** `src/App.tsx:159-166`

```tsx
<ProtectedShell permission="salesInvoices" permissionAction="edit">
```

**اختبار:** `tests/component/ProtectedShell.test.tsx` فيه النمط — أضف حالة لمستخدم بـ view بدون edit يُعاد توجيهه.

---

## FIX-V2-07 — سياسة إلغاء الفاتورة المدفوعة 🟠 (✅ القرار معتمد من المالك — 2026-06-10)

**القرار المعتمد:** عند إلغاء فاتورة عليها تحصيل، **تظهر رسالة (Dialog) تسأل المستخدم: "هل تريد إرجاع الفلوس للعميل نقداً أم تحويلها رصيداً دائناً؟"** — وعلى أساس اختياره يُنفَّذ الإجراء. (الخيار ب — لا حاجة لانتظار أي اعتماد إضافي.)

**التنفيذ:**
1. `cancelSalesInvoice(id, refundMode: "cash" | "credit")` في الـ store.
2. عند `"cash"`: قيد `adjustment` بسالب `amountReceived + overpayment` بوصف "ردّ نقدية لإلغاء فاتورة ...".
3. عند `"credit"`: صفّر `amountReceived` وانقل المجموع إلى `overpayment` على الفاتورة الملغاة، وعدّل `customerCredit` ليشمل الفواتير الملغاة ذات overpayment (وعدّل `settleAllDues` ليستهلكها كمصدر).
4. Dialog في `SalesInvoiceDetailPage` (canCancelSales موجود) يظهر **فقط إذا كان هناك تحصيل** (`amountReceived + (overpayment ?? 0) > 0`) بخيارين واضحين:
   - **"إرجاع نقدي"** → `refundMode: "cash"` — يُكتب وصف القيد: "ردّ نقدية لإلغاء فاتورة {رقم} — {العميل}".
   - **"تحويل لرصيد دائن"** → `refundMode: "credit"` — يظهر بعدها الرصيد في صفحة المستحقات/التنبيهات كالمعتاد.
   - إذا لم يكن هناك تحصيل: يكفي تأكيد الإلغاء الحالي بدون الخيارين.
5. سجّل الاختيار في سجل التدقيق ضمن `details` لقيد `invoice_sale_cancelled` (مثلاً: "ردّ نقدي 1000" أو "تحويل رصيد دائن 1000").
6. اختبارات للسيناريوهين + إلغاء فاتورة غير مدفوعة (لا يتغير شيء في الخزنة).

---

## المرحلة الثالثة — المتوسطة (تُنفَّذ دفعة واحدة بعد ما سبق)

| FIX | الموضع | التغيير |
|---|---|---|
| V2-B08 | `adjustStock` (880-913) | `date: ...slice(0,10)` + تمثيل looseDelta في الحركة |
| V2-B09 | `resetDemo` (687-705) | `setAuditLogs([])` |
| V2-B10 | `employeeSalesStats` (1683) | خصم قيود ردّ المرتجعات المرتبطة بفواتير الموظف من `totalCollected` + تعليق يوثّق قرار الإلغاء + اختبارات |
| V2-B12 | `exportToExcel` (1854) | استثناء `cancelled` أو عمود حالة + عمودا المُحصَّل/المتبقي |
| V2-B13 | `main.cjs:1478` | فحص `getSession(event)` في معالجات `print:*` |
| V2-B16 | `UsersPage:315` | Dialog مخصص بدل `confirm()` |

---

## أوامر التحقق (إلزامية بعد كل FIX)

من داخل `helpers-warehouse-system/` (ملاحظة: `vitest` **لا** يفحص الأنواع، و`npx tsc` يلتقط حزمة خاطئة):

```powershell
node_modules/.bin/tsc.cmd -b tsconfig.json --force   # الأنواع — يجب أن يخرج صامتاً
node_modules/.bin/eslint.cmd .                        # يجب 0 أخطاء (شغّلها من مجلد المشروع)
node_modules/.bin/vitest.cmd run                      # كل الاختبارات (435+ الجديدة)
```

عتبة تغطية 80% مفروضة على `src/lib/**` و`src/store/_pure.ts` — أي ملف جديد هناك يحتاج اختبارات حقيقية.

---

## ترتيب التنفيذ والتقدير

```
اليوم 1:   FIX-V2-01 (lint) → FIX-V2-06 (سطر الصلاحية) → FIX-V2-02 (الحذف + اختباراته)
اليوم 2:   FIX-V2-03 (تعديل المُحصَّل + اختباراته) → FIX-V2-04 (رصيد المورد)
اليوم 3:   FIX-V2-05 (النسخ الاحتياطي) → commit شامل → CI أخضر
اليوم 4-5: FIX-V2-07 (سياسة الإلغاء — معتمدة: Dialog كاش/رصيد) + المرحلة الثالثة
```

## قائمة المراجعة قبل الإصدار 1.0.3

- [ ] FIX-V2-01..06 منفّذة والاختبارات الجديدة خضراء
- [ ] سياسة الإلغاء منفّذة (FIX-V2-07 — ✅ معتمدة: Dialog يسأل كاش/رصيد دائن)
- [ ] الثلاثي (tsc/eslint/vitest) نظيف محلياً + CI أخضر
- [ ] commit لكل الشغل (يوجد حالياً حجم كبير غير مُكوميت!)
- [ ] تجربة يدوية: إنشاء→تعديل→دفعة→مرتجع→حذف فاتورة مع مراقبة رصيد الخزنة في كل خطوة
- [ ] نسخة احتياطية + استعادة كاملة على بيانات حقيقية (يتضمن auditLogs)
- [ ] رفع رقم الإصدار وبناء `dist:win` وتجربة المثبّت على جهاز نظيف

---

*انتهت خطة V2 — Helpers Technologies | 2026-06-10*
