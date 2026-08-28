-- Return-to-service accountability for shutdown / out-of-service assets.
-- A shutdown stays in force until an authorized Admin approves the repair.

alter table public.fleet_dt_defects
  add column if not exists return_to_service_required boolean not null default false,
  add column if not exists repair_completed_by uuid references public.profiles(id),
  add column if not exists repair_completed_at timestamptz,
  add column if not exists repair_notes text,
  add column if not exists return_to_service_approved_by uuid references public.profiles(id),
  add column if not exists return_to_service_approved_at timestamptz,
  add column if not exists return_to_service_approval_note text;

create table if not exists public.fleet_return_to_service_approvals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  truck_id uuid not null references public.fleet_equipment(id) on delete cascade,
  defect_id uuid not null references public.fleet_dt_defects(id) on delete cascade,
  approved_by_user_id uuid not null references public.profiles(id),
  approved_by_three_b_id text,
  approval_note text not null,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_fleet_return_to_service_business
  on public.fleet_return_to_service_approvals(business_id, approved_at desc);
create index if not exists idx_fleet_return_to_service_truck
  on public.fleet_return_to_service_approvals(truck_id, approved_at desc);

alter table public.fleet_return_to_service_approvals enable row level security;

drop policy if exists "fleet_return_to_service_select" on public.fleet_return_to_service_approvals;
create policy "fleet_return_to_service_select" on public.fleet_return_to_service_approvals
  for select using (
    public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

-- Only company Admin/Owner can create a return-to-service approval.
drop policy if exists "fleet_return_to_service_insert" on public.fleet_return_to_service_approvals;
create policy "fleet_return_to_service_insert" on public.fleet_return_to_service_approvals
  for insert with check (
    public.fleet_dt_has_role(business_id, array['owner','admin'])
    and approved_by_user_id = auth.uid()
  );

notify pgrst, 'reload schema';
