-- Fleet Commander / 3B Ecosystem
-- Rich asset profile: ownership/rental, registration/insurance/roadside details,
-- trailer specs, driver-added trailer review state, and pickup/drop-off evidence.

alter table public.fleet_equipment
  add column if not exists ownership_type text not null default 'owned'
    check (ownership_type in ('owned','leased','rental','customer_owned','temporary')),
  add column if not exists registration_number text,
  add column if not exists registration_state text,
  add column if not exists insurance_provider text,
  add column if not exists insurance_policy_number text,
  add column if not exists insurance_phone text,
  add column if not exists rental_company text,
  add column if not exists rental_contract_number text,
  add column if not exists rental_start_date date,
  add column if not exists rental_end_date date,
  add column if not exists roadside_provider text,
  add column if not exists roadside_phone text,
  add column if not exists roadside_member_number text,
  add column if not exists roadside_notes text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists axle_count integer,
  add column if not exists gvwr_lbs integer,
  add column if not exists empty_weight_lbs integer,
  add column if not exists capacity_tons numeric(10,2),
  add column if not exists capacity_cubic_yards numeric(10,2),
  add column if not exists length_ft numeric(8,2),
  add column if not exists added_by_driver boolean not null default false,
  add column if not exists dispatch_review_required boolean not null default false,
  add column if not exists dispatch_reviewed_by uuid references public.profiles(id),
  add column if not exists dispatch_reviewed_at timestamptz;

create index if not exists idx_fleet_equipment_dispatch_review
  on public.fleet_equipment(business_id, dispatch_review_required)
  where dispatch_review_required = true;

-- Expand the private Vault-backed document types used by assets.
alter table public.fleet_dt_documents drop constraint if exists fleet_dt_documents_doc_type_check;
alter table public.fleet_dt_documents add constraint fleet_dt_documents_doc_type_check
  check (doc_type in (
    'fuel_receipt','scale_ticket','load_ticket','delivery_ticket','disposal_receipt',
    'inspection_photo','defect_photo','incident_photo','signed_work_order',
    'signature','vehicle_photo','other',
    'equipment_compliance_doc','equipment_service_receipt',
    'registration','insurance','rental_agreement','roadside_card',
    'asset_pickup_photo','asset_dropoff_photo','trailer_photo'
  ));

-- Pickup/drop-off photos remain Vault documents; the link points to the
-- vehicle_custody record so the same evidence survives driver changes.
-- linked_entity_type values used by the app:
--   equipment | vehicle_custody | trailer_custody

notify pgrst, 'reload schema';
