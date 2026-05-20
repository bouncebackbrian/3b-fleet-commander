-- ============================================================
-- 3B FLEET COMMANDER — operational_events table
-- Run in: Fleet Commander Supabase project > SQL Editor
--
-- This table is the operational memory of the fleet.
-- Every field-level incident — receiver delay, parking issue,
-- scale backup, breakdown — gets logged here and surfaced
-- as insights on future dispatches to the same lane.
-- ============================================================

-- ── Event type + severity enums ──────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_type') then
    create type public.event_type as enum (
      'detention',
      'weather_delay',
      'fuel_issue',
      'receiver_delay',
      'parking_issue',
      'breakdown',
      'route_problem',
      'successful_delivery',
      'scale_issue',
      'traffic_delay'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_severity') then
    create type public.event_severity as enum ('info', 'warn', 'critical');
  end if;
end;
$$;

-- ── operational_events ───────────────────────────────────────
create table if not exists public.operational_events (
  id           uuid primary key default gen_random_uuid(),

  -- Link to fleet_missions (nullable: events can outlive their mission row)
  mission_id   uuid references public.fleet_missions(id) on delete set null,

  -- Denormalized for query efficiency — no JOIN needed for lane analysis
  load_number  text,
  origin       text,         -- normalised lower-case for lane matching
  destination  text,         -- normalised lower-case for lane matching

  -- Event detail
  event_type   public.event_type   not null,
  severity     public.event_severity not null default 'info',
  notes        text,
  location     text,         -- free-text: "TA Dallas", "Pilot on I-40 MM 142"

  -- Identity (nullable — scoped when auth is wired)
  user_id      uuid references auth.users on delete cascade,
  created_by   text,         -- driver name or 'system'

  created_at   timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────
-- Lane history lookup (most common dashboard query)
create index if not exists op_events_lane
  on public.operational_events(origin, destination, created_at desc);

-- Per-mission event list
create index if not exists op_events_mission
  on public.operational_events(mission_id, created_at desc)
  where mission_id is not null;

-- Per-user recent events
create index if not exists op_events_user
  on public.operational_events(user_id, created_at desc)
  where user_id is not null;

-- ── Row-Level Security ────────────────────────────────────────
-- Same permissive-while-anonymous posture as fleet_missions.
-- Rows with user_id = null are visible to all (pre-auth mode).
-- Once auth is wired, each driver's events are automatically scoped.
alter table public.operational_events enable row level security;

drop policy if exists "op_events_select" on public.operational_events;
create policy "op_events_select" on public.operational_events
  for select using (user_id is null or auth.uid() = user_id);

drop policy if exists "op_events_insert" on public.operational_events;
create policy "op_events_insert" on public.operational_events
  for insert with check (user_id is null or auth.uid() = user_id);

drop policy if exists "op_events_update" on public.operational_events;
create policy "op_events_update" on public.operational_events
  for update using (user_id is null or auth.uid() = user_id);

drop policy if exists "op_events_delete" on public.operational_events;
create policy "op_events_delete" on public.operational_events
  for delete using (user_id is null or auth.uid() = user_id);
