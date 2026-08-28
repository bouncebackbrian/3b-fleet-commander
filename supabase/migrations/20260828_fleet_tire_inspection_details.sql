-- Tire-specific inspection evidence for pre-trip/post-trip.
-- Drivers record facts (position, axle type, tread depth, visible damage).
-- Application derives green/yellow/red maintenance status from the measurement.

alter table public.fleet_dt_inspection_items
  add column if not exists tire_position text,
  add column if not exists tire_axle_type text check (tire_axle_type is null or tire_axle_type in ('steer','other')),
  add column if not exists tread_depth_32nds numeric(4,1) check (tread_depth_32nds is null or (tread_depth_32nds >= 0 and tread_depth_32nds <= 32)),
  add column if not exists visible_damage boolean,
  add column if not exists tire_status text check (tire_status is null or tire_status in ('green','yellow','red'));

create index if not exists idx_fleet_dt_inspection_items_tire_status
  on public.fleet_dt_inspection_items(tire_status)
  where tire_status is not null;

notify pgrst, 'reload schema';
