-- ============================================================
-- 3B FLEET COMMANDER — Dump Truck Mode: Core Schema
-- Migration: 20260727_fleet_dt_core
--
-- Foundation tables for Dump Truck Mode (Phase 1):
--   fleet_dt_sites            — yards, pickup/dump sites, geofences, nav points
--   fleet_dt_jobs              — dispatch job / assignment
--   fleet_dt_shifts             — driver shift + state machine
--   fleet_dt_events              — append-only operational event log (source of truth)
--   fleet_dt_vehicle_custody      — truck pickup/drop-off custody periods
--   fleet_dt_drive_segments        — derived drive segments (paired depart/arrive events)
--   fleet_dt_load_cycles             — one row per load within a shift/job
--
-- Reuses existing 3B infrastructure — does not duplicate identity/auth/fleet:
--   businesses, profiles, fleet_business_members (tenant + role membership)
--   fleet_equipment (trucks & trailers — dump-truck class already supported)
--   public.set_updated_at() (existing trigger function, fleet_loads migration)
--
-- Naming: `fleet_dt_*` — namespaced Dump Truck Mode extension of the Fleet DB,
-- kept separate from `fleet_loads`/`fleet_load_stops` (OTR freight domain).
--
-- Doc/photo FKs (scale_ticket_doc_id, etc.) are added via ALTER TABLE in the
-- companion migration 20260727_fleet_dt_inspections_docs.sql, once
-- fleet_dt_documents exists.
-- ============================================================

-- ── Helper: business membership + role check (SECURITY DEFINER, STABLE) ───────
-- Centralizes the "is this user an active member of this business, with one
-- of these operational roles" check so every RLS policy below stays DRY.

create or replace function public.fleet_dt_has_role(p_business_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.fleet_business_members
    where business_id = p_business_id
      and user_id = auth.uid()
      and active = true
      and (p_roles is null or role = any(p_roles))
  );
$$;

create or replace function public.fleet_dt_is_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.fleet_dt_has_role(p_business_id, null);
$$;

-- Roles allowed to manage jobs/sites/dispatch and correct records.
-- 'admin' and 'owner' map to spec's "Business Admin/Owner"; 'dispatcher' is dispatcher.
-- Payroll/billing roles are added when Phase 4/5 (payroll & billing) land —
-- fleet_business_members.role currently only has owner|driver|dispatcher|admin|broker|fleet_manager.

-- ============================================================
-- fleet_dt_sites — yards, pickup/dump/customer/fuel sites, geofences, nav points
-- ============================================================

create table if not exists public.fleet_dt_sites (
  id                  uuid        primary key default gen_random_uuid(),
  business_id         uuid        not null references public.businesses(id) on delete cascade,

  site_type           text        not null default 'other'
    check (site_type in ('yard','pickup','dump','customer','fuel','maintenance','scale','disposal','parking','other')),
  name                text        not null,

  address_line1       text,
  address_line2       text,
  city                text,
  state               text,
  postal_code         text,
  country             text        default 'US',

  -- Verified/street coordinates
  lat                 double precision,
  lng                 double precision,
  geofence_radius_m   integer     not null default 300,

  -- Alternate navigation points (may differ from street address pin)
  entrance_lat        double precision,
  entrance_lng        double precision,
  scale_lat           double precision,
  scale_lng           double precision,

  -- Which point to prefer when launching navigation
  preferred_nav_point  text       not null default 'address'
    check (preferred_nav_point in ('address','site_pin','entrance','gate','scale','other')),

  customer_name        text,
  broker_name          text,

  instructions          text,       -- general site instructions
  route_notes            text,      -- truck-specific route notes
  gate_code               text,     -- role-restricted visibility enforced at app layer (never sent to unauthorized roles)
  gate_instructions        text,

  restrictions               jsonb  not null default '{}'::jsonb,
  -- { height_ft, weight_lbs, length_ft, axle_limit, bridge_notes, surface, seasonal, road_restrictions }
  approach_direction          text,
  avoid_notes                  text,

  contact_name                  text,
  contact_phone                   text,
  operating_hours                   jsonb default '{}'::jsonb,

  active                              boolean not null default true,
  verified                             boolean not null default false,
  verified_by                           uuid references public.profiles(id),
  verified_at                            timestamptz,
  archived_at                             timestamptz,

  created_by                               uuid references public.profiles(id),
  created_at                                timestamptz not null default now(),
  updated_at                                 timestamptz not null default now()
);

