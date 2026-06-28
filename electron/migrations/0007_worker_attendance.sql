-- Feature: worker attendance / time tracking (حضور وانصراف الصنايعية).
-- Records each worker's check-in and check-out per business date.

CREATE TABLE IF NOT EXISTS worker_attendance (
  id            TEXT PRIMARY KEY,
  worker_id     TEXT NOT NULL REFERENCES workers(id),
  business_date TEXT NOT NULL,
  check_in      TEXT NOT NULL,
  check_out     TEXT,
  branch_id     TEXT NOT NULL DEFAULT 'branch-main' REFERENCES branches(id),
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON worker_attendance(branch_id, business_date);
