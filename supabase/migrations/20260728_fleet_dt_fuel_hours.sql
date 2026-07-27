-- ============================================================
-- 3B FLEET COMMANDER — Dump Truck Mode: Fuel, Pay Policy, Record Exports
-- Migration: 20260728_fleet_dt_fuel_hours
--
-- Phase 3: fuel/mileage/receipts (spec §9) + the data this driver hours
-- portal + personal-record CSV export (spec §10) need to compute estimated
-- earnings.
--
-- Depends on: 20260727_fleet_dt_core.sql, 20260727_fleet_dt_inspections_docs.sql
-- (reuses fleet_dt_documents + the private fleet-dt-documents bucket for
-- receipt images — no new Storage bucket needed).
--
-- Scope note on fleet_dt_pay_policies: this is a deliberately minimal single
-- hourly-rate + daily-overtime-threshold policy (the exact seed example the
-- spec itself proposes in §10 — "$32/hr, daily OT after 8h at 1.5x"). It is
-- NOT the full multi-rate-type pay policy engine (per-load/per-mile/per-ton/
-- percentage/detention/minimum-guarantee/weekly-OT/double-time) that spec
-- §10 "Pay Rules" and the Admin Payroll Portal (§11) describe — that engine,
-- its versioning, and payroll approval workflow remain a later phase. This
-- table only powers an "Estimated" hourly earnings figure on the driver
-- hours portal, never a payroll-approved amount.
-- ============================================================

-- ============================================================
-- fleet_dt_fuel_entries
-- ============================================================

create table if not exists public.fleet_dt_fuel_entries (
  id                   uuid        primary key default gen_random_uuid(),
  business_id          uuid        not null references public.businesses(id) on delete cascade,
  driver_id            uuid        not null references public.profiles(id),
  shift_id             uuid        references public.fleet_dt_shifts(id) on delete cascade,
  vehicle_id           uuid        not null references public.fleet_equipment(id),
  job_id               uuid        references public.fleet_dt_jobs(id),

  vendor_name          text,
  purchased_at         timestamptz not null default now(),

  lat                  double precision,
  lng                  double precision,
  location_accuracy_m  numeric(8,2),

  odometer             integer,

  fuel_type            text        not null default 'diesel'
    check (fuel_type in ('diesel', 'gasoline', 'def', 'reefer', 'other')),
  gallons              numeric(8,3),
  price_per_gallon     numeric(8,4),
  total_cost           numeric(10,2) not null,
  tax                  numeric(8,2),
  payment_method       text,
  fuel_card_ref        text,
  full_tank            boolean     not null default true,

  -- Receipt image lives in fleet_dt_documents / fleet-dt-documents bucket.
  receipt_doc_id       uuid        references public.fleet_dt_documents(id),

  -- OCR suggestions — reviewed by the driver before save, never silently trusted.
  ocr_merchant         text,
  ocr_date             date,
  ocr_gallons          numeric(8,3),
  ocr_price_per_gallon numeric(8,4),
  ocr_total            numeric(10,2),
  ocr_address          text,
  ocr_confidence       text        check (ocr_confidence in ('high', 'medium', 'low')),
  driver_verified       boolean    not null default false,

  -- Validation flags computed at write time (spec §9: decreasing odometer,
  -- unrealistic mileage jump, missing total). Informational, non-blocking.
  flag_decreasing_odometer boolean  not null default false,
  flag_unrealistic_jump    boolean  not null default false,

  notes                text,

  created_by           uuid        references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_fleet_dt_fuel_business on public.fleet_dt_fuel_entries(business_id, purchased_at desc);
create index if not exists idx_fleet_dt_fuel_vehicle on public.fleet_dt_fuel_entries(vehicle_id, purchased_at desc);
create index if not exists idx_fleet_dt_fuel_shift on public.fleet_dt_fuel_entries(shift_id);
create index if not exists idx_fleet_dt_fuel_driver on public.fleet_dt_fuel_entries(driver_id, purchased_at desc);

alter table public.fleet_dt_fuel_entries enable row level security;

drop policy if exists "fleet_dt_fuel_select" on public.fleet_dt_fuel_entries;
create policy "fleet_dt_fuel_select" on public.fleet_dt_fuel_entries
  for select using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll','billing'])
  );

