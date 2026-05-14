<p align="center">
  <img src="build/icon.ico" width="80" alt="Helpers Warehouse System" />
</p>

<h1 align="center">Helpers Warehouse System</h1>

<p align="center">
  <strong>نظام متكامل لإدارة المخزون والمبيعات — تطبيق سطح مكتب مؤمّن ومشفّر</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows-blue?logo=windows" alt="Platform" />
  <img src="https://img.shields.io/badge/Electron-37-47848F?logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-Proprietary-red" alt="License" />
</p>

---

## 📋 نظرة عامة

**Helpers Warehouse System** هو تطبيق Desktop احترافي لإدارة المخزون والمبيعات، مصمم للشركات الصغيرة والمتوسطة. يعمل بدون إنترنت مع تشفير كامل للبيانات وترخيص مربوط بالجهاز.

### ✨ المميزات الرئيسية

| الميزة | الوصف |
|--------|-------|
| 📦 **إدارة المنتجات** | إضافة وتعديل المنتجات مع تتبع الكميات وتواريخ الصلاحية |
| 🧾 **فواتير الشراء والبيع** | إنشاء فواتير احترافية مع طباعة A4 وحفظ PDF |
| 👥 **العملاء والموردين** | إدارة بيانات العملاء والموردين مع تتبع الأرصدة |
| 💰 **الخزينة** | تتبع التدفقات النقدية والدفعات |
| 📊 **التقارير** | تقارير المبيعات والمشتريات والمخزون وتصدير CSV |
| 🔄 **المرتجعات** | مرتجعات مبيعات ومشتريات مع تحديث المخزون تلقائياً |
| 🚚 **السائقين** | إدارة السائقين وربطهم بفواتير المبيعات |
| 🏆 **بونص الموردين** | نظام عمولات متدرج للموردين |
| 🔔 **التنبيهات** | تنبيهات نقص المخزون وقرب انتهاء الصلاحية |
| 👤 **صلاحيات المستخدمين** | نظام أدوار (مدير / موظف) مع صلاحيات مخصصة |
| 💾 **النسخ الاحتياطي** | نسخ احتياطي يدوي وتلقائي مع استعادة |

---

## 🔒 الأمان والحماية

| الطبقة | التقنية |
|--------|---------|
| **تشفير قاعدة البيانات** | SQLCipher (AES-256) مربوط بمعرّف الجهاز |
| **تشفير كلمات المرور** | Argon2id (65MB memory, 3 iterations) |
| **نظام الترخيص** | Ed25519 Digital Signatures — مربوط بالجهاز |
| **حماية وقت التشغيل** | Content Security Policy, Sandbox, Context Isolation |
| **مقاومة الهندسة العكسية** | Terser minification, ASAR archive, no source maps |
| **حماية DevTools** | محظور في الإنتاج مع إغلاق تلقائي |
| **حماية Brute-force** | Rate-limiting (5 محاولات / قفل 60 ثانية) |

---

## 🛠️ Technology Stack

```
Frontend:    React 19 + TypeScript 6 + Tailwind CSS 3
Desktop:     Electron 37
Database:    better-sqlite3 + SQLCipher (encrypted)
Auth:        Argon2id hashing
License:     Ed25519 asymmetric signatures
Build:       Vite 8 + electron-builder
```

---

## 🚀 التشغيل والتطوير

### المتطلبات
- **Node.js** >= 20.x
- **npm** >= 10.x
- **Windows** 10/11 (64-bit)

### التثبيت والتشغيل

```bash
# تثبيت الحزم
npm install

# تشغيل وضع التطوير (Electron + Vite)
npm run electron:dev
```

### بناء نسخة الإنتاج

```bash
# بناء ملف التثبيت (Windows NSIS Installer)
npm run dist:win
```

ملف التثبيت يُنتج في:
```
release/Helpers Warehouse System-1.0.0-Setup.exe
```

---

## 🔑 نظام الترخيص

### إنشاء مفاتيح المطور (مرة واحدة)

```bash
npm run license:init
```

> ⚠️ أدوات إصدار التراخيص موجودة خارج تطبيق العميل في `../helpers_sys_activate`، والمفتاح الخاص يُحفظ هناك في `.license/private-key.pem` — **لا يُرفع على Git ولا يُشحن مع البرنامج.**

### إصدار سيريال لعميل

```bash
# واجهة رسومية محلية لإصدار التراخيص
npm run license:studio

# أو عبر سطر الأوامر
npm run license:generate -- \
  --machine HTW-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX \
  --months 12 \
  --warranty-months 12
```

### كود دعم مؤقت (إعادة تعيين كلمة مرور المدير)

```bash
npm run license:generate -- \
  --support \
  --machine HTW-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX \
  --hours 24
```

---

## 📱 تجربة المستخدم الأولى

1. **🔑 التفعيل** — يظهر كود الجهاز ويُطلب سيريال التفعيل
2. **👤 إنشاء المدير** — تسجيل اسم مستخدم وكلمة مرور للمدير
3. **🚀 جاهز للعمل** — النظام فارغ وجاهز لإدخال البيانات

> لا يوجد حساب افتراضي أو كلمة مرور مبدئية — كل نسخة تبدأ نظيفة.

---

## 📁 هيكل المشروع

```
helpers-warehouse-system/
├── electron/               # Electron main process
│   ├── main.cjs           # Main process (IPC, DB, License, Print)
│   ├── preload.cjs         # Context bridge APIs
│   ├── print-preload.cjs   # Print window bridge
│   └── license-public-key.cjs
├── src/                    # React frontend
│   ├── components/         # Reusable UI components
│   ├── features/           # Feature-specific components
│   ├── pages/              # Route pages
│   ├── store/              # App state (AppContext)
│   ├── lib/                # Utilities
│   ├── types/              # TypeScript types
│   └── data/               # Seed data
├── build/                  # App icons
├── public/                 # Static assets
└── package.json
```

---

## ✅ التحقق

```bash
npm run lint        # فحص الكود
npm run build       # بناء الإنتاج
```

---

## 📞 الدعم والتواصل

| | |
|---|---|
| **الشركة** | Helpers Technologies |
| **واتساب** | [+201118445625](https://wa.me/201118445625) |
| **الموقع** | [helpers-tech.com](https://helpers-tech.com) |

---

<p align="center">
  <sub>© 2026 Helpers Technologies — جميع الحقوق محفوظة</sub>
</p>
