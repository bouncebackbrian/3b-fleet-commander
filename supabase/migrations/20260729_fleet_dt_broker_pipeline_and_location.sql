-- ============================================================
-- 3B FLEET COMMANDER — Broker deal pipeline + live truck location
-- Migration: 20260729_fleet_dt_broker_pipeline_and_location
--
-- Driver-requested: "Broker portal needs to have connection to dispatch.
-- Once accepted dispatch portal completes as much as possible without
-- human interaction... broker to dispatch to driver should be easy" +
-- "dispatch should be able to locate in portal truck location."
--
-- Part A — fleet_dt_jobs: a broker-portal user can now originate a deal
-- (status 'proposed', no driver/truck yet) instead of only editing rate
-- fields on a job dispatch already created. Dispatch picks driver/truck
-- and accepts in one action (status -> 'scheduled'), stamped the same way
-- fleet_team_invites already stamps accepted_by/accepted_at.
--
-- Part B — fleet_equipment: a "latest known position" cache (not a history
-- log — out of scope for this pass), mirroring the existing
-- current_odometer/last_odometer_update cache pair added in
-- 20260729_fleet_equipment_compliance.sql.
-- ============================================================

-- ── Part A: broker deal -> dispatch accept ──────────────────────────────────

alter table public.fleet_dt_jobs drop constraint if exists fleet_dt_jobs_status_check;
alter table public.fleet_dt_jobs add constraint fleet_dt_jobs_status_check
  check (status in ('proposed', 'draft', 'scheduled', 'active', 'completed', 'cancelled'));

alter table public.fleet_dt_jobs
  add column if not exists source text not null default 'dispatch'
    check (source in ('dispatch', 'broker')),
  add column if not exists dispatch_accepted_by uuid references public.profiles(id),
  add column if not exists dispatch_accepted_at timestamptz;

-- ── Part B: truck location cache ────────────────────────────────────────────

alter table public.fleet_equipment
  add column if not exists current_lat        double precision,
  add column if not exists current_lng        double precision,
  add column if not exists location_updated_at timestamptz;

notify pgrst, 'reload schema';
