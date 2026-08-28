-- ============================================================
-- 3B FLEET COMMANDER — Cal-Neva product-owner development access
-- Migration: 20260828_cal_neva_product_owner_dev_access
--
-- Keeps platform Founder identity separate from the normal product-owner
-- account used to test Fleet Commander as a real business user.
--
-- Development business: Cal-Neva Trucking
-- Business UUID: 34f00ed3-1759-4534-afad-34b6b000792f
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_business_id uuid := '34f00ed3-1759-4534-afad-34b6b000792f'::uuid;
begin
  select id into v_user_id
  from public.profiles
  where lower(email) = 'bouncebackbrian@outlook.com'
  limit 1;

  if v_user_id is null then
    raise notice 'Cal-Neva dev bootstrap skipped: product-owner profile does not exist yet';
    return;
  end if;

  if not exists (select 1 from public.businesses where id = v_business_id) then
    raise notice 'Cal-Neva dev bootstrap skipped: Cal-Neva business is missing';
    return;
  end if;

  -- Ecosystem/business relationship. For development this account is allowed
  -- to manage Cal-Neva, but this does not change the platform Founder owner.
  insert into public.business_members (business_id, user_id, role)
  values (v_business_id, v_user_id, 'manager')
  on conflict (business_id, user_id) do update
    set role = excluded.role;

  -- Fleet membership remains a display label; portal grants below are the
  -- actual authorization source.
  insert into public.fleet_business_members (business_id, user_id, role, active)
  values (v_business_id, v_user_id, 'admin', true)
  on conflict (business_id, user_id) do update
    set role = excluded.role,
        active = true;

  -- Product-owner dev account receives all three requested operational views.
  insert into public.fleet_member_portal_grants
    (business_id, user_id, portal, permission_level, granted_by)
  values
    (v_business_id, v_user_id, 'driver',   'manage', v_user_id),
    (v_business_id, v_user_id, 'dispatch', 'manage', v_user_id),
    (v_business_id, v_user_id, 'admin',    'manage', v_user_id)
  on conflict (business_id, user_id, portal) do update
    set permission_level = excluded.permission_level,
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
end;
$$;

notify pgrst, 'reload schema';
