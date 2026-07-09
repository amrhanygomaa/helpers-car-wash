const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");
const electronRuntime = require("electron");
const Database = require("better-sqlite3-multiple-ciphers");
const argon2 = require("argon2");
const { machineIdSync } = require("node-machine-id");
const { z } = require("zod");
const { createSyncEngine } = require("./sync.cjs");

let LICENSE_PUBLIC_KEY;
try {
  ({ LICENSE_PUBLIC_KEY } = require("./license-public-key.cjs"));
} catch (e) {
  if (e && (e.code === "MODULE_NOT_FOUND" || e.code === "ERR_MODULE_NOT_FOUND")) {
    console.error(
      "[electron] Missing `electron/license-public-key.cjs`.\n" +
        "Copy `electron/license-public-key.example.cjs` to `electron/license-public-key.cjs` " +
        "and replace the PEM with your deployment Ed25519 public key (team-only; do not commit)."
    );
  }
  throw e;
}

if (!electronRuntime.app) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const electronPath = typeof electronRuntime === "string" ? electronRuntime : process.execPath;
  const result = childProcess.spawnSync(
    electronPath,
    [path.join(__dirname, ".."), ...process.argv.slice(2)],
    { env, stdio: "inherit" }
  );
  process.exit(result.status ?? 0);
}

const { app, BrowserWindow, dialog, ipcMain, shell, session } = electronRuntime;

const APP_ID = "com.topgear.carwash";
const APP_SALT = "helpers-inventory-system-v1-local-license";
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_TOKEN_LENGTH = 8192;
const MAX_USERNAME_LENGTH = 80;
const MAX_PASSWORD_LENGTH = 256;

// ── E2E test mode — gated by HW_E2E=1; never reachable in shipped builds ──
const HW_E2E = process.env.HW_E2E === "1";

// ── Storage security: pure predicates and redaction helpers ─────────────
const {
  STORE_PREFIX,
  REDACTED_PASSWORD_HASH,
  PROTECTED_KEYS,
  safeUserForRenderer,
  safeUsersForRenderer,
} = require("./storage-security.cjs");

// ── Rate-limiting: pure state machine ────────────────────────────────────
const {
  checkRateLimit,
  recordFailedAttempt,
  recordFailedSupportAttempt,
  clearAttempts,
} = require("./rate-limit.cjs");

// Derived keys used only inside main.cjs
const LICENSE_TOKEN_KEY = "__license_token";
const LICENSE_LAST_SEEN_KEY = "__license_last_seen_at";
const AUTH_STATE_KEY = `${STORE_PREFIX}auth`;

// ── SECURITY: Login brute-force protection ──────────────────────────────
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 60 * 1000; // 60 seconds
const loginAttempts = new Map(); // key: username → { count, lockedUntil }
const SUPPORT_MAX_ATTEMPTS = 5;
const SUPPORT_LOCKOUT_MS = 10 * 60 * 1000;
const supportAttempts = new Map(); // key: sender id → { count, lockedUntil }

let db = null;
const printDocumentNames = new Map();
const rendererSessions = new Map(); // key: webContents id → { userId, role }

function isSmokeTestRun() {
  return process.argv.includes("--smoke-test") || process.env.HELPERS_SMOKE_TEST === "1";
}

function exitForSmokeTest() {
  try {
    db?.close();
  } catch {
    // Ignore shutdown cleanup errors in smoke mode.
  } finally {
    db = null;
    app.exit(0);
  }
}

const permissionTemplate = {
  products: { view: true, add: true, edit: true, delete: true },
  inventory: { view: true, adjust: true },
  purchaseInvoices: { view: true, add: true, edit: true, pay: true, delete: true },
  salesInvoices: { view: true, add: true, edit: true, receive: true, cancel: true, delete: true },
  customers: { view: true, add: true, edit: true, delete: true },
  suppliers: { view: true, add: true, edit: true, delete: true, commissions: true },
  drivers: { view: true, add: true, edit: true, delete: true },
  returns: { view: true, add: true },
  alerts: { view: true },
  cashbox: { view: true, add: true, spend: true, editOpeningBalance: true },
  reports: { view: true },
  vehicles: { view: true, add: true, edit: true, delete: true },
  washServices: { view: true, add: true, edit: true, delete: true },
  queue: { view: true, add: true, edit: true, cancel: true },
  pricing: { override: true },
  payroll: { view: true, manage: true },
  workers: { view: true, manage: true },
  settings: { view: true, manage: true },
  users: { view: true, manage: true },
};

if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}

function getAppIconPath() {
  const iconCandidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, "build", "icon.ico"),
        path.join(process.resourcesPath, "app.asar", "build", "icon.ico"),
        path.join(process.resourcesPath, "app", "build", "icon.ico"),
      ]
    : [path.join(__dirname, "..", "build", "icon.ico")];

  return iconCandidates.find((candidate) => fs.existsSync(candidate)) || iconCandidates[0];
}

