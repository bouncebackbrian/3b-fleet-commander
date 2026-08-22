-- ============================================================
-- fleet_dt_pay_policies.ot_mode — add 'daily_and_weekly'
--
-- A third overtime basis alongside the existing 'daily' (OT past a daily
-- threshold, weekly ignored) and 'weekly' (OT past a weekly threshold,
-- daily ignored): 'daily_and_weekly' applies BOTH — hours beyond
-- daily_ot_threshold_hours on any single day are OT, AND the remaining
-- (already daily-capped) hours are further capped at
-- weekly_ot_threshold_hours for the week, with any excess promoted to OT
-- too. See applyDailyAndWeeklyOvertimeSplit in src/lib/dumpTruck/hours.ts.
-- ============================================================

alter table public.fleet_dt_pay_policies drop constraint if exists fleet_dt_pay_policies_ot_mode_check;
alter table public.fleet_dt_pay_policies add constraint fleet_dt_pay_policies_ot_mode_check
  check (ot_mode = any (array['daily', 'weekly', 'daily_and_weekly']));
