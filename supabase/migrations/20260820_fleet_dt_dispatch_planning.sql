-- ============================================================
-- 3B FLEET COMMANDER — AI Dispatch Intake & Driver Trip Planning
-- Migration: 20260820_fleet_dt_dispatch_planning
--
-- Adds a planning layer on top of the existing fleet_dt_jobs operational
-- record: Hector pastes/types incoming job info, AI parses it into a draft
-- (fleet_dt_dispatches + fleet_dt_dispatch_stops), Fleet Commander computes
-- real drive time + recommended yard-arrival/leave-yard/target-arrival
-- times (fleet_dt_dispatch_route_estimates), Hector reviews/edits/publishes
-- (fleet_dt_dispatch_versions, fleet_dt_dispatch_acknowledgements track the
-- history + driver acknowledgement). Publishing creates/links the real
-- fleet_dt_jobs row — the dispatch record never duplicates job/site/driver/
-- truck data, it only adds the planning metadata those tables don't carry.
--
-- Raw AI parses are kept forever in fleet_dt_dispatch_ai_parses (with the
-- original pasted text) even after Hector edits over them, per the "make
-- disputes and AI parsing errors auditable" requirement.
-- ============================================================

-- ── Site aliases — reuse fleet_dt_sites, add alt names for text matching ───
alter table public.fleet_dt_sites add column if not exists aliases text[] not null default '{}';
create index if not exists idx_fleet_dt_sites_aliases on public.fleet_dt_sites using gin(aliases);

-- ============================================================
-- fleet_dt_dispatch_settings — one row per business, configurable timing policy
-- ============================================================

create table if not exists public.fleet_dt_dispatch_settings (
  id                              uuid        primary key default gen_random_uuid(),
  business_id                     uuid        not null references public.businesses(id) on delete cascade,

  default_pretrip_minutes         int         not null default 20 check (default_pretrip_minutes >= 0),
  target_early_arrival_minutes    int         not null default 10 check (target_early_arrival_minutes >= 0),
  max_late_minutes                int         not null default 10 check (max_late_minutes >= 0),
  route_recalc_threshold_minutes  int         not null default 10 check (route_recalc_threshold_minutes >= 0),
  traffic_enabled                 boolean     not null default false,
  default_yard_site_id            uuid        references public.fleet_dt_sites(id),
  driver_ack_required             boolean     not null default true,

  updated_by                      uuid        references public.profiles(id),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),

  unique (business_id)
);

alter table public.fleet_dt_dispatch_settings enable row level security;

drop policy if exists "fleet_dt_dispatch_settings_select" on public.fleet_dt_dispatch_settings;
create policy "fleet_dt_dispatch_settings_select" on public.fleet_dt_dispatch_settings
  for select using (fleet_dt_is_member(business_id));