drop policy if exists "fleet_dt_fuel_insert" on public.fleet_dt_fuel_entries;
create policy "fleet_dt_fuel_insert" on public.fleet_dt_fuel_entries
  for insert with check (driver_id = auth.uid() and public.fleet_dt_is_member(business_id));

drop policy if exists "fleet_dt_fuel_update" on public.fleet_dt_fuel_entries;
create policy "fleet_dt_fuel_update" on public.fleet_dt_fuel_entries
  for update using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop trigger if exists set_fleet_dt_fuel_updated_at on public.fleet_dt_fuel_entries;
create trigger set_fleet_dt_fuel_updated_at
  before update on public.fleet_dt_fuel_entries
  for each row execute function public.set_updated_at();


-- ============================================================
-- fleet_dt_pay_policies — minimal hourly + daily-OT estimate policy
-- ============================================================

create table if not exists public.fleet_dt_pay_policies (
  id                       uuid        primary key default gen_random_uuid(),
  business_id              uuid        not null unique references public.businesses(id) on delete cascade,

  base_hourly_rate         numeric(8,2) not null default 32.00,
  daily_ot_threshold_hours numeric(5,2) not null default 8.00,
  ot_multiplier            numeric(4,2) not null default 1.50,

  effective_at             date        not null default current_date,
  notes                    text,

  created_by               uuid        references public.profiles(id),
  created_at                timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

alter table public.fleet_dt_pay_policies enable row level security;

drop policy if exists "fleet_dt_pay_policies_select" on public.fleet_dt_pay_policies;
create policy "fleet_dt_pay_policies_select" on public.fleet_dt_pay_policies
  for select using (public.fleet_dt_is_member(business_id));

drop policy if exists "fleet_dt_pay_policies_write" on public.fleet_dt_pay_policies;
create policy "fleet_dt_pay_policies_write" on public.fleet_dt_pay_policies
  for all using (public.fleet_dt_has_role(business_id, array['owner','admin']))
  with check (public.fleet_dt_has_role(business_id, array['owner','admin']));

drop trigger if exists set_fleet_dt_pay_policies_updated_at on public.fleet_dt_pay_policies;
create trigger set_fleet_dt_pay_policies_updated_at
  before update on public.fleet_dt_pay_policies
  for each row execute function public.set_updated_at();


-- ============================================================
-- fleet_dt_driver_record_exports — audit trail for driver CSV exports
-- Spec §10: "Store a lightweight Supabase audit record containing the
-- driver, tenant, selected date range, export type, row count, and
-- generation timestamp; do not make the driver's downloaded CSV publicly
-- accessible."
-- ============================================================

create table if not exists public.fleet_dt_driver_record_exports (
  id            uuid        primary key default gen_random_uuid(),
  business_id   uuid        not null references public.businesses(id) on delete cascade,
  driver_id     uuid        not null references public.profiles(id),

  export_type   text        not null check (export_type in ('detail', 'summary')),
  range_type    text        not null check (range_type in (
    'current_week', 'previous_week', 'current_pay_period', 'previous_pay_period', 'custom'
  )),
  range_start   date        not null,
  range_end     date        not null,
  row_count     integer     not null default 0,

  generated_at  timestamptz not null default now()
);

create index if not exists idx_fleet_dt_exports_driver on public.fleet_dt_driver_record_exports(driver_id, generated_at desc);
create index if not exists idx_fleet_dt_exports_business on public.fleet_dt_driver_record_exports(business_id, generated_at desc);

alter table public.fleet_dt_driver_record_exports enable row level security;

drop policy if exists "fleet_dt_exports_select" on public.fleet_dt_driver_record_exports;
create policy "fleet_dt_exports_select" on public.fleet_dt_driver_record_exports
  for select using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','payroll'])
  );

drop policy if exists "fleet_dt_exports_insert" on public.fleet_dt_driver_record_exports;
create policy "fleet_dt_exports_insert" on public.fleet_dt_driver_record_exports
  for insert with check (driver_id = auth.uid() and public.fleet_dt_is_member(business_id));

-- ── Notify PostgREST of schema changes ──────────────────────
notify pgrst, 'reload schema';