create index if not exists idx_fleet_dt_sites_business on public.fleet_dt_sites(business_id, active);
create index if not exists idx_fleet_dt_sites_type on public.fleet_dt_sites(business_id, site_type);

alter table public.fleet_dt_sites enable row level security;

drop policy if exists "fleet_dt_sites_select" on public.fleet_dt_sites;
create policy "fleet_dt_sites_select" on public.fleet_dt_sites
  for select using (public.fleet_dt_is_member(business_id));

drop policy if exists "fleet_dt_sites_write" on public.fleet_dt_sites;
create policy "fleet_dt_sites_write" on public.fleet_dt_sites
  for all using (public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']))
  with check (public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

drop trigger if exists set_fleet_dt_sites_updated_at on public.fleet_dt_sites;
create trigger set_fleet_dt_sites_updated_at
  before update on public.fleet_dt_sites
  for each row execute function public.set_updated_at();


-- ============================================================
-- fleet_dt_jobs — dispatch job / assignment
-- ============================================================

create table if not exists public.fleet_dt_jobs (
  id                  uuid        primary key default gen_random_uuid(),
  business_id         uuid        not null references public.businesses(id) on delete cascade,

  job_number          text        not null,
  po_number           text,

  customer_name       text,
  broker_name         text,

  driver_id           uuid        references public.profiles(id),
  truck_id            uuid        references public.fleet_equipment(id),
  trailer_id          uuid        references public.fleet_equipment(id),

  pickup_site_id      uuid        references public.fleet_dt_sites(id),
  dump_site_id        uuid        references public.fleet_dt_sites(id),

  material            text,
  est_quantity         numeric(10,2),
  quantity_unit          text     not null default 'loads'
    check (quantity_unit in ('loads','tons','cubic_yards','hours','miles','units')),

  scheduled_at             timestamptz,
  instructions               text,
  required_documents           jsonb default '[]'::jsonb,

  -- Billing/pay rate wiring is Phase 4/5 (payroll & billing engines) — not built yet.
  rate_notes                     text,

  status                           text not null default 'draft'
    check (status in ('draft','scheduled','active','completed','cancelled')),

  created_by                        uuid references public.profiles(id),
  created_at                         timestamptz not null default now(),
  updated_at                          timestamptz not null default now(),

  unique (business_id, job_number)
);

create index if not exists idx_fleet_dt_jobs_business on public.fleet_dt_jobs(business_id, status);
create index if not exists idx_fleet_dt_jobs_driver on public.fleet_dt_jobs(driver_id, status);

alter table public.fleet_dt_jobs enable row level security;

drop policy if exists "fleet_dt_jobs_select" on public.fleet_dt_jobs;
create policy "fleet_dt_jobs_select" on public.fleet_dt_jobs
  for select using (public.fleet_dt_is_member(business_id));

drop policy if exists "fleet_dt_jobs_write" on public.fleet_dt_jobs;
create policy "fleet_dt_jobs_write" on public.fleet_dt_jobs
  for all using (public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']))
  with check (public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

drop trigger if exists set_fleet_dt_jobs_updated_at on public.fleet_dt_jobs;
create trigger set_fleet_dt_jobs_updated_at
  before update on public.fleet_dt_jobs
  for each row execute function public.set_updated_at();


-- ============================================================
-- fleet_dt_shifts — driver shift + state machine
-- ============================================================

create table if not exists public.fleet_dt_shifts (
  id                  uuid        primary key default gen_random_uuid(),
  business_id         uuid        not null references public.businesses(id) on delete cascade,
  driver_id           uuid        not null references public.profiles(id),

  truck_id            uuid        references public.fleet_equipment(id),
  trailer_id          uuid        references public.fleet_equipment(id),

  state               text        not null default 'draft'
    check (state in (
      'draft','clocked_in','pretrip_in_progress','pretrip_complete','active',
      'posttrip_in_progress','posttrip_complete','clocked_out','submitted',
      'payroll_approved','billing_approved','locked','returned_for_correction','void'
    )),

  clock_in_at          timestamptz,
  clock_out_at           timestamptz,

  start_yard_site_id       uuid    references public.fleet_dt_sites(id),
  end_site_id                uuid  references public.fleet_dt_sites(id),

  device_id                    text,   -- device-generated identifier, for offline idempotency scoping
  device_timezone                text,

  -- Cached summary fields — must remain derivable from fleet_dt_events / load_cycles.
  load_count                       integer not null default 0,

  notes                              text,
  submitted_at                        timestamptz,
  submitted_by                         uuid references public.profiles(id),

  created_at                            timestamptz not null default now(),
  updated_at                             timestamptz not null default now()
);

create index if not exists idx_fleet_dt_shifts_business on public.fleet_dt_shifts(business_id, state);
create index if not exists idx_fleet_dt_shifts_driver on public.fleet_dt_shifts(driver_id, created_at desc);
-- A driver should have at most one non-terminal shift open at a time.
create unique index if not exists uq_fleet_dt_shifts_one_open_per_driver
  on public.fleet_dt_shifts(driver_id)
  where state not in ('clocked_out','submitted','payroll_approved','billing_approved','locked','void');

alter table public.fleet_dt_shifts enable row level security;

drop policy if exists "fleet_dt_shifts_select" on public.fleet_dt_shifts;
create policy "fleet_dt_shifts_select" on public.fleet_dt_shifts
  for select using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll','billing'])
  );

drop policy if exists "fleet_dt_shifts_insert" on public.fleet_dt_shifts;
create policy "fleet_dt_shifts_insert" on public.fleet_dt_shifts
  for insert with check (
    driver_id = auth.uid() and public.fleet_dt_is_member(business_id)
  );

-- Drivers may update their own shift only while it is open (not yet submitted/locked).
-- Dispatchers/admins can correct any shift in their business (drives "returned_for_correction").
drop policy if exists "fleet_dt_shifts_update" on public.fleet_dt_shifts;
create policy "fleet_dt_shifts_update" on public.fleet_dt_shifts
  for update using (
    (driver_id = auth.uid() and state not in ('submitted','payroll_approved','billing_approved','locked'))
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop trigger if exists set_fleet_dt_shifts_updated_at on public.fleet_dt_shifts;
create trigger set_fleet_dt_shifts_updated_at
  before update on public.fleet_dt_shifts
  for each row execute function public.set_updated_at();


-- ============================================================
-- fleet_dt_events — append-only operational event log (source of truth)
-- ============================================================

create table if not exists public.fleet_dt_events (
  -- Client-generated UUID (device creates the id — required for offline idempotency).
  id                    uuid        primary key,
  idempotency_key        text       not null,

  business_id             uuid       not null references public.businesses(id) on delete cascade,
  threeb_id                 text,     -- denormalized 3B-U-XXXXXXXX, resolved server-side at insert time
  driver_id                  uuid     not null references public.profiles(id),

  shift_id                     uuid   not null references public.fleet_dt_shifts(id) on delete cascade,
  job_id                         uuid references public.fleet_dt_jobs(id),
  load_cycle_id                    uuid, -- FK added after fleet_dt_load_cycles is created below
  vehicle_id                         uuid references public.fleet_equipment(id),
  trailer_id                          uuid references public.fleet_equipment(id),

  event_type                            text not null check (event_type in (
    'clock_in','arrive_yard_for_pickup','truck_picked_up',
    'pretrip_started','pretrip_completed',
    'depart_yard','arrive_pickup','loading_started','loading_completed','depart_pickup',
    'arrive_dump','unloading_started','unloading_completed','depart_dump','arrive_yard',
    'break_started','break_ended','delay_started','delay_ended',
    'fuel_stop_started','fuel_stop_ended',
    'posttrip_started','posttrip_completed','truck_dropped_off','clock_out',
    'shift_submitted','correction_requested','event_corrected',
    'shift_approved','shift_reopened',
    'note','photo_captured','ticket_captured'
  )),

  -- Timing evidence — never overwritten.
  device_captured_at                      timestamptz not null,
  server_received_at                       timestamptz not null default now(),
  effective_at                              timestamptz not null,
  timezone                                    text,
  utc_offset_minutes                           integer,

  -- Geolocation evidence.
  lat                                            double precision,
  lng                                              double precision,
  location_accuracy_m                               numeric(8,2),
  gps_captured_at                                     timestamptz,
  location_permission                                   text not null default 'not_requested'
    check (location_permission in ('granted','denied','unavailable','not_requested','timeout')),
  reverse_geocoded_address                                text,
  matched_site_id                                          uuid references public.fleet_dt_sites(id),
  distance_from_site_m                                       numeric(10,2),

  odometer                                                     integer,
  notes                                                          text,
  device_metadata                                                 jsonb default '{}'::jsonb,

  sync_state                                                        text not null default 'synced'
    check (sync_state in ('pending','syncing','synced','conflict','failed')),

  -- Corrections: never mutate old rows' evidentiary fields. A correction is a
  -- NEW event referencing the one it corrects; original stays intact.
  corrects_event_id                                                    uuid references public.fleet_dt_events(id),
  correction_reason                                                     text,

  created_by                                                             uuid references public.profiles(id),
  created_at                                                              timestamptz not null default now(),

  unique (business_id, idempotency_key)
);

create index if not exists idx_fleet_dt_events_shift on public.fleet_dt_events(shift_id, effective_at);
create index if not exists idx_fleet_dt_events_business on public.fleet_dt_events(business_id, event_type, effective_at desc);
create index if not exists idx_fleet_dt_events_driver on public.fleet_dt_events(driver_id, effective_at desc);
create index if not exists idx_fleet_dt_events_load_cycle on public.fleet_dt_events(load_cycle_id) where load_cycle_id is not null;
create index if not exists idx_fleet_dt_events_job on public.fleet_dt_events(job_id) where job_id is not null;

alter table public.fleet_dt_events enable row level security;

drop policy if exists "fleet_dt_events_select" on public.fleet_dt_events;
create policy "fleet_dt_events_select" on public.fleet_dt_events
  for select using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll','billing'])
  );

-- Drivers insert events only for their own open shift. No UPDATE/DELETE policy for
-- drivers at all — the log is append-only; corrections are new rows (event_corrected).
drop policy if exists "fleet_dt_events_insert" on public.fleet_dt_events;
create policy "fleet_dt_events_insert" on public.fleet_dt_events
  for insert with check (
    public.fleet_dt_is_member(business_id)
    and (
      (driver_id = auth.uid() and shift_id in (
        select id from public.fleet_dt_shifts
        where driver_id = auth.uid()
          and state not in ('submitted','payroll_approved','billing_approved','locked')
      ))
      or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
    )
  );

-- No update/delete policies exist for anyone — immutable log. Dashboard/admin
-- "corrections" always insert a new event_corrected row; service-role only may
-- patch sync_state during the offline-sync ack step.


-- ============================================================
-- fleet_dt_vehicle_custody — truck pickup/drop-off custody periods
-- ============================================================

create table if not exists public.fleet_dt_vehicle_custody (
  id                    uuid        primary key default gen_random_uuid(),
  business_id           uuid        not null references public.businesses(id) on delete cascade,
  shift_id              uuid        not null references public.fleet_dt_shifts(id) on delete cascade,
  driver_id             uuid        not null references public.profiles(id),
  truck_id              uuid        not null references public.fleet_equipment(id),
  trailer_id            uuid        references public.fleet_equipment(id),

  start_event_id        uuid        not null references public.fleet_dt_events(id),
  end_event_id          uuid        references public.fleet_dt_events(id),

  start_odometer        integer     not null,
  end_odometer          integer,

  start_yard_site_id    uuid        references public.fleet_dt_sites(id),
  end_site_id           uuid        references public.fleet_dt_sites(id),

  end_condition         text,       -- vehicle condition note at drop-off
  end_fuel_level        text,
  end_key_status         text,

  started_at             timestamptz not null,
  ended_at                 timestamptz,

  created_at                timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  check (end_odometer is null or end_odometer >= start_odometer)
);

create index if not exists idx_fleet_dt_custody_shift on public.fleet_dt_vehicle_custody(shift_id);
create index if not exists idx_fleet_dt_custody_truck on public.fleet_dt_vehicle_custody(truck_id, started_at desc);
-- A truck can only be in custody once at a time (open-ended custody = ended_at is null).
create unique index if not exists uq_fleet_dt_custody_one_open_per_truck
  on public.fleet_dt_vehicle_custody(truck_id)
  where ended_at is null;

alter table public.fleet_dt_vehicle_custody enable row level security;

drop policy if exists "fleet_dt_custody_select" on public.fleet_dt_vehicle_custody;
create policy "fleet_dt_custody_select" on public.fleet_dt_vehicle_custody
  for select using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll','billing'])
  );

drop policy if exists "fleet_dt_custody_write" on public.fleet_dt_vehicle_custody;
create policy "fleet_dt_custody_write" on public.fleet_dt_vehicle_custody
  for insert with check (
    driver_id = auth.uid() and public.fleet_dt_is_member(business_id)
  );

drop policy if exists "fleet_dt_custody_update" on public.fleet_dt_vehicle_custody;
create policy "fleet_dt_custody_update" on public.fleet_dt_vehicle_custody
  for update using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop trigger if exists set_fleet_dt_custody_updated_at on public.fleet_dt_vehicle_custody;
create trigger set_fleet_dt_custody_updated_at
  before update on public.fleet_dt_vehicle_custody
  for each row execute function public.set_updated_at();


-- ============================================================
-- fleet_dt_drive_segments — derived from paired departure/arrival events
-- ============================================================

create table if not exists public.fleet_dt_drive_segments (
  id                    uuid        primary key default gen_random_uuid(),
  business_id           uuid        not null references public.businesses(id) on delete cascade,
  shift_id              uuid        not null references public.fleet_dt_shifts(id) on delete cascade,
  load_cycle_id         uuid,       -- FK added after fleet_dt_load_cycles is created below
  driver_id             uuid        not null references public.profiles(id),
  truck_id              uuid        not null references public.fleet_equipment(id),
  trailer_id            uuid        references public.fleet_equipment(id),

  origin_site_id        uuid        references public.fleet_dt_sites(id),
  destination_site_id   uuid        references public.fleet_dt_sites(id),

  depart_event_id       uuid        not null references public.fleet_dt_events(id),
  arrive_event_id       uuid        references public.fleet_dt_events(id),

  category               text       not null default 'other'
    check (category in ('empty','loaded','yard_transfer','fuel','maintenance','other')),

  started_at              timestamptz not null,
  ended_at                  timestamptz,
  duration_seconds           integer,

  start_odometer               integer,
  end_odometer                   integer,
  segment_miles                    numeric(8,2),

  is_exception                       boolean not null default false,
  exception_reason                     text,

  created_at                            timestamptz not null default now(),
  updated_at                             timestamptz not null default now()
);

create index if not exists idx_fleet_dt_segments_shift on public.fleet_dt_drive_segments(shift_id, started_at);
create index if not exists idx_fleet_dt_segments_truck on public.fleet_dt_drive_segments(truck_id, started_at desc);
create index if not exists idx_fleet_dt_segments_open on public.fleet_dt_drive_segments(shift_id) where ended_at is null;

alter table public.fleet_dt_drive_segments enable row level security;

drop policy if exists "fleet_dt_segments_select" on public.fleet_dt_drive_segments;
create policy "fleet_dt_segments_select" on public.fleet_dt_drive_segments
  for select using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll','billing'])
  );

drop policy if exists "fleet_dt_segments_insert" on public.fleet_dt_drive_segments;
create policy "fleet_dt_segments_insert" on public.fleet_dt_drive_segments
  for insert with check (driver_id = auth.uid() and public.fleet_dt_is_member(business_id));

drop policy if exists "fleet_dt_segments_update" on public.fleet_dt_drive_segments;
create policy "fleet_dt_segments_update" on public.fleet_dt_drive_segments
  for update using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop trigger if exists set_fleet_dt_segments_updated_at on public.fleet_dt_drive_segments;
create trigger set_fleet_dt_segments_updated_at
  before update on public.fleet_dt_drive_segments
  for each row execute function public.set_updated_at();


-- ============================================================
-- fleet_dt_load_cycles — one row per load within a shift/job
-- ============================================================

create table if not exists public.fleet_dt_load_cycles (
  id                        uuid        primary key default gen_random_uuid(),
  business_id               uuid        not null references public.businesses(id) on delete cascade,
  shift_id                  uuid        not null references public.fleet_dt_shifts(id) on delete cascade,
  job_id                    uuid        not null references public.fleet_dt_jobs(id),
  driver_id                 uuid        not null references public.profiles(id),

  sequence                  integer     not null,   -- auto-numbered within shift

  pickup_site_id            uuid        references public.fleet_dt_sites(id),
  dump_site_id               uuid       references public.fleet_dt_sites(id),

  pickup_arrive_event_id       uuid     references public.fleet_dt_events(id),
  pickup_depart_event_id         uuid   references public.fleet_dt_events(id),
  loading_started_event_id         uuid references public.fleet_dt_events(id),
  loading_completed_event_id         uuid references public.fleet_dt_events(id),
  dump_arrive_event_id                 uuid references public.fleet_dt_events(id),
  dump_depart_event_id                   uuid references public.fleet_dt_events(id),
  unloading_started_event_id               uuid references public.fleet_dt_events(id),
  unloading_completed_event_id               uuid references public.fleet_dt_events(id),

  material                                     text,
  quantity                                       numeric(10,2),
  quantity_unit                                    text default 'tons',
  weight_tons                                        numeric(10,2),
  ticket_number                                        text,

  -- Doc FKs (scale/delivery ticket images) added via ALTER TABLE once
  -- fleet_dt_documents exists — see 20260727_fleet_dt_inspections_docs.sql.
  scale_ticket_doc_id                                    uuid,
  delivery_ticket_doc_id                                   uuid,

  origin_odometer                                            integer,
  destination_odometer                                         integer,

  billable_status                                                text not null default 'pending'
    check (billable_status in ('pending','billable','excluded','disputed')),
  exception_flags                                                  jsonb not null default '[]'::jsonb,
  driver_notes                                                       text,

  created_at                                                          timestamptz not null default now(),
  updated_at                                                           timestamptz not null default now(),

  unique (shift_id, sequence)
);

create index if not exists idx_fleet_dt_load_cycles_shift on public.fleet_dt_load_cycles(shift_id, sequence);
create index if not exists idx_fleet_dt_load_cycles_job on public.fleet_dt_load_cycles(job_id);

alter table public.fleet_dt_load_cycles enable row level security;

drop policy if exists "fleet_dt_load_cycles_select" on public.fleet_dt_load_cycles;
create policy "fleet_dt_load_cycles_select" on public.fleet_dt_load_cycles
  for select using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll','billing'])
  );

