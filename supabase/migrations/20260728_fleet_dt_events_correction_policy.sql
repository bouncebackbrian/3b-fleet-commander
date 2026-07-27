-- ============================================================
-- 3B FLEET COMMANDER — Dump Truck Mode: allow correction_requested on closed shifts
-- Migration: 20260728_fleet_dt_events_correction_policy
--
-- Gap found while building the driver hours portal (spec §10): the original
-- fleet_dt_events insert policy (20260727_fleet_dt_core.sql) only lets a
-- driver insert events into a shift that is NOT submitted/payroll_approved/
-- billing_approved/locked. That's correct for the operational primary
-- sequence, but it also silently blocked 'correction_requested' — the one
-- event type whose entire purpose is disputing an already-submitted shift
-- ("Request a correction with an explanation", spec §10). This migration
-- carves out that one event type so it remains fireable by the owning
-- driver regardless of shift state, while every other event type keeps the
-- original open-shift-only restriction.
-- ============================================================

drop policy if exists "fleet_dt_events_insert" on public.fleet_dt_events;
create policy "fleet_dt_events_insert" on public.fleet_dt_events
  for insert with check (
    public.fleet_dt_is_member(business_id)
    and (
      (driver_id = auth.uid() and event_type = 'correction_requested'
        and shift_id in (select id from public.fleet_dt_shifts where driver_id = auth.uid()))
      or (driver_id = auth.uid() and shift_id in (
        select id from public.fleet_dt_shifts
        where driver_id = auth.uid()
          and state not in ('submitted','payroll_approved','billing_approved','locked')
      ))
      or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
    )
  );

notify pgrst, 'reload schema';
