-- ============================================================
-- 3B FLEET COMMANDER — Fleet Equipment (Trucks & Trailers)
-- Migration: 20260623_fleet_equipment
--
-- Adds equipment management tables. Previously, tractor/trailer
-- data was stored as free-text fields on loads. This migration
-- creates a proper equipment registry with maintenance tracking,
-- inspection schedules, and status management.
-- ============================================================

-- ── Equipment type enum ─────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'equipment_type') then
    create type public.equipment_type as enum (
      'tractor', 'straight_truck', 'trailer_van',
      'trailer_reefer', 'trailer_flatbed', 'trailer_tanker',
      'trailer_lowboy', 'trailer_stepdeck', 'trailer_dump',
      'sprinter_van', 'cargo_van', 'other'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'equipment_status') then
    create type public.equipment_status as enum (
      'active', 'in_shop', 'out_of_service', 'retired', 'pending_inspection'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'fuel_type') then
    create type public.fuel_type as enum (
      'diesel', 'gasoline', 'electric', 'cng', 'lng', 'hydrogen'
    );
  end if;
end;
$$;

-- ── fleet_equipment ──────────────────────────────────────────
create table if not exists public.fleet_equipment (
  id                uuid        primary key default gen_random_uuid(),

  -- Business scoping
  business_id       uuid        references public.businesses(id) on delete cascade,
  owner_id          uuid        references public.profiles(id) on delete set null,

  -- Identity
  equipment_type    public.equipment_type not null default 'tractor',
  unit_number       text        not null,           -- fleet unit number (e.g. "TR-101")
  vin               text,
  license_plate     text,
  license_state     char(2),

  -- Vehicle details
  make              text,
  model             text,
  year              integer,
  color             text,
  fuel_type         public.fuel_type not null default 'diesel',

  -- Registration
  dot_number        text,                           -- USDOT number
  mc_number         text,                           -- MC number
  registration_exp  date,
  insurance_exp     date,
  inspection_exp    date,

  -- Lease / ownership
  ownership         text        not null default 'owned'
    check (ownership in ('owned', 'leased', 'rental', 'owner_operator')),
  lessor_name       text,                           -- leasing company name
  lease_expires     date,

  -- Status
  status            public.equipment_status not null default 'active',
  notes             text,

  -- Odometer tracking
  current_odometer  integer,                        -- latest odometer reading (miles)
  last_odometer_update timestamptz,

  -- Identity
  user_id           uuid        references auth.users on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (business_id, unit_number)
);

-- ── Indexes ──────────────────────────────────────────────────
create index if not exists idx_fleet_equipment_business
  on public.fleet_equipment(business_id, unit_number);

create index if not exists idx_fleet_equipment_type
  on public.fleet_equipment(equipment_type, status);

create index if not exists idx_fleet_equipment_status
  on public.fleet_equipment(status);

create index if not exists idx_fleet_equipment_expiry
  on public.fleet_equipment(inspection_exp) where inspection_exp is not null;

-- ── RLS ───────────────────────────────────────────────────────
alter table public.fleet_equipment enable row level security;

drop policy if exists "fleet_equipment_member_select" on public.fleet_equipment;
create policy "fleet_equipment_member_select" on public.fleet_equipment
  for select using (
    business_id in (select business_id from public.fleet_business_members where user_id = auth.uid())
    or user_id = auth.uid()
  );

drop policy if exists "fleet_equipment_member_insert" on public.fleet_equipment;
create policy "fleet_equipment_member_insert" on public.fleet_equipment
  for insert with check (
    business_id in (select business_id from public.fleet_business_members where user_id = auth.uid())
    or user_id = auth.uid()
  );

drop policy if exists "fleet_equipment_member_update" on public.fleet_equipment;
create policy "fleet_equipment_member_update" on public.fleet_equipment
  for update using (
    business_id in (select business_id from public.fleet_business_members
                    where user_id = auth.uid()
                    and role in ('owner', 'admin', 'dispatcher', 'fleet_manager'))
  );

