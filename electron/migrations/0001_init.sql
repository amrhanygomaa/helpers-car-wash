-- Top Gear Car Wash — Initial Schema
-- Phase 0: create all tables per DATA_MODEL.md, seed 12 services + 2 workers + settings

-- ── Auth ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  is_system  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS permissions (
  key   TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id        TEXT NOT NULL REFERENCES roles(id),
  permission_key TEXT NOT NULL REFERENCES permissions(key),
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  role_id    TEXT NOT NULL REFERENCES roles(id),
  pin_hash   TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- ── Customers & Vehicles ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

CREATE TABLE IF NOT EXISTS vehicles (
  id          TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  brand       TEXT NOT NULL,
  model       TEXT,
  plate       TEXT,
  created_at  TEXT NOT NULL
);

-- ── Services catalog ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS services (
  id             TEXT PRIMARY KEY,
  name_ar        TEXT NOT NULL,
  category       TEXT NOT NULL CHECK(category IN ('wash','chemical','extra')),
  has_commission INTEGER NOT NULL DEFAULT 0,
  default_price  INTEGER,
  active         INTEGER NOT NULL DEFAULT 1,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

-- ── Discount Codes ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS discount_codes (
  id     TEXT PRIMARY KEY,
  code   TEXT NOT NULL UNIQUE,
  type   TEXT NOT NULL CHECK(type IN ('fixed_amount','percent','override')),
  value  INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

-- ── Orders & Items ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id                   TEXT PRIMARY KEY,
  ticket_number        INTEGER NOT NULL,
  business_date        TEXT NOT NULL,
  customer_id          TEXT REFERENCES customers(id),
  vehicle_id           TEXT REFERENCES vehicles(id),
  customer_name        TEXT NOT NULL,
  phone                TEXT,
  vehicle_brand        TEXT,
  key_received         INTEGER NOT NULL DEFAULT 0,
  requested_pickup_at  TEXT,
  note                 TEXT,
  queue_position       INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'waiting'
                         CHECK(status IN ('waiting','in_progress','done','delivered','cancelled')),
  discount_code_id     TEXT REFERENCES discount_codes(id),
  discount_amount      INTEGER NOT NULL DEFAULT 0,
  subtotal             INTEGER NOT NULL DEFAULT 0,
  total                INTEGER NOT NULL DEFAULT 0,
  commission_in_total  INTEGER NOT NULL DEFAULT 0,
  created_by           TEXT,
  created_at           TEXT NOT NULL,
  finalized_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(business_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id),
  item_type        TEXT NOT NULL CHECK(item_type IN ('service','product')),
  service_id       TEXT REFERENCES services(id),
  product_id       TEXT,
  description      TEXT NOT NULL,
  unit_price       INTEGER NOT NULL,
  qty              INTEGER NOT NULL DEFAULT 1,
  line_total       INTEGER NOT NULL,
  performed_by     TEXT,
  commission_amount INTEGER,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_counters (
  business_date TEXT PRIMARY KEY,
  last_number   INTEGER NOT NULL DEFAULT 0
);

-- ── Workers ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workers (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  wage_type TEXT NOT NULL DEFAULT 'daily_fixed'
              CHECK(wage_type IN ('daily_fixed','monthly','commission_only')),
  base_wage INTEGER,
  active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS worker_withdrawals (
  id            TEXT PRIMARY KEY,
  worker_id     TEXT NOT NULL REFERENCES workers(id),
  amount        INTEGER NOT NULL,
  reason        TEXT,
  business_date TEXT NOT NULL,
  created_by    TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_closures (
  id                TEXT PRIMARY KEY,
  business_date     TEXT NOT NULL,
  worker_id         TEXT NOT NULL REFERENCES workers(id),
  cars_count        INTEGER NOT NULL DEFAULT 0,
  commission_total  INTEGER NOT NULL DEFAULT 0,
  base_amount       INTEGER NOT NULL DEFAULT 0,
  withdrawals_total INTEGER NOT NULL DEFAULT 0,
  net_due           INTEGER NOT NULL DEFAULT 0,
  closed_by         TEXT,
  closed_at         TEXT NOT NULL,
  UNIQUE(business_date, worker_id)
);

-- ── Treasury ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS treasury_entries (
  id            TEXT PRIMARY KEY,
  business_date TEXT NOT NULL,
  type          TEXT NOT NULL CHECK(type IN ('expense','withdrawal','adjustment')),
  amount        INTEGER NOT NULL,
  description   TEXT NOT NULL,
  worker_id     TEXT REFERENCES workers(id),
  created_by    TEXT,
  created_at    TEXT NOT NULL
);

-- ── Products ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  sale_price          INTEGER NOT NULL,
  purchase_price      INTEGER NOT NULL DEFAULT 0,
  stock_qty           INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  active              INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS product_movements (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id),
  type          TEXT NOT NULL CHECK(type IN ('purchase','sale','adjustment')),
  qty           INTEGER NOT NULL,
  unit_price    INTEGER NOT NULL DEFAULT 0,
  order_id      TEXT REFERENCES orders(id),
  business_date TEXT NOT NULL,
  created_by    TEXT,
  created_at    TEXT NOT NULL
);

-- ── Raw Materials ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS raw_materials (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  unit                TEXT NOT NULL DEFAULT 'piece',
  unit_cost           INTEGER NOT NULL DEFAULT 0,
  stock_qty           INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  active              INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS material_movements (
  id            TEXT PRIMARY KEY,
  material_id   TEXT NOT NULL REFERENCES raw_materials(id),
  type          TEXT NOT NULL CHECK(type IN ('purchase','consumption','adjustment')),
  qty           INTEGER NOT NULL,
  unit_cost     INTEGER NOT NULL DEFAULT 0,
  by_worker_id  TEXT REFERENCES workers(id),
  by_user_id    TEXT,
  business_date TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- ── Settings ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ── Permission keys (seeded) ──────────────────────────────────────────────

INSERT OR IGNORE INTO permissions (key, label) VALUES
  ('queue.manage',      'إدارة الطابور'),
  ('invoice.create',    'إنشاء فاتورة'),
  ('invoice.finalize',  'تأكيد الفاتورة'),
  ('pricing.override',  'تعديل الأسعار'),
  ('products.view',     'عرض المنتجات'),
  ('products.manage',   'إدارة المنتجات'),
  ('materials.view',    'عرض المواد الخام'),
  ('materials.manage',  'إدارة المواد الخام'),
  ('treasury.manage',   'إدارة الخزينة'),
  ('payroll.manage',    'إدارة الرواتب'),
  ('reports.view',      'عرض التقارير'),
  ('customers.view',    'عرض العملاء'),
  ('workers.manage',    'إدارة الصنايعية'),
  ('settings.manage',   'إدارة الإعدادات'),
  ('users.manage',      'إدارة المستخدمين');

-- ── Default settings ──────────────────────────────────────────────────────

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('business_name',               'Top Gear Car Wash'),
  ('currency',                    'EGP'),
  ('pricing_mode',                'variable'),
  ('commission_default_in_total', '0'),
  ('low_stock_alert_window_days', '7'),
  ('printer_name',                ''),
  ('receipt_width_mm',            '80'),
  ('branch_name',                 'الفرع الرئيسي'),
  ('timezone',                    'Africa/Cairo');

-- ── Services catalog — 12 services from REQUIREMENTS §B ──────────────────
-- Prices in piastres (EGP × 100). default_price = NULL means manual entry.

INSERT OR IGNORE INTO services (id, name_ar, category, has_commission, default_price, active, sort_order) VALUES
  ('svc-01', 'غسيل برّة وجوّه (خارجي + داخلي)', 'wash',     0, NULL, 1,  1),
  ('svc-02', 'غسيل كيماوي كامل',                  'chemical', 1, NULL, 1,  2),
  ('svc-03', 'كيماوي سقف',                        'chemical', 1, NULL, 1,  3),
  ('svc-04', 'كيماوي كراسي',                      'chemical', 1, NULL, 1,  4),
  ('svc-05', 'كيماوي أبواب',                      'chemical', 1, NULL, 1,  5),
  ('svc-06', 'كيماوي تابلوه/فايبر',               'chemical', 1, NULL, 1,  6),
  ('svc-07', 'كيماوي أرضية',                      'chemical', 1, NULL, 1,  7),
  ('svc-08', 'موتور',                              'extra',    1, NULL, 1,  8),
  ('svc-09', 'فوانيس',                             'extra',    1, NULL, 1,  9),
  ('svc-10', 'جنوط',                              'extra',    1, NULL, 1, 10),
  ('svc-11', 'شنطة',                              'extra',    1, NULL, 1, 11),
  ('svc-12', 'تلميع / بوليش',                     'extra',    1, NULL, 1, 12);

-- ── Seed workers (2 test workers) ────────────────────────────────────────

INSERT OR IGNORE INTO workers (id, name, wage_type, base_wage, active) VALUES
  ('wrk-01', 'أحمد محمد',   'daily_fixed', 15000, 1),
  ('wrk-02', 'محمود علي',   'daily_fixed', 15000, 1);
