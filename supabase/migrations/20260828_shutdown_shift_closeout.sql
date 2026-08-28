-- Fleet Commander — shutdown shift closeout
-- A driver may close a shift without post-trip only when the assigned asset is
-- formally in an active shutdown/out-of-service state. The shutdown interval
-- remains distinct from productive/billable time and is retained for payroll review.

alter table public.fleet_dt_events drop constraint if exists fleet_dt_events_event_type_check;
alter table public.fleet_dt_events add constraint fleet_dt_events_event_type_check check (event_type in (
  'clock_in','arrive_yard_for_pickup','truck_picked_up',
  'pretrip_started','pretrip_completed',
  'depart_yard','arrive_pickup','loading_started','loading_completed','depart_pickup',
  'arrive_dump','unloading_started','unloading_completed','depart_dump','arrive_yard',
  'break_started','break_ended','delay_started','delay_ended',
  'fuel_stop_started','fuel_stop_ended',
  'posttrip_started','posttrip_completed','truck_dropped_off','clock_out','shutdown_clock_out','asset_transfer_clock_out',
  'shift_submitted','correction_requested','event_corrected',
  'shift_approved','shift_reopened','note','photo_captured','ticket_captured','location_logged'
));

create table if not exists public.fleet_dt_shutdown_closeouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  shift_id uuid not null references public.fleet_dt_shifts(id) on delete cascade,
  driver_id uuid not null references public.profiles(id),
  truck_id uuid references public.fleet_equipment(id),
  defect_id uuid references public.fleet_dt_defects(id),
  shutdown_started_at timestamptz not null,
  shutdown_started_event_id uuid references public.fleet_dt_events(id),
  clock_out_event_id uuid references public.fleet_dt_events(id),
  clock_out_at timestamptz,
  posttrip_waived boolean not null default true,
  posttrip_waiver_reason text not null default 'asset_shutdown',
  pay_time_category text not null default 'shutdown_breakdown'
    check (pay_time_category in ('shutdown_breakdown')),
  release_note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (shift_id)
);

create index if not exists idx_fleet_dt_shutdown_closeouts_business
  on public.fleet_dt_shutdown_closeouts(business_id, shutdown_started_at desc);

alter table public.fleet_dt_shutdown_closeouts enable row level security;

drop policy if exists "fleet_dt_shutdown_closeouts_select" on public.fleet_dt_shutdown_closeouts;
create policy "fleet_dt_shutdown_closeouts_select" on public.fleet_dt_shutdown_closeouts
for select using (
  driver_id = auth.uid()
  or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll'])
);

drop policy if exists "fleet_dt_shutdown_closeouts_insert" on public.fleet_dt_shutdown_closeouts;
create policy "fleet_dt_shutdown_closeouts_insert" on public.fleet_dt_shutdown_closeouts
for insert with check (driver_id = auth.uid() and public.fleet_dt_is_member(business_id));

comment on table public.fleet_dt_shutdown_closeouts is
  'Auditable exception closeout when an asset is formally shut down during a shift. Post-trip is waived, and shutdown/breakdown time remains separately reportable for payroll review.';

notify pgrst, 'reload schema';
