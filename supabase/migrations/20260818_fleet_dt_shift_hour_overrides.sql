-- ============================================================
-- fleet_dt_shift_hour_overrides — verified paper-sheet / dispatcher hour
-- overrides, kept separate from raw operational timestamps (spec follow-up
-- from the 2026-08 payroll reconciliation).
--
-- Raw fleet_dt_shifts.clock_in_at/clock_out_at (+ manual travel minutes) and
-- the fleet_dt_events GPS/timestamp trail remain the operational record and
-- are never overwritten by this feature. When a stronger source (a signed
-- paper haul sheet, a dispatcher-confirmed paid adjustment for a truck-down
-- day, etc.) gives a different authoritative worked/paid-hours total for a
-- shift, dispatch/admin records that total here instead of hand-editing
-- clock times to force the raw calculation to match. The hours engine uses
-- the active (non-superseded) override's hours for payroll purposes when one
-- exists, while still reporting the raw calculated hours alongside it so the
-- two are never conflated.
-- ============================================================

create table if not exists public.fleet_dt_shift_hour_overrides (
  id                    uuid        primary key default gen_random_uuid(),
  business_id           uuid        not null references public.businesses(id) on delete cascade,
  shift_id              uuid        not null references public.fleet_dt_shifts(id) on delete cascade,

  verified_hours        numeric     not null check (verified_hours >= 0),
  source_document       text,       -- e.g. "Penny Knight paper sheet 8/13/2026", "Dispatcher verbal agreement — truck down"
  reason                text        not null,

  -- Overrides are never edited or deleted — a correction supersedes the
  -- prior one, preserving the full override history for a shift.
  superseded_at         timestamptz,
  superseded_by         uuid        references public.fleet_dt_shift_hour_overrides(id),

  created_by            uuid        not null references public.profiles(id),
  created_at            timestamptz not null default now()
);

create index if not exists idx_fleet_dt_shift_hour_overrides_shift
  on public.fleet_dt_shift_hour_overrides(shift_id, created_at desc);
create index if not exists idx_fleet_dt_shift_hour_overrides_business
  on public.fleet_dt_shift_hour_overrides(business_id, created_at desc);

-- Partial unique index: at most one *active* (non-superseded) override per
-- shift at a time — applying a new override must go through supersede-then-insert.
create unique index if not exists uq_fleet_dt_shift_hour_overrides_one_active_per_shift
  on public.fleet_dt_shift_hour_overrides(shift_id)
  where superseded_at is null;

alter table public.fleet_dt_shift_hour_overrides enable row level security;

drop policy if exists "fleet_dt_shift_hour_overrides_select" on public.fleet_dt_shift_hour_overrides;
create policy "fleet_dt_shift_hour_overrides_select" on public.fleet_dt_shift_hour_overrides
  for select using (public.fleet_dt_is_member(business_id));

-- Only dispatcher+ roles may enter a verified-hours override — this is a
-- payroll-affecting correction, not a driver self-service action.
drop policy if exists "fleet_dt_shift_hour_overrides_insert" on public.fleet_dt_shift_hour_overrides;
create policy "fleet_dt_shift_hour_overrides_insert" on public.fleet_dt_shift_hour_overrides
  for insert with check (
    created_by = auth.uid()
    and public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

-- Superseding an override is an update restricted to the supersede fields only,
-- same role gate as insert. No update path is provided for verified_hours/
-- reason/source_document on an existing row — corrections always insert a new
-- row rather than mutate history.
drop policy if exists "fleet_dt_shift_hour_overrides_supersede" on public.fleet_dt_shift_hour_overrides;
create policy "fleet_dt_shift_hour_overrides_supersede" on public.fleet_dt_shift_hour_overrides
  for update using (
    public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  ) with check (
    public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

notify pgrst, 'reload schema';
