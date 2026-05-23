-- ============================================================
-- 3B FLEET COMMANDER — Fleet Loads & Load Stops
-- Migration: 20260522_fleet_loads
--
-- fleet_loads     — authoritative load record (replaces ad-hoc
--                   localStorage missions for persistent storage)
-- fleet_load_stops — each stop as its own row with FK to fleet_loads
--
-- Design principles:
--   • Stops are rows, not jsonb arrays — queryable, indexable,
--     sortable, individually updatable without full-row rewrites.
--   • Metadata jsonb carries flexible fields (reviews, route notes,
--     custom data) without requiring future migrations.
--   • All timestamps store UTC ISO — app layer handles tz display.
--   • RLS: permissive-while-anonymous, tighten when auth is wired.
-- ============================================================

-- ── fleet_loads ──────────────────────────────────────────────────────────────

create table if not exists public.fleet_loads (
  id                uuid        primary key default gen_random_uuid(),

  -- ── Identity ──────────────────────────────────────────────────────────────
  load_number       text        not null,
  order_number      text,                    -- human-readable ORD-YYYYMMDD-XXXX
  broker            text,
  dispatcher        text,
  commodity         text,

  -- ── Geography ─────────────────────────────────────────────────────────────
  origin            text        not null,    -- "City, ST" summary
  destination       text        not null,    -- "City, ST" summary
  origin_name       text,                    -- shipper facility name
  dest_name         text,                    -- consignee facility name

  -- ── Equipment ─────────────────────────────────────────────────────────────
  tractor_id        text,
  trailer_num       text,
  trailer_plate     text,
  trailer_type      text,
  rig_type          text,                    -- 'semi' | 'straight' | 'sprinter'

  -- ── Financials ────────────────────────────────────────────────────────────
  gross_rate        numeric(10,2) not null default 0,
  cpm_rate          numeric(8,4),
  fuel_price        numeric(6,3),
  dispatch_miles    integer      not null default 0,
  deadhead_miles    integer      not null default 0,
  actual_miles      integer,
  paid_miles        integer,

  -- ── Timing ────────────────────────────────────────────────────────────────
  load_date         date         not null default current_date,
  pickup_appt       timestamptz,             -- first pickup appointment
  delivery_appt     timestamptz,             -- final delivery appointment

  -- ── Lifecycle ─────────────────────────────────────────────────────────────
  status            text        not null default 'draft',
  -- draft | active | planned | en_route | at_pickup | loaded |
  -- en_route_delivery | at_delivery | delivered | completed | cancelled

  -- ── Route ─────────────────────────────────────────────────────────────────
  route_preference  text        default 'main_corridors',
  route_notes       text,

  -- ── Detention / Wait ──────────────────────────────────────────────────────
  wait_hours        numeric(6,2) default 0,
  detention_hours   numeric(6,2) default 0,
  detention_pay     numeric(10,2) default 0,

  -- ── Settlement ────────────────────────────────────────────────────────────
  settlement_pay    numeric(10,2),
  settlement_verified boolean    default false,

  -- ── Driver ────────────────────────────────────────────────────────────────
  driver_name       text,
  driver_type       text,                    -- Solo | Team

  -- ── Paperwork ─────────────────────────────────────────────────────────────
  paperwork_location text,
  proof_saved       boolean      default false,
  notes             text,
  hos_notes         text,

  -- ── Flexible metadata (trip review, reload intel, etc.) ───────────────────
  metadata          jsonb        default '{}'::jsonb,

  -- ── Draft / resume intake ─────────────────────────────────────────────────
  intake_step       integer      default 1,  -- last completed wizard step
  is_draft          boolean      default true,

  -- ── Identity ──────────────────────────────────────────────────────────────
  user_id           uuid         references auth.users on delete cascade,
  business_id       text,

  -- ── Timestamps ────────────────────────────────────────────────────────────
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now()
);

-- Indexes
create index if not exists idx_fleet_loads_load_number
  on public.fleet_loads(load_number);

create index if not exists idx_fleet_loads_status
  on public.fleet_loads(status, load_date desc);

create index if not exists idx_fleet_loads_user
  on public.fleet_loads(user_id, created_at desc);

create index if not exists idx_fleet_loads_draft
  on public.fleet_loads(is_draft, updated_at desc);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger fleet_loads_updated_at
  before update on public.fleet_loads
  for each row execute function public.set_updated_at();

-- RLS — open read, authenticated write (permissive until auth wired)
alter table public.fleet_loads enable row level security;

create policy "allow_all_fleet_loads"
  on public.fleet_loads
  for all
  using (true)
  with check (true);


-- ── fleet_load_stops ─────────────────────────────────────────────────────────

create table if not exists public.fleet_load_stops (
  id                uuid        primary key default gen_random_uuid(),

  -- ── Parent load ───────────────────────────────────────────────────────────
  load_id           uuid        not null references public.fleet_loads(id) on delete cascade,
  load_number       text,                    -- denormalized for fast lookup

  -- ── Stop identity ─────────────────────────────────────────────────────────
  sequence          integer     not null,    -- 1-based display order
  stop_type         text        not null,    -- pickup | delivery | relay | fuel | yard | rest | scale | repair | washout | other
  name              text        not null default '',
  address           text,
  city              text,
  state             text,
  phone             text,

  -- ── Appointment ───────────────────────────────────────────────────────────
  appointment_start timestamptz,
  appointment_end   timestamptz,

  -- ── Reference numbers ─────────────────────────────────────────────────────
  reference         text,                    -- BOL / REF# / PO#

  -- ── Lifecycle ─────────────────────────────────────────────────────────────
  lifecycle_status  text,
  -- arrived | checked_in | waiting | docked | work_started | work_ended | departed

  arrived_at        timestamptz,
  checked_in_at     timestamptz,
  waiting_at        timestamptz,
  docked_at         timestamptz,
  work_started_at   timestamptz,
  work_ended_at     timestamptz,
  departed_at       timestamptz,

  completed         boolean      default false,
  completed_at      timestamptz,

  -- ── Detention ─────────────────────────────────────────────────────────────
  dwell_minutes     integer,
  free_minutes      integer      default 120,
  detention_minutes integer,
  detention_amount  numeric(8,2),
  detention_rate    numeric(6,2) default 50,

  -- ── Notes / docs ──────────────────────────────────────────────────────────
  notes             text,
  doc_ids           jsonb        default '[]'::jsonb,  -- VaultDoc ids

  -- ── Identity ──────────────────────────────────────────────────────────────
  user_id           uuid         references auth.users on delete cascade,
  order_number      text,
  mission_id        text,        -- optional link to legacy fleet_missions id

  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now()
);

-- Indexes
create index if not exists idx_fleet_load_stops_load
  on public.fleet_load_stops(load_id, sequence asc);

create index if not exists idx_fleet_load_stops_number
  on public.fleet_load_stops(load_number, sequence asc);

create index if not exists idx_fleet_load_stops_lifecycle
  on public.fleet_load_stops(lifecycle_status);

create trigger fleet_load_stops_updated_at
  before update on public.fleet_load_stops
  for each row execute function public.set_updated_at();

-- RLS
alter table public.fleet_load_stops enable row level security;

create policy "allow_all_fleet_load_stops"
  on public.fleet_load_stops
  for all
  using (true)
  with check (true);

notify pgrst, 'reload schema';
