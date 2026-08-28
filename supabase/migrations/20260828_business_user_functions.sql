-- 3B Business ID — reusable user functions / permission templates
-- A business creator/owner can define named functions such as Night Dispatcher,
-- Payroll Clerk, Safety Manager, Shop Manager, or Driver + Fuel, then assign
-- those functions to authorized 3B IDs. The template is convenience; the
-- underlying permissions remain explicit and auditable.

create table if not exists public.business_user_functions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  business_permissions text[] not null default '{}',
  fleet_portal_grants jsonb not null default '[]'::jsonb,
  mode_ids text[] not null default '{}',
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create table if not exists public.business_user_function_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  function_id uuid not null references public.business_user_functions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  unique (business_id, function_id, user_id)
);

create index if not exists idx_business_user_functions_business
  on public.business_user_functions(business_id, active);
create index if not exists idx_business_user_function_assignments_user
  on public.business_user_function_assignments(business_id, user_id, active);

alter table public.business_user_functions enable row level security;
alter table public.business_user_function_assignments enable row level security;

-- Members can see function names/assignments for their own business so the UI
-- can explain why access exists. Only the business owner/creator can manage
-- templates in this first implementation; delegation can later use an explicit
-- Authorized Users management permission without coupling it to Dispatch.
drop policy if exists "business_user_functions_member_read" on public.business_user_functions;
create policy "business_user_functions_member_read" on public.business_user_functions
  for select using (
    exists (
      select 1 from public.business_members bm
      where bm.business_id = business_user_functions.business_id
        and bm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.fleet_business_members fm
      where fm.business_id = business_user_functions.business_id
        and fm.user_id = auth.uid() and fm.active = true
    )
  );

drop policy if exists "business_user_functions_owner_manage" on public.business_user_functions;
create policy "business_user_functions_owner_manage" on public.business_user_functions
  for all using (
    exists (
      select 1 from public.businesses b
      where b.id = business_user_functions.business_id
        and (b.owner_id = auth.uid() or b.created_by_user_id = auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.businesses b
      where b.id = business_user_functions.business_id
        and (b.owner_id = auth.uid() or b.created_by_user_id = auth.uid())
    )
  );

drop policy if exists "business_user_function_assignments_member_read" on public.business_user_function_assignments;
create policy "business_user_function_assignments_member_read" on public.business_user_function_assignments
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.business_members bm
      where bm.business_id = business_user_function_assignments.business_id
        and bm.user_id = auth.uid()
    )
  );

drop policy if exists "business_user_function_assignments_owner_manage" on public.business_user_function_assignments;
create policy "business_user_function_assignments_owner_manage" on public.business_user_function_assignments
  for all using (
    exists (
      select 1 from public.businesses b
      where b.id = business_user_function_assignments.business_id
        and (b.owner_id = auth.uid() or b.created_by_user_id = auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.businesses b
      where b.id = business_user_function_assignments.business_id
        and (b.owner_id = auth.uid() or b.created_by_user_id = auth.uid())
    )
  );

drop trigger if exists set_business_user_functions_updated_at on public.business_user_functions;
create trigger set_business_user_functions_updated_at
  before update on public.business_user_functions
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
