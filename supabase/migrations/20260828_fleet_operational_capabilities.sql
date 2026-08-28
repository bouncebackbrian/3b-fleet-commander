-- Fleet Commander granular operational capabilities.
-- Portal access answers WHERE a user can go. Capability grants answer WHAT
-- they can do once there. This keeps Dispatch separate from company/admin data
-- while allowing selected dispatchers to approve hours, run reports, or view KPIs.

create table if not exists public.fleet_member_capability_grants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  capability text not null check (capability in (
    'hours_view',
    'hours_approve',
    'hours_correct',
    'reports_view',
    'reports_generate',
    'kpi_view',
    'kpi_export',
    'driver_status_view',
    'dispatch_assign',
    'dispatch_message',
    'tickets_view',
    'tickets_manage',
    'fuel_view',
    'exceptions_manage'
  )),
  mode_id text,
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (business_id, user_id, capability, mode_id)
);

alter table public.business_user_functions
  add column if not exists fleet_capabilities text[] not null default '{}';

alter table public.fleet_member_capability_grants enable row level security;

drop policy if exists "fleet_capability_self_or_member_read" on public.fleet_member_capability_grants;
create policy "fleet_capability_self_or_member_read" on public.fleet_member_capability_grants
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.business_members bm
      where bm.business_id = fleet_member_capability_grants.business_id
        and bm.user_id = auth.uid()
    )
  );

drop policy if exists "fleet_capability_owner_manage" on public.fleet_member_capability_grants;
create policy "fleet_capability_owner_manage" on public.fleet_member_capability_grants
  for all using (
    exists (
      select 1 from public.businesses b
      where b.id = fleet_member_capability_grants.business_id
        and (b.owner_id = auth.uid() or b.created_by_user_id = auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.businesses b
      where b.id = fleet_member_capability_grants.business_id
        and (b.owner_id = auth.uid() or b.created_by_user_id = auth.uid())
    )
  );

create index if not exists idx_fleet_member_capability_lookup
  on public.fleet_member_capability_grants(business_id, user_id, capability, mode_id);

notify pgrst, 'reload schema';
