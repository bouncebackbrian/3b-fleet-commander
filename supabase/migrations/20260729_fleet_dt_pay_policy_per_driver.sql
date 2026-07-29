-- ============================================================
-- 3B FLEET COMMANDER — Per-driver pay policy (hourly vs per-mile)
-- Migration: 20260729_fleet_dt_pay_policy_per_driver
--
-- Driver-requested: "some pay by mile and some pay by hour" within the same
-- business. fleet_dt_pay_policies was one hourly-rate row per business
-- (business_id unique). This adds an optional driver_id — a row with
-- driver_id null is the business default (unchanged behavior for anyone
-- without an override); a row with driver_id set is that driver's
-- override, which can be pay_type='per_mile' with its own rate.
-- ============================================================

alter table public.fleet_dt_pay_policies drop constraint if exists fleet_dt_pay_policies_business_id_key;

alter table public.fleet_dt_pay_policies
  add column if not exists driver_id     uuid references public.profiles(id) on delete cascade,
  add column if not exists pay_type      text not null default 'hourly' check (pay_type in ('hourly', 'per_mile')),
  add column if not exists rate_per_mile numeric(6,3);

-- One business-default row (driver_id null) per business...
create unique index if not exists idx_fleet_dt_pay_policies_business_default
  on public.fleet_dt_pay_policies(business_id) where driver_id is null;

-- ...and at most one override row per driver per business.
create unique index if not exists idx_fleet_dt_pay_policies_driver_override
  on public.fleet_dt_pay_policies(business_id, driver_id) where driver_id is not null;

notify pgrst, 'reload schema';
