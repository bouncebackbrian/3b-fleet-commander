-- ============================================================
-- 3B FLEET COMMANDER — fleet_missions table
-- Run in: Fleet Commander Supabase project > SQL Editor
--
-- WHY a separate table (not altering loads):
--   The existing `loads` table stores the complete accounting
--   record for a completed run (settlement pay, CPM rate, BOL,
--   etc.). fleet_missions is the *operational* record created
--   at dispatch time — lighter, driver-facing, and independent
--   of whether the load ever gets reconciled in accounting.
--   They share the same load_number / load_ref so the audit
--   page can join them later if needed.
-- ============================================================

-- ── Status enum ─────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'mission_status'
  ) then
    create type public.mission_status as enum (
      'planned', 'active', 'completed', 'cancelled'
    );
  end if;
end;
$$;

-- ── fleet_missions ───────────────────────────────────────────
create table if not exists public.fleet_missions (
  -- Identity
  id                    uuid primary key default gen_random_uuid(),

  -- Optional link back to the accounting loads table
  load_ref              uuid references public.loads(id) on delete set null,

  -- Load identifiers
  load_number           text not null default '',
  broker                text,

  -- Route
  origin                text not null,
  destination           text not null,
  date                  date not null default current_date,
  pickup                text,          -- e.g. "Mon 06:00"
  delivery              text,          -- e.g. "Tue 14:00"
  commodity             text,

  -- Miles
  dispatch_miles        int  not null default 0,
  deadhead_miles        int  not null default 0,

  -- Financials
  gross_rate            numeric(10,2) not null default 0,
  fuel_price            numeric(6,4)  not null default 3.85,

  -- Rig
  rig_type              text not null default 'semi-solo'
                          check (rig_type in ('semi-solo','semi-team','hotshot')),
  driver_mode           text not null default 'Solo'
                          check (driver_mode in ('Solo','Team')),

  -- Operational scoring inputs
  wait_hours            numeric(5,2) not null default 0,
  reload_known          boolean      not null default false,
  reload_area_strength  smallint     not null default 2
                          check (reload_area_strength between 1 and 3),
  has_overnight_parking boolean      not null default false,
  load_type             text         not null default 'FTL',

  -- Mission lifecycle
  status                public.mission_status not null default 'active',

  -- Identity (nullable — populated when auth is wired)
  user_id               uuid references auth.users on delete cascade,
  business_id           text,          -- '3B-BIZ-XXXXXX' from ecosystem

  -- Timestamps
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────
-- Primary dashboard query: latest active mission per user (or anon)
create index if not exists fleet_missions_status_created
  on public.fleet_missions(status, created_at desc);

create index if not exists fleet_missions_user_id
  on public.fleet_missions(user_id, created_at desc)
  where user_id is not null;

-- ── updated_at auto-stamp ────────────────────────────────────
-- Reuse the set_updated_at() function from fleet_commander_schema.sql
-- (already exists; safe to add trigger independently)
drop trigger if exists set_fleet_missions_updated_at on public.fleet_missions;
create trigger set_fleet_missions_updated_at
  before update on public.fleet_missions
  for each row execute procedure public.set_updated_at();

-- ── Row-Level Security ────────────────────────────────────────
-- Current posture (pre-auth): any anon client can read/write rows
-- where user_id IS NULL. Once auth is wired, each driver's rows
-- are automatically scoped to their auth.uid().
alter table public.fleet_missions enable row level security;

-- SELECT: own rows, or any anonymous row
drop policy if exists "fleet_missions_select" on public.fleet_missions;
create policy "fleet_missions_select" on public.fleet_missions
  for select using (
    user_id is null
    or auth.uid() = user_id
  );

-- INSERT: allow anonymous inserts (user_id null) or own user_id
drop policy if exists "fleet_missions_insert" on public.fleet_missions;
create policy "fleet_missions_insert" on public.fleet_missions
  for insert with check (
    user_id is null
    or auth.uid() = user_id
  );

-- UPDATE: own rows only
drop policy if exists "fleet_missions_update" on public.fleet_missions;
create policy "fleet_missions_update" on public.fleet_missions
  for update using (
    user_id is null
    or auth.uid() = user_id
  );

-- DELETE: own rows only
drop policy if exists "fleet_missions_delete" on public.fleet_missions;
create policy "fleet_missions_delete" on public.fleet_missions
  for delete using (
    user_id is null
    or auth.uid() = user_id
  );

-- ── Completed-mission cleanup ─────────────────────────────────
-- When a new mission is inserted as 'active', mark previous
-- active/planned missions for this user (or anon session) as
-- 'completed' so the dashboard always shows exactly one active
-- mission. Uses a trigger so it fires server-side regardless of
-- which client performs the insert.

create or replace function public.deactivate_prior_missions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' then
    update public.fleet_missions
    set    status = 'completed'
    where  status in ('active', 'planned')
      and  id     <> new.id
      and  (
             (new.user_id is null     and user_id is null)
          or (new.user_id is not null and user_id = new.user_id)
           );
  end if;
  return new;
end;
$$;

drop trigger if exists deactivate_prior_missions_on_insert on public.fleet_missions;
create trigger deactivate_prior_missions_on_insert
  after insert on public.fleet_missions
  for each row execute procedure public.deactivate_prior_missions();
