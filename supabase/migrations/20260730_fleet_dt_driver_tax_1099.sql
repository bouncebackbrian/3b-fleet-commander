-- ============================================================
-- 3B FLEET COMMANDER — Driver tax classification, W-9, 1099-NEC
-- Migration: 20260730_fleet_dt_driver_tax_1099
--
-- businesses gets a mailing address (payer address on Form 1099-NEC —
-- name/EIN already existed from the earlier branded-reports pass).
-- fleet_dt_driver_tax_profiles holds classification (W-2 vs 1099),
-- per-driver withholding %, and W-9 info (name/address/TIN, digitally
-- signed via the SignaturePad component already used for dispatch
-- tickets). TIN is sensitive — RLS here is deliberately tighter than the
-- usual owner/admin/dispatcher/fleet_manager convention (owner/admin only,
-- or the driver themselves), and the app layer additionally never returns
-- TIN in list endpoints, only in the single-record admin/self fetch and
-- server-side PDF generation.
--
-- fleet_dt_1099_filings records a generated Form 1099-NEC (Copy B/C, plain
-- paper — NOT the IRS-scannable Copy A; see lib/tax/form1099nec.ts) so
-- there's a record of what was generated/sent, independent of payroll
-- payment rows changing later.
-- ============================================================

alter table public.businesses
  add column if not exists address_line1 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text;

create table if not exists public.fleet_dt_driver_tax_profiles (
  id                          uuid        primary key default gen_random_uuid(),
  business_id                 uuid        not null references public.businesses(id) on delete cascade,
  driver_id                   uuid        not null,

  classification               text       not null default 'w2'
    check (classification in ('w2', '1099')),
  withholding_percent            numeric,

  legal_name                       text,
  business_name                       text,
  federal_tax_classification             text
    check (federal_tax_classification in ('individual', 'sole_proprietor', 'c_corp', 's_corp', 'partnership', 'trust_estate', 'llc', 'other')),
  address_line1                             text,
  city                                         text,
  state                                          text,
  postal_code                                       text,

  tin                                                  text,
  tin_type                                                text check (tin_type in ('ssn', 'ein')),
  w9_signature_doc_id                                        uuid references public.fleet_dt_documents(id),
  w9_signed_at                                                  timestamptz,

  updated_by                                                       uuid,
  created_at                                                          timestamptz not null default now(),
  updated_at                                                          timestamptz not null default now(),

  unique (business_id, driver_id)
);

alter table public.fleet_dt_driver_tax_profiles enable row level security;

drop policy if exists "fleet_dt_driver_tax_profiles_select" on public.fleet_dt_driver_tax_profiles;
create policy "fleet_dt_driver_tax_profiles_select" on public.fleet_dt_driver_tax_profiles
  for select using (
    fleet_dt_has_role(business_id, array['owner','admin'])
    or driver_id = auth.uid()
  );

drop policy if exists "fleet_dt_driver_tax_profiles_write" on public.fleet_dt_driver_tax_profiles;
create policy "fleet_dt_driver_tax_profiles_write" on public.fleet_dt_driver_tax_profiles
  for all using (
    fleet_dt_has_role(business_id, array['owner','admin'])
    or driver_id = auth.uid()
  )
  with check (
    fleet_dt_has_role(business_id, array['owner','admin'])
    or driver_id = auth.uid()
  );

drop trigger if exists set_fleet_dt_driver_tax_profiles_updated_at on public.fleet_dt_driver_tax_profiles;
create trigger set_fleet_dt_driver_tax_profiles_updated_at
  before update on public.fleet_dt_driver_tax_profiles
  for each row execute function public.set_updated_at();

-- ── Generated 1099-NEC filings ───────────────────────────────────────────────

create table if not exists public.fleet_dt_1099_filings (
  id                    uuid        primary key default gen_random_uuid(),
  business_id           uuid        not null references public.businesses(id) on delete cascade,
  driver_id             uuid        not null,
  tax_year              integer     not null,
  total_compensation    numeric     not null,
  pdf_storage_path      text,
  generated_by          uuid,
  generated_at          timestamptz not null default now(),

  unique (business_id, driver_id, tax_year)
);

alter table public.fleet_dt_1099_filings enable row level security;

drop policy if exists "fleet_dt_1099_filings_select" on public.fleet_dt_1099_filings;
create policy "fleet_dt_1099_filings_select" on public.fleet_dt_1099_filings
  for select using (
    fleet_dt_has_role(business_id, array['owner','admin'])
    or driver_id = auth.uid()
  );

drop policy if exists "fleet_dt_1099_filings_write" on public.fleet_dt_1099_filings;
create policy "fleet_dt_1099_filings_write" on public.fleet_dt_1099_filings
  for all using (fleet_dt_has_role(business_id, array['owner','admin']))
  with check (fleet_dt_has_role(business_id, array['owner','admin']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fleet-dt-1099-forms', 'fleet-dt-1099-forms', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

notify pgrst, 'reload schema';
