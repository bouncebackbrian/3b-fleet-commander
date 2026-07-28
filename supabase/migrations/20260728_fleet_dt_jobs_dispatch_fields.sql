-- ============================================================
-- 3B FLEET COMMANDER — Dump Truck Mode: dispatch-ticket fields on fleet_dt_jobs
-- Migration: 20260728_fleet_dt_jobs_dispatch_fields
--
-- The user confirmed the paper "Reno Rock Transport" dispatch ticket is the
-- real dispatch form used today (load time, order/delivery date, cosignee,
-- ordered-by, phone, truck type, directions, travel time, fuel surcharge,
-- price per hour/ton, material cost). fleet_dt_jobs previously only covered
-- job#/PO#/customer/broker/driver/truck/trailer/sites/material/quantity —
-- adding the remaining ticket fields so the admin Jobs form can replace the
-- paper ticket rather than just supplement it. All columns are nullable —
-- existing jobs and the driver-side read path are unaffected.
-- ============================================================

alter table public.fleet_dt_jobs
  add column if not exists load_time            time,
  add column if not exists order_date           date,
  add column if not exists delivery_date        date,
  add column if not exists cosignee_name        text,
  add column if not exists ordered_by           text,
  add column if not exists contact_phone        text,
  add column if not exists truck_type           text,
  add column if not exists directions           text,
  add column if not exists travel_time_minutes  integer,
  add column if not exists fuel_surcharge       numeric(10,2),
  add column if not exists price_per_hour       numeric(10,2),
  add column if not exists price_per_ton        numeric(10,2),
  add column if not exists material_cost        numeric(10,2);

notify pgrst, 'reload schema';
