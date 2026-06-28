-- Phase 9 foundation: branch catalog for future multi-branch support.
-- This keeps v1 fully offline; cloud sync can layer on top later.

CREATE TABLE IF NOT EXISTS branches (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO branches (id, name, active, created_at) VALUES
  ('branch-main', 'الفرع الرئيسي', 1, datetime('now'));

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('current_branch_id', 'branch-main'),
  ('branch_name', 'الفرع الرئيسي');
