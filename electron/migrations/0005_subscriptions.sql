-- Feature: subscriptions & packages (اشتراكات وباقات).
-- Owner defines prepaid wash packages; customers buy them as subscriptions that
-- are redeemed (one wash at a time, or unlimited within a period) when invoicing.

CREATE TABLE IF NOT EXISTS wash_packages (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'count',   -- 'count' | 'period'
  price         INTEGER NOT NULL DEFAULT 0,        -- piastres
  wash_count    INTEGER,                           -- for 'count' packages
  duration_days INTEGER,                           -- for 'period' packages
  active        INTEGER NOT NULL DEFAULT 1,
  notes         TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id               TEXT PRIMARY KEY,
  customer_id      TEXT NOT NULL,
  package_id       TEXT REFERENCES wash_packages(id),
  package_name     TEXT NOT NULL,
  kind             TEXT NOT NULL DEFAULT 'count',
  price_paid       INTEGER NOT NULL DEFAULT 0,      -- piastres
  total_washes     INTEGER,
  remaining_washes INTEGER,
  start_date       TEXT,
  end_date         TEXT,
  status           TEXT NOT NULL DEFAULT 'active',  -- active | used_up | expired | cancelled
  branch_id        TEXT NOT NULL DEFAULT 'branch-main' REFERENCES branches(id),
  created_by       TEXT,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_redemptions (
  id              TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES customer_subscriptions(id),
  order_id        TEXT,
  customer_id     TEXT,
  washes_used     INTEGER NOT NULL DEFAULT 1,
  business_date   TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON customer_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_subscription ON subscription_redemptions(subscription_id);
