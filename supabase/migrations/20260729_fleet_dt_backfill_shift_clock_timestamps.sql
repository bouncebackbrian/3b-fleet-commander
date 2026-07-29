-- ============================================================
-- 3B FLEET COMMANDER — Backfill fleet_dt_shifts.clock_in_at/clock_out_at
-- Migration: 20260729_fleet_dt_backfill_shift_clock_timestamps
--
-- Bug (pre-existing, not introduced this session): recordEvent()'s side
-- effects (src/lib/fleet/dumpTruck/events.ts) never stamped
-- fleet_dt_shifts.clock_in_at/clock_out_at when a clock_in/clock_out event
-- was recorded — only fleet_dt_events got the timestamp. Every hours query
-- (driver "My Hours", CSV export, dispatch payroll) filters shifts by
-- clock_in_at range, so every shift silently vanished from those views
-- despite its full event history being intact. Fixed going forward in
-- events.ts (this same commit); this migration repairs shifts already
-- affected by deriving the missing timestamps from their own event log.
-- ============================================================

update public.fleet_dt_shifts s
set clock_in_at = e.effective_at
from public.fleet_dt_events e
where e.shift_id = s.id
  and e.event_type = 'clock_in'
  and s.clock_in_at is null;

update public.fleet_dt_shifts s
set clock_out_at = e.effective_at
from public.fleet_dt_events e
where e.shift_id = s.id
  and e.event_type = 'clock_out'
  and s.clock_out_at is null;

notify pgrst, 'reload schema';
