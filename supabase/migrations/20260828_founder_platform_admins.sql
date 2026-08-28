-- ============================================================
-- 3B FLEET COMMANDER — Founder / Platform Admin Registry
-- Migration: 20260828_founder_platform_admins
--
-- Platform-level access is intentionally independent from any customer
-- business membership, business ownership, or Fleet portal grant.
-- ============================================================

create table if not exists public.fleet_platform_admins (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  admin_level   text not null default 'founder'
    check (admin_level in ('founder','platform_admin','support')),
  active        boolean not null default true,
  granted_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists set_fleet_platform_admins_updated_at on public.fleet_platform_admins;
create trigger set_fleet_platform_admins_updated_at
  before update on public.fleet_platform_admins
  for each row execute function public.set_updated_at();

create index if not exists idx_fleet_platform_admins_active
  on public.fleet_platform_admins(active, admin_level);

alter table public.fleet_platform_admins enable row level security;

-- Platform admins can read their own platform-admin row. All cross-account
-- Founder Portal reads/writes continue through server-side service-role code.
drop policy if exists "fleet_platform_admins_self_select" on public.fleet_platform_admins;
create policy "fleet_platform_admins_self_select" on public.fleet_platform_admins
  for select using (user_id = auth.uid());

-- Bootstrap the canonical system-owner account when its 3B profile exists.
insert into public.fleet_platform_admins (user_id, admin_level, active, granted_by)
select id, 'founder', true, id
from public.profiles
where lower(email) = 'admin@bouncebackbrian.com'
on conflict (user_id) do update
set admin_level = 'founder',
    active = true,
    updated_at = now();

notify pgrst, 'reload schema';
