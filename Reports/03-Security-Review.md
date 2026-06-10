# 03 — المراجعة الأمنية

> **تاريخ التقرير:** 2026-06-09 | فحص شامل لـ `electron/main.cjs`, `preload.cjs`, `storage-security.cjs`, `rate-limit.cjs`, `lib/auth.ts`

---

## ملخص الحكم الأمني

> **الحكم العام: 🟢 جيد مع ملاحظات**

المشروع يُطبّق ممارسات أمنية صحيحة في معظم الطبقات. الثغرات المُكتشفة إما **قيود تصميمية مقصودة** (مفتاح التشفير المرتبط بالجهاز)، أو **مسارات غير مُستخدمة في الإنتاج** (auth fallback)، أو **تحسينات اختيارية** لرفع مستوى التدقيق.

---

## نقاط القوة الأمنية ✅

### 1. تشفير قاعدة البيانات

- SQLCipher عبر `better-sqlite3-multiple-ciphers` — مُدرج في `asarUnpack` للعمل كـ native module
- مفتاح التشفير مشتق من بصمة الجهاز + ثابت التطبيق: `sha256("helpers-inventory-system-v1-local-license:db:<machineId>")`
- **النتيجة:** نسخ القاعدة لجهاز آخر لا تعمل بدون معرفة الثابت + بصمة الجهاز الأصلية

### 2. تشفير كلمات المرور

```javascript
// electron/main.cjs:438-444 — argon2id بمعاملات قوية
argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MB
  timeCost: 3,
  parallelism: 4,
})
```

- Argon2id مع 64MB ذاكرة و3 تكرارات — صعب للجداول الراينبو
- ترقية تلقائية للهاشات القديمة (base64) إلى argon2id عند أول دخول ناجح
- **لا تُخزَّن كلمات المرور نصاً أبداً**

### 3. عزل العملية (Process Isolation)

```javascript
// electron/main.cjs:630-637 — إعدادات BrowserWindow
webPreferences: {
  preload: path.join(__dirname, "preload.cjs"),
  contextIsolation: true,   // ✅
  nodeIntegration: false,   // ✅
  sandbox: true,            // ✅
  devTools: isDev,          // ✅ محجوب في الإنتاج
  webSecurity: true,        // ✅
  allowRunningInsecureContent: false, // ✅
}
```

### 4. جسر IPC المحدود (Preload)

- `contextBridge.exposeInMainWorld` فقط — لا `require()` مكشوف للـ renderer
- **مفاتيح التخزين مُصفَّاة:** `isRendererStorageKey()` تمنع الوصول للمفاتيح الداخلية
- **هاشات كلمات المرور مُخفاة:** `storageValueForRenderer()` تُعيد `[REDACTED]` للـ renderer
- التخزين المتزامن (`sendSync`) مقيَّد بالمفاتيح المسموح بها فقط

### 5. التحقق من التوقيع الرقمي للترخيص

```javascript
// electron/main.cjs:361-373 — Ed25519 + base64url
const verified = crypto.verify(
  null,  // Ed25519 لا يحتاج algorithm منفصل
  Buffer.from(canonicalStringify(unsignedPayload)),
  getPublicKey(),
  Buffer.from(signature, "base64url")
);
```

- توقيع Ed25519 — مقاوم للتزوير
- `canonicalStringify()` لضمان ثبات الـ payload قبل التحقق
- ربط الترخيص بـ `machine hash` — لا ينقل من جهاز لآخر

### 6. حماية Brute-Force

| النوع | الحد | مدة القفل | الملف |
|---|---|---|---|
| تسجيل الدخول | 5 محاولات | 60 ثانية | `rate-limit.cjs` |
| كود الدعم الفني | 5 محاولات | 10 دقائق | `rate-limit.cjs` |

- مطبّق في طبقة Electron الرئيسية (لا يُتحايَل عليه من الـ renderer)
- `constant-time-ish` للمصادقة: يُشغَّل `verifyPassword` دائماً لمنع timing attacks

