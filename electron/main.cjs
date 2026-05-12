const { app, BrowserWindow, dialog, ipcMain, shell, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const Database = require("better-sqlite3-multiple-ciphers");
const argon2 = require("argon2");
const { machineIdSync } = require("node-machine-id");
const { z } = require("zod");
const { LICENSE_PUBLIC_KEY } = require("./license-public-key.cjs");

const STORE_PREFIX = "helpers_warehouse_v1::";
const LICENSE_TOKEN_KEY = "__license_token";
const LICENSE_LAST_SEEN_KEY = "__license_last_seen_at";
const APP_SALT = "helpers-warehouse-system-v1-local-license";
const CLOCK_SKEW_MS = 5 * 60 * 1000;

// ── SECURITY: Protected keys that cannot be written via renderer IPC ────
const PROTECTED_KEYS = new Set([
  LICENSE_TOKEN_KEY,
  LICENSE_LAST_SEEN_KEY,
]);

// ── SECURITY: Login brute-force protection ──────────────────────────────
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 60 * 1000; // 60 seconds
const loginAttempts = new Map(); // key: username → { count, lockedUntil }

let db = null;
const printDocumentNames = new Map();

const permissionTemplate = {
  products: { view: true, add: true, edit: true, delete: true },
  purchaseInvoices: { view: true, add: true },
  salesInvoices: { view: true, add: true },
  customers: { view: true, add: true, edit: true },
  suppliers: { view: true, add: true, edit: true },
  cashbox: { view: true },
  reports: { view: true },
};

const licenseSchema = z.object({
  licenseId: z.string().min(1),
  machineHash: z.string().length(64),
  subscriptionType: z.enum(["limited", "lifetime"]),
  subscriptionStartDate: z.string().min(1),
  subscriptionExpiresAt: z.string().nullable(),
  warrantyStartDate: z.string().nullable(),
  warrantyExpiresAt: z.string().nullable(),
  issuedAt: z.string().min(1),
  signature: z.string().min(32),
});

const supportSchema = z.object({
  supportId: z.string().min(1),
  purpose: z.literal("owner_password_reset"),
  machineHash: z.string().length(64),
  issuedAt: z.string().min(1),
  expiresAt: z.string().min(1),
  signature: z.string().min(32),
});

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function getMachineMaterial() {
  try {
    return machineIdSync(true);
  } catch {
    return sha256(
      [os.hostname(), os.platform(), os.arch(), os.cpus()?.[0]?.model || "cpu"]
        .filter(Boolean)
        .join("|")
    );
  }
}

function getMachineCode() {
  const digest = sha256(`${APP_SALT}:machine:${getMachineMaterial()}`).toUpperCase();
  const groups = digest.slice(0, 32).match(/.{1,4}/g) || [];
  return `HTW-${groups.join("-")}`;
}

function getMachineHash() {
  return sha256(getMachineCode());
}

function getDbKey() {
  return sha256(`${APP_SALT}:db:${getMachineMaterial()}`);
}

function openDatabase() {
  if (db) return db;

  const userDataPath = app.getPath("userData");
  fs.mkdirSync(userDataPath, { recursive: true });
  const dbPath = path.join(userDataPath, "helpers-warehouse.secure.sqlite");
  const existed = fs.existsSync(dbPath);

  db = new Database(dbPath);
  // SECURITY: Use parameterized key setting to prevent SQL injection.
  // The key is hex-only (SHA-256 output) but we use x'' literal for safety.
  const dbKeyHex = getDbKey();
  if (existed) {
    db.pragma(`key="x'${dbKeyHex}'"`);
  } else {
    db.pragma(`rekey="x'${dbKeyHex}'"`);
  }
  db.pragma("journal_mode = WAL");
  db.prepare(
    "CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)"
  ).run();
  return db;
}

function storageGet(key) {
  const row = openDatabase()
    .prepare("SELECT value FROM kv_store WHERE key = ?")
    .get(key);
  return row?.value ?? null;
}

function storageSet(key, value) {
  openDatabase()
    .prepare(
      "INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .run(key, String(value), new Date().toISOString());
  return true;
}

function storageRemove(key) {
  openDatabase().prepare("DELETE FROM kv_store WHERE key = ?").run(key);
  return true;
}

function storageClearPrefix(prefix) {
  openDatabase().prepare("DELETE FROM kv_store WHERE key LIKE ?").run(`${prefix}%`);
  return true;
}

function readJsonKey(key, fallback) {
  const raw = storageGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonKey(key, value) {
  return storageSet(key, JSON.stringify(value));
}

function getUsers() {
  const users = readJsonKey(`${STORE_PREFIX}users`, []);
  return Array.isArray(users) ? users : [];
}

function setUsers(users) {
  writeJsonKey(`${STORE_PREFIX}users`, users);
}

function getPublicKey() {
  return crypto.createPublicKey(LICENSE_PUBLIC_KEY);
}

function parseSignedPayload(token, prefix, schema) {
  const normalized = String(token || "").trim();
  if (!normalized.startsWith(prefix)) {
    throw new Error("Invalid token prefix");
  }

  const decoded = JSON.parse(
    Buffer.from(normalized.slice(prefix.length), "base64url").toString("utf8")
  );
  const parsed = schema.parse(decoded);
  const { signature, ...unsignedPayload } = parsed;
  const verified = crypto.verify(
    null,
    Buffer.from(canonicalStringify(unsignedPayload)),
    getPublicKey(),
    Buffer.from(signature, "base64url")
  );

  if (!verified) {
    throw new Error("Invalid token signature");
  }

  return parsed;
}

function buildLicenseStatus(state, extra = {}) {
  return {
    state,
    machineCode: getMachineCode(),
    machineHash: getMachineHash(),
    ...extra,
  };
}

function evaluateLicense(serial, persistSeen) {
  if (!serial) {
    return buildLicenseStatus("inactive");
  }

  let license;
  try {
    license = parseSignedPayload(serial, "HTLIC.", licenseSchema);
  } catch (error) {
    return buildLicenseStatus("inactive", {
      message: error instanceof Error ? error.message : "Invalid license",
    });
  }

  if (license.machineHash !== getMachineHash()) {
    return buildLicenseStatus("machine_mismatch", { license });
  }

  const now = new Date();
  const lastSeenRaw = storageGet(LICENSE_LAST_SEEN_KEY);
  if (lastSeenRaw) {
    const lastSeen = new Date(lastSeenRaw);
    if (!Number.isNaN(lastSeen.getTime()) && now.getTime() + CLOCK_SKEW_MS < lastSeen.getTime()) {
      return buildLicenseStatus("clock_tampered", { license });
    }
  }

  if (
    license.subscriptionType === "limited" &&
    (!license.subscriptionExpiresAt || now.getTime() > new Date(license.subscriptionExpiresAt).getTime())
  ) {
    return buildLicenseStatus("expired", { license });
  }

  if (persistSeen) {
    storageSet(LICENSE_LAST_SEEN_KEY, now.toISOString());
  }

  return buildLicenseStatus("active", { license });
}

function getLicenseStatus() {
  return evaluateLicense(storageGet(LICENSE_TOKEN_KEY), true);
}

async function hashPassword(password) {
  return argon2.hash(String(password), {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

async function verifyPassword(storedHash, password) {
  if (!storedHash) return false;
  if (String(storedHash).startsWith("$argon2")) {
    return argon2.verify(storedHash, String(password));
  }
  // SECURITY: Legacy base64 fallback — auto-upgrade on next successful login
  return storedHash === Buffer.from(String(password), "utf8").toString("base64");
}

async function createOwner(username, password) {
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername || String(password || "").length < 6) {
    return { ok: false, error: "invalid_input" };
  }

  const users = getUsers();
  if (users.some((user) => user.role === "owner")) {
    return { ok: false, error: "owner_exists" };
  }
  if (users.some((user) => user.username === cleanUsername)) {
    return { ok: false, error: "username_exists" };
  }

  const user = {
    id: `usr_${crypto.randomUUID()}`,
    username: cleanUsername,
    passwordHash: await hashPassword(password),
    role: "owner",
    permissions: permissionTemplate,
    createdAt: new Date().toISOString(),
  };

  setUsers([user, ...users]);
  return { ok: true, user };
}

async function login(username, password) {
  const cleanUsername = String(username || "").trim();

  // ── SECURITY: Rate-limiting ──────────────────────────────────────
  const now = Date.now();
  const entry = loginAttempts.get(cleanUsername);
  if (entry && entry.lockedUntil > now) {
    const remainSec = Math.ceil((entry.lockedUntil - now) / 1000);
    return { ok: false, error: "rate_limited", remainSeconds: remainSec };
  }
  // ────────────────────────────────────────────────────────────────

  const users = getUsers();
  const user = users.find((item) => item.username === cleanUsername);

  // SECURITY: constant-time-ish — always run verifyPassword to prevent
  // timing attacks that reveal whether a username exists.
  const dummyHash = "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$dummyhashvalue";
  const ok = await verifyPassword(user?.passwordHash || dummyHash, password);

  if (!user || !ok) {
    // ── Increment failed attempts ──
    const current = loginAttempts.get(cleanUsername) || { count: 0, lockedUntil: 0 };
    current.count += 1;
    if (current.count >= LOGIN_MAX_ATTEMPTS) {
      current.lockedUntil = now + LOGIN_LOCKOUT_MS;
      current.count = 0;
    }
    loginAttempts.set(cleanUsername, current);
    return { ok: false };
  }

  // ── Success — clear attempts ──
  loginAttempts.delete(cleanUsername);

  // Auto-upgrade legacy password hashes to argon2id
  if (!String(user.passwordHash || "").startsWith("$argon2")) {
    user.passwordHash = await hashPassword(password);
    setUsers(users);
  }

  return { ok: true, user };
}

async function resetOwnerPassword({ supportCode, username, password }) {
  let support;
  try {
    support = parseSignedPayload(supportCode, "HTSUP.", supportSchema);
  } catch {
    return { ok: false, error: "invalid_support_code" };
  }

  if (support.machineHash !== getMachineHash()) {
    return { ok: false, error: "machine_mismatch" };
  }
  if (new Date().getTime() > new Date(support.expiresAt).getTime()) {
    return { ok: false, error: "support_code_expired" };
  }

  const users = getUsers();
  const owner = users.find((user) => user.role === "owner");
  if (!owner) return { ok: false, error: "owner_missing" };

  const cleanUsername = String(username || owner.username).trim();
  if (!cleanUsername || String(password || "").length < 6) {
    return { ok: false, error: "invalid_input" };
  }

  owner.username = cleanUsername;
  owner.passwordHash = await hashPassword(password);
  setUsers(users);
  return { ok: true, user: owner };
}

function createWindow() {
  const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
  const iconPath = path.join(__dirname, "..", "build", "icon.ico");
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: "نظام إدارة المخزون والمبيعات",
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
      // SECURITY: Prevent navigation to external content
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // SECURITY: Block all navigation away from the app
  win.webContents.on("will-navigate", (event, navigationUrl) => {
    if (isDev && navigationUrl.startsWith(process.env.ELECTRON_RENDERER_URL)) return;
    const parsed = new URL(navigationUrl);
    if (parsed.protocol !== "file:") {
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (!isDev) {
    // SECURITY: Comprehensive DevTools blocking
    win.webContents.on("before-input-event", (event, input) => {
      const key = input.key.toUpperCase();
      // Block F12, Ctrl+Shift+I/J/C, Ctrl+U (view source), Ctrl+Shift+D
      if (
        input.key === "F12" ||
        (input.control && input.shift && ["I", "J", "C", "D"].includes(key)) ||
        (input.control && key === "U")
      ) {
        event.preventDefault();
      }
    });

    // SECURITY: Force-close DevTools if somehow opened
    win.webContents.on("devtools-opened", () => {
      win.webContents.closeDevTools();
    });
  }

  if (isDev) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function normalizePrintRoute(route) {
  const cleanRoute = String(route || "").trim();
  if (!cleanRoute.startsWith("/")) {
    throw new Error("Invalid print route");
  }
  if (!/^\/(sales|purchases)\/[^/]+\/print$/.test(cleanRoute)) {
    throw new Error("Unsupported print route");
  }
  return cleanRoute;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatCurrency(value, currency) {
  const amount = Number(value || 0);
  return `${new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} ${currency || ""}`.trim();
}

function sanitizeFileName(value) {
  return String(value || "invoice")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 140) || "invoice";
}

function ensurePdfExtension(filePath) {
  return filePath.toLowerCase().endsWith(".pdf") ? filePath : `${filePath}.pdf`;
}

function getInvoicePrintMeta(route) {
  const { kind, invoice } = getInvoiceForPrint(route);
  const title = kind === "sales" ? "فاتورة مبيعات" : "فاتورة مشتريات";
  const invoiceNumber = invoice.invoiceNumber || invoice.id || "invoice";
  const datePart = invoice.date ? `-${invoice.date}` : "";
  return {
    windowTitle: `${title} ${invoiceNumber}`,
    fileBaseName: sanitizeFileName(`${title}-${invoiceNumber}${datePart}`),
  };
}

function getInvoicePrintOptions() {
  return {
    silent: false,
    printBackground: true,
    landscape: true,
    pageSize: "A4",
    margins: { marginType: "default" },
  };
}

function getInvoicePdfOptions() {
  return {
    printBackground: true,
    landscape: true,
    pageSize: "A4",
    margins: { marginType: "default" },
    preferCSSPageSize: true,
  };
}

function getPrintSettings() {
  return readJsonKey(`${STORE_PREFIX}settings`, {
    companyName: "Helpers Distribution",
    companyNameAr: "شركة الهلبرز للتوزيع",
    invoiceFooter: "",
    currency: "ج.م",
    arabicLabels: true,
    logoText: "HD",
    logoImage: "",
    invoicesSavePath: "",
  });
}

function getInvoiceForPrint(route) {
  const cleanRoute = normalizePrintRoute(route);
  const match = cleanRoute.match(/^\/(sales|purchases)\/([^/]+)\/print$/);
  if (!match) {
    throw new Error("Unsupported print route");
  }

  const section = match[1];
  const id = decodeURIComponent(match[2]);
  if (section === "sales") {
    const invoices = readJsonKey(`${STORE_PREFIX}salesInvoices`, []);
    const invoice = Array.isArray(invoices) ? invoices.find((item) => item.id === id) : null;
    if (!invoice) throw new Error("sales_invoice_not_found");
    return { kind: "sales", invoice };
  }

  const invoices = readJsonKey(`${STORE_PREFIX}purchaseInvoices`, []);
  const invoice = Array.isArray(invoices) ? invoices.find((item) => item.id === id) : null;
  if (!invoice) throw new Error("purchase_invoice_not_found");
  return { kind: "purchase", invoice };
}

function buildInvoicePrintHtml(route) {
  const { kind, invoice } = getInvoiceForPrint(route);
  const settings = getPrintSettings();
  const isSales = kind === "sales";
  const title = isSales ? "فاتورة مبيعات" : "فاتورة مشتريات";
  const partyLabel = isSales ? "العميل" : "المورد";
  const partyName = isSales ? invoice.customerName : invoice.supplierName;
  const amountPaid = isSales ? invoice.amountReceived : invoice.amountPaid;
  const paymentLabel = isSales
    ? invoice.paymentType === "cash"
      ? "نقدي"
      : "آجل (حساب)"
    : invoice.status === "paid"
      ? "مسدد"
      : invoice.status === "partial"
        ? "جزئي"
        : "آجل";
  const companyName = settings.arabicLabels ? settings.companyNameAr : settings.companyName;
  const logo = settings.logoImage
    ? `<img src="${escapeHtml(settings.logoImage)}" alt="Logo" />`
    : escapeHtml(settings.logoText || "HD");

  const rows = (invoice.lines || [])
    .map(
      (line, idx) => `
        <tr>
          <td class="center">${idx + 1}</td>
          <td>
            ${escapeHtml(line.productName)}
            ${line.expiryDate ? `<div class="muted small">صلاحية: ${formatDate(line.expiryDate)}</div>` : ""}
          </td>
          <td class="center">${escapeHtml(line.unit)}</td>
          <td class="center mono">${escapeHtml(line.quantity)}</td>
          <td class="center mono">${escapeHtml(formatCurrency(line.price, settings.currency))}</td>
          <td class="center mono bold">${escapeHtml(formatCurrency(line.subtotal, settings.currency))}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: white;
      color: #172033;
      font-family: Tahoma, Arial, sans-serif;
      font-size: 12px;
      direction: rtl;
    }
    .print-toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 8px;
      padding: 10px 14px;
      background: #241f62;
      color: white;
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.18);
    }
    .print-toolbar button {
      border: 0;
      border-radius: 6px;
      padding: 8px 14px;
      background: white;
      color: #241f62;
      font-family: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .print-toolbar .secondary {
      background: rgba(255, 255, 255, 0.14);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.32);
    }
    .print-status {
      min-width: 150px;
      color: rgba(255, 255, 255, 0.82);
      font-size: 11px;
    }
    .page { width: 100%; padding: 14px; }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      border-bottom: 1px solid #d6dee8;
      padding-bottom: 16px;
      margin-bottom: 16px;
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .logo {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      background: #241f62;
      color: white;
      display: grid;
      place-items: center;
      font-weight: 700;
      font-size: 18px;
      overflow: hidden;
    }
    .logo img { width: 100%; height: 100%; object-fit: cover; }
    .company { font-size: 19px; font-weight: 700; }
    .company-en { color: #667085; margin-top: 3px; }
    .title { text-align: left; }
    .title h1 { margin: 0 0 8px; font-size: 25px; }
    .muted { color: #667085; }
    .small { font-size: 11px; margin-top: 3px; }
    .mono { font-family: Consolas, "Courier New", monospace; direction: ltr; }
    .bold { font-weight: 700; }
    .cards {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }
    .card {
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      border-radius: 8px;
      padding: 10px;
    }
    .label { color: #667085; font-size: 11px; margin-bottom: 5px; }
    .value { font-weight: 700; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th {
      background: #eef2f7;
      color: #334155;
      font-weight: 700;
    }
    th, td {
      border: 1px solid #d6dee8;
      padding: 7px;
      vertical-align: top;
    }
    .center { text-align: center; }
    .totals {
      display: flex;
      justify-content: flex-start;
      margin-bottom: 16px;
    }
    .totals-box { width: 330px; }
    .total-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 0;
      border-bottom: 1px solid #edf2f7;
    }
    .total-row.final {
      border-top: 1px solid #94a3b8;
      border-bottom: 0;
      margin-top: 4px;
      padding-top: 8px;
      font-size: 16px;
      font-weight: 700;
    }
    .notes {
      border-top: 1px solid #e2e8f0;
      padding-top: 9px;
      margin-bottom: 18px;
      color: #475569;
    }
    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
      text-align: center;
      color: #667085;
      white-space: pre-line;
      margin-bottom: 26px;
    }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 60px;
      margin-top: 50px;
    }
    .signature-line {
      height: 50px;
      border-bottom: 1px solid #64748b;
      margin-bottom: 6px;
    }
    .signature-label { text-align: center; color: #667085; font-size: 11px; }
    .developer-info {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #94a3b8;
      font-size: 10px;
    }
    @media print {
      .print-toolbar { display: none; }
      .page { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <button type="button" onclick="printNow()">طباعة الآن</button>
    <button type="button" onclick="savePdf()">حفظ PDF</button>
    <button type="button" class="secondary" onclick="window.close()">إغلاق</button>
    <span id="print-status" class="print-status"></span>
  </div>
  <div class="page">
    <div class="header">
      <div class="brand">
        <div class="logo">${logo}</div>
        <div>
          <div class="company">${escapeHtml(companyName)}</div>
          <div class="company-en">${escapeHtml(settings.companyName || "")}</div>
        </div>
      </div>
      <div class="title">
        <h1>${escapeHtml(title)}</h1>
        <div class="muted">رقم الفاتورة: <span class="mono bold">${escapeHtml(invoice.invoiceNumber)}</span></div>
        <div class="muted">التاريخ: ${formatDate(invoice.date)}</div>
      </div>
    </div>

    <div class="cards">
      <div class="card">
        <div class="label">${escapeHtml(partyLabel)}</div>
        <div class="value">${escapeHtml(partyName)}</div>
      </div>
      <div class="card">
        <div class="label">طريقة الدفع / السائق</div>
        <div class="value">
          ${escapeHtml(paymentLabel)}
          ${invoice.driverName ? `<span class="muted"> - السائق: ${escapeHtml(invoice.driverName)}</span>` : ""}
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="center" style="width:42px">#</th>
          <th>الصنف</th>
          <th class="center" style="width:80px">الوحدة</th>
          <th class="center" style="width:80px">الكمية</th>
          <th class="center" style="width:130px">السعر</th>
          <th class="center" style="width:130px">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="6" class="center muted">لا توجد بنود</td></tr>`}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        <div class="total-row"><span>الإجمالي</span><span class="mono">${escapeHtml(formatCurrency(invoice.total, settings.currency))}</span></div>
        <div class="total-row"><span>${isSales ? "المبلغ المستلم" : "المبلغ المدفوع"}</span><span class="mono">${escapeHtml(formatCurrency(amountPaid, settings.currency))}</span></div>
        <div class="total-row final"><span>المتبقي</span><span class="mono">${escapeHtml(formatCurrency(invoice.remaining, settings.currency))}</span></div>
      </div>
    </div>

    ${invoice.notes ? `<div class="notes"><strong>ملاحظات: </strong>${escapeHtml(invoice.notes)}</div>` : ""}
    <div class="footer">${escapeHtml(settings.invoiceFooter || "")}</div>
    <div class="signatures">
      <div><div class="signature-line"></div><div class="signature-label">توقيع المستلم</div></div>
      <div><div class="signature-line"></div><div class="signature-label">توقيع المسؤول</div></div>
    </div>
    <div class="developer-info">
      برمجة وتطوير: م/ عمرو هاني — واتساب: 01118445625
    </div>
  </div>
  <script>
    const statusEl = document.getElementById("print-status");
    function setStatus(message) {
      if (statusEl) statusEl.textContent = message || "";
    }
    async function printNow() {
      setStatus("جاري فتح نافذة الطباعة...");
      if (window.invoicePrint && window.invoicePrint.printNow) {
        const result = await window.invoicePrint.printNow();
        setStatus(result && result.ok ? "" : "تعذر فتح الطباعة");
      } else {
        window.print();
        setStatus("");
      }
    }
    async function savePdf() {
      setStatus("جاري حفظ PDF...");
      if (!window.invoicePrint || !window.invoicePrint.savePdf) {
        setStatus("حفظ PDF غير متاح");
        return;
      }
      const result = await window.invoicePrint.savePdf();
      setStatus(result && result.ok ? "تم حفظ PDF" : "");
    }
  </script>
</body>
</html>`;
}

function printRoute(route) {
  return new Promise((resolve) => {
    let printWindow = null;
    let resolved = false;
    const finish = (result) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };
    try {
      const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
      const meta = getInvoicePrintMeta(route);
      const html = buildInvoicePrintHtml(route);
      printWindow = new BrowserWindow({
        width: 1200,
        height: 850,
        show: true,
        autoHideMenuBar: true,
        title: meta.windowTitle,
        webPreferences: {
          preload: path.join(__dirname, "print-preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          devTools: isDev,
        },
      });
      const webContentsId = printWindow.webContents.id;
      printDocumentNames.set(webContentsId, meta.fileBaseName);
      printWindow.on("closed", () => {
        printDocumentNames.delete(webContentsId);
        printWindow = null;
        finish({ ok: false, error: "print_window_closed" });
      });

      printWindow.webContents.once("did-finish-load", () => {
        if (!printWindow || printWindow.isDestroyed()) {
          finish({ ok: false, error: "print_window_closed" });
          return;
        }
        printWindow.show();
        printWindow.focus();
        finish({ ok: true });
        setTimeout(() => {
          if (!printWindow || printWindow.isDestroyed()) return;
          printWindow.webContents.print(
            getInvoicePrintOptions(),
            (success, failureReason) => {
              if (!success && failureReason) {
                console.warn(`Invoice print was not completed: ${failureReason}`);
              }
            }
          );
        }, 650);
      });

      printWindow.webContents.once("did-fail-load", (_event, _code, description) => {
        if (printWindow && !printWindow.isDestroyed()) {
          printWindow.close();
        }
        finish({ ok: false, error: description || "did_fail_load" });
      });

      printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    } catch (error) {
      if (printWindow && !printWindow.isDestroyed()) {
        printWindow.close();
      }
      finish({ ok: false, error: error instanceof Error ? error.message : "print_failed" });
    }
  });
}

function registerIpc() {
  // ── SECURITY: Validate storage keys — block protected internal keys ──
  function isKeyAllowed(key) {
    return !PROTECTED_KEYS.has(String(key));
  }

  ipcMain.on("storage:get", (event, key) => {
    event.returnValue = storageGet(String(key));
  });
  ipcMain.on("storage:set", (event, key, value) => {
    if (!isKeyAllowed(key)) {
      event.returnValue = false;
      return;
    }
    event.returnValue = storageSet(String(key), String(value));
  });
  ipcMain.on("storage:remove", (event, key) => {
    if (!isKeyAllowed(key)) {
      event.returnValue = false;
      return;
    }
    event.returnValue = storageRemove(String(key));
  });
  ipcMain.on("storage:clear-prefix", (event, prefix) => {
    event.returnValue = storageClearPrefix(String(prefix));
  });

  ipcMain.handle("storage:export", () => {
    // SECURITY: Exclude sensitive internal keys from export
    const rows = openDatabase()
      .prepare("SELECT key, value, updated_at FROM kv_store WHERE key NOT LIKE '\_%' ESCAPE '\\' ORDER BY key")
      .all();
    return { version: 1, timestamp: new Date().toISOString(), rows };
  });
  ipcMain.handle("storage:import", (_event, payload) => {
    if (!payload || !Array.isArray(payload.rows)) return { ok: false };
    const insert = openDatabase().prepare(
      "INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    );
    const tx = openDatabase().transaction((rows) => {
      for (const row of rows) {
        if (typeof row.key === "string" && typeof row.value === "string") {
          // SECURITY: Never allow importing protected keys (license, etc.)
          if (PROTECTED_KEYS.has(row.key)) continue;
          insert.run(row.key, row.value, row.updated_at || new Date().toISOString());
        }
      }
    });
    tx(payload.rows);
    return { ok: true };
  });

  ipcMain.handle("license:get-machine-code", () => getMachineCode());
  ipcMain.handle("license:get-status", () => getLicenseStatus());
  ipcMain.handle("license:activate", (_event, serial) => {
    const status = evaluateLicense(serial, false);
    if (status.state !== "active") {
      return { ok: false, status };
    }
    storageSet(LICENSE_TOKEN_KEY, String(serial).trim());
    storageSet(LICENSE_LAST_SEEN_KEY, new Date().toISOString());
    return { ok: true, status: getLicenseStatus() };
  });

  ipcMain.handle("setup:has-owner", () => getUsers().some((user) => user.role === "owner"));
  ipcMain.handle("setup:create-owner", (_event, payload) =>
    createOwner(payload?.username, payload?.password)
  );
  ipcMain.handle("auth:hash-password", (_event, password) => hashPassword(password));
  ipcMain.handle("auth:login", (_event, payload) => login(payload?.username, payload?.password));
  ipcMain.handle("support:reset-owner-password", (_event, payload) => resetOwnerPassword(payload));
  ipcMain.handle("print:route", (_event, route) => printRoute(route));
  ipcMain.handle("print:current-window", (event) =>
    new Promise((resolve) => {
      event.sender.print(getInvoicePrintOptions(), (success, failureReason) => {
        resolve(
          success ? { ok: true } : { ok: false, error: failureReason || "print_cancelled" }
        );
      });
    })
  );
  ipcMain.handle("print:save-current-pdf", async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const baseName =
      printDocumentNames.get(event.sender.id) ||
      sanitizeFileName(ownerWindow?.getTitle() || event.sender.getTitle() || "invoice");
    const settings = getPrintSettings();
    const baseDir = settings.invoicesSavePath || app.getPath("downloads");
    const defaultPath = path.join(baseDir, `${baseName}.pdf`);
    const options = {
      title: "حفظ الفاتورة PDF",
      defaultPath,
      filters: [{ name: "PDF Document", extensions: ["pdf"] }],
    };
    const result = ownerWindow
      ? await dialog.showSaveDialog(ownerWindow, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) {
      return { ok: false, error: "cancelled" };
    }

    const pdfPath = ensurePdfExtension(result.filePath);
    const pdf = await event.sender.printToPDF(getInvoicePdfOptions());
    fs.writeFileSync(pdfPath, pdf);
    shell.showItemInFolder(pdfPath);
    return { ok: true, path: pdfPath };
  });

  ipcMain.handle("dialog:select-directory", async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(ownerWindow, {
      properties: ["openDirectory"],
      title: "اختر مجلد حفظ الفواتير",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}

app.whenReady().then(() => {
  // ── SECURITY: Set Content Security Policy ──────────────────────────
  const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const cspDirectives = isDev
      ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';";
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [cspDirectives],
      },
    });
  });

  // ── SECURITY: Block dangerous permission requests ─────────────────
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ["clipboard-read", "clipboard-sanitized-write"];
    callback(allowed.includes(permission));
  });

  registerIpc();
  openDatabase();

  if (process.argv.includes("--smoke-test")) {
    // SECURITY: Removed console.log of license status
    app.quit();
    return;
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
