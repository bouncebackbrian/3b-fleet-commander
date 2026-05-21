-- ── Phase 4D (trimmed): Fleet Commander operational identity columns ──────────
-- Scenario B: 3B ID is the external identity source of truth.
-- Fleet Commander owns operational data, NOT auth/identity infrastructure.
--
-- DO NOT add profiles, business_profiles, or signup triggers here.
-- Those belong in the 3B ID project.
--
-- This migration only adds nullable identity columns to fleet_missions so
-- records can be linked to 3B ID users once the auth strategy is finalized.
-- All columns are nullable — alpha/offline mode is fully unaffected.
--
-- Safe to run multiple times (IF NOT EXISTS guards).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fleet_missions
  add column if not exists user_id     uuid,
  add column if not exists business_id uuid;

create index if not exists idx_fleet_missions_user_id
  on public.fleet_missions(user_id);

-- ── NOT included (belongs in 3B ID project, not here) ────────────────────────
-- public.profiles
-- public.business_profiles
-- trigger: on_auth_user_created
-- FK references to non-local identity tables
-- ─────────────────────────────────────────────────────────────────────────────