```javascript
// electron/main.cjs:500-501 — أمان التوقيت
const dummyHash = "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$dummyhashvalue";
const ok = await verifyPassword(user?.passwordHash || dummyHash, password);
```

### 7. Electron Fuses (في الإنتاج)

```json
"electronFuses": {
  "runAsNode": false,                           // ✅ يمنع --inspect
  "enableCookieEncryption": true,               // ✅
  "enableNodeOptionsEnvironmentVariable": false, // ✅
  "enableNodeCliInspectArguments": false,       // ✅
  "enableEmbeddedAsarIntegrityValidation": true, // ✅ التحقق من سلامة ASAR
  "onlyLoadAppFromAsar": true                   // ✅ يمنع تحميل كود خارجي
}
```

### 8. Content Security Policy

```javascript
// electron/main.cjs:1512 — CSP في الإنتاج
"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' ...; 
 img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';"
```

---

## الثغرات والملاحظات الأمنية

### SEC-01 🟡 — مفتاح تشفير قاعدة البيانات قابل للاشتقاق

**الملف:** [`electron/main.cjs:233-235`](../electron/main.cjs#L233)

```javascript
function getDbKey() {
  return sha256(`${APP_SALT}:db:${getMachineMaterial()}`);
}
// APP_SALT = "helpers-inventory-system-v1-local-license" ← ثابت في الكود
```

**الأثر:**
- من يملك: (1) ملفات التطبيق المفككة + (2) نفس الجهاز → يمكنه اشتقاق المفتاح
- الحماية: ضد **نقل قاعدة البيانات لجهاز مختلف** فقط
- لا حماية إضافية من **المستخدم نفسه** على **نفس الجهاز**

**التقييم:** هذا **قيد تصميمي مقصود** لتطبيق أوف-لاين بمستخدم واحد. مستوى الحماية مناسب للسيناريو المستهدف. الخطر الفعلي محدود.

**التوصية (اختيارية):** يمكن تعزيز الأمان بدمج رمز مشتق من كلمة مرور المالك عند التهيئة الأولى — لكن هذا يجعل نسيان كلمة المرور يُفقد البيانات نهائياً، وهو مقايضة تصميمية.

---

### SEC-02 🟡 — Fallback كلمة المرور يستخدم base64 بدون Salt

**الملف:** [`src/lib/auth.ts:20-22`](../src/lib/auth.ts#L20)

```typescript
// auth.ts — الـ fallback الأقدم
return storedHash === btoa(password); // base64 = تشفير قابل للعكس الفوري
```

**الأثر:**
- `btoa()` يحوّل النص لـ base64 — ليس hashing — يُعكَس بـ `atob()` فوراً
- **لا أثر في الإنتاج المحزوم** (argon2 عبر IPC هو الطريق الوحيد)
- خطر فقط إذا نُشر التطبيق كويب (غير مخطط له حالياً)

**التوصية:** استبدال `btoa(password)` بـ `sha256(password)` على الأقل (دالة `hashPassword` متاحة) حتى في هذا المسار الاحتياطي.

---

### SEC-03 🟡 — لا يوجد سجل تدقيق (Audit Log)

**التأثير على:** جميع العمليات الحساسة (حذف فواتير، تعديل أسعار، تغيير صلاحيات، حذف مستخدمين)

**الوصف:**
لا يوجد تسجيل منهجي لـ:
- من حذف فاتورة / منتج / مستخدم
- من عدّل سعر منتج
- من أجرى تسوية مخزون
- من غيّر صلاحيات موظف

**الأثر:** في حالة خلافات أو أخطاء مالية، لا توجد مسارات تدقيق للتحقيق.

**التوصية:** إضافة جدول `audit_log` في قاعدة البيانات (أو مصفوفة في الـ store) يُسجَّل فيه: المستخدم، العملية، الكيان، الوقت، القيمة القديمة/الجديدة.

---

### SEC-04 🟢 — حجب DevTools بـ keyboard shortcuts قابل للتجاوز

**الملف:** [`electron/main.cjs:673-689`](../electron/main.cjs#L673)

```javascript
win.webContents.on("before-input-event", (event, input) => {
  if (input.key === "F12" || (input.control && input.shift && ["I","J","C"].includes(key))) {
    event.preventDefault();
  }
});
win.webContents.on("devtools-opened", () => {
  win.webContents.closeDevTools();
});
```

**الأثر:** حجب الاختصارات يمنع المستخدم العادي، لكن المطوّر يمكنه فتح DevTools بطرق أخرى (من خارج التطبيق، من خلال remote debugging...).

**التقييم:** الحماية الحقيقية هي من **Electron Fuses** (`runAsNode: false`, `enableNodeCliInspectArguments: false`) وليس من حجب الاختصارات. الكود الحالي هو "حماية جمالية إضافية" فقط.

**التوصية:** تحسين (اختياري) — استخدام `app.commandLine.appendSwitch("remote-debugging-port", "0")` لتعطيل remote debugging كلياً في الإنتاج.

---

### SEC-05 🟢 — CSP في وضع التطوير يسمح بـ `unsafe-eval`

**الملف:** [`electron/main.cjs:1511`](../electron/main.cjs#L1511)

```javascript
const cspDirectives = isDev
  ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; ..."  // ← unsafe-eval في التطوير
  : "default-src 'self'; script-src 'self'; ..."; // ← صارم في الإنتاج
```

**التقييم:** هذا متوقع ومقبول — Vite HMR يحتاج `unsafe-eval` في التطوير. CSP الإنتاج صارم ومناسب. لا أثر أمني في الإنتاج.

---

### SEC-06 🟢 — مسار بيانات الطباعة لا يُحقق من الجلسة

**الملف:** [`electron/main.cjs:1442`](../electron/main.cjs#L1442)

```javascript
ipcMain.handle("print:route", (_event, route) => printRoute(route));
// ← لا يتحقق من وجود جلسة مصادق عليها
```

**الأثر:** أي كود renderer يمكنه طلب طباعة أي فاتورة دون التحقق من صلاحية الجلسة.

**السياق:** نافذة الطباعة تقرأ البيانات من قاعدة البيانات مباشرة (تُصفَّى عبر `normalizePrintRoute` لمنع path traversal). التحقق من الجلسة هنا سيضيف طبقة حماية إضافية.

**التوصية:**
```javascript
ipcMain.handle("print:route", (event, route) => {
  if (!getSession(event)) return { ok: false, error: "not_authenticated" };
  return printRoute(route);
});
```

---

## مصفوفة الأمان الشاملة

| الطبقة | الحالة | التفاصيل |
|---|---|---|
| تشفير قاعدة البيانات | ✅ ممتاز | SQLCipher, مفتاح مشتق من الجهاز |
| تشفير كلمات المرور | ✅ ممتاز | Argon2id, معاملات قوية, ترقية تلقائية |
| عزل العملية | ✅ ممتاز | contextIsolation + sandbox + no nodeIntegration |
| جسر IPC | ✅ جيد جداً | مفاتيح مُصفَّاة + هاشات مُخفاة |
| التوقيع الرقمي | ✅ ممتاز | Ed25519 + canonical JSON |
| Brute-Force Protection | ✅ ممتاز | Rate limiting في طبقة Node.js |
| CSP | ✅ جيد | صارم في الإنتاج |
| Electron Fuses | ✅ جيد | 6 fuses مُفعَّلة |
| مفتاح التشفير | 🟡 مقبول | قيد تصميمي — مناسب للسيناريو |
| Auth Fallback | 🟡 تحسين مطلوب | btoa → sha256 |
| سجل التدقيق | 🟠 غائب | لا audit log |
| حماية الطباعة | 🟢 تحسين اختياري | إضافة فحص الجلسة |
