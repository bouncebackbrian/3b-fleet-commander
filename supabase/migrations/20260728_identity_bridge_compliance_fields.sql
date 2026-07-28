-- ============================================================
-- 3B FLEET COMMANDER — Attach compliance data to the company, CDL/3B ID
-- data to the person, for real, in this database
-- Migration: 20260728_identity_bridge_compliance_fields
--
-- Two gaps found live tonight while setting up a real driver trial
-- (documented in docs/SCHEMA_RECONCILIATION.md):
--
-- 1. `businesses` had zero compliance columns (DOT#, MC#, EIN, insurance)
--    and no `three_b_biz_id` — identity-registry.ts's ThreeBBusiness type
--    documented these as if they existed; they did not. Adding them here,
--    nullable, no data fabricated.
--
-- 2. `profiles.id` hard-FK'd to THIS project's own local `auth.users`,
--    which cannot have a row for a Core_Eco-only session (same root cause
--    as the clock-in bug fixed in 20260728_fleet_dt_decouple_profiles_fk.sql,
--    showing up a second place). That migration decoupled 24 Dump Truck
--    Mode tables from profiles(id); this migration finishes the same fix
--    for profiles.id's own FK to auth.users, so a real profiles row can
--    finally exist for a Core_Eco-authenticated user — which is required
--    for "CDL attaches to the actual person" to mean anything.
--
-- No `three_b_id`/`three_b_biz_id` VALUES are generated here — there is no
-- sequence/generator function for the 3B-U-XXXXXXXX / 3B-B-XXXXXXXX format
-- anywhere in this database (confirmed: no matching function or trigger).
-- Building that generator is a separate, real feature — out of scope
-- tonight. These columns are added and left null rather than fabricated.
-- ============================================================

alter table public.businesses
  add column if not exists three_b_biz_id          text,
  add column if not exists dot_number              text,
  add column if not exists mc_number               text,
  add column if not exists ein                     text,
  add column if not exists insurance_carrier       text,
  add column if not exists insurance_policy_number text,
  add column if not exists insurance_expiry        date;

create unique index if not exists businesses_three_b_biz_id_key
  on public.businesses (three_b_biz_id) where three_b_biz_id is not null;

alter table public.profiles drop constraint if exists profiles_id_fkey;

-- Provision the real profiles row for the Core_Eco-authenticated driver
-- this trial is using (bouncebackbrian@outlook.com — id confirmed live in
-- Core_Eco, no matching row possible in Fleet's local auth.users).
insert into public.profiles (id, full_name)
values ('bf568e3f-af39-4487-9649-953ddefd1216', 'Brian Martin')
on conflict (id) do update set full_name = excluded.full_name;

notify pgrst, 'reload schema';
