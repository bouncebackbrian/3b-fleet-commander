-- 3B Ecosystem / Fleet Commander
-- Business-account permissions are independent from Fleet Commander operational portals.
-- Dispatch access must never imply company administration, billing, ownership, or authorized-user management.

-- Correct the legacy role-to-portal defaults for future/backfill translation.
-- A user who needs multiple portals receives multiple explicit grants.
delete from public.fleet_role_portal_map where role = 'admin';
insert into public.fleet_role_portal_map (role, portal, permission_level)
values ('admin', 'admin', 'manage')
on conflict (role, portal) do update set permission_level = excluded.permission_level;

-- Dispatcher remains mode/operations-facing only.
delete from public.fleet_role_portal_map where role = 'dispatcher';
insert into public.fleet_role_portal_map (role, portal, permission_level) values
  ('dispatcher', 'dispatch', 'manage'),
  ('dispatcher', 'driver', 'view')
on conflict (role, portal) do update set permission_level = excluded.permission_level;

-- Company-account permissions live outside Fleet Commander portal grants.
create table if not exists public.business_member_permissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null check (permission in (
    'asset_portal_view',
    'asset_portal_manage',
    'authorized_users_view',
    'authorized_users_manage',
    'company_profile_view',
    'company_profile_manage',
    'billing_view',
    'billing_manage',
    'subscriptions_view',
    'subscriptions_manage',
    'compliance_view',
    'compliance_manage'
  )),
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (business_id, user_id, permission)
);

create index if not exists idx_business_member_permissions_lookup
  on public.business_member_permissions(business_id, user_id);

alter table public.business_member_permissions enable row level security;

-- Members may read their own explicit company permissions.
drop policy if exists "business_permissions_self_read" on public.business_member_permissions;
create policy "business_permissions_self_read" on public.business_member_permissions
  for select using (user_id = auth.uid());

-- The claimed business owner controls company-account permissions.
-- Partners/managers can be granted the ability through application service logic,
-- but do not receive it implicitly from their relationship title.
drop policy if exists "business_permissions_owner_manage" on public.business_member_permissions;
create policy "business_permissions_owner_manage" on public.business_member_permissions
  for all using (
    exists (
      select 1 from public.businesses b
      where b.id = business_member_permissions.business_id
        and b.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = business_member_permissions.business_id
        and b.owner_id = auth.uid()
    )
  );

-- Owners have implicit full company-account access. This helper avoids needing
-- redundant permission rows for the primary owner.
create or replace function public.has_business_permission(
  p_business_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.businesses b
      where b.id = p_business_id and b.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.business_member_permissions p
      where p.business_id = p_business_id
        and p.user_id = auth.uid()
        and p.permission = p_permission
    );
$$;

notify pgrst, 'reload schema';
