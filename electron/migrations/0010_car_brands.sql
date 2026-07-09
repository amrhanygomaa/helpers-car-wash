-- Feature: admin-managed car brands (الإعدادات → ماركات السيارات).
-- Supplements the bundled static brand list so the shop can add brands/logos
-- that aren't in the built-in catalog, without a code change.

CREATE TABLE IF NOT EXISTS car_brands (
  id         TEXT PRIMARY KEY,
  name_ar    TEXT NOT NULL,
  name_en    TEXT NOT NULL,
  logo_image TEXT,
  created_at TEXT NOT NULL
);
