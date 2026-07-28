-- ============================================================
-- 3B FLEET COMMANDER — Dump Truck Mode: lock down helper functions
-- Migration: 20260728_fleet_dt_lock_down_helper_functions
--
-- The Supabase security advisor flagged fleet_dt_has_role() / fleet_dt_is_member()
-- (both SECURITY DEFINER, defined in 20260727_fleet_dt_core.sql) as directly
-- callable by the unauthenticated `anon` role via PostgREST RPC
-- (/rest/v1/rpc/fleet_dt_has_role). Practical risk was low — both functions
-- only return a boolean gated on auth.uid(), which is null for anon, so no
-- data was exposed — but there's no reason to leave that surface open.
--
-- These functions are only meant to be called from inside RLS policies
-- (which evaluate as the `authenticated` role), never invoked directly.
-- ============================================================

revoke execute on function public.fleet_dt_has_role(uuid, text[]) from public, anon;
revoke execute on function public.fleet_dt_is_member(uuid) from public, anon;

grant execute on function public.fleet_dt_has_role(uuid, text[]) to authenticated, service_role;
grant execute on function public.fleet_dt_is_member(uuid) to authenticated, service_role;
