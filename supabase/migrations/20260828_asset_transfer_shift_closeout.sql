-- Fleet Commander — asset transfer shift closeout
-- Allows an outgoing driver to close custody and clock out without a normal
-- post-trip when the asset is formally transferred to another authorized
-- person/location. The transfer is an auditable chain-of-custody event.

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

create table if not exists public.fleet_dt_asset_transfer_closeouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  shift_id uuid not null references public.fleet_dt_shifts(id) on delete cascade,
  outgoing_driver_id uuid not null references public.profiles(id),
  truck_id uuid not null references public.fleet_equipment(id),
  trailer_id uuid references public.fleet_equipment(id),
  receiving_user_id uuid references public.profiles(id),
  receiving_three_b_id text,
  receiving_name text,
  transfer_reason text not null,
  transfer_condition text,
  transfer_odometer integer,
  transfer_at timestamptz not null,
  transfer_lat double precision,
  transfer_lng double precision,
  transfer_accuracy_m numeric(8,2),
  custody_end_event_id uuid references public.fleet_dt_events(id),
  clock_out_event_id uuid references public.fleet_dt_events(id),
  clock_out_at timestamptz not null,
  posttrip_waived boolean not null default true,
  posttrip_waiver_reason text not null default 'asset_transfer',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (shift_id)
);

create index if not exists idx_fleet_dt_asset_transfer_business
  on public.fleet_dt_asset_transfer_closeouts(business_id, transfer_at desc);
create index if not exists idx_fleet_dt_asset_transfer_truck
  on public.fleet_dt_asset_transfer_closeouts(truck_id, transfer_at desc);

alter table public.fleet_dt_asset_transfer_closeouts enable row level security;

drop policy if exists "fleet_dt_asset_transfer_select" on public.fleet_dt_asset_transfer_closeouts;
create policy "fleet_dt_asset_transfer_select" on public.fleet_dt_asset_transfer_closeouts
for select using (
  outgoing_driver_id = auth.uid()
  or receiving_user_id = auth.uid()
  or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll'])
);

drop policy if exists "fleet_dt_asset_transfer_insert" on public.fleet_dt_asset_transfer_closeouts;
create policy "fleet_dt_asset_transfer_insert" on public.fleet_dt_asset_transfer_closeouts
for insert with check (
  outgoing_driver_id = auth.uid()
  and public.fleet_dt_is_member(business_id)
);

comment on table public.fleet_dt_asset_transfer_closeouts is
  'Auditable outgoing-driver closeout when custody of an asset is transferred. Post-trip may be waived because responsibility continues under the receiving custodian rather than ending unattended.';

notify pgrst, 'reload schema';