drop policy if exists "fleet_dt_load_cycles_insert" on public.fleet_dt_load_cycles;
create policy "fleet_dt_load_cycles_insert" on public.fleet_dt_load_cycles
  for insert with check (driver_id = auth.uid() and public.fleet_dt_is_member(business_id));

drop policy if exists "fleet_dt_load_cycles_update" on public.fleet_dt_load_cycles;
create policy "fleet_dt_load_cycles_update" on public.fleet_dt_load_cycles
  for update using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop trigger if exists set_fleet_dt_load_cycles_updated_at on public.fleet_dt_load_cycles;
create trigger set_fleet_dt_load_cycles_updated_at
  before update on public.fleet_dt_load_cycles
  for each row execute function public.set_updated_at();


-- ── Back-fill the forward references from events/segments → load_cycles ───────
alter table public.fleet_dt_events
  add constraint fleet_dt_events_load_cycle_fk
  foreign key (load_cycle_id) references public.fleet_dt_load_cycles(id) on delete set null;

alter table public.fleet_dt_drive_segments
  add constraint fleet_dt_segments_load_cycle_fk
  foreign key (load_cycle_id) references public.fleet_dt_load_cycles(id) on delete set null;


-- ============================================================
-- View: fleet_dt_shift_summary — daily shift summary derived from events
-- ============================================================

