-- ============================================================
-- 3B FLEET COMMANDER — Dump Truck Mode: one-tap time/location log event
-- Migration: 20260729_fleet_dt_events_location_logged
--
-- Driver-requested: a plain "log the current time and GPS location" quick
-- action, distinct from Note (which requires typed text) — for marking a
-- moment (a scale queue, a random stop) with zero typing. Adds
-- 'location_logged' to fleet_dt_events' event_type check constraint.
-- Parallel event (like note/photo/delay) — never gates the primary
-- sequence, fireable any time the shift is open.
-- ============================================================

alter table public.fleet_dt_events drop constraint fleet_dt_events_event_type_check;
alter table public.fleet_dt_events add constraint fleet_dt_events_event_type_check
  check (event_type = ANY (ARRAY[
    'clock_in', 'arrive_yard_for_pickup', 'truck_picked_up', 'pretrip_started', 'pretrip_completed',
    'depart_yard', 'arrive_pickup', 'loading_started', 'loading_completed', 'depart_pickup',
    'arrive_dump', 'unloading_started', 'unloading_completed', 'depart_dump', 'arrive_yard',
    'break_started', 'break_ended', 'delay_started', 'delay_ended', 'fuel_stop_started', 'fuel_stop_ended',
    'posttrip_started', 'posttrip_completed', 'truck_dropped_off', 'clock_out', 'shift_submitted',
    'correction_requested', 'event_corrected', 'shift_approved', 'shift_reopened',
    'note', 'photo_captured', 'ticket_captured', 'location_logged'
  ]));

notify pgrst, 'reload schema';
