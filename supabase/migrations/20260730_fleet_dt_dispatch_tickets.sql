-- ============================================================
-- 3B FLEET COMMANDER — Digital dispatch tickets
-- Migration: 20260730_fleet_dt_dispatch_tickets
--
-- Broker-branded (or generic Fleet Commander) digital dispatch ticket per
-- job: a fixed field catalog (mirrors the existing fleet_dt_jobs
-- dispatch-ticket columns — no new "what fields exist" decision needed),
-- toggled per broker by an admin. Field VALUES are not duplicated here —
-- read live off fleet_dt_jobs at render time. Company + driver each sign
-- (fleet_dt_documents.doc_type already allows 'signature', just never used
-- until now); the rendered PDF is stored in a new bucket and the instance
-- tracks status/signatures/pdf path/email delivery.
--
-- Note: fleet_dt_documents.linked_entity_type has no DB-level CHECK
-- constraint (confirmed live) — 'event' and 'ticket_instance' can be used
-- as values with no migration needed for that table.
-- ============================================================

create table if not exists public.fleet_dt_ticket_templates (
  id                       uuid        primary key default gen_random_uuid(),
  business_id              uuid        not null references public.businesses(id) on delete cascade,
  broker_id                uuid        references public.fleet_brokers(id) on delete set null,
  name                     text        not null,
  field_keys               jsonb       not null default '[]'::jsonb,
  requires_company_signoff boolean     not null default true,
  requires_driver_signature boolean    not null default true,
  reference_scan_doc_id    uuid        references public.fleet_dt_documents(id),
  created_by               uuid        references public.profiles(id),
  created_at               timestamptz not null default now()
);

-- One generic (broker_id null) template per business, and at most one template per broker.
create unique index if not exists fleet_dt_ticket_templates_broker_uniq
  on public.fleet_dt_ticket_templates(business_id, broker_id) where broker_id is not null;
create unique index if not exists fleet_dt_ticket_templates_generic_uniq
  on public.fleet_dt_ticket_templates(business_id) where broker_id is null;

alter table public.fleet_dt_ticket_templates enable row level security;

drop policy if exists "fleet_dt_ticket_templates_select" on public.fleet_dt_ticket_templates;
create policy "fleet_dt_ticket_templates_select" on public.fleet_dt_ticket_templates
  for select using (fleet_dt_is_member(business_id));

drop policy if exists "fleet_dt_ticket_templates_write" on public.fleet_dt_ticket_templates;
create policy "fleet_dt_ticket_templates_write" on public.fleet_dt_ticket_templates
  for all using (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']))
  with check (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

-- ── Ticket instances — one per job ──────────────────────────────────────────

create table if not exists public.fleet_dt_ticket_instances (
  id                        uuid        primary key default gen_random_uuid(),
  business_id               uuid        not null references public.businesses(id) on delete cascade,
  job_id                    uuid        not null references public.fleet_dt_jobs(id) on delete cascade,
  template_id               uuid        references public.fleet_dt_ticket_templates(id),
  driver_id                 uuid        references public.profiles(id),
  broker_id                 uuid        references public.fleet_brokers(id),

  status                    text        not null default 'active'
    check (status in ('active', 'company_signed', 'driver_signed', 'completed')),

  company_signature_doc_id  uuid        references public.fleet_dt_documents(id),
  company_signed_by         uuid        references public.profiles(id),
  company_signed_at         timestamptz,

  driver_signature_doc_id   uuid        references public.fleet_dt_documents(id),
  driver_signed_at          timestamptz,

  pdf_storage_path          text,
  emailed_at                timestamptz,

  created_at                timestamptz not null default now(),

  unique (job_id)
);

create index if not exists idx_fleet_dt_ticket_instances_business
  on public.fleet_dt_ticket_instances(business_id, status);

alter table public.fleet_dt_ticket_instances enable row level security;

drop policy if exists "fleet_dt_ticket_instances_select" on public.fleet_dt_ticket_instances;
create policy "fleet_dt_ticket_instances_select" on public.fleet_dt_ticket_instances
  for select using (fleet_dt_is_member(business_id));

-- Write: dispatch/admin roles, or the driver signing their own ticket.
drop policy if exists "fleet_dt_ticket_instances_write" on public.fleet_dt_ticket_instances;
create policy "fleet_dt_ticket_instances_write" on public.fleet_dt_ticket_instances
  for all using (
    fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
    or driver_id = auth.uid()
  )
  with check (
    fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
    or driver_id = auth.uid()
  );

notify pgrst, 'reload schema';
