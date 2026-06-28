-- Feature: cashier shift / drawer reconciliation (وردية وجرد الخزنة).
-- Open a shift with an opening float, then close it by counting actual cash and
-- comparing to the expected drawer (float + day's cash receipts − cash payouts).

CREATE TABLE IF NOT EXISTS cash_shifts (
  id            TEXT PRIMARY KEY,
  business_date TEXT NOT NULL,
  opened_at     TEXT NOT NULL,
  opened_by     TEXT,
  opening_float INTEGER NOT NULL DEFAULT 0,   -- piastres
  closed_at     TEXT,
  closed_by     TEXT,
  counted_cash  INTEGER,                       -- piastres
  expected_cash INTEGER,                       -- piastres
  variance      INTEGER,                       -- piastres (counted − expected)
  status        TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'closed'
  note          TEXT,
  branch_id     TEXT NOT NULL DEFAULT 'branch-main' REFERENCES branches(id),
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cash_shifts_status ON cash_shifts(branch_id, status);
