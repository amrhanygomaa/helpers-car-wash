-- Top Gear Car Wash — Supabase (Postgres) sync store.
-- Applied to project `topgear-carwash` (org: Helpers Tech). Re-runnable.
--
-- One generic table holds every synced entity as JSONB, keyed by (entity,id).
-- This avoids maintaining 16 mirror schemas in lock-step with the local SQLite
-- DB and keeps the full row available for a future dashboard. `updated_at` /
-- `deleted_at` are TEXT in the exact ISO-UTC format the SQLite triggers emit
-- (e.g. 2026-06-28T03:00:00.000Z), so cursor `gt` and last-write-wins compare
-- byte-consistently across devices (see src/lib/sync.ts for the rules).

create table if not exists public.sync_rows (
  entity     text not null,
  id         text not null,
  org_id     text not null,
  branch_id  text,
  updated_at text not null,
  deleted_at text,
  data       jsonb not null default '{}'::jsonb,
  synced_at  timestamptz not null default now(),
  primary key (entity, id)
);

create index if not exists sync_rows_pull_idx on public.sync_rows (org_id, entity, updated_at);

alter table public.sync_rows enable row level security;

-- Single-business project: every branch install of Top Gear shares this project
-- and its anon key, so the project itself is the security boundary. The anon role
-- gets full access to this one table only. (For true multi-tenant, switch to
-- per-org JWT claims + `org_id = app_org_id()` policies.)
drop policy if exists sync_rows_anon_all on public.sync_rows;
create policy sync_rows_anon_all on public.sync_rows
  for all
  to anon
  using (true)
  with check (true);
