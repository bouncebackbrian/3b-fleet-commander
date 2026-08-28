-- ============================================================
-- Fleet Commander development bootstrap: Cal-Neva full-access user
-- Date: 2026-08-28
--
-- Purpose:
--   Bind the existing 3B auth/profile for BounceBackBrian@outlook.com to
--   Cal-Neva Trucking for development and grant explicit Driver + Dispatch +
--   Admin portal access. This does not grant Fleet Founder/system access.
--
-- Founder/system access remains a separate platform-level authorization.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_business_id uuid := '34f00ed3-1759-4534-afad-34b6b000792f'::uuid;
begin
  select id into v_user_id
  from public.profiles
  where lower(email) = lower('BounceBackBrian@outlook.com')
  limit 1;

  if v_user_id is null then
    raise notice 'Cal-Neva dev bootstrap skipped: 3B profile not found for configured development email.';
    return;
  end if;

  if not exists (select 1 from public.businesses where id = v_business_id) then
    raise notice 'Cal-Neva dev bootstrap skipped: Cal-Neva business ID not found.';
    return;
  end if;

  -- Development business relationship. This gives the account full company
  -- management capability for Cal-Neva while preserving Founder as a separate
  -- platform-level identity.
  insert into public.business_members (business_id, user_id, role, invited_by)
  values (v_business_id, v_user_id, 'owner', v_user_id)
  on conflict (business_id, user_id)
  do update set role = excluded.role;

  insert into public.fleet_business_members (business_id, user_id, role, active)
  values (v_business_id, v_user_id, 'owner', true)
  on conflict (business_id, user_id)
  do update set role = excluded.role, active = true;

  -- Authorization truth: explicit portal grants.
  insert into public.fleet_member_portal_grants
    (business_id, user_id, portal, permission_level, granted_by)
  values
    (v_business_id, v_user_id, 'driver',   'manage', v_user_id),
    (v_business_id, v_user_id, 'dispatch', 'manage', v_user_id),
    (v_business_id, v_user_id, 'admin',    'manage', v_user_id)
  on conflict (business_id, user_id, portal)
  do update set
    permission_level = excluded.permission_level,
    granted_by = excluded.granted_by,
    updated_at = now();

  update public.profiles
  set default_business_id = v_business_id,
      has_fleet = true,
      updated_at = now()
  where id = v_user_id;

  update public.businesses
  set has_fleet = true,
      updated_at = now()
  where id = v_business_id;
end
$$;

notify pgrst, 'reload schema';