create or replace view public.fleet_dt_shift_summary as
select
  s.id                as shift_id,
  s.business_id,
  s.driver_id,
  s.truck_id,
  s.trailer_id,
  s.state,
  s.clock_in_at,
  s.clock_out_at,
  extract(epoch from (coalesce(s.clock_out_at, now()) - s.clock_in_at)) / 3600.0 as shift_hours,
  (select count(*) from public.fleet_dt_load_cycles lc where lc.shift_id = s.id) as load_count,
  (select coalesce(sum(seg.duration_seconds), 0) from public.fleet_dt_drive_segments seg
     where seg.shift_id = s.id and seg.category = 'empty')  as empty_drive_seconds,
  (select coalesce(sum(seg.duration_seconds), 0) from public.fleet_dt_drive_segments seg
     where seg.shift_id = s.id and seg.category = 'loaded') as loaded_drive_seconds,
  (select coalesce(sum(seg.duration_seconds), 0) from public.fleet_dt_drive_segments seg
     where seg.shift_id = s.id) as total_drive_seconds,
  (select min(started_at) from public.fleet_dt_vehicle_custody c where c.shift_id = s.id) as custody_started_at,
  (select max(ended_at) from public.fleet_dt_vehicle_custody c where c.shift_id = s.id)   as custody_ended_at
from public.fleet_dt_shifts s;

alter view public.fleet_dt_shift_summary set (security_invoker = true);

-- ── Notify PostgREST of schema changes ──────────────────────
notify pgrst, 'reload schema';
