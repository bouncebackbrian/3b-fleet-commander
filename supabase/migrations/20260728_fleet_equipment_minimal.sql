-- ============================================================
-- 3B FLEET COMMANDER — Minimal fleet_equipment (Dump Truck Mode dependency)
-- Migration: 20260728_fleet_equipment_minimal
--
-- SCOPE: This is intentionally NOT the full historical fleet_equipment
-- migration that already exists, unapplied, at
-- supabase/migrations/20260623_fleet_equipment.sql (which adds maintenance
-- schedules, odometer/engine-hour logs, DOT/MC numbers, lease tracking,
-- equipment_type/status/fuel_type enums, etc). That migration — and the
-- rest of the historical migration chain it belongs to (3B identity arch,
-- HOS, fuel, driver score, emergency events, rewards) — was never applied
-- to this live database (confirmed via a schema snapshot taken immediately
-- before this migration: docs/schema-snapshots/2026-07-28-pre-fleet-equipment.md).
-- Backfilling that full history was explicitly out of scope for this change.
--
-- This migration creates ONLY the minimal, self-contained table Dump Truck
-- Mode's fleet_dt_* tables need to foreign-key trucks/trailers to
-- (src/lib/fleet/dumpTruck/equipment.ts reads exactly: id, unit_number,
-- equipment_type, status, scoped by business_id). It is written against the
-- ACTUAL live schema of businesses/fleet_business_members (see the snapshot
-- above), not against the assumptions in the unapplied historical files.
--
-- A real equipment registry (VIN, DOT#, maintenance, odometer history) is
-- tracked as follow-up work in docs/SCHEMA_RECONCILIATION.md — this table
-- can be extended with `alter table ... add column ... if not exists` later
-- without conflicting with anything here.
-- ============================================================

create table if not exists public.fleet_equipment (
  id             uuid        primary key default gen_random_uuid(),
  business_id    uuid        not null references public.businesses(id) on delete cascade,

  unit_number    text        not null,
  equipment_type text        not null default 'tractor',
  -- Dump Truck Mode treats equipment_type = 'trailer_dump' as a trailer and
  -- everything else as a truck (src/lib/fleet/dumpTruck/equipment.ts) — no
  -- enum/check constraint here so real fleet variety isn't blocked.
  status         text        not null default 'active',

  vin            text,
  license_plate  text,
  notes          text,

  created_by     uuid        references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (business_id, unit_number)
);

create index if not exists idx_fleet_equipment_business
  on public.fleet_equipment(business_id, status);

alter table public.fleet_equipment enable row level security;

-- Self-contained RLS — direct fleet_business_members subqueries, matching
-- this database's actual columns (business_id, user_id, role, active).
-- Deliberately does not depend on fleet_dt_has_role()/fleet_dt_is_member()
-- (defined in 20260727_fleet_dt_core.sql, which itself depends on this
-- table existing first) so this migration has no ordering dependency on
-- the Dump Truck Mode migrations that follow it.

drop policy if exists "fleet_equipment_member_select" on public.fleet_equipment;
create policy "fleet_equipment_member_select" on public.fleet_equipment
  for select using (
    exists (
      select 1 from public.fleet_business_members
      where business_id = fleet_equipment.business_id
        and user_id = auth.uid()
        and active = true
    )
  );

drop policy if exists "fleet_equipment_member_write" on public.fleet_equipment;
create policy "fleet_equipment_member_write" on public.fleet_equipment
  for all using (
    exists (
      select 1 from public.fleet_business_members
      where business_id = fleet_equipment.business_id
        and user_id = auth.uid()
        and active = true
        and role in ('owner', 'admin', 'dispatcher', 'fleet_manager')
    )
  )
  with check (
    exists (
      select 1 from public.fleet_business_members
      where business_id = fleet_equipment.business_id
        and user_id = auth.uid()
        and active = true
        and role in ('owner', 'admin', 'dispatcher', 'fleet_manager')
    )
  );

-- Reuse the same set_updated_at() trigger function already present in this
-- database (created by the fleet_loads migration — confirmed present via
-- existing fleet_* tables already using it in the same project).
drop trigger if exists set_fleet_equipment_updated_at on public.fleet_equipment;
create trigger set_fleet_equipment_updated_at
  before update on public.fleet_equipment
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
