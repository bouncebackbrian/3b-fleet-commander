-- ============================================================
-- 3B FLEET COMMANDER — Dump Truck Mode: ticket-printed date/time on load cycles
-- Migration: 20260729_fleet_dt_load_cycles_ticket_captured_at
--
-- Real scale tickets (Dayton Materials, etc.) print their own date/time,
-- which can differ from when the driver tapped an event button in the app
-- (they may photograph/log the ticket a few minutes later). This column
-- holds that ticket-printed timestamp — filled either from OCR
-- (scan-load-ticket) or typed in by hand when no photo/OCR is available.
-- It is metadata on the ticket, not a correction to the append-only
-- fleet_dt_events log — event timestamps remain the source of truth for
-- the primary sequence.
-- ============================================================

alter table public.fleet_dt_load_cycles
  add column if not exists ticket_captured_at timestamptz;

notify pgrst, 'reload schema';