const licenseSchema = z.object({
  licenseId: z.string().min(1),
  machineHash: z.string().length(64),
  subscriptionType: z.enum(["limited", "lifetime"]),
  subscriptionStartDate: z.string().min(1),
  subscriptionExpiresAt: z.string().nullable(),
  warrantyStartDate: z.string().nullable(),
  warrantyExpiresAt: z.string().nullable(),
  // Optional feature packaging. When present they are part of the signed payload
  // (must be included in the generator's canonical string before signing).
  // Absent on serials issued before packaging ⇒ all features allowed.
  plan: z.string().optional(),
  features: z.array(z.string()).optional(),
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

function normalizeUsername(username) {
  return String(username || "").trim().slice(0, MAX_USERNAME_LENGTH);
}

function normalizePassword(password) {
  return String(password ?? "");
}

function isPasswordLengthAllowed(password, minLength = 0) {
  const cleanPassword = normalizePassword(password);
  return cleanPassword.length >= minLength && cleanPassword.length <= MAX_PASSWORD_LENGTH;
}

function parseDateMs(value) {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isArgonPasswordHash(value) {
  return typeof value === "string" && value.startsWith("$argon2");
}

// safeUserForRenderer and safeUsersForRenderer imported from ./storage-security.cjs

function getSession(event) {
  return rendererSessions.get(event.sender.id) || null;
}

function setSession(event, user) {
  if (!user?.id) return;
  rendererSessions.set(event.sender.id, {
    userId: user.id,
    role: user.role,
  });
}

function clearSession(event) {
  rendererSessions.delete(event.sender.id);
}

function hasOwnerSession(event) {
  return getSession(event)?.role === "owner";
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
  // In development mode, use a static key to allow sharing databases across developer machines.
  if (typeof app !== "undefined" && !app.isPackaged) {
    return sha256(`${APP_SALT}:db:development-shared-constant-key`);
  }
  return sha256(`${APP_SALT}:db:${getMachineMaterial()}`);
}

function getDatabasePath() {
  return HW_E2E && process.env.HW_E2E_DB_PATH
    ? process.env.HW_E2E_DB_PATH
    : path.join(app.getPath("userData"), "helpers-inventory.secure.sqlite");
}

function openDatabase() {
  if (db) return db;

  const dbPath = getDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const existed = fs.existsSync(dbPath);
  const dbKeyHex = getDbKey();

  const initDb = (isExisting) => {
    const instance = new Database(dbPath);
    try {
      if (isExisting) {
        instance.pragma(`key="x'${dbKeyHex}'"`);
      } else {
        instance.pragma(`rekey="x'${dbKeyHex}'"`);
      }
      instance.pragma("journal_mode = WAL");
      instance.prepare(
        "CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)"
      ).run();
      return instance;
    } catch (error) {
      try { instance.close(); } catch { /* ignore close errors while recovering */ }
      throw error;
    }
  };

  try {
    db = initDb(existed);
  } catch (error) {
    // If decryption or initialization fails in development, recreate database.
    if (typeof app !== "undefined" && !app.isPackaged) {
      console.warn("Dev database initialization failed. Recreating fresh database...", error);
      try { if (db) db.close(); } catch { /* ignore */ }
      const backupPath = `${dbPath}.corrupt-${Date.now()}.bak`;
      if (fs.existsSync(dbPath)) {
        fs.renameSync(dbPath, backupPath);
      }
      db = initDb(false);
    } else {
      throw error;
    }
  }

  db.prepare("DELETE FROM kv_store WHERE key = ?").run(AUTH_STATE_KEY);

  // Flush the WAL file periodically so it never grows unboundedly.
  // A large WAL file makes every read slower over time — this is a key cause
  // of the renderer freezing after hours of use.
  setInterval(() => {
    try { db?.pragma("wal_checkpoint(PASSIVE)"); } catch { /* ignore */ }
  }, 10 * 60 * 1000); // every 10 minutes

  return db;
}

// ── Car Wash migration runner ─────────────────────────────────────────────
// Reads SQL files from electron/migrations/ and applies any that haven't run yet.
// Tracked in __carwash_migrations so each file executes exactly once.
function runCarwashMigrations() {
  const database = openDatabase();

  database.prepare(`CREATE TABLE IF NOT EXISTS __carwash_migrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )`).run();

  const migrationsDir = path.join(__dirname, "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.warn("[db] migrations directory not found:", migrationsDir);
    return;
  }

  const applied = new Set(
    database.prepare("SELECT name FROM __carwash_migrations").all().map((r) => r.name)
  );

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    try {
      database.exec(sql);
      database
        .prepare("INSERT INTO __carwash_migrations (name, applied_at) VALUES (?, ?)")
        .run(file, new Date().toISOString());
      console.log("[db] migration applied:", file);
    } catch (err) {
      console.error("[db] migration failed:", file, err.message);
      throw err;
    }
  }
}

// ── Cloud sync engine (Phase 9) — lazy singleton, runs in main only ───────────
let _syncEngine = null;
let _syncTimer = null;
function getSyncEngine() {
  if (!_syncEngine) {
    _syncEngine = createSyncEngine({
      db: openDatabase(),
      deviceId: () => { try { return machineIdSync(true); } catch { return ""; } },
      log: (...a) => console.log(...a),
    });
  }
  return _syncEngine;
}
function startSyncScheduler() {
  if (_syncTimer) return;
  // Background, non-blocking: only acts when the owner enabled + configured sync.
  _syncTimer = setInterval(() => {
    try {
      const engine = getSyncEngine();
      if (engine.getConfig().enabled) engine.runSync().catch((e) => console.warn("[sync] tick", e?.message));
    } catch (e) {
      console.warn("[sync] scheduler", e?.message);
    }
  }, 5 * 60 * 1000);
  if (_syncTimer.unref) _syncTimer.unref();
}

// Cached prepared statements — created once after DB is first opened.
let _stmtGet = null;
let _stmtSet = null;
let _stmtRemove = null;
let _stmtClearPrefix = null;

function resetPreparedStatements() {
  _stmtGet = null;
  _stmtSet = null;
  _stmtRemove = null;
  _stmtClearPrefix = null;
}

function getStmtGet() {
  if (!_stmtGet) _stmtGet = openDatabase().prepare("SELECT value FROM kv_store WHERE key = ?");
  return _stmtGet;
}
function getStmtSet() {
  if (!_stmtSet) _stmtSet = openDatabase().prepare(
    "INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  );
  return _stmtSet;
}
function getStmtRemove() {
  if (!_stmtRemove) _stmtRemove = openDatabase().prepare("DELETE FROM kv_store WHERE key = ?");
  return _stmtRemove;
}
function getStmtClearPrefix() {
  if (!_stmtClearPrefix) _stmtClearPrefix = openDatabase().prepare("DELETE FROM kv_store WHERE key LIKE ?");
  return _stmtClearPrefix;
}

function storageGet(key) {
  const row = getStmtGet().get(key);
  return row?.value ?? null;
}

function storageSet(key, value) {
  getStmtSet().run(key, String(value), new Date().toISOString());
  return true;
}

function storageRemove(key) {
  getStmtRemove().run(key);
  return true;
}

function storageClearPrefix(prefix) {
  getStmtClearPrefix().run(`${prefix}%`);
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
  if (!Array.isArray(users)) return [];
  return users.map((user) => ({
    ...user,
    name: String(user.name || user.username || "").trim(),
  }));
}

function setUsers(users) {
  writeJsonKey(`${STORE_PREFIX}users`, users);
}

function getPublicKey() {
  return crypto.createPublicKey(LICENSE_PUBLIC_KEY);
}

function parseSignedPayload(token, prefix, schema) {
  const normalized = String(token || "").replace(/\s+/g, "").trim();
  if (normalized.length > MAX_TOKEN_LENGTH) {
    throw new Error("Token too large");
  }
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
    const lastSeenMs = parseDateMs(lastSeenRaw);
    if (lastSeenMs !== null && now.getTime() + CLOCK_SKEW_MS < lastSeenMs) {
      return buildLicenseStatus("clock_tampered", { license });
    }
  }

  const subscriptionExpiresMs = license.subscriptionExpiresAt
    ? parseDateMs(license.subscriptionExpiresAt)
    : null;
  if (
    license.subscriptionType === "limited" &&
    (!license.subscriptionExpiresAt || subscriptionExpiresMs === null || now.getTime() > subscriptionExpiresMs)
  ) {
    return buildLicenseStatus("expired", { license });
  }

  if (persistSeen) {
    storageSet(LICENSE_LAST_SEEN_KEY, now.toISOString());
  }

  return buildLicenseStatus("active", { license });
}

function getLicenseStatus() {
  if (HW_E2E) return buildLicenseStatus("active", { license: { subscriptionType: "lifetime", subscriptionStartDate: new Date().toISOString(), subscriptionExpiresAt: null } });
  return evaluateLicense(storageGet(LICENSE_TOKEN_KEY), true);
}

async function hashPassword(password) {
  const cleanPassword = normalizePassword(password);
  if (!isPasswordLengthAllowed(cleanPassword)) {
    throw new Error("invalid_password_length");
  }
  return argon2.hash(cleanPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

async function verifyPassword(storedHash, password) {
  const cleanPassword = normalizePassword(password);
  if (!isPasswordLengthAllowed(cleanPassword)) return false;
  if (!storedHash) return false;
  if (String(storedHash).startsWith("$argon2")) {
    return argon2.verify(storedHash, cleanPassword);
  }
  // SECURITY: Legacy base64 fallback — auto-upgrade on next successful login
  return storedHash === Buffer.from(cleanPassword, "utf8").toString("base64");
}

async function createOwner(username, password) {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername || !isPasswordLengthAllowed(password, 4)) {
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
    name: cleanUsername,
    username: cleanUsername,
    passwordHash: await hashPassword(password),
    role: "owner",
    roleId: "owner",
    permissions: permissionTemplate,
    createdAt: new Date().toISOString(),
  };

  setUsers([user, ...users]);
  return { ok: true, user };
}

async function login(username, password) {
  const cleanUsername = normalizeUsername(username);
  const attemptKey = cleanUsername.toLowerCase();

  // ── SECURITY: Rate-limiting ──────────────────────────────────────
  const now = Date.now();
  const rateLimited = checkRateLimit(loginAttempts, attemptKey, now);
  if (rateLimited) return rateLimited;
  // ────────────────────────────────────────────────────────────────

  const users = getUsers();
  const user = users.find((item) => item.username === cleanUsername);

  // SECURITY: constant-time-ish — always run verifyPassword to prevent
  // timing attacks that reveal whether a username exists.
  const dummyHash = "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$dummyhashvalue";
  const ok = await verifyPassword(user?.passwordHash || dummyHash, password);

  if (!user || !ok) {
    return recordFailedAttempt(loginAttempts, attemptKey, Date.now(), LOGIN_MAX_ATTEMPTS, LOGIN_LOCKOUT_MS);
  }

  // ── Success — clear attempts ──
  clearAttempts(loginAttempts, attemptKey);

  // Auto-upgrade legacy password hashes to argon2id
  if (!String(user.passwordHash || "").startsWith("$argon2")) {
    user.passwordHash = await hashPassword(password);
    setUsers(users);
  }

  return { ok: true, user };
}

async function changePassword({ userId, currentPassword, newPassword }) {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId || !isPasswordLengthAllowed(newPassword, 4)) {
    return { ok: false, error: "invalid_input" };
  }

  const users = getUsers();
  const user = users.find((item) => item.id === cleanUserId);
  if (!user) {
    return { ok: false, error: "user_missing" };
  }

  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) {
    return { ok: false, error: "invalid_current_password" };
  }

  user.passwordHash = await hashPassword(newPassword);
  setUsers(users);
  return { ok: true, user };
}

async function updateOwnProfile({ userId, name, currentPassword, newPassword }) {
  const cleanUserId = String(userId || "").trim();
  const cleanName = String(name || "").trim().slice(0, MAX_USERNAME_LENGTH);
  const wantsPasswordChange = Boolean(newPassword);
  if (!cleanUserId || !cleanName) {
    return { ok: false, error: "invalid_input" };
  }
  if (wantsPasswordChange && !isPasswordLengthAllowed(newPassword, 4)) {
    return { ok: false, error: "invalid_input" };
  }

  const users = getUsers();
  const user = users.find((item) => item.id === cleanUserId);
  if (!user) {
    return { ok: false, error: "user_missing" };
  }

  if (wantsPasswordChange) {
    const ok = await verifyPassword(user.passwordHash, currentPassword);
    if (!ok) {
      return { ok: false, error: "invalid_current_password" };
    }
    user.passwordHash = await hashPassword(newPassword);
  }

  user.name = cleanName;
  setUsers(users);
  return { ok: true, user };
}

function getSupportRateLimitResult(key) {
  return checkRateLimit(supportAttempts, key, Date.now());
}

function registerFailedSupportAttempt(key) {
  return recordFailedSupportAttempt(supportAttempts, key, Date.now(), SUPPORT_MAX_ATTEMPTS, SUPPORT_LOCKOUT_MS);
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
  const supportExpiresMs = parseDateMs(support.expiresAt);
  if (supportExpiresMs === null || new Date().getTime() > supportExpiresMs) {
    return { ok: false, error: "support_code_expired" };
  }

  const users = getUsers();
  const owner = users.find((user) => user.role === "owner");
  if (!owner) return { ok: false, error: "owner_missing" };

  const cleanUsername = normalizeUsername(username || owner.username);
  if (!cleanUsername || !isPasswordLengthAllowed(password, 4)) {
    return { ok: false, error: "invalid_input" };
  }

  owner.username = cleanUsername;
  owner.passwordHash = await hashPassword(password);
  setUsers(users);
  return { ok: true, user: owner };
}

function createWindow() {
  const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
  const devRendererOrigin = (() => {
    if (!isDev) return null;
    try {
      return new URL(process.env.ELECTRON_RENDERER_URL).origin;
    } catch {
      return null;
    }
  })();
  const iconPath = getAppIconPath();
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: "توب جير لغسيل السيارات — Top Gear Car Wash",
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
  const _wcId = win.webContents.id; // capture before destruction
  win.webContents.on("destroyed", () => {
    rendererSessions.delete(_wcId);
  });

  // Backup-on-close: give the renderer a chance to write a backup to the
  // configured folder before the window goes away. A timeout guarantees the
  // app never hangs on quit even if the renderer is unresponsive.
  let closeBackupStarted = false;
  win.on("close", (e) => {
    if (closeBackupStarted) return; // second close → let it through
    e.preventDefault();
    closeBackupStarted = true;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      ipcMain.removeListener("app:close-backup-done", finish);
      if (!win.isDestroyed()) win.destroy();
    };
    ipcMain.once("app:close-backup-done", finish);
    try {
      if (win.webContents.isDestroyed()) { finish(); return; }
      win.webContents.send("app:run-close-backup");
    } catch {
      finish();
      return;
    }
    setTimeout(finish, 6000);
  });

  // SECURITY: Block all navigation away from the app
  win.webContents.on("will-navigate", (event, navigationUrl) => {
    let parsed;
    try {
      parsed = new URL(navigationUrl);
    } catch {
      event.preventDefault();
      return;
    }
    if (isDev && devRendererOrigin && parsed.origin === devRendererOrigin) return;
    if (!isDev && parsed.protocol === "file:") return;
    event.preventDefault();
  });

  const allowedExternalHosts = new Set(["wa.me", "helpers-tech.com", "www.helpers-tech.com"]);
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" && allowedExternalHosts.has(parsed.hostname.toLowerCase())) {
        shell.openExternal(parsed.toString());
      }
    } catch {
      // Deny malformed popups.
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
  if (!/^\/(sales|purchases|quotations)\/[^/]+\/print$/.test(cleanRoute)) {
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
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatCurrency(value, currency) {
  const amount = Number(value || 0);
  return `${new Intl.NumberFormat("ar-EG-u-nu-latn", {
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

function sanitizeImageSrc(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(raw)) {
    return raw;
  }
  if (/^\.\/[a-z0-9._/%-]+$/i.test(raw) && !raw.includes("..")) {
    return raw;
  }
  return "";
}

/**
 * Print windows load via `data:text/html,...` — a relative logo path like
 * "./helpers_tech_logo.png" has no base URL to resolve against there, so it
 * shows as a broken image. Inline it as base64 instead. Already-uploaded logos
 * (stored as data: URIs from Settings) pass through sanitizeImageSrc unchanged.
 */
function resolveLogoDataUri(value) {
  const safe = sanitizeImageSrc(value);
  if (!safe) return "";
  if (safe.startsWith("data:")) return safe;

  const relative = safe.replace(/^\.\//, "");
  const candidates = [
    path.join(__dirname, "..", "dist", relative),
    path.join(__dirname, "..", "public", relative),
  ];
  for (const candidate of candidates) {
    try {
      const buffer = fs.readFileSync(candidate);
      const ext = path.extname(candidate).slice(1).toLowerCase();
      const mime = ext === "jpg" ? "jpeg" : ext || "png";
      return `data:image/${mime};base64,${buffer.toString("base64")}`;
    } catch {
      // try next candidate
    }
  }
  return "";
}

/** Keep only the newest N `helpers-backup-*.json` files in a folder; delete older ones. */
const MAX_BACKUP_FILES = 30;
function pruneOldBackups(dir, keep = MAX_BACKUP_FILES) {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((name) => /^helpers-backup-.*\.json$/i.test(name))
      .map((name) => {
        const full = path.join(dir, name);
        let mtime = 0;
        try { mtime = fs.statSync(full).mtimeMs; } catch { /* ignore */ }
        return { full, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime); // newest first
    for (const file of files.slice(keep)) {
      try { fs.unlinkSync(file.full); } catch { /* ignore individual failures */ }
    }
  } catch {
    // pruning is best-effort — never let it break a successful backup write
  }
}

let cachedCairoFontFaceCss = null;

/**
 * Inlines the Cairo font (Arabic + Latin subsets, regular + bold) as base64
 * @font-face rules so print windows — which load via `data:text/html,...` and
 * so can't reach the app's own bundled font files — still render the invoice
 * in Cairo instead of falling back to whatever sans-serif the OS has.
 * Computed once and cached; returns "" (silent fallback) if the font package
 * isn't present for any reason.
 */
function loadCairoFontFaceCss() {
  if (cachedCairoFontFaceCss !== null) return cachedCairoFontFaceCss;
  try {
    const cairoDir = path.join(__dirname, "..", "node_modules", "@fontsource", "cairo");
    const css = ["400.css", "700.css"]
      .map((file) => fs.readFileSync(path.join(cairoDir, file), "utf8"))
      .join("\n")
      // Drop the .woff fallback src — Electron's bundled Chromium always
      // supports woff2 — then inline the woff2 file as base64.
      .replace(/,\s*url\(\.\/files\/[^)]+\.woff\)\s*format\('woff'\)/g, "")
      .replace(/url\(\.\/files\/([^)]+\.woff2)\)/g, (match, fileName) => {
        try {
          const buffer = fs.readFileSync(path.join(cairoDir, "files", fileName));
          return `url(data:font/woff2;base64,${buffer.toString("base64")})`;
        } catch {
          return match;
        }
      });
    cachedCairoFontFaceCss = css;
  } catch {
    cachedCairoFontFaceCss = "";
  }
  return cachedCairoFontFaceCss;
}

function ensurePdfExtension(filePath) {
  return filePath.toLowerCase().endsWith(".pdf") ? filePath : `${filePath}.pdf`;
}

function getInvoicePrintMeta(route) {
  const { kind, invoice } = getInvoiceForPrint(route);
  const title = kind === "sales" ? "فاتورة مبيعات" : kind === "quotation" ? "عرض سعر" : "فاتورة مشتريات";
  const docNumber = invoice.invoiceNumber || invoice.quotationNumber || invoice.id || "doc";
  const datePart = invoice.date ? `-${invoice.date}` : "";
  return {
    windowTitle: `${title} ${docNumber}`,
    fileBaseName: sanitizeFileName(`${title}-${docNumber}${datePart}`),
  };
}

function printDeviceName(settings) {
  const name = String(settings.printerName || "").trim();
  return name ? name : undefined;
}

function receiptPageSize(settings) {
  const widthMm = Math.min(110, Math.max(58, Number(settings.receiptWidthMm) || 80));
  return { width: Math.round(widthMm * 1000), height: 220000 };
}

function getInvoicePrintOptions(documentName = "") {
  const settings = getPrintSettings();
  const isReceipt = /^(?:test|receipt)-80mm/.test(String(documentName));
  return {
    silent: false,
    printBackground: true,
    landscape: false,
    ...(printDeviceName(settings) ? { deviceName: printDeviceName(settings) } : {}),
    pageSize: isReceipt ? receiptPageSize(settings) : settings.printPaperSize || "A4",
    margins: { marginType: isReceipt ? "none" : "default" },
  };
}

function getInvoicePdfOptions(documentName = "") {
  const settings = getPrintSettings();
  const isReceipt = /^(?:test|receipt)-80mm/.test(String(documentName));
  return {
    printBackground: true,
    landscape: false,
    pageSize: isReceipt ? receiptPageSize(settings) : settings.printPaperSize || "A4",
    margins: { marginType: isReceipt ? "none" : "default" },
    // "@page { size: Xmm auto }" (used for the 80mm receipts) isn't a valid CSS
    // page-size value — auto can't be mixed with a fixed length — so letting
    // Chromium prefer it here made printToPDF fall back to a blank page.
    // The explicit pageSize above is always correct, so always use it.
    preferCSSPageSize: false,
  };
}

function getPrintSettings() {
  return readJsonKey(`${STORE_PREFIX}settings`, {
    companyName: "Helpers Technology",
    companyNameAr: "شركة هيلبيرز تيكنولوجي",
    invoiceFooter: "",
    currency: "EGP",
    pricingMode: "variable",
    printerName: "",
    receiptWidthMm: 80,
    printPaperSize: "A4",
    lowStockAlertWindowDays: 7,
    timezone: "Africa/Cairo",
    arabicLabels: true,
    logoText: "HT",
    logoImage: "./helpers_tech_logo.png",
    invoicesSavePath: "",
  });
}

function getInvoiceForPrint(route) {
  const cleanRoute = normalizePrintRoute(route);
  const match = cleanRoute.match(/^\/(sales|purchases|quotations)\/([^/]+)\/print$/);
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
  if (section === "quotations") {
    const quotations = readJsonKey(`${STORE_PREFIX}quotations`, []);
    const invoice = Array.isArray(quotations) ? quotations.find((item) => item.id === id) : null;
    if (!invoice) throw new Error("quotation_not_found");
    return { kind: "quotation", invoice };
  }

  const invoices = readJsonKey(`${STORE_PREFIX}purchaseInvoices`, []);
  const invoice = Array.isArray(invoices) ? invoices.find((item) => item.id === id) : null;
  if (!invoice) throw new Error("purchase_invoice_not_found");
  return { kind: "purchase", invoice };
}

function buildQuotationPrintHtml(quot, settings) {
  const companyName = settings.arabicLabels ? settings.companyNameAr : settings.companyName;
  const logoImage = sanitizeImageSrc(settings.logoImage);
  const logo = logoImage
    ? `<img src="${escapeHtml(logoImage)}" alt="Logo" />`
    : escapeHtml(settings.logoText || "HT");
  const discount = Number(quot.discount) || 0;
  const subtotal = (quot.lines || []).reduce((a, l) => a + (l.subtotal || 0), 0);

  const rows = (quot.lines || []).map((l, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td>${escapeHtml(l.productName)}</td>
      <td class="center">${escapeHtml(l.unit)}</td>
      <td class="center mono">${escapeHtml(String(l.quantity))}</td>
      <td class="center mono">${escapeHtml(formatCurrency(l.price, settings.currency))}</td>
      <td class="center mono bold">${escapeHtml(formatCurrency(l.subtotal, settings.currency))}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: file:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none';" />
  <title>عرض سعر ${escapeHtml(quot.quotationNumber)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin:0; background:white; color:#172033; font-family:Tahoma,Arial,sans-serif; font-size:12px; direction:rtl; }
    .print-toolbar { position:sticky; top:0; z-index:10; display:flex; align-items:center; justify-content:flex-start; gap:8px; padding:10px 14px; background:#241f62; color:white; box-shadow:0 2px 10px rgba(15,23,42,.18); }
    .print-toolbar button { border:0; border-radius:6px; padding:8px 14px; background:white; color:#241f62; font-family:inherit; font-weight:700; cursor:pointer; }
    .print-toolbar .secondary { background:rgba(255,255,255,.14); color:white; border:1px solid rgba(255,255,255,.32); }
    .print-status { min-width:150px; color:rgba(255,255,255,.82); font-size:11px; }
    .page { width:210mm; min-height:297mm; margin:0 auto; padding:12mm; }
    .header { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; border-bottom:1px solid #d6dee8; padding-bottom:16px; margin-bottom:16px; }
    .brand { display:flex; align-items:center; gap:10px; }
    .logo { width:56px; height:56px; border-radius:12px; background:#241f62; color:white; display:grid; place-items:center; font-weight:700; font-size:18px; overflow:hidden; }
    .logo img { width:100%; height:100%; object-fit:cover; }
    .company { font-size:19px; font-weight:700; }
    .title { text-align:left; }
    .title h1 { margin:0 0 8px; font-size:25px; color:#241f62; }
    .muted { color:#667085; }
    .mono { font-family:Consolas,"Courier New",monospace; direction:ltr; }
    .bold { font-weight:700; }
    .cards { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; }
    .card { border:1px solid #e2e8f0; background:#f8fafc; border-radius:8px; padding:10px; }
    .label { color:#667085; font-size:11px; margin-bottom:5px; }
    .value { font-weight:700; font-size:14px; }
    table { width:100%; border-collapse:collapse; margin-bottom:16px; }
    th { background:#eef2f7; color:#334155; font-weight:700; }
    th, td { border:1px solid #d6dee8; padding:7px; vertical-align:top; }
    .center { text-align:center; }
    .totals { display:flex; justify-content:flex-start; margin-bottom:16px; }
    .totals-box { width:280px; }
    .total-row { display:flex; align-items:center; justify-content:space-between; padding:5px 0; border-bottom:1px solid #edf2f7; }
    .total-row.final { border-top:1px solid #94a3b8; border-bottom:0; margin-top:4px; padding-top:8px; font-size:16px; font-weight:700; }
    .discount-row { color:#16a34a; }
    .notes { border-top:1px solid #e2e8f0; padding-top:9px; margin-bottom:18px; color:#475569; }
    .footer { border-top:1px solid #e2e8f0; padding-top:12px; text-align:center; color:#667085; white-space:pre-line; margin-bottom:26px; }
    .developer-info { margin-top:30px; padding-top:10px; border-top:1px solid #e2e8f0; text-align:center; color:#94a3b8; font-size:10px; }
    @media print { .print-toolbar { display:none; } .page { width:100%; min-height:auto; padding:0; } }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <button type="button" id="print-now-button">طباعة</button>
    <button type="button" id="save-pdf-button">حفظ PDF</button>
    <button type="button" class="secondary" id="close-window-button">إغلاق</button>
    <span id="print-status" class="print-status"></span>
  </div>
  <div class="page">
    <div class="header">
      <div class="brand">
        <div class="logo">${logo}</div>
        <div>
          <div class="company">${escapeHtml(companyName)}</div>
          <div class="muted" style="margin-top:3px">${escapeHtml(settings.companyName || "")}</div>
        </div>
      </div>
      <div class="title">
        <h1>عرض سعر</h1>
        <div class="muted">رقم: <span class="mono bold">${escapeHtml(quot.quotationNumber)}</span></div>
        <div class="muted">التاريخ: ${formatDate(quot.date)}</div>
        ${quot.validUntil ? `<div class="muted">صالح حتى: ${formatDate(quot.validUntil)}</div>` : ""}
      </div>
    </div>

    <div class="cards">
      <div class="card">
        <div class="label">العميل</div>
        <div class="value">${escapeHtml(quot.customerName)}</div>
      </div>
      <div class="card">
        <div class="label">الحالة</div>
        <div class="value">${quot.status === "converted" ? "محولة لفاتورة" : "مفتوحة"}</div>
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
        ${discount > 0 ? `
        <div class="total-row"><span>الإجمالي قبل الخصم</span><span class="mono">${escapeHtml(formatCurrency(subtotal, settings.currency))}</span></div>
        <div class="total-row discount-row"><span>خصم</span><span class="mono">- ${escapeHtml(formatCurrency(discount, settings.currency))}</span></div>
        <div class="total-row final"><span>الإجمالي</span><span class="mono">${escapeHtml(formatCurrency(quot.total, settings.currency))}</span></div>
        ` : `<div class="total-row final"><span>الإجمالي</span><span class="mono">${escapeHtml(formatCurrency(quot.total, settings.currency))}</span></div>`}
      </div>
    </div>

    ${quot.notes ? `<div class="notes"><strong>ملاحظات: </strong>${escapeHtml(quot.notes)}</div>` : ""}
    <div class="footer">${escapeHtml(settings.invoiceFooter || "")}</div>
    <div class="developer-info">هيلبيرز تكنولوجي</div>
  </div>
</body>
</html>`;
}

/** Small inline WhatsApp glyph for the mandatory developer-credit footer line. */
const WHATSAPP_ICON_SVG = `<svg class="wa-icon" viewBox="0 0 32 32" width="12" height="12" aria-hidden="true"><path fill="#25D366" d="M16.001 3C9.373 3 4 8.373 4 15c0 2.386.697 4.61 1.902 6.484L4 29l7.72-1.874A11.94 11.94 0 0 0 16.001 27C22.628 27 28 21.627 28 15S22.628 3 16.001 3zm6.964 16.845c-.29.816-1.435 1.5-2.303 1.68-.61.129-1.409.232-4.09-.874-3.436-1.42-5.653-4.892-5.826-5.12-.168-.228-1.386-1.846-1.386-3.523 0-1.677.879-2.5 1.19-2.842.31-.343.68-.428.907-.428.227 0 .454.002.652.012.209.01.49-.079.767.585.29.696 1.001 2.4 1.089 2.575.088.175.147.38.03.61-.117.228-.176.37-.35.57-.176.2-.37.446-.53.6-.176.17-.36.354-.155.696.206.343.916 1.51 1.966 2.446 1.351 1.204 2.49 1.577 2.836 1.755.348.176.552.15.756-.09.205-.242.878-1.024 1.113-1.375.235-.35.469-.29.79-.174.322.117 2.041.964 2.392 1.138.352.174.586.262.673.407.088.145.088.837-.202 1.667z"/></svg>`;

/**
 * Builds an 80mm thermal-receipt for a car-wash sales/product invoice — the
 * format a wash actually hands the customer, instead of the A4 office invoice.
 * Mirrors the on-screen receipt in src/lib/print.ts (printServiceInvoice).
 */
function buildInvoiceReceiptHtml(invoice, settings) {
  const widthMm = Math.min(110, Math.max(58, Number(settings.receiptWidthMm) || 80));
  const companyName = settings.arabicLabels ? settings.companyNameAr : settings.companyName;
  const currency = settings.currency;
  const logoImage = resolveLogoDataUri(settings.logoImage);
  const logoBlock = logoImage
    ? `<img src="${logoImage}" alt="Logo" class="receipt-logo" />`
    : "";
  const cairoFontFaceCss = loadCairoFontFaceCss();
  const isProduct = invoice.invoiceKind === "product";
  const documentTitle = isProduct ? "فاتورة منتجات" : "فاتورة غسيل سيارات";
  const isCash = invoice.paymentType === "cash";

  const money = (value) => escapeHtml(formatCurrency(value, currency));
  const lineSubtotal = (l) =>
    l.subtotal != null ? Number(l.subtotal) : (Number(l.price) || 0) * (Number(l.quantity) || 0);

  const formatReceiptDateTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "short", timeStyle: "short" }).format(date);
  };

  // Service invoices list only the wash services; product invoices list all lines.
  const allLines = Array.isArray(invoice.lines) ? invoice.lines : [];
  const serviceLines = allLines.filter((l) => l.kind === "service");
  const displayLines = isProduct ? allLines : serviceLines.length ? serviceLines : allLines;

  const lineRows = displayLines
    .map(
      (l) => `
      <tr>
        <td>${escapeHtml(l.productName)}</td>
        <td class="center">${escapeHtml(l.quantity)}</td>
        <td class="ltr">${money(l.price)}</td>
        <td class="ltr">${money(lineSubtotal(l))}</td>
      </tr>`
    )
    .join("");

  const discount = Number(invoice.discount) || 0;
  const subtotalBeforeDiscount = allLines.reduce((s, l) => s + lineSubtotal(l), 0);
  const subtotalRow = discount > 0
    ? `<div class="row muted small"><span>المجموع قبل الخصم</span><span class="ltr">${money(subtotalBeforeDiscount)}</span></div>`
    : "";
  const discountRow = discount > 0
    ? `<div class="row"><span>الخصم</span><span class="ltr">(${money(discount)})</span></div>`
    : "";

  const remaining = invoice.remaining != null
    ? Number(invoice.remaining)
    : Math.max(0, (Number(invoice.total) || 0) - (Number(invoice.amountReceived) || 0));
  // If the customer handed over more than the total, cashTendered preserves
  // the real amount they paid so the receipt can still show it and the change
  // given back — amountReceived alone is capped at the total for accounting.
  const cashTendered = Number(invoice.cashTendered) || 0;
  const changeGiven = cashTendered > invoice.total ? cashTendered - invoice.total : 0;
  const amountPaidForDisplay = cashTendered > 0 ? cashTendered : invoice.amountReceived;
  const paidRow = isCash
    ? `<div class="row"><span>المدفوع (نقدي)</span><span class="ltr">${money(amountPaidForDisplay)}</span></div>`
    : `<div class="row"><span>آجل (حساب)</span><span class="ltr">${money(invoice.total)}</span></div>
       ${Number(invoice.amountReceived) > 0 ? `<div class="row"><span>مقدم</span><span class="ltr">${money(invoice.amountReceived)}</span></div>` : ""}`;
  const changeRow = changeGiven > 0
    ? `<div class="row change"><span>الباقي</span><span class="ltr">${money(changeGiven)}</span></div>`
    : "";
  const remainingRow = remaining > 0
    ? `<div class="row warn"><span>المتبقي</span><span class="ltr">${money(remaining)}</span></div>`
    : "";

  const footerText = String(settings.invoiceFooter || "").trim();

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'; img-src data:; font-src data:;" />
  <title>${escapeHtml(documentTitle)} ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    ${cairoFontFaceCss}
    @page { size: ${widthMm}mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f1f5f9; color: #111827; font-family: 'Cairo', Tahoma, Arial, sans-serif; direction: rtl; }
    .print-toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 10px 14px; background: #241f62; color: white; box-shadow: 0 2px 10px rgba(15,23,42,.18); }
    .print-toolbar button { border: 0; border-radius: 6px; padding: 8px 14px; background: white; color: #241f62; font-family: inherit; font-weight: 700; cursor: pointer; }
    .print-toolbar .secondary { background: rgba(255,255,255,.14); color: white; border: 1px solid rgba(255,255,255,.32); }
    .print-status { min-width: 150px; color: rgba(255,255,255,.82); font-size: 11px; }
    .receipt { width: max(${widthMm}mm, 340px); margin: 18px auto; padding: 4mm; background: white; box-shadow: 0 10px 28px rgba(15,23,42,.16); font-size: 11px; line-height: 1.55; }
    .center { text-align: center; }
    .ltr { direction: ltr; text-align: left; }
    .receipt-logo { display: block; max-width: 70%; max-height: 64px; margin: 0 auto 6px; object-fit: contain; }
    .brand { font-size: 16px; font-weight: 800; }
    .inv-no { font-size: 20px; font-weight: 900; margin: 4px 0; }
    .muted { color: #4b5563; }
    .small { font-size: 10px; }
    .row { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px solid #e5e7eb; padding: 3px 0; }
    .row.warn { color: #b45309; font-weight: 700; }
    .row.change { color: #047857; font-weight: 700; }
    .row-pair { display: flex; gap: 8px; border-bottom: 1px solid #e5e7eb; padding: 3px 0; }
    .pair-col { flex: 1; min-width: 0; }
    .pair-col:not(:first-child) { border-inline-start: 1px dashed #e5e7eb; padding-inline-start: 8px; }
    .divider { border-top: 1px dashed #111827; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #f1f5f9; padding: 2px 4px; border-bottom: 1px solid #e5e7eb; }
    td { padding: 2px 4px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .total-row { font-size: 14px; font-weight: 800; display: flex; justify-content: space-between; padding: 5px 0; }
    .foot { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #111827; text-align: center; }
    .dev-credit { margin-top: 4px; padding-top: 4px; text-align: center; font-size: 9.5px; color: #6b7280; }
    .dev-credit .wa-icon { vertical-align: middle; margin: 0 2px; }
    .dev-phones { font-weight: 600; }
    @media print { body { background: white; } .print-toolbar { display: none; } .receipt { margin: 0; box-shadow: none; width: auto; } }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <button type="button" id="print-now-button">طباعة</button>
    <button type="button" id="save-pdf-button">حفظ PDF</button>
    <button type="button" class="secondary" id="close-window-button">إغلاق</button>
    <span id="print-status" class="print-status"></span>
  </div>
  <main class="receipt">
    <div class="center">
      ${logoBlock}
      <div class="brand">${escapeHtml(companyName || "Top Gear Car Wash")}</div>
      <div class="inv-no">#${escapeHtml(invoice.invoiceNumber)}</div>
      <div class="muted small">${escapeHtml(formatReceiptDateTime(invoice.finalizedAt || invoice.date))}</div>
    </div>
    <div class="divider"></div>
    <div class="row"><span>العميل</span><strong>${escapeHtml(invoice.customerName)}</strong></div>
    ${invoice.vehicleLabel ? `<div class="row"><span>السيارة</span><strong>${escapeHtml(invoice.vehicleLabel)}</strong></div>` : ""}
    ${invoice.driverName ? `<div class="row"><span>السائق</span><strong>${escapeHtml(invoice.driverName)}</strong></div>` : ""}
    <div class="divider"></div>
    <table>
      <thead>
        <tr><th>${isProduct ? "الصنف" : "الخدمة"}</th><th>ك</th><th>سعر</th><th>إجمالي</th></tr>
      </thead>
      <tbody>${lineRows || `<tr><td colspan="4" class="center muted">لا توجد بنود</td></tr>`}</tbody>
    </table>
    <div class="divider"></div>
    ${subtotalRow}
    ${discountRow}
    <div class="total-row"><span>الإجمالي</span><span class="ltr">${money(invoice.total)}</span></div>
    <div class="divider"></div>
    ${paidRow}
    ${changeRow}
    ${remainingRow}
    ${invoice.notes ? `<div class="muted small" style="margin-top:4px">ملاحظة: ${escapeHtml(invoice.notes)}</div>` : ""}
    <div class="foot muted small">${footerText ? escapeHtml(footerText) : "شكراً لاختياركم — احتفظ بهذه الفاتورة"}</div>
    <div class="dev-credit">
      <span>تطوير وتنفيذ شركة هيلبيرز تكنولوجيز</span>
      <span class="ltr dev-phones">01080001249 | 01118445625</span>
      ${WHATSAPP_ICON_SVG}
    </div>
  </main>
</body>
</html>`;
}

function buildInvoicePrintHtml(route) {
  const { kind, invoice } = getInvoiceForPrint(route);
  const settings = getPrintSettings();
  if (kind === "quotation") return buildQuotationPrintHtml(invoice, settings);
  const isSales = kind === "sales";
  const title = isSales ? "فاتورة مبيعات" : "فاتورة مشتريات";
  const partyLabel = isSales ? "العميل" : "المورد";
  const partyName = isSales ? invoice.customerName : invoice.supplierName;
  const amountPaid = isSales ? invoice.amountReceived : invoice.amountPaid;



  const returnsKey = isSales ? `${STORE_PREFIX}salesReturns` : `${STORE_PREFIX}purchaseReturns`;
  const allReturns = readJsonKey(returnsKey, []);
  const invoiceReturns = Array.isArray(allReturns)
    ? allReturns.filter((r) => r.originalInvoiceId === invoice.id)
    : [];
  const allReturnLines = invoiceReturns.flatMap((r) => r.lines || []);
  const returnsTotal = invoiceReturns.reduce((a, r) => a + (r.total || 0), 0);

  const paymentMethodLabels = { cash: "نقدي", bank: "تحويل بنكي", vodafone: "فودافون كاش", instapay: "انستاباي", other: "أخرى" };
  const paymentLog = Array.isArray(invoice.paymentLog) ? invoice.paymentLog : [];
  const discount = Number(invoice.discount) || 0;
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
  const logoImage = sanitizeImageSrc(settings.logoImage);
  const logo = logoImage
    ? `<img src="${escapeHtml(logoImage)}" alt="Logo" />`
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

  const returnRows = allReturnLines
    .map(
      (line, idx) => `
        <tr style="background:${idx % 2 === 1 ? "#fff5f5" : "#ffffff"}">
          <td class="center">${idx + 1}</td>
          <td>${escapeHtml(line.productName)}</td>
          <td class="center">${escapeHtml(line.unit)}</td>
          <td class="center mono">${escapeHtml(String(line.quantity))}</td>
          <td class="center mono">${escapeHtml(formatCurrency(line.price, settings.currency))}</td>
          <td class="center mono bold">${escapeHtml(formatCurrency(line.subtotal, settings.currency))}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: file:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none';" />
  <title>${escapeHtml(title)} ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
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
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 12mm;
    }
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
    .customer-balance {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 14px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 16px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .customer-balance.credit { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
    .customer-balance.debit { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }
    .customer-balance.settled { background: #f8fafc; border: 1px solid #e2e8f0; color: #334155; }
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
    .developer-info {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #94a3b8;
      font-size: 10px;
    }
    .returns-section { margin-bottom: 16px; }
    .returns-title {
      font-weight: 700;
      color: #dc2626;
      border-bottom: 1.5px solid #dc2626;
      padding-bottom: 4px;
      margin-bottom: 8px;
      font-size: 12px;
    }
    .returns-total-line {
      text-align: left;
      margin-top: 6px;
      color: #dc2626;
      font-weight: 700;
      font-size: 12px;
    }
    .return-deduction { color: #dc2626; }
    .discount-row { color: #16a34a; }
    .paylog-section { margin-bottom: 16px; }
    .paylog-title {
      font-weight: 700;
      color: #1e3a5f;
      border-bottom: 1.5px solid #1e3a5f;
      padding-bottom: 4px;
      margin-bottom: 8px;
      font-size: 12px;
    }
    .paylog-table th { background: #e8f0fb; color: #1e3a5f; }
    .paid-highlight { color: #15803d; font-weight: 700; }
    @media print {
      .print-toolbar { display: none; }
      .page {
        width: 100%;
        min-height: auto;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <button type="button" id="print-now-button">طباعة</button>
    <button type="button" id="save-pdf-button">حفظ PDF</button>
    <button type="button" class="secondary" id="close-window-button">إغلاق</button>
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

    ${allReturnLines.length > 0 ? `
    <div class="returns-section">
      <div class="returns-title">المرتجعات</div>
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
        <tbody>${returnRows}</tbody>
      </table>
      <div class="returns-total-line">إجمالي المرتجع: ${escapeHtml(formatCurrency(returnsTotal, settings.currency))}</div>
    </div>
    ` : ""}


    <div class="totals">
      <div class="totals-box">
        ${discount > 0 ? `
        <div class="total-row"><span>الإجمالي قبل الخصم</span><span class="mono">${escapeHtml(formatCurrency(invoice.total + discount, settings.currency))}</span></div>
        <div class="total-row discount-row"><span>خصم</span><span class="mono">- ${escapeHtml(formatCurrency(discount, settings.currency))}</span></div>
        <div class="total-row"><span>صافي الفاتورة</span><span class="mono">${escapeHtml(formatCurrency(invoice.total, settings.currency))}</span></div>
        ` : `<div class="total-row"><span>الإجمالي</span><span class="mono">${escapeHtml(formatCurrency(invoice.total, settings.currency))}</span></div>`}
        ${returnsTotal > 0 ? `<div class="total-row return-deduction"><span>خصم المرتجع</span><span class="mono">- ${escapeHtml(formatCurrency(returnsTotal, settings.currency))}</span></div>` : ""}
        ${paymentLog.length > 1
          ? paymentLog.map((e, i) => `<div class="total-row"><span>دفعة ${i + 1} (${escapeHtml(paymentMethodLabels[e.paymentMethod] || e.paymentMethod)})</span><span class="mono paid-highlight">${escapeHtml(formatCurrency(e.amount, settings.currency))}</span></div>`).join("")
          : `<div class="total-row"><span>${isSales ? "تم استلام" : "تم سداد"}</span><span class="mono paid-highlight">${escapeHtml(formatCurrency(amountPaid, settings.currency))}</span></div>`
        }
        ${paymentLog.length > 1 ? `<div class="total-row"><span>إجمالي ما تم سداده</span><span class="mono paid-highlight">${escapeHtml(formatCurrency(amountPaid, settings.currency))}</span></div>` : ""}
        <div class="total-row final"><span>المتبقي</span><span class="mono">${escapeHtml(formatCurrency(invoice.remaining, settings.currency))}</span></div>
      </div>
    </div>


    ${invoice.notes ? `<div class="notes"><strong>ملاحظات: </strong>${escapeHtml(invoice.notes)}</div>` : ""}
    <div class="footer">${escapeHtml(settings.invoiceFooter || "")}</div>
    <div class="developer-info">
      هيلبيرز تكنولوجي
    </div>
  </div>
</body>
</html>`;
}

function buildIntakeTicketHtml(payload, settings) {
  const ticket = payload && typeof payload.ticket === "object" ? payload.ticket : {};
  const widthMm = Math.min(110, Math.max(58, Number(settings.receiptWidthMm) || 80));
  const companyName = settings.arabicLabels ? settings.companyNameAr : settings.companyName;
  const ticketNumber = String(ticket.number ?? "-").slice(0, 30);
  const carsAhead = Math.max(0, Math.floor(Number(payload?.carsAhead) || 0));
  const services = Array.isArray(payload?.services) ? payload.services.slice(0, 30) : [];
  const serviceRows = services.length
    ? services.map((name) => `<li>${escapeHtml(String(name).slice(0, 160))}</li>`).join("")
    : "<li>غير محدد</li>";
  const formatDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "short", timeStyle: "short" }).format(date);
  };
  const damageAreas = Array.isArray(ticket.damageAreas)
    ? ticket.damageAreas.slice(0, 30).map((area) => escapeHtml(String(area).slice(0, 100))).join("، ")
    : "";
  const condition = String(ticket.conditionNotes || "").slice(0, 1000);
  const conditionBlock = damageAreas || condition
    ? `<div class="footer"><strong>حالة السيارة عند الاستلام:</strong>${damageAreas ? `<br>أماكن بها ملاحظات: ${damageAreas}` : ""}${condition ? `<br>${escapeHtml(condition)}` : ""}</div>`
    : "";
  const note = String(ticket.note || "").slice(0, 1000);

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none';" />
  <title>تذكرة استقبال #${escapeHtml(ticketNumber)}</title>
  <style>
    @page { size: ${widthMm}mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f1f5f9; color: #111827; font-family: Tahoma, Arial, sans-serif; direction: rtl; }
    .print-toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 10px 14px; background: #241f62; color: white; box-shadow: 0 2px 10px rgba(15,23,42,.18); }
    .print-toolbar button { border: 0; border-radius: 6px; padding: 8px 14px; background: white; color: #241f62; font-family: inherit; font-weight: 700; cursor: pointer; }
    .print-toolbar .secondary { background: rgba(255,255,255,.14); color: white; border: 1px solid rgba(255,255,255,.32); }
    .print-status { min-width: 150px; color: rgba(255,255,255,.82); font-size: 11px; }
    .receipt { width: ${widthMm}mm; margin: 18px auto; padding: 4mm; background: white; box-shadow: 0 10px 28px rgba(15,23,42,.16); font-size: 11px; line-height: 1.55; }
    .center { text-align: center; }
    .brand { font-size: 16px; font-weight: 800; }
    .muted { color: #4b5563; }
    .ticket { font-size: 28px; font-weight: 900; border: 1px dashed #111827; padding: 6px; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px solid #e5e7eb; padding: 3px 0; }
    ul { margin: 4px 0 0; padding: 0 14px 0 0; }
    .footer { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #111827; }
    @media print { body { background: white; } .print-toolbar { display: none; } .receipt { margin: 0; box-shadow: none; } }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <button type="button" id="print-now-button">طباعة</button>
    <button type="button" id="save-pdf-button">حفظ PDF</button>
    <button type="button" class="secondary" id="close-window-button">إغلاق</button>
    <span id="print-status" class="print-status"></span>
  </div>
  <main class="receipt">
    <div class="center">
      <div class="brand">${escapeHtml(companyName || "Top Gear Car Wash")}</div>
      <div class="muted">تذكرة استقبال غسيل</div>
      <div class="ticket">#${escapeHtml(ticketNumber)}</div>
    </div>
    <div class="row"><span>الاستلام المتوقع</span><strong>${escapeHtml(formatDateTime(ticket.requestedPickupAt))}</strong></div>
    <div class="row"><span>سيارات قبلك</span><strong>${carsAhead}</strong></div>
    <div><strong>الخدمات</strong><ul>${serviceRows}</ul></div>
    ${note ? `<div class="footer"><strong>ملاحظة:</strong> ${escapeHtml(note)}</div>` : ""}
    ${conditionBlock}
    <div class="center footer muted">احتفظ بهذه التذكرة حتى الاستلام</div>
  </main>
</body>
</html>`;
}

function buildTestReceiptHtml(settings) {
  const companyName = settings.arabicLabels ? settings.companyNameAr : settings.companyName;
  const widthMm = Math.min(110, Math.max(58, Number(settings.receiptWidthMm) || 80));
  const now = new Date();
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none';" />
  <title>اختبار طباعة 80mm</title>
  <style>
    @page { size: ${widthMm}mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f1f5f9; color: #111827; font-family: Tahoma, Arial, sans-serif; direction: rtl; }
    .print-toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 10px 14px; background: #241f62; color: white; box-shadow: 0 2px 10px rgba(15,23,42,.18); }
    .print-toolbar button { border: 0; border-radius: 6px; padding: 8px 14px; background: white; color: #241f62; font-family: inherit; font-weight: 700; cursor: pointer; }
    .print-toolbar .secondary { background: rgba(255,255,255,.14); color: white; border: 1px solid rgba(255,255,255,.32); }
    .print-status { min-width: 150px; color: rgba(255,255,255,.82); font-size: 11px; }
    .receipt { width: ${widthMm}mm; margin: 18px auto; padding: 4mm; background: white; box-shadow: 0 10px 28px rgba(15,23,42,.16); font-size: 12px; line-height: 1.45; }
    .center { text-align: center; }
    .brand { font-weight: 800; font-size: 16px; }
    .muted { color: #64748b; font-size: 10px; }
    .row { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dashed #cbd5e1; padding: 5px 0; }
    .total { font-weight: 800; font-size: 14px; border-bottom: 0; border-top: 1px solid #111827; margin-top: 4px; }
    .barcode { letter-spacing: 2px; font-family: Consolas, monospace; font-size: 18px; margin: 8px 0 2px; }
    @media print { body { background: white; } .print-toolbar { display: none; } .receipt { margin: 0; box-shadow: none; } }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <button type="button" id="print-now-button">طباعة</button>
    <button type="button" id="save-pdf-button">حفظ PDF</button>
    <button type="button" class="secondary" id="close-window-button">إغلاق</button>
    <span id="print-status" class="print-status"></span>
  </div>
  <main class="receipt">
    <div class="center">
      <div class="brand">${escapeHtml(companyName || "Top Gear Car Wash")}</div>
      <div class="muted">اختبار طباعة إيصال ${widthMm}mm</div>
      <div class="muted">${escapeHtml(now.toLocaleString("ar-EG"))}</div>
    </div>
    <div class="row"><span>غسيل خارجي</span><strong>120.00</strong></div>
    <div class="row"><span>إضافة معطر</span><strong>30.00</strong></div>
    <div class="row"><span>خصم اختبار</span><strong>-10.00</strong></div>
    <div class="row total"><span>الإجمالي</span><strong>140.00 ${escapeHtml(settings.currency || "EGP")}</strong></div>
    <div class="center">
      <div class="barcode">*123456789*</div>
      <div class="muted">إذا ظهر هذا الإيصال بعرض صحيح فالطابعة جاهزة.</div>
    </div>
  </main>
</body>
</html>`;
}

function openPrintHtml({ html, windowTitle, fileBaseName }) {
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
      printWindow = new BrowserWindow({
        width: 900,
        height: 1100,
        show: true,
        autoHideMenuBar: true,
        title: windowTitle,
        icon: getAppIconPath(),
        webPreferences: {
          preload: path.join(__dirname, "print-preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          devTools: isDev,
          webSecurity: true,
          allowRunningInsecureContent: false,
        },
      });
      const webContentsId = printWindow.webContents.id;
      printDocumentNames.set(webContentsId, fileBaseName);
      printWindow.webContents.on("will-navigate", (event) => {
        event.preventDefault();
      });
      printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
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

function printRoute(route) {
  const { kind, invoice } = getInvoiceForPrint(route);
  // Car-wash sales/product invoices print as an 80mm thermal receipt.
  if (kind === "sales") {
    const settings = getPrintSettings();
    const docNumber = String(invoice.invoiceNumber || invoice.id || "invoice").slice(0, 40);
    return openPrintHtml({
      html: buildInvoiceReceiptHtml(invoice, settings),
      windowTitle: `فاتورة ${docNumber}`,
      fileBaseName: sanitizeFileName(`receipt-80mm-invoice-${docNumber}`),
    });
  }
  const meta = getInvoicePrintMeta(route);
  return openPrintHtml({
    html: buildInvoicePrintHtml(route),
    windowTitle: meta.windowTitle,
    fileBaseName: meta.fileBaseName,
  });
}

function printTestReceipt() {
  const settings = getPrintSettings();
  return openPrintHtml({
    html: buildTestReceiptHtml(settings),
    windowTitle: "اختبار طباعة 80mm",
    fileBaseName: "test-80mm-receipt",
  });
}

function printIntakeTicket(payload) {
  const settings = getPrintSettings();
  const ticketNumber = String(payload?.ticket?.number ?? "ticket").slice(0, 30);
  return openPrintHtml({
    html: buildIntakeTicketHtml(payload, settings),
    windowTitle: `تذكرة استقبال #${ticketNumber}`,
    fileBaseName: sanitizeFileName(`receipt-80mm-intake-${ticketNumber}`),
  });
}

function registerIpc() {
  // ── SECURITY: Validate storage keys exposed to the renderer ─────────
  const {
    isRendererStorageKey,
    redactStorageRowForExport,
    storageValueForRenderer,
  } = require("./storage-security.cjs");

  function ownerExistsInStore() {
    return getUsers().some((user) => user.role === "owner");
  }

  function canReadRendererStorage(event) {
    return !ownerExistsInStore() || Boolean(getSession(event));
  }

  function canMutateRendererStorage(event, key) {
    if (!ownerExistsInStore()) return false;
    if (!getSession(event)) return false;
    if (String(key) === `${STORE_PREFIX}users`) return hasOwnerSession(event);
    return true;
  }

  // isRendererStorageKey, redactStorageRowForExport, storageValueForRenderer
  // imported above from ./storage-security.cjs

  function mergeRendererUsersValue(value) {
    const incoming = JSON.parse(String(value));
    if (!Array.isArray(incoming)) throw new Error("invalid_users_payload");
    const existing = getUsers();
    const existingById = new Map(existing.map((user) => [user.id, user]));
    const existingByUsername = new Map(existing.map((user) => [String(user.username).toLowerCase(), user]));

    return JSON.stringify(
      incoming.map((user) => {
        const cleanUsername = normalizeUsername(user?.username);
        if (!cleanUsername) {
          throw new Error("invalid_username");
        }
        const existingUser =
          existingById.get(user?.id) || existingByUsername.get(cleanUsername.toLowerCase());
        const incomingHash = user?.passwordHash;
        const passwordHash =
          incomingHash === REDACTED_PASSWORD_HASH
            ? existingUser?.passwordHash
            : incomingHash;
        if (!isArgonPasswordHash(passwordHash)) {
          throw new Error("invalid_password_hash");
        }
        return {
          ...user,
          name: String(user?.name || cleanUsername).trim(),
          username: cleanUsername,
          passwordHash,
          role: user?.role === "owner" ? "owner" : user?.role === "cashier" ? "cashier" : "employee",
        };
      })
    );
  }

  function normalizeRendererStorageValue(key, value) {
    if (String(key) === `${STORE_PREFIX}users`) return mergeRendererUsersValue(value);
    return String(value);
  }

  ipcMain.on("storage:get", (event, key) => {
    if (!isRendererStorageKey(key) || !canReadRendererStorage(event)) {
      event.returnValue = null;
      return;
    }
    const raw = storageGet(String(key));
    event.returnValue = raw === null ? null : storageValueForRenderer(key, raw);
  });
  ipcMain.handle("storage:set", (event, key, value) => {
    if (!isRendererStorageKey(key) || !canMutateRendererStorage(event, key)) {
      return false;
    }
    try {
      return storageSet(String(key), normalizeRendererStorageValue(key, value));
    } catch {
      return false;
    }
  });
  ipcMain.handle("storage:remove", (event, key) => {
    if (!isRendererStorageKey(key) || !canMutateRendererStorage(event, key)) {
      return false;
    }
    return storageRemove(String(key));
  });
  ipcMain.handle("storage:clear-prefix", (event, prefix) => {
    if (String(prefix) !== STORE_PREFIX || !hasOwnerSession(event)) {
      return false;
    }
    return storageClearPrefix(String(prefix));
  });

  // ── Batch operations — eliminates per-key sync IPC bottleneck ────────
  ipcMain.handle("storage:get-batch", (event) => {
    if (!canReadRendererStorage(event)) return {};
    const rows = openDatabase()
      .prepare("SELECT key, value FROM kv_store WHERE key LIKE ?")
      .all(`${STORE_PREFIX}%`);
    const result = {};
    for (const row of rows) {
      if (!isRendererStorageKey(row.key)) continue;
      result[row.key] = storageValueForRenderer(row.key, row.value);
    }
    return result;
  });

  ipcMain.handle("storage:set-batch", (event, entries) => {
    if (!entries || typeof entries !== "object") return false;
    try {
      const tx = openDatabase().transaction(() => {
        for (const [key, value] of Object.entries(entries)) {
          if (!isRendererStorageKey(key) || !canMutateRendererStorage(event, key)) continue;
          try {
            getStmtSet().run(
              String(key),
              normalizeRendererStorageValue(key, value),
              new Date().toISOString()
            );
          } catch { /* skip invalid individual keys */ }
        }
      });
      tx();
      return true;
    } catch {
      return false;
    }
  });

  // ── Car Wash relational data bridge (Drizzle sqlite-proxy) ────────────
  // The renderer builds typed queries with Drizzle; the generated SQL+params
  // execute here against the encrypted DB. SECURITY: auth/license/kv secrets
  // are NOT reachable through this bridge — protected tables and any DDL are
  // rejected, and better-sqlite3's prepare() blocks stacked statements.
  const PROTECTED_SQL_TABLES = /\b(users|kv_store|__carwash_migrations|sqlite_[a-z0-9_]*)\b/i;
  const ALLOWED_SQL_LEAD = /^\s*(?:select|insert|update|delete|with)\b/i;

  function assertRendererSqlAllowed(sql) {
    const text = String(sql || "");
    if (!ALLOWED_SQL_LEAD.test(text)) throw new Error("sql_statement_not_allowed");
    if (PROTECTED_SQL_TABLES.test(text)) throw new Error("sql_table_protected");
  }

  function runRendererSql(sql, params, method) {
    assertRendererSqlAllowed(sql);
    const stmt = openDatabase().prepare(String(sql));
    const args = Array.isArray(params) ? params : [];
    if (method === "run") {
      stmt.run(...args);
      return { rows: [] };
    }
    if (method === "get") {
      const row = stmt.raw().get(...args);
      return { rows: row ?? [] };
    }
    // 'all' | 'values'
    return { rows: stmt.raw().all(...args) };
  }

  ipcMain.handle("db:query", (event, payload) => {
    if (!canReadRendererStorage(event)) throw new Error("not_authorized");
    const { sql, params, method } = payload || {};
    // Writes require a real authenticated session (not just first-run).
    if (method === "run" && !getSession(event)) throw new Error("not_authorized");
    return runRendererSql(sql, params, method);
  });

  ipcMain.handle("db:batch", (event, queries) => {
    // Atomic multi-statement writes (e.g. finalize invoice) — owner/cashier session required.
    if (!getSession(event)) throw new Error("not_authorized");
    if (!Array.isArray(queries)) return [];
    const tx = openDatabase().transaction((items) =>
      items.map((q) => runRendererSql(q.sql, q.params, q.method))
    );
    return tx(queries);
  });

  // ── Cloud sync (Phase 9) — status/config/manual; engine lives in main ───────
  ipcMain.handle("sync:status", (event) => {
    if (!canReadRendererStorage(event)) throw new Error("not_authorized");
    return getSyncEngine().status();
  });
  ipcMain.handle("sync:get-config", (event) => {
    if (!hasOwnerSession(event)) throw new Error("not_authorized");
    return getSyncEngine().getConfig();
  });
  ipcMain.handle("sync:set-config", (event, cfg) => {
    if (!hasOwnerSession(event)) throw new Error("not_authorized");
    getSyncEngine().setConfig(cfg || {});
    return getSyncEngine().status();
  });
  ipcMain.handle("sync:now", async (event) => {
    if (!hasOwnerSession(event)) throw new Error("not_authorized");
    return getSyncEngine().runSync();
  });

  ipcMain.handle("storage:export", (event) => {
    if (!hasOwnerSession(event)) {
      return { version: 1, timestamp: new Date().toISOString(), rows: [] };
    }
    // SECURITY: Export only renderer-owned app data and redact credential hashes.
    const rows = openDatabase()
      .prepare("SELECT key, value, updated_at FROM kv_store WHERE key LIKE ? ORDER BY key")
      .all(`${STORE_PREFIX}%`)
      .filter((row) => isRendererStorageKey(row.key))
      .map(redactStorageRowForExport);
    return { version: 1, timestamp: new Date().toISOString(), rows };
  });
  ipcMain.handle("storage:import", (event, payload) => {
    if (!hasOwnerSession(event) || !payload || !Array.isArray(payload.rows)) return { ok: false };
    const insert = openDatabase().prepare(
      "INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    );
    const tx = openDatabase().transaction((rows) => {
      for (const row of rows) {
        if (typeof row.key === "string" && typeof row.value === "string") {
          if (!isRendererStorageKey(row.key)) continue;
          insert.run(
            row.key,
            normalizeRendererStorageValue(row.key, row.value),
            row.updated_at || new Date().toISOString()
          );
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
  ipcMain.handle("setup:create-owner", async (event, payload) => {
    const result = await createOwner(payload?.username, payload?.password);
    if (result.ok && result.user) {
      setSession(event, result.user);
      return { ...result, user: safeUserForRenderer(result.user) };
    }
    return result;
  });
  ipcMain.handle("auth:hash-password", (event, password) => {
    if (ownerExistsInStore() && !hasOwnerSession(event)) {
      throw new Error("not_authorized");
    }
    return hashPassword(password);
  });
  ipcMain.handle("auth:login", async (event, payload) => {
    const result = await login(payload?.username, payload?.password);
    if (result.ok && result.user) {
      setSession(event, result.user);
      return { ...result, user: safeUserForRenderer(result.user) };
    }
    return result;
  });
  ipcMain.handle("auth:dev-login", async (event) => {
    let users = getUsers();
    let owner = users.find((u) => u.role === "owner");
    if (!owner) {
      const result = await createOwner("dev", "1234");
      if (result.ok && result.user) {
        owner = result.user;
      } else {
        return { ok: false, error: "could_not_create_dev_owner" };
      }
    }
    setSession(event, owner);
    return { ok: true, user: safeUserForRenderer(owner) };
  });
  ipcMain.handle("auth:logout", (event) => {
    clearSession(event);
    return { ok: true };
  });
  ipcMain.handle("auth:change-password", async (event, payload) => {
    const sessionInfo = getSession(event);
    const targetUserId = String(payload?.userId || "").trim();
    if (!sessionInfo || (sessionInfo.userId !== targetUserId && sessionInfo.role !== "owner")) {
      return { ok: false, error: "not_authorized" };
    }
    const result = await changePassword(payload);
    if (result.ok && result.user) {
      return { ...result, user: safeUserForRenderer(result.user) };
    }
    return result;
  });
  ipcMain.handle("auth:update-profile", async (event, payload) => {
    const sessionInfo = getSession(event);
    const targetUserId = String(payload?.userId || "").trim();
    if (!sessionInfo || (sessionInfo.userId !== targetUserId && sessionInfo.role !== "owner")) {
      return { ok: false, error: "not_authorized" };
    }
    const result = await updateOwnProfile(payload);
    if (result.ok && result.user) {
      return { ...result, user: safeUserForRenderer(result.user) };
    }
    return result;
  });
  ipcMain.handle("support:reset-owner-password", async (event, payload) => {
    const key = String(event.sender.id);
    const rateLimited = getSupportRateLimitResult(key);
    if (rateLimited) return rateLimited;

    const result = await resetOwnerPassword(payload);
    if (result.ok && result.user) {
      supportAttempts.delete(key);
      return { ...result, user: safeUserForRenderer(result.user) };
    }
    if (result.error === "invalid_support_code" || result.error === "machine_mismatch") {
      const nextRateLimit = registerFailedSupportAttempt(key);
      if (nextRateLimit) return nextRateLimit;
    }
    return result;
  });
  ipcMain.handle("print:route", (event, route) => {
    if (!getSession(event)) return { ok: false, error: "not_authenticated" };
    return printRoute(route);
  });
  ipcMain.handle("print:test-receipt", (event) => {
    if (!getSession(event)) return { ok: false, error: "not_authenticated" };
    return printTestReceipt();
  });
  ipcMain.handle("print:intake-ticket", (event, payload) => {
    if (!getSession(event)) return { ok: false, error: "not_authenticated" };
    return printIntakeTicket(payload);
  });
  ipcMain.handle("print:current-window", async (event) => {
    try {
      const documentName = printDocumentNames.get(event.sender.id) || "";
      const printOpts = getInvoicePrintOptions(documentName);
      return new Promise((resolve) => {
        event.sender.print(printOpts, (success, failureReason) => {
          if (success) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: failureReason || "print_failed" });
          }
        });
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "print_failed" };
    }
  });
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
    const documentName = printDocumentNames.get(event.sender.id) || "";
    const pdf = await event.sender.printToPDF(getInvoicePdfOptions(documentName));
    fs.writeFileSync(pdfPath, pdf);
    shell.showItemInFolder(pdfPath);
    return { ok: true, path: pdfPath };
  });
  ipcMain.handle("print:close-current-window", (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    if (ownerWindow && !ownerWindow.isDestroyed()) {
      ownerWindow.close();
      return { ok: true };
    }
    return { ok: false, error: "window_not_found" };
  });

  ipcMain.handle("dialog:select-directory", async (event) => {
    // E2E mode cannot drive a native dialog; return a real writable dir instead.
    if (HW_E2E) return os.tmpdir();
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(ownerWindow, {
      properties: ["openDirectory"],
      title: "اختر مجلد حفظ الفواتير",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("backup:select-directory", async (event) => {
    if (HW_E2E) return os.tmpdir();
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(ownerWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "اختر مجلد النسخ الاحتياطي (محلي أو شبكة)",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("backup:write-file", (event, payload) => {
    // SECURITY: any authenticated session may write a data backup so the
    // automatic on-close backup fires whoever is logged in (usually the
    // cashier). Non-owners are still confined to the owner-configured backup
    // folder — they can't pick an arbitrary path — so this stays a controlled
    // write, not a general "write any file anywhere" capability.
    const session = getSession(event);
    if (!session) return { ok: false, error: "not_authorized" };
    if (
      !payload ||
      typeof payload.dir !== "string" ||
      typeof payload.fileName !== "string" ||
      typeof payload.content !== "string"
    ) {
      return { ok: false, error: "invalid_input" };
    }
    try {
      const dir = payload.dir;
      if (session.role !== "owner") {
        const configuredPath = readJsonKey(`${STORE_PREFIX}settings`, {}).backupPath;
        if (!configuredPath || path.resolve(dir) !== path.resolve(String(configuredPath))) {
          return { ok: false, error: "not_authorized" };
        }
      }
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return { ok: false, error: "path_not_found" };
      }
      const base = sanitizeFileName(payload.fileName.replace(/\.json$/i, "")) || "helpers-backup";
      const target = path.join(dir, `${base}.json`);
      fs.writeFileSync(target, payload.content, "utf8");
      pruneOldBackups(dir);
      return { ok: true, path: target };
    } catch {
      return { ok: false, error: "write_failed" };
    }
  });

  ipcMain.handle("backup:export-database", async (event) => {
    if (!hasOwnerSession(event)) return { ok: false, error: "not_authorized" };
    try {
      const ownerWindow = BrowserWindow.fromWebContents(event.sender);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const defaultPath = path.join(app.getPath("documents"), `topgear-db-backup-${stamp}.sqlite`);
      const options = {
        title: "تصدير نسخة قاعدة البيانات",
        defaultPath,
        filters: [
          { name: "SQLite Database", extensions: ["sqlite", "db"] },
          { name: "All Files", extensions: ["*"] },
        ],
      };
      const result = ownerWindow
        ? await dialog.showSaveDialog(ownerWindow, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { ok: false, error: "cancelled" };

      const source = getDatabasePath();
      openDatabase().pragma("wal_checkpoint(TRUNCATE)");
      fs.copyFileSync(source, result.filePath);
      return { ok: true, path: result.filePath };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "export_failed" };
    }
  });

  ipcMain.handle("backup:import-database", async (event) => {
    if (!hasOwnerSession(event)) return { ok: false, error: "not_authorized" };
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: "استعادة قاعدة البيانات",
      properties: ["openFile"],
      filters: [
        { name: "SQLite Database", extensions: ["sqlite", "db"] },
        { name: "All Files", extensions: ["*"] },
      ],
    };
    const pick = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, options)
      : await dialog.showOpenDialog(options);
    if (pick.canceled || pick.filePaths.length === 0) return { ok: false, error: "cancelled" };

    const source = pick.filePaths[0];
    const target = getDatabasePath();
    try {
      if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
        return { ok: false, error: "path_not_found" };
      }

      const validationDb = new Database(source);
      try {
        validationDb.pragma(`key="x'${getDbKey()}'"`);
        validationDb.prepare("SELECT name FROM sqlite_master LIMIT 1").get();
      } finally {
        validationDb.close();
      }

      try { db?.pragma("wal_checkpoint(TRUNCATE)"); } catch { /* ignore */ }
      try { db?.close(); } catch { /* ignore */ }
      db = null;
      resetPreparedStatements();

      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (fs.existsSync(target)) {
        const backupBeforeRestore = `${target}.before-restore-${Date.now()}.bak`;
        fs.copyFileSync(target, backupBeforeRestore);
      }
      fs.copyFileSync(source, target);

      openDatabase();
      runCarwashMigrations();

      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 750);

      return { ok: true, restartRequired: true };
    } catch (error) {
      try {
        openDatabase();
      } catch {
        // If reopening fails, surface the original restore error to the renderer.
      }
      return { ok: false, error: error instanceof Error ? error.message : "import_failed" };
    }
  });
}

app.whenReady().then(() => {
  // ── SECURITY: Set Content Security Policy ──────────────────────────
  const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const cspDirectives = isDev
      ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: blob:; font-src 'self'; style-src 'self' 'unsafe-inline';"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';";
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
  runCarwashMigrations();
  startSyncScheduler();

  if (isSmokeTestRun()) {
    // SECURITY: Removed console.log of license status
    exitForSmokeTest();
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

app.on("before-quit", () => {
  try { db?.pragma("wal_checkpoint(TRUNCATE)"); } catch { /* ignore */ }
  try { db?.close(); db = null; } catch { /* ignore */ }
});
