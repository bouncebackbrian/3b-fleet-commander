-- ============================================================
-- fleet_dt_weekly_timesheets — weekly recap, two-party sign-off
--
-- Same insert-only, "latest row wins" audit trail as
-- fleet_dt_hours_confirmations, but for a Monday–Sunday week instead of a
-- single shift, and with TWO signers instead of one:
--   1. role='driver'   action='confirmed'             — driver reviewed the
--      week's daily hours + any flagged escalations and signs that the
--      recap is correct. Signature required.
--   2. role='driver'   action='correction_requested'  — driver disputes the
--      week; a note is required. Dispatch cannot approve until the driver's
--      latest row for the week is 'confirmed' again (enforced in the
--      service layer, not the DB, same as the daily confirmation flow).
--   3. role='dispatch' action='approved'               — dispatch signs off
--      on the driver-confirmed recap. Signature required.
--   4. role='dispatch' action='sent_back'               — dispatch sends the
--      week back to the driver instead of approving; a note is required.
--
-- escalations_snapshot captures what was flagged at the moment of THIS
-- action (integrity warnings, open hours corrections, truck-problem
-- reports touching the week) so a later reviewer sees what the signer
-- actually saw, even if the underlying data changes afterward.
-- ============================================================

create table if not exists public.fleet_dt_weekly_timesheets (
  id                          uuid        primary key default gen_random_uuid(),
  business_id                 uuid        not null references public.businesses(id) on delete cascade,
  business_threeb_id          text,

  driver_id                   uuid        not null references public.profiles(id),
  driver_threeb_id            text,
  week_start                  date        not null,
  week_end                    date        not null,

  role                        text        not null check (role in ('driver', 'dispatch')),
  action                      text        not null check (action in ('confirmed', 'correction_requested', 'approved', 'sent_back')),

  signature_doc_id            uuid        references public.fleet_dt_documents(id),
  note                        text,

  total_hours_at_action       numeric(10,2),
  regular_hours_at_action     numeric(10,2),
  overtime_hours_at_action    numeric(10,2),
  escalations_snapshot        jsonb       not null default '[]'::jsonb,
  shift_ids                   uuid[]      not null default '{}',

  created_by                  uuid        not null references public.profiles(id),
  created_by_email            text,
  created_at                  timestamptz not null default now(),

  check (
    (role = 'driver' and action in ('confirmed', 'correction_requested')) or
    (role = 'dispatch' and action in ('approved', 'sent_back'))
  ),
  check (action not in ('confirmed', 'approved') or signature_doc_id is not null),
  check (action not in ('correction_requested', 'sent_back') or length(trim(coalesce(note, ''))) > 0)
);

create index if not exists idx_fleet_dt_weekly_timesheets_driver_week on public.fleet_dt_weekly_timesheets(driver_id, week_start desc, created_at desc);
create index if not exists idx_fleet_dt_weekly_timesheets_business_week on public.fleet_dt_weekly_timesheets(business_id, week_start desc);

alter table public.fleet_dt_weekly_timesheets enable row level security;

drop policy if exists "fleet_dt_weekly_timesheets_select" on public.fleet_dt_weekly_timesheets;
create policy "fleet_dt_weekly_timesheets_select" on public.fleet_dt_weekly_timesheets
  for select using (fleet_dt_is_member(business_id));

-- Insert-only, immutable audit trail. Two disjoint insert grants: a driver
-- may only ever write role='driver' rows for their own week; dispatch-level
-- roles may only ever write role='dispatch' rows. Neither can write the
-- other's row, mirroring the "never mutate, always append, each party owns
-- their own signature" convention used by fleet_dt_hours_confirmations.
drop policy if exists "fleet_dt_weekly_timesheets_insert_driver" on public.fleet_dt_weekly_timesheets;
create policy "fleet_dt_weekly_timesheets_insert_driver" on public.fleet_dt_weekly_timesheets
  for insert with check (
    role = 'driver' and driver_id = auth.uid() and fleet_dt_is_member(business_id)
  );

drop policy if exists "fleet_dt_weekly_timesheets_insert_dispatch" on public.fleet_dt_weekly_timesheets;
create policy "fleet_dt_weekly_timesheets_insert_dispatch" on public.fleet_dt_weekly_timesheets
  for insert with check (
    role = 'dispatch' and
    fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll','billing'])
  );
