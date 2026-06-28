# Multi-branch cloud sync — setup (Phase 9)

The desktop app is **offline-first**. Cloud sync is an **optional** layer that lets
multiple branches share the relational data (workers, products, materials, treasury,
packages/subscriptions, shifts, attendance, services, branches). With sync off, the app
is 100% offline; change-capture triggers still queue rows in `sync_outbox`, which drain
on the next successful sync.

## How it works
- **Local source of truth:** the encrypted SQLite DB (better-sqlite3).
- **Change capture:** SQLite triggers (`electron/migrations/0009_sync_outbox.sql`) append
  every insert/update/delete to `sync_outbox`. Soft deletes use `deleted_at` tombstones.
  Timestamps are written ISO-UTC (`strftime('%Y-%m-%dT%H:%M:%fZ','now')`).
- **Engine (`electron/sync.cjs`, main process):** `push()` drains the outbox to Supabase
  (reads the live row by id), `pull()` fetches rows newer than a per-entity cursor and
  merges with **last-write-wins by `updated_at`** (delete tombstone wins ties — see the
  unit-tested rules in `src/lib/sync.ts`). A 5-minute scheduler + the manual "مزامنة الآن"
  button (Settings) trigger it. The engine runs in **main**, so it is not bound by the
  renderer CSP.
- **Cloud store:** one generic table `public.sync_rows(entity, id, org_id, branch_id,
  updated_at, deleted_at, data jsonb)` — see `schema.sql`.

## Provisioned project
- Project: **topgear-carwash** (org **Helpers Tech**), region eu-west-1.
- `schema.sql` is already applied (table + RLS). The API **URL** and **anon key** are
  given to the owner privately — paste them into the app, do **not** commit them to git.

## Per-device setup (each branch install)
Settings → "المزامنة السحابية (الفروع)":
1. Enable sync.
2. **Org ID**: the same value on every branch (e.g. `topgear`).
3. **Branch ID**: unique per branch (e.g. `branch-main`, `branch-2`).
4. **Supabase URL** + **anon Key** (provided).
5. Save → click "مزامنة الآن" once to seed.

## Verified (live)
A standalone round-trip against the live project confirmed: create → pull, cursor
filtering, cross-branch edit converging by `updated_at`, soft-delete tombstone, and
org isolation via RLS.

## Security
The anon key is shared across Top Gear's own branch installs; the project is the
security boundary. **Never** put the `service_role` key in the app. For multi-tenant
(multiple businesses on one project) switch to per-org JWT claims + `org_id` RLS.

## Dependency
`@supabase/supabase-js` runs in the **main** process; it is lazily `require`d only when
sync is enabled, so the offline build needs no network access.
