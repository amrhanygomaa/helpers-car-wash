-- Phase 9: attach branch_id to every transactional table so data is
-- logically partitioned per branch.  All existing rows default to the
-- main branch ('branch-main') so nothing breaks on upgrade.

ALTER TABLE treasury_entries    ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'branch-main' REFERENCES branches(id);
ALTER TABLE worker_withdrawals  ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'branch-main' REFERENCES branches(id);
ALTER TABLE daily_closures      ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'branch-main' REFERENCES branches(id);
ALTER TABLE product_movements   ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'branch-main' REFERENCES branches(id);
ALTER TABLE material_movements  ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'branch-main' REFERENCES branches(id);
