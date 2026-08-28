-- Fleet Commander / 3B Ecosystem
-- Driver Bill of Lading (BOL) / lading-sheet capture.
-- The immutable source document lives in the private Vault-backed document store;
-- extracted/confirmed operational fields are stored separately and linked to the
-- shift/job/load so locations and load details can feed the driver's workflow.

alter table public.fleet_dt_documents drop constraint if exists fleet_dt_documents_doc_type_check;
alter table public.fleet_dt_documents add constraint fleet_dt_documents_doc_type_check
  check (doc_type in (
    'fuel_receipt','scale_ticket','load_ticket','delivery_ticket','disposal_receipt',
    'inspection_photo','defect_photo','incident_photo','signed_work_order',
    'signature','vehicle_photo','other',
    'equipment_compliance_doc','equipment_service_receipt',
    'registration','insurance','rental_agreement','roadside_card',
    'asset_pickup_photo','asset_dropoff_photo','trailer_photo',
    'bill_of_lading'
  ));

create table if not exists public.fleet_dt_lading_inputs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  document_id uuid not null references public.fleet_dt_documents(id) on delete cascade,
  shift_id uuid references public.fleet_dt_shifts(id) on delete set null,
  job_id uuid references public.fleet_dt_jobs(id) on delete set null,
  load_cycle_id uuid references public.fleet_dt_load_cycles(id) on delete set null,
  driver_id uuid not null references public.profiles(id),

  bol_number text,
  load_number text,
  po_number text,
  job_number text,
  customer_name text,
  shipper_name text,
  receiver_name text,
  pickup_location_text text,
  delivery_location_text text,
  material text,
  quantity numeric(12,3),
  quantity_unit text,
  gross_weight_lbs numeric(12,2),
  tare_weight_lbs numeric(12,2),
  net_weight_lbs numeric(12,2),
  special_instructions text,

  -- Machine extraction is advisory until the driver confirms it.
  extraction_status text not null default 'manual'
    check (extraction_status in ('manual','pending','extracted','failed')),
  extraction_provider text,
  extraction_confidence numeric(5,4),
  raw_extracted_json jsonb,
  extracted_at timestamptz,

  confirmed boolean not null default false,
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,

  captured_at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  unique (document_id)
);

create index if not exists idx_fleet_dt_lading_inputs_shift
  on public.fleet_dt_lading_inputs(shift_id, captured_at desc);
create index if not exists idx_fleet_dt_lading_inputs_job
  on public.fleet_dt_lading_inputs(job_id, captured_at desc);
create index if not exists idx_fleet_dt_lading_inputs_driver
  on public.fleet_dt_lading_inputs(driver_id, captured_at desc);

alter table public.fleet_dt_lading_inputs enable row level security;

drop policy if exists "fleet_dt_lading_inputs_select" on public.fleet_dt_lading_inputs;
create policy "fleet_dt_lading_inputs_select" on public.fleet_dt_lading_inputs
  for select using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop policy if exists "fleet_dt_lading_inputs_insert" on public.fleet_dt_lading_inputs;
create policy "fleet_dt_lading_inputs_insert" on public.fleet_dt_lading_inputs
  for insert with check (
    driver_id = auth.uid() and public.fleet_dt_is_member(business_id)
  );

drop policy if exists "fleet_dt_lading_inputs_update" on public.fleet_dt_lading_inputs;
create policy "fleet_dt_lading_inputs_update" on public.fleet_dt_lading_inputs
  for update using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

notify pgrst, 'reload schema';
