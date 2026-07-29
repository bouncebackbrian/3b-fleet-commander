-- ============================================================
-- 3B FLEET COMMANDER — Dump Truck Mode: manual yard-travel-time entry
-- Migration: 20260729_fleet_dt_shifts_manual_yard_travel
--
-- Driver-requested: a manual way to add drive time between the yard and
-- the first/last stop of the day to total hours, for whenever the real
-- GPS-tapped Depart Yard / Arrived Yard sequence isn't used end-to-end
-- (e.g. signing out from the last dump site rather than waiting to
-- physically arrive back at the yard). Real Google/Apple Maps-estimated
-- travel time was the original ask but needs a Maps Platform API key
-- that doesn't exist yet — this is the manual-entry version requested
-- as an interim step. Deliberately separate columns from clock_in_at/
-- clock_out_at (never edits those) so the real clocked time and this
-- manual top-up stay independently auditable.
-- ============================================================

alter table public.fleet_dt_shifts
  add column if not exists manual_start_travel_minutes numeric,
  add column if not exists manual_end_travel_minutes   numeric;

notify pgrst, 'reload schema';
