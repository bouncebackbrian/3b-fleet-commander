-- 3B Business access + Fleet Commander operational contact foundation
-- Company can invite a 3B ID by its account email; a driver can request access to a 3B Business ID.
-- Operational contact details are separate from authentication identity and may be used only for enabled communications.

alter table public.businesses
  add column if not exists operations_email text,
  add column if not exists operations_phone text,
  add column if not exists sms_enabled boolean not null default false;

create table if not exists public.business_access_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  requester_user_id uuid not null references public.profiles(id) on delete cascade,
  requested_role text not null default 'employee'
    check (requested_role in ('partner','manager','employee','advisor')),
  requested_fleet_role text
    check (requested_fleet_role is null or requested_fleet_role in ('driver','dispatcher','admin','broker','fleet_manager')),
  requested_mode text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  note text,
  reviewed_by_user_id uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, requester_user_id)
);

create index if not exists idx_business_access_requests_business_status
  on public.business_access_requests(business_id, status);

alter table public.business_access_requests enable row level security;

create policy "business_access_request_self_read"
  on public.business_access_requests for select
  using (requester_user_id = auth.uid());

create policy "business_access_request_self_create"
  on public.business_access_requests for insert
  with check (requester_user_id = auth.uid());

create policy "business_access_request_business_admin_read"
  on public.business_access_requests for select
  using (
    exists (
      select 1 from public.business_members bm
      where bm.business_id = business_access_requests.business_id
        and bm.user_id = auth.uid()
        and bm.role in ('owner','partner','manager')
    )
  );

-- Membership communication preferences are business-scoped so a person can use
-- different contact choices with different companies while retaining one 3B ID.
alter table public.fleet_business_members
  add column if not exists operations_email text,
  add column if not exists operations_phone text,
  add column if not exists sms_opt_in boolean not null default false,
  add column if not exists email_opt_in boolean not null default true;

notify pgrst, 'reload schema';