-- ── updated_at trigger ────────────────────────────────────────
drop trigger if exists set_fleet_equipment_updated_at on public.fleet_equipment;
create trigger set_fleet_equipment_updated_at
  before update on public.fleet_equipment
  for each row execute function public.set_updated_at();


-- ============================================================
-- MAINTENANCE SCHEDULE
-- ============================================================

create table if not exists public.fleet_maintenance_schedule (
  id                uuid        primary key default gen_random_uuid(),

  equipment_id      uuid        not null references public.fleet_equipment(id) on delete cascade,

  -- Maintenance type
  maintenance_type  text        not null,
    -- oil_change | tire_replacement | brake_service | dpf_regeneration |
    -- inspection | annual_dot | preventive_maintenance | repair | other

  -- Schedule
  schedule_type     text        not null default 'interval',
    -- interval (every X miles/hours) | date (specific date) | both
  interval_miles    integer,                        -- schedule every N miles
  interval_hours    integer,                        -- schedule every N engine hours
  interval_days     integer,                        -- schedule every N days
  due_date          date,                           -- fixed due date
  due_miles         integer,                        -- odometer reading when due

  -- Status
  status            text        not null default 'scheduled'
    check (status in ('scheduled', 'due', 'overdue', 'in_progress', 'completed', 'cancelled')),

  -- Completion
  completed_at      timestamptz,
  completed_miles   integer,
  completed_by      text,
  notes             text,
  cost              numeric(10,2),

  -- Vendor
  vendor_name       text,
  vendor_location   text,
  invoice_number    text,

  -- Identity
  user_id           uuid        references auth.users on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Indexes
create index if not exists idx_maintenance_equipment
  on public.fleet_maintenance_schedule(equipment_id, due_date);

create index if not exists idx_maintenance_status
  on public.fleet_maintenance_schedule(status, due_date);

create index if not exists idx_maintenance_due
  on public.fleet_maintenance_schedule(due_date)
  where status in ('scheduled', 'due', 'overdue');

alter table public.fleet_maintenance_schedule enable row level security;

drop policy if exists "maintenance_member_all" on public.fleet_maintenance_schedule;
create policy "maintenance_member_all" on public.fleet_maintenance_schedule
  for all using (
    equipment_id in (
      select id from public.fleet_equipment
      where business_id in (
        select business_id from public.fleet_business_members
        where user_id = auth.uid()
      )
    )
    or user_id = auth.uid()
  );

drop trigger if exists set_maintenance_updated_at on public.fleet_maintenance_schedule;
create trigger set_maintenance_updated_at
  before update on public.fleet_maintenance_schedule
  for each row execute function public.set_updated_at();


-- ============================================================
-- ODOMETER / FUEL LOGS (engine hours & mileage snapshots)
-- ============================================================

create table if not exists public.fleet_equipment_logs (
  id                uuid        primary key default gen_random_uuid(),

  equipment_id      uuid        not null references public.fleet_equipment(id) on delete cascade,

  -- Reading
  odometer          integer,                        -- miles
  engine_hours      numeric(8,1),                   -- total engine hours
  recorded_at       timestamptz not null default now(),

  -- Source
  source            text        not null default 'manual'
    check (source in ('manual', 'elog', 'telematics', 'inspection')),

  notes             text,

  -- Identity
  user_id           uuid        references auth.users on delete cascade,
  created_at        timestamptz not null default now()
);

create index if not exists idx_equipment_logs_equipment
  on public.fleet_equipment_logs(equipment_id, recorded_at desc);

alter table public.fleet_equipment_logs enable row level security;

drop policy if exists "equipment_logs_member_all" on public.fleet_equipment_logs;
create policy "equipment_logs_member_all" on public.fleet_equipment_logs
  for all using (
    equipment_id in (
      select id from public.fleet_equipment
      where business_id in (
        select business_id from public.fleet_business_members
        where user_id = auth.uid()
      )
    )
    or user_id = auth.uid()
  );

-- ── Notify PostgREST of schema changes ──────────────────────
notify pgrst, 'reload schema';