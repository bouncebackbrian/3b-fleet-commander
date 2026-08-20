-- ============================================================
-- fleet_dt_hours_confirmations — driver sign-off on a day's hours
--
-- Per-shift, insert-only audit trail (same "never mutate, always append"
-- pattern as fleet_dt_shift_hour_overrides / fleet_dt_time_adjustments).
-- Two outcomes per attempt:
--   'confirmed'             — driver signed (SignaturePad), optionally with
--                              a photo of a signed paper sheet, attesting the
--                              day's hours are correct. Signature required.
--   'correction_requested'  — driver disputes the hours; a note is required.
--                              This is a *status* record distinct from (but
--                              raised alongside) the existing generic
--                              correction_requested event on fleet_dt_events
--                              — that event is the audit-log entry dispatch/
--                              payroll already watch; this table is what
--                              /driver/hours displays as "confirmed / needs
--                              your sign-off / correction pending" per shift.
-- The latest row per shift_id (by created_at) is the current status — a
-- driver can resubmit (sign off again) once a correction has been addressed.
-- ============================================================

create table if not exists public.fleet_dt_hours_confirmations (
  id                          uuid        primary key default gen_random_uuid(),
  business_id                 uuid        not null references public.businesses(id) on delete cascade,
  business_threeb_id          text,

  driver_id                   uuid        not null references public.profiles(id),
  driver_threeb_id            text,
  shift_id                    uuid        not null references public.fleet_dt_shifts(id),
  work_date                   date        not null,

  status                      text        not null check (status in ('confirmed', 'correction_requested')),

  signature_doc_id            uuid        references public.fleet_dt_documents(id),
  sheet_photo_doc_id          uuid        references public.fleet_dt_documents(id),
  correction_note             text,

  total_hours_at_confirmation numeric(10,2),

  created_by                  uuid        not null references public.profiles(id),
  created_by_email            text,
  created_at                  timestamptz not null default now(),

  check (status <> 'confirmed' or signature_doc_id is not null),
  check (status <> 'correction_requested' or length(trim(coalesce(correction_note, ''))) > 0)
);

create index if not exists idx_fleet_dt_hours_confirmations_shift on public.fleet_dt_hours_confirmations(shift_id, created_at desc);
create index if not exists idx_fleet_dt_hours_confirmations_driver on public.fleet_dt_hours_confirmations(driver_id, work_date desc);
create index if not exists idx_fleet_dt_hours_confirmations_business on public.fleet_dt_hours_confirmations(business_id, work_date desc);

alter table public.fleet_dt_hours_confirmations enable row level security;

drop policy if exists "fleet_dt_hours_confirmations_select" on public.fleet_dt_hours_confirmations;
create policy "fleet_dt_hours_confirmations_select" on public.fleet_dt_hours_confirmations
  for select using (fleet_dt_is_member(business_id));

-- Insert-only, immutable audit trail — a driver signs off on their own
-- hours; no update/delete policy exists (default-deny), matching the
-- supersede-not-mutate convention used elsewhere in Dump Truck Mode.
drop policy if exists "fleet_dt_hours_confirmations_insert" on public.fleet_dt_hours_confirmations;
create policy "fleet_dt_hours_confirmations_insert" on public.fleet_dt_hours_confirmations
  for insert with check (driver_id = auth.uid() and fleet_dt_is_member(business_id));
