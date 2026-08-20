-- ============================================================
-- 3B FLEET COMMANDER — Non-Paid Time, Breakdown Downtime & Management
-- Adjustments
-- Migration: 20260820_fleet_dt_time_classification
--
-- Core principle (unchanged elsewhere in the schema): fleet_dt_shifts'
-- clock-derived totalShiftHours (hours.ts) remains "Total Operational
-- Time" exactly as it is today — a full clock-span figure. This migration
-- adds the layer that decides how much of that operational time is
-- currently approved for driver pay and/or customer billing, WITHOUT ever
-- touching the operational record itself. Three independently-classified
-- concepts, never inferred from one another (spec):
--   1. Operational time  — fleet_dt_shifts / fleet_dt_events (unchanged)
--   2. Driver payable     — fleet_dt_time_adjustments.driver_payable
--   3. Customer billable  — fleet_dt_time_adjustments.customer_billable
--
-- Breakdown is a first-class OPERATIONAL workflow (fleet_dt_breakdowns) —
-- what happened, when, why, whether the truck could move. Its pay/bill
-- CLASSIFICATION always flows through a linked fleet_dt_time_adjustments
-- row (default: driver_payable='pending', customer_billable='no', per
-- spec's stated default), so there is exactly one classification
-- mechanism in the whole system, not two competing ones.
--
-- Adjustments are never mutated once entered (spec: "Never silently
-- overwrite historical payroll/billing classifications") — corrections
-- supersede the prior row, same pattern as fleet_dt_shift_hour_overrides
-- (20260818). Full history is preserved.
--
-- Denormalized *_threeb_id columns follow the exact precedent already set
-- by fleet_dt_events.threeb_id ("denormalized 3B-U-XXXXXXXX, resolved
-- server-side at insert time") — the spec is explicit that every
-- adjustment preserve both the UUID and the 3B ID, and 3B IDs are stable
-- once assigned (20260820_fleet_3b_identity_generator.sql), so a snapshot
-- taken at insert time is a correct, permanent record.
-- ============================================================

-- ── payroll / billing as real portals (closes documented dead code) ───────
-- 20260729_fleet_portal_permissions.sql already anticipated this: several
-- RLS policies pass 'payroll'/'billing' as legacy role names to
-- fleet_dt_has_role(), but fleet_role_portal_map never had rows for them,
-- so those checks have been permanently false since that migration ("side
-- effect... intentionally left out... equivalent to deleting dead code").
-- This is the "dedicated permission... do not rely only on generic role
-- strings" the spec asks for, using the exact same portal-grant mechanism
-- driver/dispatch/broker/admin already use — not a parallel system.

alter table public.fleet_role_portal_map drop constraint if exists fleet_role_portal_map_portal_check;
alter table public.fleet_role_portal_map add constraint fleet_role_portal_map_portal_check
  check (portal in ('driver','dispatch','broker','admin','payroll','billing'));

alter table public.fleet_member_portal_grants drop constraint if exists fleet_member_portal_grants_portal_check;
alter table public.fleet_member_portal_grants add constraint fleet_member_portal_grants_portal_check
  check (portal in ('driver','dispatch','broker','admin','payroll','billing'));

insert into public.fleet_role_portal_map (role, portal, permission_level) values
  ('owner','payroll','manage'), ('owner','billing','manage'),
  ('admin','payroll','manage'), ('admin','billing','manage'),
  ('payroll','payroll','manage'), ('billing','billing','manage')
on conflict (role, portal) do update set permission_level = excluded.permission_level;

-- ── fleet_dt_documents — a couple more doc types for adjustment evidence ──
alter table public.fleet_dt_documents drop constraint if exists fleet_dt_documents_doc_type_check;
alter table public.fleet_dt_documents add constraint fleet_dt_documents_doc_type_check
  check (doc_type in (
    'fuel_receipt','scale_ticket','load_ticket','delivery_ticket','disposal_receipt',
    'inspection_photo','defect_photo','incident_photo','signed_work_order',
    'signature','vehicle_photo','repair_ticket','dispatch_note','other'
  ));

-- ============================================================
-- fleet_dt_time_policy_settings — business-level default classification
-- for routine (non-adjustment) operational categories
-- ============================================================

create table if not exists public.fleet_dt_time_policy_settings (
  id                                  uuid        primary key default gen_random_uuid(),
  business_id                         uuid        not null references public.businesses(id) on delete cascade,

  include_return_to_yard_in_pay       boolean     not null default false,
  include_return_to_yard_in_billing   boolean     not null default false,
  include_posttrip_in_pay             boolean     not null default false,
  include_posttrip_in_billing         boolean     not null default false,

  -- Reference rate for the "Non-Paid Time Value / Operational Opportunity
  -- Cost" analytics figure (never a payroll amount) when a driver has no
  -- pay-policy hourly rate on file.
  default_reference_hourly_rate       numeric(10,2),

  updated_by                          uuid        references public.profiles(id),
  created_at                          timestamptz not null default now(),
  updated_at                          timestamptz not null default now(),

  unique (business_id)
);

alter table public.fleet_dt_time_policy_settings enable row level security;

drop policy if exists "fleet_dt_time_policy_settings_select" on public.fleet_dt_time_policy_settings;
create policy "fleet_dt_time_policy_settings_select" on public.fleet_dt_time_policy_settings
  for select using (fleet_dt_is_member(business_id));

drop policy if exists "fleet_dt_time_policy_settings_write" on public.fleet_dt_time_policy_settings;
create policy "fleet_dt_time_policy_settings_write" on public.fleet_dt_time_policy_settings
  for all using (fleet_dt_has_role(business_id, array['owner','admin','payroll','billing']))
  with check (fleet_dt_has_role(business_id, array['owner','admin','payroll','billing']));

drop trigger if exists set_fleet_dt_time_policy_settings_updated_at on public.fleet_dt_time_policy_settings;
create trigger set_fleet_dt_time_policy_settings_updated_at
  before update on public.fleet_dt_time_policy_settings
  for each row execute function public.set_updated_at();

-- ============================================================
-- fleet_dt_breakdowns — the "Truck Problem" operational workflow
-- ============================================================

create table if not exists public.fleet_dt_breakdowns (
  id                    uuid        primary key default gen_random_uuid(),
  business_id           uuid        not null references public.businesses(id) on delete cascade,

  driver_id             uuid        not null references public.profiles(id),
  driver_threeb_id      text,
  shift_id              uuid        references public.fleet_dt_shifts(id),
  truck_id              uuid        not null references public.fleet_equipment(id),
  job_id                uuid        references public.fleet_dt_jobs(id),

  category              text        check (category in (
    'tire','engine','transmission','air_system','brake','overheating','electrical',
    'fuel','hydraulic','suspension','accident','stuck','other'
  )),
  can_move              boolean,
  safe_location         boolean,
  notes                 text,
  lat                   double precision,
  lng                   double precision,

  -- Preserves production completed before the failure (spec: "If a truck
  -- completed work before failing, Fleet Commander must preserve that
  -- production" / "Do NOT cancel or corrupt valid earlier load data") —
  -- a snapshot, not a live-recomputed value, so it survives even if the
  -- shift's load_count keeps changing after the breakdown is logged.
  loads_completed_before int,

  started_at            timestamptz not null default now(),
  ended_at               timestamptz,
  resolution             text        check (resolution in ('resumed','returned_to_yard','towed','ended_day')),

  created_by             uuid        references public.profiles(id),
  created_at              timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_fleet_dt_breakdowns_business on public.fleet_dt_breakdowns(business_id, started_at desc);
create index if not exists idx_fleet_dt_breakdowns_driver on public.fleet_dt_breakdowns(driver_id, started_at desc);
create index if not exists idx_fleet_dt_breakdowns_truck on public.fleet_dt_breakdowns(truck_id, started_at desc);

alter table public.fleet_dt_breakdowns enable row level security;

drop policy if exists "fleet_dt_breakdowns_select" on public.fleet_dt_breakdowns;
create policy "fleet_dt_breakdowns_select" on public.fleet_dt_breakdowns
  for select using (fleet_dt_is_member(business_id));

-- Any active member may report/update their own breakdown (operational
-- record of what happened, same "record physical reality" rationale as
-- defect reporting); dispatch/admin/payroll/billing may also manage it.
drop policy if exists "fleet_dt_breakdowns_write" on public.fleet_dt_breakdowns;
create policy "fleet_dt_breakdowns_write" on public.fleet_dt_breakdowns
  for all using (
    driver_id = auth.uid()
    or fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll','billing'])
  )
  with check (
    driver_id = auth.uid()
    or fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll','billing'])
  );

drop trigger if exists set_fleet_dt_breakdowns_updated_at on public.fleet_dt_breakdowns;
create trigger set_fleet_dt_breakdowns_updated_at
  before update on public.fleet_dt_breakdowns
  for each row execute function public.set_updated_at();

-- ============================================================
-- fleet_dt_time_adjustments — the single payable/billable classification
-- mechanism (freeform management entries AND breakdown/return/post-trip
-- classification decisions both flow through here)
-- ============================================================

create table if not exists public.fleet_dt_time_adjustments (
  id                    uuid        primary key default gen_random_uuid(),
  business_id           uuid        not null references public.businesses(id) on delete cascade,
  business_threeb_id    text,

  driver_id             uuid        not null references public.profiles(id),
  driver_threeb_id      text,
  shift_id              uuid        references public.fleet_dt_shifts(id),
  truck_id              uuid        references public.fleet_equipment(id),
  job_id                uuid        references public.fleet_dt_jobs(id),
  breakdown_id           uuid        references public.fleet_dt_breakdowns(id),

  work_date              date        not null,
  start_time             timestamptz,
  end_time               timestamptz,
  duration_minutes        numeric(10,2) not null check (duration_minutes >= 0),

  category                text        not null check (category in (
    'breakdown_roadside','shop_repair_waiting','return_to_yard','posttrip','fueling','paperwork',
    'dispatch_required_waiting','customer_delay','scale_delay','weather','road_closure','truck_dropoff',
    'training','drug_testing','administrative','corrected_paper_sheet_hours','other'
  )),
  explanation              text        not null check (length(trim(explanation)) > 0),

  driver_payable            text        not null default 'pending' check (driver_payable in ('yes','no','pending')),
  payable_hours              numeric(10,2) check (payable_hours is null or payable_hours >= 0),
  customer_billable            text        not null default 'pending' check (customer_billable in ('yes','no','pending')),
  billable_hours                numeric(10,2) check (billable_hours is null or billable_hours >= 0),

  attachment_doc_ids              uuid[]      not null default '{}',

  -- Corrections supersede, never mutate (same pattern as
  -- fleet_dt_shift_hour_overrides) — full audit history preserved.
  superseded_at                     timestamptz,
  superseded_by                       uuid        references public.fleet_dt_time_adjustments(id),

  entered_by                            uuid        not null references public.profiles(id),
  manager_threeb_id                       text,
  created_at                                timestamptz not null default now(),
  updated_at                                  timestamptz not null default now()
);

create index if not exists idx_fleet_dt_time_adjustments_business on public.fleet_dt_time_adjustments(business_id, work_date desc);
create index if not exists idx_fleet_dt_time_adjustments_driver on public.fleet_dt_time_adjustments(driver_id, work_date desc);
create index if not exists idx_fleet_dt_time_adjustments_shift on public.fleet_dt_time_adjustments(shift_id);
create index if not exists idx_fleet_dt_time_adjustments_breakdown on public.fleet_dt_time_adjustments(breakdown_id);

-- At most one *active* (non-superseded) adjustment per breakdown — a
-- breakdown's classification is corrected via supersede, not by adding a
-- second simultaneously-active decision.
create unique index if not exists uq_fleet_dt_time_adjustments_one_active_per_breakdown
  on public.fleet_dt_time_adjustments(breakdown_id)
  where superseded_at is null and breakdown_id is not null;

alter table public.fleet_dt_time_adjustments enable row level security;

-- Drivers may see adjustments about their own time (transparency: spec
-- "Drivers may see paid/non-paid classification"); payroll/billing/admin
-- see everything for the business.
drop policy if exists "fleet_dt_time_adjustments_select" on public.fleet_dt_time_adjustments;
create policy "fleet_dt_time_adjustments_select" on public.fleet_dt_time_adjustments
  for select using (
    driver_id = auth.uid()
    or fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll','billing'])
  );

-- Only payroll/billing/admin/owner may create or supersede an adjustment —
-- this is the explicit payroll/billing-affecting decision, never a driver
-- self-service action (spec: "May not approve their own pay adjustment").
-- Dispatch is deliberately excluded from write here — spec: "Should not
-- automatically receive payroll approval rights."
drop policy if exists "fleet_dt_time_adjustments_write" on public.fleet_dt_time_adjustments;
create policy "fleet_dt_time_adjustments_write" on public.fleet_dt_time_adjustments
  for all using (fleet_dt_has_role(business_id, array['owner','admin','payroll','billing']))
  with check (fleet_dt_has_role(business_id, array['owner','admin','payroll','billing']));

drop trigger if exists set_fleet_dt_time_adjustments_updated_at on public.fleet_dt_time_adjustments;
create trigger set_fleet_dt_time_adjustments_updated_at
  before update on public.fleet_dt_time_adjustments
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
