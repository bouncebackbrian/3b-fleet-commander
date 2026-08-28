-- Fleet Commander / 3B Ecosystem
-- Provisional business records created by drivers when the real owner has not joined 3B yet.
-- IMPORTANT: creating a provisional business is NOT a claim of legal ownership.

alter table public.businesses
  add column if not exists account_status text not null default 'claimed',
  add column if not exists created_by_user_id uuid references public.profiles(id),
  add column if not exists owner_claimed_at timestamptz,
  add column if not exists provisional_owner_name text,
  add column if not exists provisional_owner_email text,
  add column if not exists provisional_owner_phone text;

alter table public.businesses
  drop constraint if exists businesses_account_status_check;

alter table public.businesses
  add constraint businesses_account_status_check
  check (account_status in ('provisional','claim_pending','claimed','suspended'));

update public.businesses
set account_status = 'claimed',
    created_by_user_id = coalesce(created_by_user_id, owner_id),
    owner_claimed_at = coalesce(owner_claimed_at, created_at)
where owner_id is not null
  and account_status = 'claimed';

create table if not exists public.business_claim_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  claimant_user_id uuid not null references public.profiles(id) on delete cascade,
  requested_by_user_id uuid references public.profiles(id),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled','expired')),
  claimant_email text,
  claimant_phone text,
  verification_note text,
  reviewed_by_user_id uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, claimant_user_id)
);

create index if not exists idx_business_claim_requests_business
  on public.business_claim_requests(business_id, status);

-- Existing fleet_equipment already requires business_id NOT NULL.
-- Allow the driver who created an unclaimed/provisional company to add the truck
-- they actually operate without granting company ownership/admin rights.
drop policy if exists "fleet_equipment_member_write" on public.fleet_equipment;
create policy "fleet_equipment_member_write" on public.fleet_equipment
  for all using (
    exists (
      select 1 from public.fleet_business_members
      where business_id = fleet_equipment.business_id
        and user_id = auth.uid()
        and active = true
        and role in ('owner', 'admin', 'dispatcher', 'fleet_manager')
    )
    or exists (
      select 1 from public.businesses b
      where b.id = fleet_equipment.business_id
        and b.created_by_user_id = auth.uid()
        and b.account_status in ('provisional','claim_pending')
    )
  )
  with check (
    exists (
      select 1 from public.fleet_business_members
      where business_id = fleet_equipment.business_id
        and user_id = auth.uid()
        and active = true
        and role in ('owner', 'admin', 'dispatcher', 'fleet_manager')
    )
    or exists (
      select 1 from public.businesses b
      where b.id = fleet_equipment.business_id
        and b.created_by_user_id = auth.uid()
        and b.account_status in ('provisional','claim_pending')
    )
  );

alter table public.business_claim_requests enable row level security;

drop policy if exists "business_claim_request_member_select" on public.business_claim_requests;
create policy "business_claim_request_member_select" on public.business_claim_requests
  for select using (
    claimant_user_id = auth.uid()
    or requested_by_user_id = auth.uid()
    or exists (
      select 1 from public.business_members bm
      where bm.business_id = business_claim_requests.business_id
        and bm.user_id = auth.uid()
        and bm.role in ('owner','partner','manager')
    )
  );

notify pgrst, 'reload schema';
