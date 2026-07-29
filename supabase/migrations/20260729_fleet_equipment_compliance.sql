-- ============================================================
-- 3B FLEET COMMANDER — Equipment compliance, maintenance, mileage
-- Migration: 20260729_fleet_equipment_compliance
--
-- Driver-requested: "All trucks are to be saved with compliance and
-- maintenance and mileage documentation." fleet_equipment (see
-- 20260728_fleet_equipment_minimal.sql) is deliberately bare today — this
-- extends it with the columns that migration explicitly deferred, plus a
-- service/maintenance history log.
--
-- Scope note: the OTR /compliance and /maintenance pages
-- (src/app/compliance, src/app/maintenance) are a separate, pre-existing,
-- localStorage-first system with undocumented Supabase tables — left
-- untouched here. This is a fresh, real, per-truck record tied to
-- fleet_equipment.id, which both the OTR and Dump Truck Mode sides already
-- share. Reconciling the old pages into this is a separate follow-up.
-- ============================================================

alter table public.fleet_equipment
  add column if not exists make               text,
  add column if not exists model              text,
  add column if not exists year               integer,
  add column if not exists dot_number         text,
  add column if not exists mc_number          text,
  add column if not exists registration_exp   date,
  add column if not exists insurance_exp      date,
  add column if not exists inspection_exp     date,
  add column if not exists current_odometer   integer,
  add column if not exists last_odometer_update timestamptz,
  add column if not exists next_service_due_date  date,
  add column if not exists next_service_due_miles integer;

-- ── fleet_equipment_service_records — append-only maintenance/service log ─────

create table if not exists public.fleet_equipment_service_records (
  id             uuid        primary key default gen_random_uuid(),
  business_id    uuid        not null references public.businesses(id) on delete cascade,
  equipment_id   uuid        not null references public.fleet_equipment(id) on delete cascade,

  service_type   text        not null default 'other'
    check (service_type in (
      'oil_change','tire_rotation','tire_replacement','brake_inspection','brake_service',
      'dot_inspection','annual_inspection','repair','recall','other'
    )),
  performed_at   date        not null default current_date,
  odometer       integer,
  cost           numeric(10,2),
  vendor_name    text,
  notes          text,
  doc_id         uuid        references public.fleet_dt_documents(id),

  created_by     uuid        references public.profiles(id),
  created_at     timestamptz not null default now()
);

create index if not exists idx_fleet_equipment_service_records_equipment
  on public.fleet_equipment_service_records(equipment_id, performed_at desc);

alter table public.fleet_equipment_service_records enable row level security;

drop policy if exists "fleet_equipment_service_records_select" on public.fleet_equipment_service_records;
create policy "fleet_equipment_service_records_select" on public.fleet_equipment_service_records
  for select using (
    exists (
      select 1 from public.fleet_business_members
      where business_id = fleet_equipment_service_records.business_id
        and user_id = auth.uid() and active = true
    )
  );

drop policy if exists "fleet_equipment_service_records_write" on public.fleet_equipment_service_records;
create policy "fleet_equipment_service_records_write" on public.fleet_equipment_service_records
  for all using (
    exists (
      select 1 from public.fleet_business_members
      where business_id = fleet_equipment_service_records.business_id
        and user_id = auth.uid() and active = true
        and role in ('owner', 'admin', 'dispatcher', 'fleet_manager')
    )
  )
  with check (
    exists (
      select 1 from public.fleet_business_members
      where business_id = fleet_equipment_service_records.business_id
        and user_id = auth.uid() and active = true
        and role in ('owner', 'admin', 'dispatcher', 'fleet_manager')
    )
  );

-- ── Extend fleet_dt_documents.doc_type for equipment compliance/service docs ──

alter table public.fleet_dt_documents drop constraint if exists fleet_dt_documents_doc_type_check;
alter table public.fleet_dt_documents add constraint fleet_dt_documents_doc_type_check
  check (doc_type in (
    'fuel_receipt','scale_ticket','load_ticket','delivery_ticket','disposal_receipt',
    'inspection_photo','defect_photo','incident_photo','signed_work_order',
    'signature','vehicle_photo','other',
    'equipment_compliance_doc','equipment_service_receipt'
  ));

notify pgrst, 'reload schema';
