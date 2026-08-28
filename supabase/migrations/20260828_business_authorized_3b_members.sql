-- 3B Ecosystem: authorize existing 3B IDs on a 3B Business ID.
-- Governance membership is separate from Fleet Commander operational permission.

create or replace function public.add_authorized_3b_member(
  p_business_id uuid,
  p_three_b_id text,
  p_governance_role text default 'employee',
  p_fleet_role text default null
)
returns table (
  user_id uuid,
  three_b_id text,
  governance_role text,
  fleet_role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select b.owner_id into v_owner_id
  from public.businesses b
  where b.id = p_business_id;

  -- During claimed-business setup only the primary owner can attach other IDs.
  -- Partners/managers can be granted broader management later through explicit permissions.
  if v_owner_id is distinct from auth.uid() then
    raise exception 'Only the business owner can authorize 3B IDs during setup';
  end if;

  if p_governance_role not in ('partner','manager','employee','advisor') then
    raise exception 'Invalid governance role';
  end if;

  if p_fleet_role is not null and p_fleet_role not in ('driver','dispatcher','admin','broker','fleet_manager') then
    raise exception 'Invalid Fleet Commander role';
  end if;

  select p.id into v_user_id
  from public.profiles p
  where upper(p.three_b_id) = upper(btrim(p_three_b_id));

  if v_user_id is null then
    raise exception '3B ID not found';
  end if;

  if v_user_id = auth.uid() then
    raise exception 'Primary owner is already attached to this business';
  end if;

  insert into public.business_members (business_id, user_id, role, invited_by)
  values (p_business_id, v_user_id, p_governance_role, auth.uid())
  on conflict (business_id, user_id)
  do update set role = excluded.role, invited_by = auth.uid();

  if p_fleet_role is not null then
    insert into public.fleet_business_members (business_id, user_id, role, active)
    values (p_business_id, v_user_id, p_fleet_role, true)
    on conflict (business_id, user_id)
    do update set role = excluded.role, active = true;
  end if;

  return query
  select v_user_id, p_three_b_id, p_governance_role, p_fleet_role;
end;
$$;

revoke all on function public.add_authorized_3b_member(uuid,text,text,text) from public;
grant execute on function public.add_authorized_3b_member(uuid,text,text,text) to authenticated;

-- Safe lookup for setup. It reveals only enough identity to confirm that the
-- user typed the intended 3B ID; it does not expose private profile fields.
create or replace function public.preview_3b_member(p_three_b_id text)
returns table (
  user_id uuid,
  three_b_id text,
  display_name text
)
language sql
security definer
set search_path = public
as $$
  select p.id,
         p.three_b_id,
         nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') as display_name
  from public.profiles p
  where auth.uid() is not null
    and upper(p.three_b_id) = upper(btrim(p_three_b_id))
  limit 1;
$$;

revoke all on function public.preview_3b_member(text) from public;
grant execute on function public.preview_3b_member(text) to authenticated;

notify pgrst, 'reload schema';
