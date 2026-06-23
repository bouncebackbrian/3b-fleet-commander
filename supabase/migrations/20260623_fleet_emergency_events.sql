-- ============================================================
-- 3B FLEET COMMANDER — Emergency Events & Incident Response
-- Migration: 20260623_fleet_emergency_events
--
-- Emergency/incident tracking: accidents, medical emergencies,
-- weather emergencies, hazardous material spills, theft,
-- roadside breakdowns requiring emergency response, etc.
-- ============================================================

-- ── Emergency type enum ────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'emergency_type') then
    create type public.emergency_type as enum (
      'accident',            -- Vehicle accident / collision
      'medical',             -- Driver medical emergency
      'breakdown',           -- Major breakdown (stranded)
      'weather',             -- Severe weather / road closure
      'hazmat_spill',        -- Hazardous material incident
      'theft',               -- Theft / cargo theft
      'fire',                -- Vehicle fire
      'roadside_assist',     -- Non-emergency roadside assistance
      'security_threat',     -- Personal security threat
      'natural_disaster',    -- Earthquake, flood, tornado, etc.
      'other'                -- Other emergency
    );
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'emergency_severity') then
    create type public.emergency_severity as enum (
      'low',                 -- Minor issue, no immediate danger
      'medium',              -- Requires attention, some risk
      'high',                -- Significant risk, needs response
      'critical'             -- Life-threatening or severe property damage
    );
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'emergency_status') then
    create type public.emergency_status as enum (
      'reported',            -- Emergency reported, not yet acknowledged
      'acknowledged',        -- Dispatch/fleet manager aware
      'responding',          -- Emergency services or roadside en route
      'resolved',            -- Situation resolved
      'closed'               -- Post-incident review complete
    );
  end if;
end;
$$;

-- ── fleet_emergency_events ─────────────────────────────────
create table if not exists public.fleet_emergency_events (
  id                uuid        primary key default gen_random_uuid(),

  -- Business scoping
  business_id       uuid        references public.businesses(id) on delete cascade,

  -- Emergency details
  emergency_type    public.emergency_type not null,
  severity          public.emergency_severity not null default 'medium',
  status            public.emergency_status not null default 'reported',

  -- Timelines
  occurred_at       timestamptz not null default now(),
  reported_at       timestamptz not null default now(),
  acknowledged_at   timestamptz,
  resolved_at       timestamptz,

  -- Location
  latitude          numeric(10,7),
  longitude         numeric(10,7),
  location_name     text,                           -- "I-40 MM 142, near Oklahoma City, OK"
  location_details  text,                           -- "Eastbound shoulder, mile marker 142"

  -- Driver information
  driver_id         uuid        references public.profiles(id) on delete set null,
  user_id           uuid        references auth.users(id) on delete cascade,

  -- Vehicle
  equipment_id      uuid        references public.fleet_equipment(id) on delete set null,
  load_id           uuid        references public.fleet_loads(id) on delete set null,

  -- Incident details
  description       text        not null,
  injuries          boolean     not null default false,
  injuries_detail   text,
  fatalities        boolean     not null default false,
  police_on_scene   boolean     not null default false,
  police_department text,
  police_report_number text,
  ambulance_called  boolean     not null default false,
  tow_required      boolean     not null default false,
  tow_company       text,
  cargo_damage      boolean     not null default false,
  cargo_damage_estimate numeric(12,2),

  -- Notifications sent
  notified_911      boolean     not null default false,
  notified_dispatch boolean     not null default true,
  notified_owner    boolean     not null default false,
  notified_safety   boolean     not null default false,
  notified_insurance boolean    not null default false,

  -- Resolution
  resolution_notes  text,
  created_by        uuid        references auth.users(id) on delete set null,
  updated_by        uuid        references auth.users(id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────
create index if not exists idx_emergency_events_status
  on public.fleet_emergency_events(status, severity);

create index if not exists idx_emergency_events_type
  on public.fleet_emergency_events(emergency_type, occurred_at desc);

create index if not exists idx_emergency_events_driver
  on public.fleet_emergency_events(driver_id, occurred_at desc);

create index if not exists idx_emergency_events_business
  on public.fleet_emergency_events(business_id, occurred_at desc);

create index if not exists idx_emergency_events_open
  on public.fleet_emergency_events(status, occurred_at desc)
  where status not in ('resolved', 'closed');

-- ── RLS ───────────────────────────────────────────────────────
alter table public.fleet_emergency_events enable row level security;

-- Drivers see their own; fleet managers see fleet's
drop policy if exists "emergency_select" on public.fleet_emergency_events;
create policy "emergency_select" on public.fleet_emergency_events
  for select using (
    user_id = auth.uid()
    or business_id in (
      select business_id from public.fleet_business_members
      where user_id = auth.uid()
    )
  );

-- Drivers can report emergencies
drop policy if exists "emergency_insert" on public.fleet_emergency_events;
create policy "emergency_insert" on public.fleet_emergency_events
  for insert with check (auth.uid() is not null);

-- Fleet managers and above can update
drop policy if exists "emergency_update" on public.fleet_emergency_events;
create policy "emergency_update" on public.fleet_emergency_events
  for update using (
    user_id = auth.uid()
    or business_id in (
      select business_id from public.fleet_business_members
      where user_id = auth.uid()
      and role in ('owner', 'admin', 'dispatcher', 'fleet_manager')
    )
  );

-- ── Updated_at trigger ───────────────────────────────────────
drop trigger if exists set_emergency_updated_at on public.fleet_emergency_events;
create trigger set_emergency_updated_at
  before update on public.fleet_emergency_events
  for each row execute function public.set_updated_at();


-- ============================================================
-- Emergency Contacts (per-business)
-- ============================================================
create table if not exists public.fleet_emergency_contacts (
  id                uuid        primary key default gen_random_uuid(),

  business_id       uuid        not null references public.businesses(id) on delete cascade,

  contact_name      text        not null,
  contact_role      text        not null,
    -- dispatch | safety | owner | insurance_agent | roadside_assist |
    -- medical_contact | emergency_contact | other

  phone             text        not null,
  email             text,
  notes             text,
  priority          integer     not null default 1,   -- 1 = highest priority

  is_active         boolean     not null default true,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_emergency_contacts_business
  on public.fleet_emergency_contacts(business_id, priority);

alter table public.fleet_emergency_contacts enable row level security;

drop policy if exists "emergency_contacts_select" on public.fleet_emergency_contacts;
create policy "emergency_contacts_select" on public.fleet_emergency_contacts
  for select using (
    business_id in (
      select business_id from public.fleet_business_members where user_id = auth.uid()
    )
  );

drop policy if exists "emergency_contacts_write" on public.fleet_emergency_contacts;
create policy "emergency_contacts_write" on public.fleet_emergency_contacts
  for all using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';