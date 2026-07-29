-- ============================================================
-- 3B FLEET COMMANDER — Portal-based permissions
-- Migration: 20260729_fleet_portal_permissions
--
-- Replaces the single-value fleet_business_members.role as the source of
-- authorization truth with independently-grantable portals (driver /
-- dispatch / broker / admin), each at a view or manage permission level.
-- One person can now hold any combination — the immediate driver for this
-- change was a business owner testing the app as their own driver, who
-- didn't fit the old "one role" model.
--
-- fleet_business_members.role is left in place (existing invite/team code
-- still references it, and dropping a column under a live table is
-- unnecessary risk) but becomes DISPLAY-ONLY after this migration — no
-- application code should read it for authorization from here on.
--
-- RLS design: fleet_dt_has_role(business_id, roles text[]) keeps its exact
-- signature so none of the ~15 existing RLS policies that call it need to
-- change. Only its body changes, translating the legacy role-name array
-- into portal/level requirements via fleet_role_portal_map.
--
-- Side effect: RLS policies elsewhere reference 'payroll' and 'billing' as
-- roles, but fleet_business_members.role's CHECK constraint has never
-- allowed those values — they are unreachable today. They are intentionally
-- left out of fleet_role_portal_map (equivalent to deleting dead code).
-- ============================================================

-- ── fleet_role_portal_map — legacy role name -> (portal, level) it implied ────
-- Single documented source of truth, used both for the one-time backfill
-- below and for fleet_dt_has_role()'s translation at query time.

create table if not exists public.fleet_role_portal_map (
  role              text not null,
  portal            text not null check (portal in ('driver','dispatch','broker','admin')),
  permission_level  text not null check (permission_level in ('view','manage')),
  primary key (role, portal)
);

insert into public.fleet_role_portal_map (role, portal, permission_level) values
  ('owner','driver','manage'),      ('owner','dispatch','manage'),      ('owner','broker','manage'),      ('owner','admin','manage'),
  ('admin','driver','manage'),      ('admin','dispatch','manage'),      ('admin','broker','manage'),      ('admin','admin','manage'),
  ('dispatcher','dispatch','manage'), ('dispatcher','driver','view'),
  ('fleet_manager','dispatch','manage'), ('fleet_manager','admin','manage'), ('fleet_manager','driver','view'),
  ('driver','driver','manage'),
  ('broker','broker','manage')
on conflict (role, portal) do update set permission_level = excluded.permission_level;

-- ── fleet_member_portal_grants — the real, per-member, multi-portal grants ────

create table if not exists public.fleet_member_portal_grants (
  id                uuid        primary key default gen_random_uuid(),
  business_id       uuid        not null references public.businesses(id) on delete cascade,
  user_id           uuid        not null references public.profiles(id) on delete cascade,
  portal            text        not null check (portal in ('driver','dispatch','broker','admin')),
  permission_level  text        not null check (permission_level in ('view','manage')),
  granted_by        uuid        references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id, user_id, portal)
);

drop trigger if exists set_fleet_member_portal_grants_updated_at on public.fleet_member_portal_grants;
create trigger set_fleet_member_portal_grants_updated_at
  before update on public.fleet_member_portal_grants
  for each row execute function public.set_updated_at();

create index if not exists idx_fleet_portal_grants_lookup
  on public.fleet_member_portal_grants(business_id, user_id);

alter table public.fleet_member_portal_grants enable row level security;

-- Any active member of the business can see the business's grants (needed to
-- render their own nav + a team-management screen for admins).
drop policy if exists "fleet_portal_grants_select" on public.fleet_member_portal_grants;
create policy "fleet_portal_grants_select" on public.fleet_member_portal_grants
  for select using (public.fleet_dt_is_member(business_id));

-- Writes stay gated on the legacy role column directly (owner/admin) — not
-- circular, since this table's own contents aren't involved in this check,
-- and application writes go through the service-role key anyway (this is
-- defense-in-depth, matching every other fleet_dt_* write policy's shape).
drop policy if exists "fleet_portal_grants_write" on public.fleet_member_portal_grants;
create policy "fleet_portal_grants_write" on public.fleet_member_portal_grants
  for all using (
    exists (
      select 1 from public.fleet_business_members
      where business_id = fleet_member_portal_grants.business_id
        and user_id = auth.uid() and active = true and role in ('owner','admin')
    )
  )
  with check (
    exists (
      select 1 from public.fleet_business_members
      where business_id = fleet_member_portal_grants.business_id
        and user_id = auth.uid() and active = true and role in ('owner','admin')
    )
  );

-- ── One-time backfill: every existing active membership gets real grants ──────
-- matching exactly what their legacy role already implied, so behavior is
-- unchanged for everyone until grants are edited going forward.
--
-- Defensive join against profiles: fleet_business_members can carry rows
-- from before the Core_Eco identity bridge existed, whose user_id has no
-- matching profiles row (found live: a stale duplicate 'owner' row on
-- Cal-Neva Trucking, already deactivated as part of this migration's
-- rollout). Skip anything without a real profile rather than let it violate
-- the FK or silently grant portals to a dead identity.

insert into public.fleet_member_portal_grants (business_id, user_id, portal, permission_level, granted_by)
select fbm.business_id, fbm.user_id, m.portal, m.permission_level, fbm.user_id
from public.fleet_business_members fbm
join public.fleet_role_portal_map m on m.role = fbm.role
where fbm.active = true
  and exists (select 1 from public.profiles p where p.id = fbm.user_id)
on conflict (business_id, user_id, portal) do nothing;

-- ── fleet_dt_has_role() — same signature, new implementation ──────────────────
-- p_roles = null keeps meaning "just check active membership" (unchanged,
-- used by fleet_dt_is_member). A non-null array now means "does the caller
-- hold a portal grant at or above the level any of these legacy role names
-- implied" — translated entirely through fleet_role_portal_map, so no RLS
-- policy text anywhere else needs to change.

create or replace function public.fleet_dt_has_role(p_business_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_roles is null then exists (
      select 1 from public.fleet_business_members
      where business_id = p_business_id and user_id = auth.uid() and active = true
    )
    else exists (
      select 1
      from public.fleet_role_portal_map m
      join public.fleet_member_portal_grants g
        on g.business_id = p_business_id
       and g.user_id = auth.uid()
       and g.portal = m.portal
      where m.role = any(p_roles)
        and (case g.permission_level when 'manage' then 2 else 1 end)
            >= (case m.permission_level when 'manage' then 2 else 1 end)
    )
  end;
$$;

notify pgrst, 'reload schema';