drop policy if exists "fleet_dt_dispatch_settings_write" on public.fleet_dt_dispatch_settings;
create policy "fleet_dt_dispatch_settings_write" on public.fleet_dt_dispatch_settings
  for all using (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']))
  with check (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

drop trigger if exists set_fleet_dt_dispatch_settings_updated_at on public.fleet_dt_dispatch_settings;
create trigger set_fleet_dt_dispatch_settings_updated_at
  before update on public.fleet_dt_dispatch_settings
  for each row execute function public.set_updated_at();

-- ============================================================
-- fleet_dt_dispatches — the AI-parsed / Hector-authored planning record
-- ============================================================

create table if not exists public.fleet_dt_dispatches (
  id                          uuid        primary key default gen_random_uuid(),
  business_id                 uuid        not null references public.businesses(id) on delete cascade,

  status                      text        not null default 'draft'
    check (status in ('draft', 'published', 'cancelled')),

  -- Source of truth for the original ask — never discarded, even after edits.
  raw_input                   text,
  source                      text        not null default 'manual' check (source in ('paste', 'manual')),

  dispatch_date                date,

  customer_name                text,
  broker_id                    uuid        references public.fleet_brokers(id),
  broker_name                  text,
  dispatch_contact_name        text,
  dispatch_contact_phone       text,

  po_number                    text,
  job_number                   text,
  load_number                  text,

  -- Driver/truck may not resolve to a real onboarded profile/equipment row yet
  -- (e.g. a driver mentioned by name who hasn't been added to Fleet Commander) —
  -- the *_raw fields preserve what was said even when the *_id can't be set.
  driver_id                    uuid        references public.profiles(id),
  driver_name_raw              text,
  truck_id                     uuid        references public.fleet_equipment(id),
  truck_label_raw              text,
  trailer_id                   uuid        references public.fleet_equipment(id),

  yard_site_id                 uuid        references public.fleet_dt_sites(id),
  required_arrival_at          timestamptz,

  material                     text,
  est_quantity                 numeric(10,2),
  quantity_unit                text        default 'loads'
    check (quantity_unit in ('loads','tons','cubic_yards','hours','miles','units')),
  num_loads_estimate           int,
  weight_requirements          text,
  ticket_requirements          text,
  scale_required                boolean,

  special_instructions         text,
  gate_instructions            text,
  contact_on_arrival_instructions text,
  safety_instructions          text,
  truck_restrictions           text,
  trailer_requirements         text,
  return_instructions          text,
  est_duration_minutes         int,

  rate_type                    text        check (rate_type in ('hourly', 'per_load')),
  customer_rate                numeric(10,2),
  driver_pay_rule              text,
  notes                        text,

  -- Cached recommendation (recomputed by computeDispatchRoute — see service
  -- layer doc). Kept here (not solely derived) so the board/driver card can
  -- render without recomputing routes on every read.
  calculated_drive_minutes     numeric(10,2),
  calculated_traffic_drive_minutes numeric(10,2),
  recommended_yard_arrival_at  timestamptz,
  recommended_leave_yard_at    timestamptz,
  target_site_arrival_at       timestamptz,
  route_calculated_at          timestamptz,

  job_id                       uuid        references public.fleet_dt_jobs(id),

  current_version              int         not null default 1,
  published_at                 timestamptz,
  published_by                 uuid        references public.profiles(id),
  cancelled_at                 timestamptz,
  cancelled_by                 uuid        references public.profiles(id),
  cancel_reason                text,

  created_by                   uuid        references public.profiles(id),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create index if not exists idx_fleet_dt_dispatches_business on public.fleet_dt_dispatches(business_id, status, dispatch_date);
create index if not exists idx_fleet_dt_dispatches_driver on public.fleet_dt_dispatches(driver_id, dispatch_date);

alter table public.fleet_dt_dispatches enable row level security;

-- Drivers may see only their own or fleet-wide-published dispatches; dispatch/admin see everything for the business.
drop policy if exists "fleet_dt_dispatches_select" on public.fleet_dt_dispatches;
create policy "fleet_dt_dispatches_select" on public.fleet_dt_dispatches
  for select using (
    fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
    or (driver_id = auth.uid() and status = 'published')
  );

drop policy if exists "fleet_dt_dispatches_write" on public.fleet_dt_dispatches;
create policy "fleet_dt_dispatches_write" on public.fleet_dt_dispatches
  for all using (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']))
  with check (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

drop trigger if exists set_fleet_dt_dispatches_updated_at on public.fleet_dt_dispatches;
create trigger set_fleet_dt_dispatches_updated_at
  before update on public.fleet_dt_dispatches
  for each row execute function public.set_updated_at();

-- ============================================================
-- fleet_dt_dispatch_stops — ordered stops (yard/pickup/delivery/return)
-- ============================================================

create table if not exists public.fleet_dt_dispatch_stops (
  id                  uuid        primary key default gen_random_uuid(),
  business_id         uuid        not null references public.businesses(id) on delete cascade,
  dispatch_id         uuid        not null references public.fleet_dt_dispatches(id) on delete cascade,

  sequence            int         not null,
  stop_type           text        not null check (stop_type in ('yard', 'pickup', 'delivery', 'return', 'other')),
  site_id             uuid        references public.fleet_dt_sites(id),
  raw_location_text   text,
  site_confidence     text        check (site_confidence in ('high', 'medium', 'low')),
  material             text,
  notes                text,

  created_at           timestamptz not null default now(),

  unique (dispatch_id, sequence)
);

create index if not exists idx_fleet_dt_dispatch_stops_dispatch on public.fleet_dt_dispatch_stops(dispatch_id, sequence);

alter table public.fleet_dt_dispatch_stops enable row level security;

drop policy if exists "fleet_dt_dispatch_stops_select" on public.fleet_dt_dispatch_stops;
create policy "fleet_dt_dispatch_stops_select" on public.fleet_dt_dispatch_stops
  for select using (
    fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
    or exists (
      select 1 from public.fleet_dt_dispatches d
      where d.id = fleet_dt_dispatch_stops.dispatch_id and d.driver_id = auth.uid() and d.status = 'published'
    )
  );

drop policy if exists "fleet_dt_dispatch_stops_write" on public.fleet_dt_dispatch_stops;
create policy "fleet_dt_dispatch_stops_write" on public.fleet_dt_dispatch_stops
  for all using (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']))
  with check (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

-- ============================================================
-- fleet_dt_dispatch_route_estimates — per-leg real routing results
-- ============================================================

create table if not exists public.fleet_dt_dispatch_route_estimates (
  id                      uuid        primary key default gen_random_uuid(),
  business_id             uuid        not null references public.businesses(id) on delete cascade,
  dispatch_id             uuid        not null references public.fleet_dt_dispatches(id) on delete cascade,

  from_stop_id            uuid        references public.fleet_dt_dispatch_stops(id),
  to_stop_id               uuid        references public.fleet_dt_dispatch_stops(id),
  leg_label                text,        -- e.g. "Yard -> Pickup", "Pickup -> Delivery"

  distance_miles          numeric(10,2),
  duration_minutes        numeric(10,2),
  traffic_duration_minutes numeric(10,2),
  provider                text,
  provider_version        text,
  calculated_at            timestamptz not null default now()
);

create index if not exists idx_fleet_dt_dispatch_route_estimates_dispatch on public.fleet_dt_dispatch_route_estimates(dispatch_id, calculated_at desc);

alter table public.fleet_dt_dispatch_route_estimates enable row level security;

drop policy if exists "fleet_dt_dispatch_route_estimates_select" on public.fleet_dt_dispatch_route_estimates;
create policy "fleet_dt_dispatch_route_estimates_select" on public.fleet_dt_dispatch_route_estimates
  for select using (
    fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
    or exists (
      select 1 from public.fleet_dt_dispatches d
      where d.id = fleet_dt_dispatch_route_estimates.dispatch_id and d.driver_id = auth.uid() and d.status = 'published'
    )
  );

drop policy if exists "fleet_dt_dispatch_route_estimates_write" on public.fleet_dt_dispatch_route_estimates;
create policy "fleet_dt_dispatch_route_estimates_write" on public.fleet_dt_dispatch_route_estimates
  for all using (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']))
  with check (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

-- ============================================================
-- fleet_dt_dispatch_ai_parses — audit trail of every AI parse attempt
-- ============================================================

create table if not exists public.fleet_dt_dispatch_ai_parses (
  id                  uuid        primary key default gen_random_uuid(),
  business_id         uuid        not null references public.businesses(id) on delete cascade,
  dispatch_id         uuid        references public.fleet_dt_dispatches(id) on delete cascade,

  raw_input           text        not null,
  parsed_json         jsonb       not null,
  confidence_json      jsonb       not null default '{}'::jsonb,
  warnings             jsonb       not null default '[]'::jsonb,
  model                text,

  created_by           uuid        references public.profiles(id),
  created_at            timestamptz not null default now()
);

create index if not exists idx_fleet_dt_dispatch_ai_parses_dispatch on public.fleet_dt_dispatch_ai_parses(dispatch_id, created_at desc);

alter table public.fleet_dt_dispatch_ai_parses enable row level security;

drop policy if exists "fleet_dt_dispatch_ai_parses_select" on public.fleet_dt_dispatch_ai_parses;
create policy "fleet_dt_dispatch_ai_parses_select" on public.fleet_dt_dispatch_ai_parses
  for select using (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

drop policy if exists "fleet_dt_dispatch_ai_parses_write" on public.fleet_dt_dispatch_ai_parses;
create policy "fleet_dt_dispatch_ai_parses_write" on public.fleet_dt_dispatch_ai_parses
  for all using (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']))
  with check (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

-- ============================================================
-- fleet_dt_dispatch_versions — version history (material changes)
-- ============================================================

create table if not exists public.fleet_dt_dispatch_versions (
  id                  uuid        primary key default gen_random_uuid(),
  business_id         uuid        not null references public.businesses(id) on delete cascade,
  dispatch_id         uuid        not null references public.fleet_dt_dispatches(id) on delete cascade,

  version_number       int         not null,
  snapshot              jsonb       not null,
  changed_fields         jsonb       not null default '{}'::jsonb,
  reason                text,

  changed_by            uuid        references public.profiles(id),
  changed_at             timestamptz not null default now(),

  unique (dispatch_id, version_number)
);

create index if not exists idx_fleet_dt_dispatch_versions_dispatch on public.fleet_dt_dispatch_versions(dispatch_id, version_number desc);

alter table public.fleet_dt_dispatch_versions enable row level security;

drop policy if exists "fleet_dt_dispatch_versions_select" on public.fleet_dt_dispatch_versions;
create policy "fleet_dt_dispatch_versions_select" on public.fleet_dt_dispatch_versions
  for select using (
    fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
    or exists (
      select 1 from public.fleet_dt_dispatches d
      where d.id = fleet_dt_dispatch_versions.dispatch_id and d.driver_id = auth.uid() and d.status = 'published'
    )
  );

drop policy if exists "fleet_dt_dispatch_versions_write" on public.fleet_dt_dispatch_versions;
create policy "fleet_dt_dispatch_versions_write" on public.fleet_dt_dispatch_versions
  for all using (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']))
  with check (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

-- ============================================================
-- fleet_dt_dispatch_acknowledgements — publish/view/ack tracking per driver+version
-- ============================================================

create table if not exists public.fleet_dt_dispatch_acknowledgements (
  id                  uuid        primary key default gen_random_uuid(),
  business_id         uuid        not null references public.businesses(id) on delete cascade,
  dispatch_id         uuid        not null references public.fleet_dt_dispatches(id) on delete cascade,
  driver_id           uuid        not null references public.profiles(id),
  version_number      int         not null,

  published_at         timestamptz,
  viewed_at             timestamptz,
  acknowledged_at        timestamptz,
  device_metadata        jsonb       not null default '{}'::jsonb,

  created_at             timestamptz not null default now(),

  unique (dispatch_id, driver_id, version_number)
);

create index if not exists idx_fleet_dt_dispatch_acks_driver on public.fleet_dt_dispatch_acknowledgements(driver_id, dispatch_id);

alter table public.fleet_dt_dispatch_acknowledgements enable row level security;

drop policy if exists "fleet_dt_dispatch_acks_select" on public.fleet_dt_dispatch_acknowledgements;
create policy "fleet_dt_dispatch_acks_select" on public.fleet_dt_dispatch_acknowledgements
  for select using (
    fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
    or driver_id = auth.uid()
  );

-- Dispatch/admin create rows (on publish); the assigned driver may update
-- only their own row's viewed_at/acknowledged_at/device_metadata (enforced
-- at the application layer — RLS here just gates row ownership).
drop policy if exists "fleet_dt_dispatch_acks_write" on public.fleet_dt_dispatch_acknowledgements;
create policy "fleet_dt_dispatch_acks_write" on public.fleet_dt_dispatch_acknowledgements
  for all using (
    fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
    or driver_id = auth.uid()
  )
  with check (
    fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
    or driver_id = auth.uid()
  );

notify pgrst, 'reload schema';
