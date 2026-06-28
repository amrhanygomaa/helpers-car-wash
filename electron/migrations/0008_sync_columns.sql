-- Phase 9 (cloud sync): add sync bookkeeping columns to every syncable table.
-- `updated_at` is the last-write-wins clock; `deleted_at` is a soft-delete
-- tombstone so deletions propagate to other branches. Existing rows default to
-- the current time so they are treated as "new" on first sync.

ALTER TABLE workers                  ADD COLUMN updated_at TEXT;
ALTER TABLE workers                  ADD COLUMN deleted_at TEXT;
ALTER TABLE products                 ADD COLUMN updated_at TEXT;
ALTER TABLE products                 ADD COLUMN deleted_at TEXT;
ALTER TABLE product_movements        ADD COLUMN updated_at TEXT;
ALTER TABLE product_movements        ADD COLUMN deleted_at TEXT;
ALTER TABLE raw_materials            ADD COLUMN updated_at TEXT;
ALTER TABLE raw_materials            ADD COLUMN deleted_at TEXT;
ALTER TABLE material_movements       ADD COLUMN updated_at TEXT;
ALTER TABLE material_movements       ADD COLUMN deleted_at TEXT;
ALTER TABLE treasury_entries         ADD COLUMN updated_at TEXT;
ALTER TABLE treasury_entries         ADD COLUMN deleted_at TEXT;
ALTER TABLE worker_withdrawals       ADD COLUMN updated_at TEXT;
ALTER TABLE worker_withdrawals       ADD COLUMN deleted_at TEXT;
ALTER TABLE daily_closures           ADD COLUMN updated_at TEXT;
ALTER TABLE daily_closures           ADD COLUMN deleted_at TEXT;
ALTER TABLE wash_packages            ADD COLUMN updated_at TEXT;
ALTER TABLE wash_packages            ADD COLUMN deleted_at TEXT;
ALTER TABLE customer_subscriptions   ADD COLUMN updated_at TEXT;
ALTER TABLE customer_subscriptions   ADD COLUMN deleted_at TEXT;
ALTER TABLE subscription_redemptions ADD COLUMN updated_at TEXT;
ALTER TABLE subscription_redemptions ADD COLUMN deleted_at TEXT;
ALTER TABLE cash_shifts              ADD COLUMN updated_at TEXT;
ALTER TABLE cash_shifts              ADD COLUMN deleted_at TEXT;
ALTER TABLE worker_attendance        ADD COLUMN updated_at TEXT;
ALTER TABLE worker_attendance        ADD COLUMN deleted_at TEXT;
ALTER TABLE services                 ADD COLUMN updated_at TEXT;
ALTER TABLE services                 ADD COLUMN deleted_at TEXT;
ALTER TABLE branches                 ADD COLUMN updated_at TEXT;
ALTER TABLE branches                 ADD COLUMN deleted_at TEXT;
ALTER TABLE discount_codes           ADD COLUMN updated_at TEXT;
ALTER TABLE discount_codes           ADD COLUMN deleted_at TEXT;

-- Backfill existing rows so they are picked up by the first push.
UPDATE workers                  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE products                 SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE product_movements        SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE raw_materials            SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE material_movements       SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE treasury_entries         SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE worker_withdrawals       SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE daily_closures           SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE wash_packages            SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE customer_subscriptions   SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE subscription_redemptions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE cash_shifts              SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE worker_attendance        SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE services                 SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE branches                 SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
UPDATE discount_codes           SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE updated_at IS NULL;
