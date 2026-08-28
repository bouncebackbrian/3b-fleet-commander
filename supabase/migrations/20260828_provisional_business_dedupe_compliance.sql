-- Fleet Commander / 3B Ecosystem
-- One real company -> one 3B Business ID, including driver-created provisional employers.
-- Registration / insurance evidence can support truck compliance and business matching,
-- but uploaded evidence never proves legal ownership by itself.

alter table public.businesses
  add column if not exists normalized_company_name text generated always as (
    regexp_replace(lower(coalesce(company_name, '')), '[^a-z0-9]+', '', 'g')
  ) stored;

-- Strong identifiers prevent duplicate provisional records even if two drivers submit together.
create unique index if not exists uq_businesses_active_dot_number
  on public.businesses ((regexp_replace(coalesce(dot_number, ''), '[^0-9]+', '', 'g')))
  where account_status in ('provisional','claim_pending','claimed')
    and dot_number is not null
    and regexp_replace(dot_number, '[^0-9]+', '', 'g') <> '';

create unique index if not exists uq_businesses_active_mc_number
  on public.businesses ((regexp_replace(upper(coalesce(mc_number, '')), '[^A-Z0-9]+', '', 'g')))
  where account_status in ('provisional','claim_pending','claimed')
    and mc_number is not null
    and regexp_replace(upper(mc_number), '[^A-Z0-9]+', '', 'g') <> '';

-- Name + state is a fallback for provisional records where DOT/MC is unknown.
-- It intentionally applies only to provisional/claim-pending records to avoid
-- retroactively blocking legitimate historical claimed businesses with similar names.
create unique index if not exists uq_businesses_provisional_name_state
  on public.businesses (normalized_company_name, upper(state))
  where account_status in ('provisional','claim_pending')
    and normalized_company_name <> ''
    and state is not null
    and btrim(state) <> '';

-- Safe employer lookup for a driver who is not yet a member of the business.
-- Returns only identification/status fields needed to prevent duplicate creation.
create or replace function public.find_3b_business_match(
  p_company_name text,
  p_state text default null,
  p_dot_number text default null,
  p_mc_number text default null
)
returns table (
  business_id uuid,
  three_b_biz_id text,
  company_name text,
  state text,
  account_status text,
  owner_claimed boolean,
  match_basis text
)
language sql
security definer
set search_path = public
as $$
  with q as (
    select
      regexp_replace(lower(coalesce(p_company_name,'')), '[^a-z0-9]+', '', 'g') as n,
      upper(nullif(btrim(coalesce(p_state,'')),'')) as s,
      regexp_replace(coalesce(p_dot_number,''), '[^0-9]+', '', 'g') as d,
      regexp_replace(upper(coalesce(p_mc_number,'')), '[^A-Z0-9]+', '', 'g') as m
  )
  select b.id, b.three_b_biz_id, b.company_name, b.state, b.account_status,
         (b.owner_id is not null) as owner_claimed,
         case
           when q.d <> '' and regexp_replace(coalesce(b.dot_number,''), '[^0-9]+', '', 'g') = q.d then 'dot'
           when q.m <> '' and regexp_replace(upper(coalesce(b.mc_number,'')), '[^A-Z0-9]+', '', 'g') = q.m then 'mc'
           else 'name_state'
         end as match_basis
  from public.businesses b cross join q
  where b.account_status in ('provisional','claim_pending','claimed')
    and (
      (q.d <> '' and regexp_replace(coalesce(b.dot_number,''), '[^0-9]+', '', 'g') = q.d)
      or (q.m <> '' and regexp_replace(upper(coalesce(b.mc_number,'')), '[^A-Z0-9]+', '', 'g') = q.m)
      or (
        q.d = '' and q.m = '' and q.s is not null
        and b.normalized_company_name = q.n
        and upper(coalesce(b.state,'')) = q.s
      )
    )
  order by
    case when q.d <> '' and regexp_replace(coalesce(b.dot_number,''), '[^0-9]+', '', 'g') = q.d then 1
         when q.m <> '' and regexp_replace(upper(coalesce(b.mc_number,'')), '[^A-Z0-9]+', '', 'g') = q.m then 2
         else 3 end,
    b.created_at asc
  limit 1;
$$;

revoke all on function public.find_3b_business_match(text,text,text,text) from public;
grant execute on function public.find_3b_business_match(text,text,text,text) to authenticated;

-- A driver can attach themself to an existing *unclaimed* business instead of
-- creating another 3B Business ID. This does not grant owner/admin/dispatch rights.
create or replace function public.join_provisional_business_as_driver(p_business_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;

  if not exists (
    select 1 from public.businesses
    where id = p_business_id
      and owner_id is null
      and account_status in ('provisional','claim_pending')
  ) then
    return false;
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (p_business_id, auth.uid(), 'employee')
  on conflict (business_id, user_id) do nothing;

  insert into public.fleet_business_members (business_id, user_id, role, active)
  values (p_business_id, auth.uid(), 'driver', true)
  on conflict (business_id, user_id) do update set active = true;

  return true;
end;
$$;

revoke all on function public.join_provisional_business_as_driver(uuid) from public;
grant execute on function public.join_provisional_business_as_driver(uuid) to authenticated;

-- Registration and insurance use the existing private fleet_dt_documents pipeline.
-- Explicit types make the compliance document meaningful instead of generic.
alter table public.fleet_dt_documents drop constraint if exists fleet_dt_documents_doc_type_check;
alter table public.fleet_dt_documents add constraint fleet_dt_documents_doc_type_check
  check (doc_type in (
    'fuel_receipt','scale_ticket','load_ticket','delivery_ticket','disposal_receipt',
    'inspection_photo','defect_photo','incident_photo','signed_work_order',
    'signature','vehicle_photo','other',
    'equipment_compliance_doc','equipment_service_receipt',
    'registration','insurance'
  ));

-- One normalized evidence row lets registration/insurance scans support both
-- truck compliance and business matching/claim review without duplicating the file.
create table if not exists public.fleet_equipment_compliance_evidence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  equipment_id uuid not null references public.fleet_equipment(id) on delete cascade,
  document_id uuid not null references public.fleet_dt_documents(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('registration','insurance')),
  vin text,
  license_plate text,
  dot_number text,
  mc_number text,
  named_business text,
  state text,
  policy_number text,
  effective_date date,
  expiration_date date,
  extracted_at timestamptz,
  extraction_confidence numeric(5,4),
  verified_by_owner boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (document_id)
);

create index if not exists idx_fleet_equipment_compliance_evidence_equipment
  on public.fleet_equipment_compliance_evidence(equipment_id, evidence_type, expiration_date);

alter table public.fleet_equipment_compliance_evidence enable row level security;

create policy "equipment_compliance_evidence_member_select"
  on public.fleet_equipment_compliance_evidence for select using (
    exists (
      select 1 from public.fleet_business_members fbm
      where fbm.business_id = fleet_equipment_compliance_evidence.business_id
        and fbm.user_id = auth.uid() and fbm.active = true
    )
  );

create policy "equipment_compliance_evidence_member_insert"
  on public.fleet_equipment_compliance_evidence for insert with check (
    exists (
      select 1 from public.fleet_business_members fbm
      where fbm.business_id = fleet_equipment_compliance_evidence.business_id
        and fbm.user_id = auth.uid() and fbm.active = true
        and fbm.role in ('owner','admin','dispatcher','fleet_manager','driver')
    )
  );

notify pgrst, 'reload schema';
