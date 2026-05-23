-- ============================================================
-- 3B FLEET COMMANDER — Fleet Operations Tables
-- Migration: 20260522_fleet_operations
--
-- fleet_driver_updates — structured driver-to-dispatch messages
-- fleet_alerts         — dispatch + predictive fleet alerts
-- fleet_documents      — photos, PDFs, scans attached to any record
-- fleet_inspections    — DOT roadside inspection records
-- fleet_violations     — violation / warning / citation records
-- fleet_repairs        — repair records linked to violations
-- ============================================================


-- ── fleet_driver_updates ─────────────────────────────────────────────────────

create table if not exists public.fleet_driver_updates (
  id            uuid        primary key default gen_random_uuid(),

  -- ── Links ─────────────────────────────────────────────────────────────────
  load_number   text,
  load_id       uuid        references public.fleet_loads(id) on delete set null,
  driver_name   text        not null default '',

  -- ── Update content ────────────────────────────────────────────────────────
  update_type   text        not null,
  -- arrived_pickup | loaded | departed | delivered | pod_uploaded |
  -- fuel_stop | break_started | break_ended | hos_update |
  -- delay_reported | detention_started | detention_ended |
  -- issue_reported | accident_incident | custom

  severity      text        not null default 'info',
  -- info | warning | critical

  location      text,
  notes         text,
  hos_drive     numeric(4,1),
  hos_shift     numeric(4,1),

  -- ── Resolution ────────────────────────────────────────────────────────────
  requires_ack  boolean     default false,
  acked_at      timestamptz,
  acked_by      text,

  -- ── Identity ──────────────────────────────────────────────────────────────
  user_id       uuid        references auth.users on delete cascade,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_fleet_driver_updates_load
  on public.fleet_driver_updates(load_number, occurred_at desc);

create index if not exists idx_fleet_driver_updates_severity
  on public.fleet_driver_updates(severity, occurred_at desc);

create index if not exists idx_fleet_driver_updates_type
  on public.fleet_driver_updates(update_type, occurred_at desc);

alter table public.fleet_driver_updates enable row level security;
create policy "allow_all_fleet_driver_updates"
  on public.fleet_driver_updates for all using (true) with check (true);


-- ── fleet_alerts ─────────────────────────────────────────────────────────────

create table if not exists public.fleet_alerts (
  id            uuid        primary key default gen_random_uuid(),

  -- ── Links ─────────────────────────────────────────────────────────────────
  load_number   text,
  load_id       uuid        references public.fleet_loads(id) on delete set null,
  update_id     uuid        references public.fleet_driver_updates(id) on delete set null,

  -- ── Alert content ─────────────────────────────────────────────────────────
  tier          text        not null,
  -- info | preventative | warning | urgent | critical

  category      text        not null,
  -- tire | brake | inspection | hos | detention | fuel |
  -- reefer | cargo | driver | appointment | system

  title         text        not null,
  body          text,
  action_label  text,

  -- ── Predictive fields ─────────────────────────────────────────────────────
  confidence    numeric(3,2),   -- 0.00–1.00
  miles_until   integer,
  days_until    integer,

  -- ── Resolution ────────────────────────────────────────────────────────────
  acked         boolean     default false,
  acked_at      timestamptz,
  acked_by      text,
  dismissed     boolean     default false,
  dismissed_at  timestamptz,

  -- ── Escalation ────────────────────────────────────────────────────────────
  escalated     boolean     default false,
  escalation_id uuid,        -- references fleet_escalations when built

  -- ── Identity ──────────────────────────────────────────────────────────────
  user_id       uuid        references auth.users on delete cascade,
  created_at    timestamptz not null default now()
);

create index if not exists idx_fleet_alerts_tier
  on public.fleet_alerts(tier, created_at desc);

create index if not exists idx_fleet_alerts_load
  on public.fleet_alerts(load_number, created_at desc);

create index if not exists idx_fleet_alerts_open
  on public.fleet_alerts(acked, dismissed, created_at desc);

alter table public.fleet_alerts enable row level security;
create policy "allow_all_fleet_alerts"
  on public.fleet_alerts for all using (true) with check (true);


-- ── fleet_documents ──────────────────────────────────────────────────────────

create table if not exists public.fleet_documents (
  id              uuid        primary key default gen_random_uuid(),

  -- ── Links — any of these can be set ──────────────────────────────────────
  load_id         uuid        references public.fleet_loads(id) on delete cascade,
  stop_id         uuid        references public.fleet_load_stops(id) on delete set null,
  violation_id    uuid,        -- references fleet_violations, set after that table exists
  repair_id       uuid,        -- references fleet_repairs, set after that table exists
  load_number     text,

  -- ── Document content ──────────────────────────────────────────────────────
  doc_type        text        not null,
  -- bol | rate_con | pod | lumper_receipt | scale_ticket |
  -- fuel_receipt | inspection | incident | violation_photo |
  -- repair_invoice | other

  file_name       text,
  file_url        text,        -- Supabase Storage URL (when cloud storage is wired)
  storage_path    text,        -- path in Supabase Storage bucket
  mime_type       text,
  size_kb         integer,
  notes           text,

  occurred_at     timestamptz,
  logged_at       timestamptz not null default now(),

  -- ── Identity ──────────────────────────────────────────────────────────────
  user_id         uuid        references auth.users on delete cascade,
  created_at      timestamptz not null default now()
);

create index if not exists idx_fleet_documents_load
  on public.fleet_documents(load_id, created_at desc);

create index if not exists idx_fleet_documents_stop
  on public.fleet_documents(stop_id);

create index if not exists idx_fleet_documents_type
  on public.fleet_documents(doc_type, created_at desc);

alter table public.fleet_documents enable row level security;
create policy "allow_all_fleet_documents"
  on public.fleet_documents for all using (true) with check (true);


-- ── fleet_inspections ────────────────────────────────────────────────────────

create table if not exists public.fleet_inspections (
  id                uuid        primary key default gen_random_uuid(),

  -- ── Links ─────────────────────────────────────────────────────────────────
  load_number       text,
  load_id           uuid        references public.fleet_loads(id) on delete set null,

  -- ── Inspection details ────────────────────────────────────────────────────
  inspection_type   text        not null default 'roadside',
  -- roadside | annual | pre_trip | post_trip | dot_audit | self

  inspection_date   date        not null default current_date,
  location          text,
  state             text,
  agency            text,
  officer_name      text,
  officer_badge     text,
  report_number     text,

  -- ── Result ────────────────────────────────────────────────────────────────
  result            text        not null default 'pass',
  -- pass | pass_with_violations | out_of_service | warning | fail

  violation_count   integer     default 0,
  oos_count         integer     default 0,

  tractor_id        text,
  trailer_num       text,

  notes             text,
  doc_ids           jsonb       default '[]'::jsonb,

  -- ── Expiry tracking ───────────────────────────────────────────────────────
  -- For annual inspections — set by driver/dispatcher manually
  expires_at        date,

  -- ── Identity ──────────────────────────────────────────────────────────────
  user_id           uuid        references auth.users on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger fleet_inspections_updated_at
  before update on public.fleet_inspections
  for each row execute function public.set_updated_at();

create index if not exists idx_fleet_inspections_date
  on public.fleet_inspections(inspection_date desc);

create index if not exists idx_fleet_inspections_result
  on public.fleet_inspections(result, inspection_date desc);

alter table public.fleet_inspections enable row level security;
create policy "allow_all_fleet_inspections"
  on public.fleet_inspections for all using (true) with check (true);


-- ── fleet_violations ─────────────────────────────────────────────────────────

create table if not exists public.fleet_violations (
  id                  uuid        primary key default gen_random_uuid(),

  -- ── Links ─────────────────────────────────────────────────────────────────
  load_number         text,
  load_id             uuid        references public.fleet_loads(id) on delete set null,
  inspection_id       uuid        references public.fleet_inspections(id) on delete set null,

  -- ── Violation details ─────────────────────────────────────────────────────
  violation_type      text        not null,
  -- roadside_inspection | citation | warning | oos_order |
  -- accident_report | dot_audit | weigh_station | customs | other

  severity            text        not null,
  -- info | warning | citation | out_of_service | critical

  status              text        not null default 'open',
  -- open | repair_pending | repaired | verified | dismissed

  incident_date       date        not null default current_date,
  location            text,
  state               text,

  -- ── Officer / Agency ──────────────────────────────────────────────────────
  agency              text,
  officer_name        text,
  officer_badge       text,
  report_number       text,

  -- ── Equipment ─────────────────────────────────────────────────────────────
  tractor_id          text,
  trailer_num         text,

  -- ── Violation codes + OOS ─────────────────────────────────────────────────
  violation_codes     jsonb       default '[]'::jsonb,   -- ["392.2", "396.3(a)"]
  description         text        not null default '',
  oos_category        text,       -- driver | vehicle | hazmat

  -- ── Docs ──────────────────────────────────────────────────────────────────
  doc_ids             jsonb       default '[]'::jsonb,

  -- ── Verification ──────────────────────────────────────────────────────────
  verified_at         timestamptz,
  verified_by         text,
  verification_note   text,

  -- ── Identity ──────────────────────────────────────────────────────────────
  user_id             uuid        references auth.users on delete cascade,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger fleet_violations_updated_at
  before update on public.fleet_violations
  for each row execute function public.set_updated_at();

create index if not exists idx_fleet_violations_status
  on public.fleet_violations(status, incident_date desc);

create index if not exists idx_fleet_violations_severity
  on public.fleet_violations(severity, status);

create index if not exists idx_fleet_violations_load
  on public.fleet_violations(load_number);

alter table public.fleet_violations enable row level security;
create policy "allow_all_fleet_violations"
  on public.fleet_violations for all using (true) with check (true);


-- ── fleet_repairs ────────────────────────────────────────────────────────────

create table if not exists public.fleet_repairs (
  id              uuid        primary key default gen_random_uuid(),

  -- ── Links ─────────────────────────────────────────────────────────────────
  violation_id    uuid        references public.fleet_violations(id) on delete cascade,
  load_number     text,

  -- ── Repair details ────────────────────────────────────────────────────────
  description     text        not null,
  shop            text,
  tech_name       text,
  invoice_number  text,
  cost            numeric(10,2),
  repair_date     date        not null default current_date,
  notes           text,

  doc_ids         jsonb       default '[]'::jsonb,

  -- ── Identity ──────────────────────────────────────────────────────────────
  user_id         uuid        references auth.users on delete cascade,
  created_at      timestamptz not null default now()
);

create index if not exists idx_fleet_repairs_violation
  on public.fleet_repairs(violation_id, created_at desc);

alter table public.fleet_repairs enable row level security;
create policy "allow_all_fleet_repairs"
  on public.fleet_repairs for all using (true) with check (true);


-- ── Add violation/repair FKs to fleet_documents ───────────────────────────────
-- Now that violation and repair tables exist, add proper FK constraints.
alter table public.fleet_documents
  add column if not exists violation_id_fk uuid references public.fleet_violations(id) on delete set null,
  add column if not exists repair_id_fk    uuid references public.fleet_repairs(id)    on delete set null;


notify pgrst, 'reload schema';
