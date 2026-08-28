-- ============================================================
-- 3B FLEET COMMANDER — Cal-Neva product-owner development access
-- Migration: 20260828_cal_neva_product_owner_dev_access
--
-- Treats the product-owner account as a fully authorized Cal-Neva user for
-- development while keeping legal business ownership and platform Founder
-- authority separate.
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

  -- Authorized business user with broad management authority, but not legal
  -- ownership. Ownership remains represented by businesses.owner_id.
  insert into public.business_members (business_id, user_id, role)
  values (v_business_id, v_user_id, 'manager')
  on conflict (business_id, user_id) do update
    set role = excluded.role;

  -- Display role only. Actual authorization comes from explicit grants below.
  insert into public.fleet_business_members (business_id, user_id, role, active)
  values (v_business_id, v_user_id, 'admin', true)
  on conflict (business_id, user_id) do update
    set role = excluded.role,
        active = true;

  -- Full requested Fleet views: Driver + Dispatch + Admin.
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

  -- Full current Business Admin permissions.
  insert into public.business_member_permissions
    (business_id, user_id, permission, granted_by)
  select v_business_id, v_user_id, permission, v_user_id
  from unnest(array[
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
    'compliance_manage',
    'driver_pay_view',
    'driver_pay_manage',
    'payroll_settings_view',
    'payroll_settings_manage'
  ]::text[]) permission
  on conflict (business_id, user_id, permission) do update
    set granted_by = excluded.granted_by;

  -- Full current Dump Truck operational capability set.
  insert into public.fleet_member_capability_grants
    (business_id, user_id, capability, mode_id, granted_by)
  select v_business_id, v_user_id, capability, 'dump-truck', v_user_id
  from unnest(array[
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
  ]::text[]) capability
  on conflict (business_id, user_id, capability, mode_id) do update
    set granted_by = excluded.granted_by;

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
