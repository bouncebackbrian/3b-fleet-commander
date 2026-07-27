-- ============================================================
-- 3B FLEET COMMANDER — Dump Truck Mode: Inspections, Documents,
-- Defects, Incidents, Corrections, Private Storage
-- Migration: 20260727_fleet_dt_inspections_docs
--
-- Depends on: 20260727_fleet_dt_core.sql
-- ============================================================

-- ============================================================
-- fleet_dt_documents — generic file metadata (photos, tickets, receipts, signatures)
-- Actual bytes live in the private `fleet-dt-documents` Storage bucket.
-- ============================================================

create table if not exists public.fleet_dt_documents (
  id                    uuid        primary key default gen_random_uuid(),
  business_id           uuid        not null references public.businesses(id) on delete cascade,
  shift_id              uuid        references public.fleet_dt_shifts(id) on delete cascade,

  doc_type              text        not null default 'other'
    check (doc_type in (
      'fuel_receipt','scale_ticket','load_ticket','delivery_ticket','disposal_receipt',
      'inspection_photo','defect_photo','incident_photo','signed_work_order',
      'signature','vehicle_photo','other'
    )),

  -- Links back to whichever record this document supports (polymorphic — app-level FK).
  linked_entity_type    text,       -- 'load_cycle' | 'inspection' | 'inspection_item' | 'incident' | 'defect' | 'vehicle_custody'
  linked_entity_id       uuid,

  storage_bucket           text     not null default 'fleet-dt-documents',
  storage_path                text  not null,     -- {business_id}/{shift_id}/{uuid}-{filename}
  file_name                     text,
  mime_type                       text,
  file_size_bytes                    bigint,
  file_hash                            text,        -- sha-256, for duplicate detection

  captured_at                            timestamptz,
  lat                                       double precision,
  lng                                         double precision,

  uploaded_by                                  uuid references public.profiles(id),
  created_at                                    timestamptz not null default now()
);

create index if not exists idx_fleet_dt_documents_business on public.fleet_dt_documents(business_id, doc_type);
create index if not exists idx_fleet_dt_documents_shift on public.fleet_dt_documents(shift_id);
create index if not exists idx_fleet_dt_documents_entity on public.fleet_dt_documents(linked_entity_type, linked_entity_id);
create index if not exists idx_fleet_dt_documents_hash on public.fleet_dt_documents(business_id, file_hash) where file_hash is not null;

alter table public.fleet_dt_documents enable row level security;

drop policy if exists "fleet_dt_documents_select" on public.fleet_dt_documents;
create policy "fleet_dt_documents_select" on public.fleet_dt_documents
  for select using (
    uploaded_by = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll','billing'])
  );

drop policy if exists "fleet_dt_documents_insert" on public.fleet_dt_documents;
create policy "fleet_dt_documents_insert" on public.fleet_dt_documents
  for insert with check (public.fleet_dt_is_member(business_id));

-- Now that fleet_dt_documents exists, wire up the deferred doc FKs.
alter table public.fleet_dt_load_cycles
  add constraint fleet_dt_load_cycles_scale_ticket_fk
  foreign key (scale_ticket_doc_id) references public.fleet_dt_documents(id) on delete set null;

alter table public.fleet_dt_load_cycles
  add constraint fleet_dt_load_cycles_delivery_ticket_fk
  foreign key (delivery_ticket_doc_id) references public.fleet_dt_documents(id) on delete set null;


-- ============================================================
-- fleet_dt_inspection_templates (+ versions + items)
-- Templates can evolve; a completed inspection snapshots the exact
-- template_version_id + item list it was run against.
-- ============================================================

