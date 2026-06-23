-- ============================================================
-- 3B FLEET COMMANDER — Hours of Service (HOS) Logs
-- Migration: 20260623_fleet_hos
--
-- FMCSA-compliant HOS tracking with ELD-grade data model.
-- Tracks driver duty status changes, cycle management,
-- and violation detection.
-- ============================================================

-- ── Duty status enum ────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'hos_duty_status') then
    create type public.hos_duty_status as enum (
      'off_duty',          -- Off duty / personal conveyance
      'sleeper_berth',     -- Sleeper berth
      'driving',           -- Driving
      'on_duty_not_driving'-- On duty, not driving (loading, waiting, etc.)
    );
  end if;
end;
$$;

-- ── HOS cycle type ──────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'hos_cycle') then
    create type public.hos_cycle as enum (
      '70hr_8day',         -- 70 hours / 8 days (property-carrying, no 34hr restart)
      '60hr_7day',         -- 60 hours / 7 days (property-carrying)
      'offshore',          -- Offshore / Alaska-specific
      'short_haul'         -- 100 air-mile exemption / short haul
    );
  end if;
end;
$$;

-- ── hos_logs ─────────────────────────────────────────────────
-- Each row = one duty status change. ELD-grade granularity.
create table if not exists public.hos_logs (
  id                uuid        primary key default gen_random_uuid(),

  -- Driver identity
  driver_id         uuid        not null references public.profiles(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,

  -- Status change
  duty_status       public.hos_duty_status not null,
  changed_at        timestamptz not null default now(),

  -- Location (lat/lng or free-text)
  latitude          numeric(10,7),
  longitude         numeric(10,7),
  location_name     text,                           -- "TA - Dallas, TX" or "I-40 MM 142"

  -- Vehicle
  equipment_id      uuid        references public.fleet_equipment(id) on delete set null,
  trailer_numbers   text[],                          -- multiple trailers if applicable

  -- ELD metadata
  eld_event_id      text,                            -- originating ELD event ID (if from telematics)
  eld_source        text,                            -- 'manual' | 'integration' | 'eld_device'
  verified_by_eld   boolean not null default false,   -- confirmed by ELD hardware

  -- Cycle tracking
  cycle             public.hos_cycle not null default '70hr_8day',
  cycle_start       date not null default current_date,  -- start of current cycle window

  -- Shift metadata
  shift_id          uuid,                            -- groups consecutive on-duty events
  notes             text,                            -- driver annotation ("heavy traffic")

  created_at        timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────
-- Primary query: timeline for a driver/date range
create index if not exists idx_hos_logs_driver_date
  on public.hos_logs(driver_id, changed_at desc);

-- Active driving session lookup
create index if not exists idx_hos_logs_driver_active
  on public.hos_logs(driver_id, changed_at desc)
  where duty_status = 'driving';

-- Cycle compliance queries
create index if not exists idx_hos_logs_cycle
  on public.hos_logs(driver_id, cycle, cycle_start, changed_at);

-- Location-based lookup
create index if not exists idx_hos_logs_location
  on public.hos_logs(location_name) where location_name is not null;

-- ── RLS ───────────────────────────────────────────────────────
alter table public.hos_logs enable row level security;

-- Drivers see their own logs; fleet managers see their fleet's logs
drop policy if exists "hos_logs_select" on public.hos_logs;
create policy "hos_logs_select" on public.hos_logs
  for select using (
    user_id = auth.uid()
    or driver_id in (
      select pm.id from public.profiles pm
      where pm.id in (
        select fbm.user_id from public.fleet_business_members fbm
        where fbm.business_id in (
          select fbm2.business_id from public.fleet_business_members fbm2
          where fbm2.user_id = auth.uid()
          and fbm2.role in ('owner', 'admin', 'dispatcher', 'fleet_manager')
        )
      )
    )
  );

drop policy if exists "hos_logs_insert" on public.hos_logs;
create policy "hos_logs_insert" on public.hos_logs
  for insert with check (user_id = auth.uid());

-- ── HOS Daily Summary View ─────────────────────────────────
-- Materializes the current day's drive time, on-duty time, etc.
-- for a driver. Used by the HOS dashboard widget.
create or replace view public.hos_daily_summary as
select
  driver_id,
  cycle,
  cycle_start,
  date(changed_at) as log_date,
  sum(case when duty_status = 'driving'
      then extract(epoch from (lead(changed_at) over w - changed_at)) / 3600
      else 0 end) as driving_hours,
  sum(case when duty_status = 'on_duty_not_driving'
      then extract(epoch from (lead(changed_at) over w - changed_at)) / 3600
      else 0 end) as on_duty_not_driving_hours,
  sum(case when duty_status in ('driving', 'on_duty_not_driving')
      then extract(epoch from (lead(changed_at) over w - changed_at)) / 3600
      else 0 end) as total_on_duty_hours,
  count(*) filter (where duty_status = 'driving') as driving_event_count
from public.hos_logs
where date(changed_at) >= current_date - interval '8 days'
window w as (partition by driver_id, date(changed_at) order by changed_at)
group by driver_id, cycle, cycle_start, date(changed_at);

-- ============================================================
-- HOS Shift Records (groups consecutive on-duty periods)
-- ============================================================
create table if not exists public.hos_shifts (
  id                uuid        primary key default gen_random_uuid(),

  driver_id         uuid        not null references public.profiles(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,

  shift_date        date        not null default current_date,
  start_time        timestamptz not null,
  end_time          timestamptz,

  -- Totals (computed from hos_logs)
  driving_minutes   integer     not null default 0,
  on_duty_minutes   integer     not null default 0,
  off_duty_minutes  integer     not null default 0,
  sleeper_berth_minutes integer not null default 0,

  -- Violation flags
  has_violation     boolean     not null default false,
  violations        jsonb       default '[]'::jsonb,

  -- Cycle tracking
  cycle             public.hos_cycle not null default '70hr_8day',
  cycle_hours_used  numeric(5,2) not null default 0,  -- cumulative in current cycle

  status            text        not null default 'active'
    check (status in ('active', 'completed', 'violation')),

  -- Shift metadata
  equipment_id      uuid        references public.fleet_equipment(id) on delete set null,
  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_hos_shifts_driver
  on public.hos_shifts(driver_id, shift_date desc);

create index if not exists idx_hos_shifts_status
  on public.hos_shifts(status, shift_date);

create index if not exists idx_hos_shifts_violation
  on public.hos_shifts(driver_id, has_violation, shift_date desc);

alter table public.hos_shifts enable row level security;

drop policy if exists "hos_shifts_select" on public.hos_shifts;
create policy "hos_shifts_select" on public.hos_shifts
  for select using (
    user_id = auth.uid()
    or driver_id in (
      select pm.id from public.profiles pm
      where pm.id in (
        select fbm.user_id from public.fleet_business_members fbm
        where fbm.business_id in (
          select fbm2.business_id from public.fleet_business_members fbm2
          where fbm2.user_id = auth.uid()
          and fbm2.role in ('owner', 'admin', 'dispatcher', 'fleet_manager')
        )
      )
    )
  );

drop policy if exists "hos_shifts_insert" on public.hos_shifts;
create policy "hos_shifts_insert" on public.hos_shifts
  for insert with check (user_id = auth.uid());

drop policy if exists "hos_shifts_update" on public.hos_shifts;
create policy "hos_shifts_update" on public.hos_shifts
  for update using (user_id = auth.uid());

drop trigger if exists set_hos_shifts_updated_at on public.hos_shifts;
create trigger set_hos_shifts_updated_at
  before update on public.hos_shifts
  for each row execute function public.set_updated_at();


-- ============================================================
-- HOS Violation Events
-- ============================================================
create table if not exists public.hos_violations (
  id                uuid        primary key default gen_random_uuid(),

  driver_id         uuid        not null references public.profiles(id) on delete cascade,
  user_id           uuid        references auth.users(id) on delete cascade,
  shift_id          uuid        references public.hos_shifts(id) on delete set null,

  -- Violation details
  violation_type    text        not null,
    -- driving_exceeded_11hr | on_duty_exceeded_14hr |
    -- cycle_exceeded_70hr_8day | cycle_exceeded_60hr_7day |
    -- insufficient_rest_10hr | sleeper_berth_violation |
    -- false_log | missing_log | other

  severity          text        not null default 'warning'
    check (severity in ('warning', 'minor', 'major', 'critical', 'oos')),

  description       text        not null default '',
  occurred_at       timestamptz not null default now(),

  -- Resolution
  status            text        not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved', 'disputed')),

  resolved_at       timestamptz,
  resolved_by       text,
  resolution_notes  text,

  created_at        timestamptz not null default now()
);

create index if not exists idx_hos_violations_driver
  on public.hos_violations(driver_id, occurred_at desc);

create index if not exists idx_hos_violations_status
  on public.hos_violations(status);

create index if not exists idx_hos_violations_severity
  on public.hos_violations(severity, status);

alter table public.hos_violations enable row level security;

drop policy if exists "hos_violations_member_all" on public.hos_violations;
create policy "hos_violations_member_all" on public.hos_violations
  for all using (
    user_id = auth.uid()
    or driver_id in (
      select pm.id from public.profiles pm
      where pm.id in (
        select fbm.user_id from public.fleet_business_members fbm
        where fbm.business_id in (
          select fbm2.business_id from public.fleet_business_members fbm2
          where fbm2.user_id = auth.uid()
        )
      )
    )
  );

notify pgrst, 'reload schema';