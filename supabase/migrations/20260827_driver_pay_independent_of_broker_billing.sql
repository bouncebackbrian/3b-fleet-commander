-- ============================================================
-- 3B FLEET COMMANDER — Driver pay is independent of broker billing
-- Migration: 20260827_driver_pay_independent_of_broker_billing
--
-- Routine required operational time (return-to-yard and post-trip) is
-- payable driver time by default even when it is not customer/broker
-- billable. Billing remains separately classified.
-- ============================================================

-- New businesses/settings rows should pay required return/post-trip time.
alter table public.fleet_dt_time_policy_settings
  alter column include_return_to_yard_in_pay set default true,
  alter column include_posttrip_in_pay set default true;

-- Correct existing business settings created under the old default. Keep
-- customer billing flags untouched so broker/customer billing remains
-- independently controlled.
update public.fleet_dt_time_policy_settings
set
  include_return_to_yard_in_pay = true,
  include_posttrip_in_pay = true,
  updated_at = now()
where include_return_to_yard_in_pay = false
   or include_posttrip_in_pay = false;

notify pgrst, 'reload schema';