create table if not exists public.fleet_dt_inspection_templates (
  id                    uuid        primary key default gen_random_uuid(),
  business_id           uuid        references public.businesses(id) on delete cascade, -- null = platform-wide default template
  name                  text        not null,
  vehicle_class         text        not null default 'dump_truck',
  inspection_type       text        not null check (inspection_type in ('pretrip','posttrip')),
  active                boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.fleet_dt_inspection_templates enable row level security;

drop policy if exists "fleet_dt_templates_select" on public.fleet_dt_inspection_templates;
create policy "fleet_dt_templates_select" on public.fleet_dt_inspection_templates
  for select using (
    business_id is null
    or public.fleet_dt_is_member(business_id)
  );

drop policy if exists "fleet_dt_templates_write" on public.fleet_dt_inspection_templates;
create policy "fleet_dt_templates_write" on public.fleet_dt_inspection_templates
  for all using (business_id is not null and public.fleet_dt_has_role(business_id, array['owner','admin']))
  with check (business_id is not null and public.fleet_dt_has_role(business_id, array['owner','admin']));

drop trigger if exists set_fleet_dt_templates_updated_at on public.fleet_dt_inspection_templates;
create trigger set_fleet_dt_templates_updated_at
  before update on public.fleet_dt_inspection_templates
  for each row execute function public.set_updated_at();


create table if not exists public.fleet_dt_inspection_template_versions (
  id                    uuid        primary key default gen_random_uuid(),
  template_id           uuid        not null references public.fleet_dt_inspection_templates(id) on delete cascade,
  version               integer     not null,
  items                 jsonb       not null default '[]'::jsonb,
  -- items: [{ key, label, category, requires_odometer, allow_na }]
  published_at          timestamptz not null default now(),
  created_by             uuid       references public.profiles(id),

  unique (template_id, version)
);

alter table public.fleet_dt_inspection_template_versions enable row level security;

drop policy if exists "fleet_dt_template_versions_select" on public.fleet_dt_inspection_template_versions;
create policy "fleet_dt_template_versions_select" on public.fleet_dt_inspection_template_versions
  for select using (
    template_id in (
      select id from public.fleet_dt_inspection_templates
      where business_id is null or public.fleet_dt_is_member(business_id)
    )
  );

drop policy if exists "fleet_dt_template_versions_write" on public.fleet_dt_inspection_template_versions;
create policy "fleet_dt_template_versions_write" on public.fleet_dt_inspection_template_versions
  for insert with check (
    template_id in (
      select id from public.fleet_dt_inspection_templates
      where business_id is not null and public.fleet_dt_has_role(business_id, array['owner','admin'])
    )
  );


-- ============================================================
-- fleet_dt_inspections — a single pre-trip or post-trip inspection run
-- ============================================================

create table if not exists public.fleet_dt_inspections (
  id                       uuid        primary key default gen_random_uuid(),
  business_id              uuid        not null references public.businesses(id) on delete cascade,
  shift_id                 uuid        not null references public.fleet_dt_shifts(id) on delete cascade,
  driver_id                uuid        not null references public.profiles(id),
  truck_id                 uuid        not null references public.fleet_equipment(id),
  trailer_id               uuid        references public.fleet_equipment(id),

  inspection_type          text        not null check (inspection_type in ('pretrip','posttrip')),
  template_version_id      uuid        not null references public.fleet_dt_inspection_template_versions(id),

  status                   text        not null default 'in_progress'
    check (status in ('in_progress','completed')),

  odometer                 integer,
  fuel_level                text,

  has_defects                boolean   not null default false,
  has_out_of_service_defect    boolean not null default false,
  override_reason                text, -- required if dispatched despite safety-critical/OOS defect
  override_by                      uuid references public.profiles(id),

  driver_signature                    text, -- data URL or storage path
  signed_at                              timestamptz,

  started_at                              timestamptz not null default now(),
  completed_at                              timestamptz,

  created_at                                 timestamptz not null default now(),
  updated_at                                  timestamptz not null default now()
);

create index if not exists idx_fleet_dt_inspections_shift on public.fleet_dt_inspections(shift_id);
create index if not exists idx_fleet_dt_inspections_truck on public.fleet_dt_inspections(truck_id, completed_at desc);
create index if not exists idx_fleet_dt_inspections_oos on public.fleet_dt_inspections(business_id) where has_out_of_service_defect = true;

alter table public.fleet_dt_inspections enable row level security;

drop policy if exists "fleet_dt_inspections_select" on public.fleet_dt_inspections;
create policy "fleet_dt_inspections_select" on public.fleet_dt_inspections
  for select using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop policy if exists "fleet_dt_inspections_insert" on public.fleet_dt_inspections;
create policy "fleet_dt_inspections_insert" on public.fleet_dt_inspections
  for insert with check (driver_id = auth.uid() and public.fleet_dt_is_member(business_id));

drop policy if exists "fleet_dt_inspections_update" on public.fleet_dt_inspections;
create policy "fleet_dt_inspections_update" on public.fleet_dt_inspections
  for update using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop trigger if exists set_fleet_dt_inspections_updated_at on public.fleet_dt_inspections;
create trigger set_fleet_dt_inspections_updated_at
  before update on public.fleet_dt_inspections
  for each row execute function public.set_updated_at();


create table if not exists public.fleet_dt_inspection_items (
  id                    uuid        primary key default gen_random_uuid(),
  inspection_id         uuid        not null references public.fleet_dt_inspections(id) on delete cascade,

  item_key              text        not null,
  item_label            text        not null,
  category               text,

  result                 text       not null default 'pass'
    check (result in ('pass','defect','not_applicable','note')),
  severity                 text     check (severity in ('monitor','non_safety','safety_critical','out_of_service')),
  notes                      text,
  photo_doc_id                 uuid references public.fleet_dt_documents(id),

  created_at                     timestamptz not null default now()
);

create index if not exists idx_fleet_dt_inspection_items_inspection on public.fleet_dt_inspection_items(inspection_id);
create index if not exists idx_fleet_dt_inspection_items_defects on public.fleet_dt_inspection_items(inspection_id) where result = 'defect';

alter table public.fleet_dt_inspection_items enable row level security;

drop policy if exists "fleet_dt_inspection_items_select" on public.fleet_dt_inspection_items;
create policy "fleet_dt_inspection_items_select" on public.fleet_dt_inspection_items
  for select using (
    inspection_id in (
      select id from public.fleet_dt_inspections
      where driver_id = auth.uid()
         or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
    )
  );

drop policy if exists "fleet_dt_inspection_items_write" on public.fleet_dt_inspection_items;
create policy "fleet_dt_inspection_items_write" on public.fleet_dt_inspection_items
  for insert with check (
    inspection_id in (select id from public.fleet_dt_inspections where driver_id = auth.uid())
  );


-- ============================================================
-- fleet_dt_defects — defects, standalone or linked to an inspection item.
-- Safety-critical / out-of-service defects block normal dispatch until
-- resolved or overridden (enforced in the app/service layer).
-- ============================================================

create table if not exists public.fleet_dt_defects (
  id                    uuid        primary key default gen_random_uuid(),
  business_id           uuid        not null references public.businesses(id) on delete cascade,
  truck_id              uuid        not null references public.fleet_equipment(id),
  trailer_id            uuid        references public.fleet_equipment(id),

  inspection_id         uuid        references public.fleet_dt_inspections(id),
  inspection_item_id    uuid        references public.fleet_dt_inspection_items(id),
  shift_id              uuid        references public.fleet_dt_shifts(id),

  description            text       not null,
  severity                 text     not null default 'non_safety'
    check (severity in ('monitor','non_safety','safety_critical','out_of_service')),

  status                     text   not null default 'open'
    check (status in ('open','acknowledged','resolved','deferred')),

  reported_by                   uuid references public.profiles(id),
  resolved_by                     uuid references public.profiles(id),
  resolved_at                       timestamptz,
  resolution_notes                     text,

  created_at                              timestamptz not null default now(),
  updated_at                                timestamptz not null default now()
);

create index if not exists idx_fleet_dt_defects_truck on public.fleet_dt_defects(truck_id, status);
create index if not exists idx_fleet_dt_defects_business on public.fleet_dt_defects(business_id, severity, status);
create index if not exists idx_fleet_dt_defects_open_oos on public.fleet_dt_defects(business_id)
  where status in ('open','acknowledged') and severity in ('safety_critical','out_of_service');

alter table public.fleet_dt_defects enable row level security;

drop policy if exists "fleet_dt_defects_select" on public.fleet_dt_defects;
create policy "fleet_dt_defects_select" on public.fleet_dt_defects
  for select using (public.fleet_dt_is_member(business_id));

drop policy if exists "fleet_dt_defects_insert" on public.fleet_dt_defects;
create policy "fleet_dt_defects_insert" on public.fleet_dt_defects
  for insert with check (public.fleet_dt_is_member(business_id));

drop policy if exists "fleet_dt_defects_update" on public.fleet_dt_defects;
create policy "fleet_dt_defects_update" on public.fleet_dt_defects
  for update using (
    public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
    or reported_by = auth.uid()
  );

drop trigger if exists set_fleet_dt_defects_updated_at on public.fleet_dt_defects;
create trigger set_fleet_dt_defects_updated_at
  before update on public.fleet_dt_defects
  for each row execute function public.set_updated_at();


-- ============================================================
-- fleet_dt_incidents
-- ============================================================

create table if not exists public.fleet_dt_incidents (
  id                    uuid        primary key default gen_random_uuid(),
  business_id           uuid        not null references public.businesses(id) on delete cascade,
  shift_id              uuid        references public.fleet_dt_shifts(id),
  driver_id             uuid        not null references public.profiles(id),
  truck_id              uuid        references public.fleet_equipment(id),
  job_id                uuid        references public.fleet_dt_jobs(id),

  incident_type          text       not null default 'other'
    check (incident_type in ('collision','property_damage','near_miss','injury','spill','equipment_failure','other')),
  description              text     not null,

  occurred_at                timestamptz not null default now(),
  lat                            double precision,
  lng                              double precision,

  injuries                          boolean not null default false,
  police_report_number                 text,
  police_agency                          text,
  other_party_details                      jsonb default '{}'::jsonb,
  witnesses                                  jsonb default '[]'::jsonb,

  immediate_safety_status                       text default 'safe'
    check (immediate_safety_status in ('safe','needs_assistance','emergency')),

  admin_notified                                   boolean not null default false,
  admin_notified_at                                   timestamptz,

  created_at                                             timestamptz not null default now(),
  updated_at                                              timestamptz not null default now()
);

create index if not exists idx_fleet_dt_incidents_business on public.fleet_dt_incidents(business_id, occurred_at desc);
create index if not exists idx_fleet_dt_incidents_shift on public.fleet_dt_incidents(shift_id);

alter table public.fleet_dt_incidents enable row level security;

drop policy if exists "fleet_dt_incidents_select" on public.fleet_dt_incidents;
create policy "fleet_dt_incidents_select" on public.fleet_dt_incidents
  for select using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop policy if exists "fleet_dt_incidents_insert" on public.fleet_dt_incidents;
create policy "fleet_dt_incidents_insert" on public.fleet_dt_incidents
  for insert with check (driver_id = auth.uid() and public.fleet_dt_is_member(business_id));

drop policy if exists "fleet_dt_incidents_update" on public.fleet_dt_incidents;
create policy "fleet_dt_incidents_update" on public.fleet_dt_incidents
  for update using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop trigger if exists set_fleet_dt_incidents_updated_at on public.fleet_dt_incidents;
create trigger set_fleet_dt_incidents_updated_at
  before update on public.fleet_dt_incidents
  for each row execute function public.set_updated_at();


-- ============================================================
-- fleet_dt_corrections — immutable audit trail for manual timestamp/field edits
-- ============================================================

create table if not exists public.fleet_dt_corrections (
  id                    uuid        primary key default gen_random_uuid(),
  business_id           uuid        not null references public.businesses(id) on delete cascade,

  entity_type           text        not null,   -- 'event' | 'shift' | 'load_cycle' | 'inspection_item'
  entity_id             uuid        not null,

  field                 text        not null,
  old_value             jsonb,
  new_value             jsonb,
  reason                text        not null,

  actor_id              uuid        not null references public.profiles(id),
  created_at            timestamptz not null default now()
);

create index if not exists idx_fleet_dt_corrections_entity on public.fleet_dt_corrections(entity_type, entity_id);
create index if not exists idx_fleet_dt_corrections_business on public.fleet_dt_corrections(business_id, created_at desc);

alter table public.fleet_dt_corrections enable row level security;

drop policy if exists "fleet_dt_corrections_select" on public.fleet_dt_corrections;
create policy "fleet_dt_corrections_select" on public.fleet_dt_corrections
  for select using (public.fleet_dt_is_member(business_id));

-- Corrections may only be written by dispatcher+ roles, and never updated/deleted.
drop policy if exists "fleet_dt_corrections_insert" on public.fleet_dt_corrections;
create policy "fleet_dt_corrections_insert" on public.fleet_dt_corrections
  for insert with check (
    actor_id = auth.uid()
    and public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );


-- ============================================================
-- Private Storage bucket: fleet-dt-documents
-- Tenant-scoped object paths: {business_id}/{shift_id}/{uuid}-{filename}
-- No public read — access only via short-lived signed URLs issued server-side.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fleet-dt-documents', 'fleet-dt-documents', false, 26214400,
  array['image/png','image/jpeg','image/webp','image/heic','application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "fleet_dt_documents_storage_select" on storage.objects;
create policy "fleet_dt_documents_storage_select" on storage.objects
  for select using (
    bucket_id = 'fleet-dt-documents'
    and public.fleet_dt_is_member((split_part(name, '/', 1))::uuid)
  );

drop policy if exists "fleet_dt_documents_storage_insert" on storage.objects;
create policy "fleet_dt_documents_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'fleet-dt-documents'
    and public.fleet_dt_is_member((split_part(name, '/', 1))::uuid)
  );

-- No update/delete storage policies — uploaded evidence documents are immutable.
-- (Admins needing to remove a file do so via a service-role admin action, audited.)

-- ── Notify PostgREST of schema changes ──────────────────────
notify pgrst, 'reload schema';
