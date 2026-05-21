-- ============================================================
-- 3B FLEET COMMANDER — fleet_missions column backfill
-- Phase 4H hotfix: add columns that missionToRow() sends but
-- may be absent from the live table (created before these
-- fields were added to the schema).
--
-- All statements are idempotent — safe to run on any state of
-- the table, whether columns exist or not.
-- ============================================================

-- ── Core load identifiers ─────────────────────────────────────
alter table public.fleet_missions
  add column if not exists broker    text,
  add column if not exists pickup    text,
  add column if not exists delivery  text,
  add column if not exists commodity text;

-- ── metadata jsonb ────────────────────────────────────────────
-- Holds: routePreference, routeNotes, stops[], tripReview,
-- and any future flexible fields without needing migrations.
alter table public.fleet_missions
  add column if not exists metadata  jsonb;

-- ── business_id ───────────────────────────────────────────────
-- SKIPPED intentionally — business_id may already exist as uuid.
-- If it does not exist yet, add it manually after confirming the
-- column type matches what missionToRow() sends (text '3B-BIZ-XXXXX').
--
--   alter table public.fleet_missions add column if not exists business_id text;
--
-- ── Notify PostgREST to reload its schema cache ───────────────
-- Without this, the API layer continues serving stale column
-- lists and upserts will fail with "column not found" errors
-- even after the DDL commits.
notify pgrst, 'reload schema';
