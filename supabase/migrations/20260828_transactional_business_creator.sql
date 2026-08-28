-- Fleet Commander / 3B Ecosystem
-- Transactional business creation. Client-side multi-step inserts were vulnerable
-- to RLS/partial failure and left onboarding unable to create a company.

create or replace function public.create_3b_business_for_current_user(
  p_company_name text,
  p_business_type text,
  p_entity_type text default null,
  p_slug text default null
)
returns public.businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_business public.businesses;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if nullif(btrim(p_company_name), '') is null then
    raise exception 'Company name is required';
  end if;

  if p_business_type not in ('owner_op','carrier','brokerage','fleet_management','service','other') then
    raise exception 'Invalid business type';
  end if;

  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception '3B profile required before creating a business';
  end if;

  insert into public.businesses (
    company_name, business_type, entity_type, slug, owner_id
  ) values (
    btrim(p_company_name), p_business_type, nullif(btrim(p_entity_type), ''), nullif(btrim(p_slug), ''), v_user
  )
  returning * into v_business;

  insert into public.business_members (business_id, user_id, role)
  values (v_business.id, v_user, 'owner')
  on conflict (business_id, user_id) do update set role = 'owner';

  insert into public.fleet_business_members (business_id, user_id, role, active)
  values (v_business.id, v_user, 'owner', true)
  on conflict (business_id, user_id) do update set role = 'owner', active = true;

  -- Company creator is Admin for this business. Driver and Dispatch remain
  -- explicit grants managed from Admin -> Team.
  insert into public.fleet_member_portal_grants (
    business_id, user_id, portal, permission_level, granted_by
  ) values (
    v_business.id, v_user, 'admin', 'manage', v_user
  )
  on conflict (business_id, user_id, portal)
  do update set permission_level = 'manage', granted_by = excluded.granted_by, updated_at = now();

  update public.profiles
  set default_business_id = coalesce(default_business_id, v_business.id), updated_at = now()
  where id = v_user;

  return v_business;
end;
$$;

revoke all on function public.create_3b_business_for_current_user(text,text,text,text) from public;
grant execute on function public.create_3b_business_for_current_user(text,text,text,text) to authenticated;

notify pgrst, 'reload schema';