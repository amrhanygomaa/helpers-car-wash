-- Phase 9 (cloud sync): change-capture outbox + cursor state + triggers.
--
-- The outbox records (entity, row_id, op) for every local mutation. Payload is
-- left empty here; the push engine reads the live row by id at send time, so the
-- triggers stay uniform across tables and never embed per-column JSON. Hard
-- deletes are captured via AFTER DELETE; soft deletes (deleted_at set) surface
-- as a 'delete' op from AFTER UPDATE. branch_id is a hint ('branch-main'); the
-- engine stamps the real device branch on push.
--
-- SQLite has recursive_triggers OFF by default, so the `updated_at` bump inside
-- the AFTER UPDATE trigger does not re-fire the trigger.

CREATE TABLE IF NOT EXISTS sync_outbox (
  id         TEXT PRIMARY KEY,
  entity     TEXT NOT NULL,
  row_id     TEXT NOT NULL,
  op         TEXT NOT NULL,            -- 'upsert' | 'delete'
  payload    TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  device_id  TEXT,
  branch_id  TEXT NOT NULL DEFAULT 'branch-main',
  created_at TEXT NOT NULL,
  synced_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_unsynced ON sync_outbox(synced_at);

CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- workers
CREATE TRIGGER IF NOT EXISTS sync_workers_ins AFTER INSERT ON workers BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'workers',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_workers_upd AFTER UPDATE ON workers BEGIN
  UPDATE workers SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'workers',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_workers_del AFTER DELETE ON workers BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'workers',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- products
CREATE TRIGGER IF NOT EXISTS sync_products_ins AFTER INSERT ON products BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'products',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_products_upd AFTER UPDATE ON products BEGIN
  UPDATE products SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'products',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_products_del AFTER DELETE ON products BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'products',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- product_movements
CREATE TRIGGER IF NOT EXISTS sync_product_movements_ins AFTER INSERT ON product_movements BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'product_movements',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_product_movements_upd AFTER UPDATE ON product_movements BEGIN
  UPDATE product_movements SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'product_movements',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_product_movements_del AFTER DELETE ON product_movements BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'product_movements',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- raw_materials
CREATE TRIGGER IF NOT EXISTS sync_raw_materials_ins AFTER INSERT ON raw_materials BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'raw_materials',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_raw_materials_upd AFTER UPDATE ON raw_materials BEGIN
  UPDATE raw_materials SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'raw_materials',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_raw_materials_del AFTER DELETE ON raw_materials BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'raw_materials',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- material_movements
CREATE TRIGGER IF NOT EXISTS sync_material_movements_ins AFTER INSERT ON material_movements BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'material_movements',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_material_movements_upd AFTER UPDATE ON material_movements BEGIN
  UPDATE material_movements SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'material_movements',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_material_movements_del AFTER DELETE ON material_movements BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'material_movements',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- treasury_entries
CREATE TRIGGER IF NOT EXISTS sync_treasury_entries_ins AFTER INSERT ON treasury_entries BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'treasury_entries',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_treasury_entries_upd AFTER UPDATE ON treasury_entries BEGIN
  UPDATE treasury_entries SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'treasury_entries',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_treasury_entries_del AFTER DELETE ON treasury_entries BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'treasury_entries',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- worker_withdrawals
CREATE TRIGGER IF NOT EXISTS sync_worker_withdrawals_ins AFTER INSERT ON worker_withdrawals BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'worker_withdrawals',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_worker_withdrawals_upd AFTER UPDATE ON worker_withdrawals BEGIN
  UPDATE worker_withdrawals SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'worker_withdrawals',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_worker_withdrawals_del AFTER DELETE ON worker_withdrawals BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'worker_withdrawals',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- daily_closures
CREATE TRIGGER IF NOT EXISTS sync_daily_closures_ins AFTER INSERT ON daily_closures BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'daily_closures',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_daily_closures_upd AFTER UPDATE ON daily_closures BEGIN
  UPDATE daily_closures SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'daily_closures',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_daily_closures_del AFTER DELETE ON daily_closures BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'daily_closures',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- wash_packages
CREATE TRIGGER IF NOT EXISTS sync_wash_packages_ins AFTER INSERT ON wash_packages BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'wash_packages',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_wash_packages_upd AFTER UPDATE ON wash_packages BEGIN
  UPDATE wash_packages SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'wash_packages',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_wash_packages_del AFTER DELETE ON wash_packages BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'wash_packages',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- customer_subscriptions
CREATE TRIGGER IF NOT EXISTS sync_customer_subscriptions_ins AFTER INSERT ON customer_subscriptions BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'customer_subscriptions',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_customer_subscriptions_upd AFTER UPDATE ON customer_subscriptions BEGIN
  UPDATE customer_subscriptions SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'customer_subscriptions',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_customer_subscriptions_del AFTER DELETE ON customer_subscriptions BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'customer_subscriptions',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- subscription_redemptions
CREATE TRIGGER IF NOT EXISTS sync_subscription_redemptions_ins AFTER INSERT ON subscription_redemptions BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'subscription_redemptions',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_subscription_redemptions_upd AFTER UPDATE ON subscription_redemptions BEGIN
  UPDATE subscription_redemptions SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'subscription_redemptions',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_subscription_redemptions_del AFTER DELETE ON subscription_redemptions BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'subscription_redemptions',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- cash_shifts
CREATE TRIGGER IF NOT EXISTS sync_cash_shifts_ins AFTER INSERT ON cash_shifts BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'cash_shifts',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_cash_shifts_upd AFTER UPDATE ON cash_shifts BEGIN
  UPDATE cash_shifts SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'cash_shifts',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_cash_shifts_del AFTER DELETE ON cash_shifts BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'cash_shifts',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- worker_attendance
CREATE TRIGGER IF NOT EXISTS sync_worker_attendance_ins AFTER INSERT ON worker_attendance BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'worker_attendance',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_worker_attendance_upd AFTER UPDATE ON worker_attendance BEGIN
  UPDATE worker_attendance SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'worker_attendance',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_worker_attendance_del AFTER DELETE ON worker_attendance BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'worker_attendance',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- services
CREATE TRIGGER IF NOT EXISTS sync_services_ins AFTER INSERT ON services BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'services',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_services_upd AFTER UPDATE ON services BEGIN
  UPDATE services SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'services',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_services_del AFTER DELETE ON services BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'services',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- branches
CREATE TRIGGER IF NOT EXISTS sync_branches_ins AFTER INSERT ON branches BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'branches',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_branches_upd AFTER UPDATE ON branches BEGIN
  UPDATE branches SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'branches',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_branches_del AFTER DELETE ON branches BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'branches',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- discount_codes
CREATE TRIGGER IF NOT EXISTS sync_discount_codes_ins AFTER INSERT ON discount_codes BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'discount_codes',NEW.id,'upsert',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_discount_codes_upd AFTER UPDATE ON discount_codes BEGIN
  UPDATE discount_codes SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'discount_codes',NEW.id,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'upsert' END,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS sync_discount_codes_del AFTER DELETE ON discount_codes BEGIN
  INSERT INTO sync_outbox(id,entity,row_id,op,updated_at,created_at) VALUES (lower(hex(randomblob(16))),'discount_codes',OLD.id,'delete',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
