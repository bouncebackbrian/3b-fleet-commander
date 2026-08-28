-- 3B Business core portals
-- Every 3B Business ID automatically receives the business-level core modules
-- that exist independently of paid Fleet Commander operating modes.

create table if not exists public.business_core_modules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  module_key text not null check (module_key in ('asset_portal','authorized_users')),
  enabled boolean not null default true,
  provisioned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id, module_key)
);

create index if not exists idx_business_core_modules_business
  on public.business_core_modules(business_id, module_key);

create or replace function public.provision_3b_business_core_modules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_core_modules (business_id, module_key)
  values
    (new.id, 'asset_portal'),
    (new.id, 'authorized_users')
  on conflict (business_id, module_key) do nothing;
  return new;
end;
$$;

drop trigger if exists provision_3b_business_core_modules_on_create on public.businesses;
create trigger provision_3b_business_core_modules_on_create
  after insert on public.businesses
  for each row execute function public.provision_3b_business_core_modules();

-- Backfill all existing 3B Business IDs so legacy businesses receive the same shell.
insert into public.business_core_modules (business_id, module_key)
select b.id, m.module_key
from public.businesses b
cross join (values ('asset_portal'::text), ('authorized_users'::text)) as m(module_key)
on conflict (business_id, module_key) do nothing;

alter table public.business_core_modules enable row level security;

drop policy if exists "business_core_modules_member_read" on public.business_core_modules;
create policy "business_core_modules_member_read" on public.business_core_modules
  for select using (
    exists (
      select 1 from public.business_members bm
      where bm.business_id = business_core_modules.business_id
        and bm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.fleet_business_members fm
      where fm.business_id = business_core_modules.business_id
        and fm.user_id = auth.uid()
        and fm.active = true
    )
  );

notify pgrst, 'reload schema';
