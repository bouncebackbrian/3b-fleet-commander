-- 3B Fleet Commander — shift reporting/readiness layer
-- Start report is generated from submitted pre-trip.
-- End report is generated from submitted post-trip and includes linked paperwork metadata.
-- Final reports are admin-owned; drivers/dispatch retain scoped visibility.

alter table public.fleet_dt_inspections
  add column if not exists day_needs jsonb not null default '[]'::jsonb,
  add column if not exists driver_day_note text;

create table if not exists public.fleet_dt_shift_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  shift_id uuid not null references public.fleet_dt_shifts(id) on delete cascade,
  driver_id uuid not null references public.profiles(id),
  truck_id uuid references public.fleet_equipment(id),
  trailer_id uuid references public.fleet_equipment(id),
  mode_id text not null default 'dump-truck',

  start_inspection_id uuid references public.fleet_dt_inspections(id),
  end_inspection_id uuid references public.fleet_dt_inspections(id),

  clock_in_at timestamptz,
  clock_out_at timestamptz,
  pretrip_started_at timestamptz,
  pretrip_completed_at timestamptz,
  posttrip_started_at timestamptz,
  posttrip_completed_at timestamptz,

  start_odometer integer,
  end_odometer integer,
  shift_miles integer generated always as (
    case when start_odometer is not null and end_odometer is not null
      then greatest(end_odometer - start_odometer, 0)
      else null end
  ) stored,

  start_lat double precision,
  start_lng double precision,
  end_lat double precision,
  end_lng double precision,

  readiness_status text not null default 'pending'
    check (readiness_status in ('pending','ready','ready_with_needs','attention','critical','out_of_service')),
  report_status text not null default 'start_pending'
    check (report_status in ('start_pending','start_submitted','end_submitted','final')),
  paperwork_status text not null default 'pending'
    check (paperwork_status in ('pending','complete','incomplete','not_required')),

  start_summary jsonb not null default '{}'::jsonb,
  end_summary jsonb not null default '{}'::jsonb,
  paperwork jsonb not null default '[]'::jsonb,
  kpi_snapshot jsonb not null default '[]'::jsonb,

  dispatch_summary text,
  quick_text_summary text,
  admin_finalized_by uuid references public.profiles(id),
  admin_finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (business_id, shift_id)
);

create index if not exists idx_fleet_dt_shift_reports_business_date
  on public.fleet_dt_shift_reports(business_id, created_at desc);
create index if not exists idx_fleet_dt_shift_reports_driver_date
  on public.fleet_dt_shift_reports(driver_id, created_at desc);
create index if not exists idx_fleet_dt_shift_reports_readiness
  on public.fleet_dt_shift_reports(business_id, readiness_status, created_at desc);

alter table public.fleet_dt_shift_reports enable row level security;

drop policy if exists "fleet_dt_shift_reports_select" on public.fleet_dt_shift_reports;
create policy "fleet_dt_shift_reports_select" on public.fleet_dt_shift_reports
  for select using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop policy if exists "fleet_dt_shift_reports_insert" on public.fleet_dt_shift_reports;
create policy "fleet_dt_shift_reports_insert" on public.fleet_dt_shift_reports
  for insert with check (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop policy if exists "fleet_dt_shift_reports_update" on public.fleet_dt_shift_reports;
create policy "fleet_dt_shift_reports_update" on public.fleet_dt_shift_reports
  for update using (
    (driver_id = auth.uid() and report_status <> 'final')
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop trigger if exists set_fleet_dt_shift_reports_updated_at on public.fleet_dt_shift_reports;
create trigger set_fleet_dt_shift_reports_updated_at
  before update on public.fleet_dt_shift_reports
  for each row execute function public.set_updated_at();

create table if not exists public.fleet_dt_shift_needs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  shift_id uuid not null references public.fleet_dt_shifts(id) on delete cascade,
  report_id uuid references public.fleet_dt_shift_reports(id) on delete cascade,
  driver_id uuid not null references public.profiles(id),
  truck_id uuid references public.fleet_equipment(id),
  category text not null default 'other'
    check (category in ('paperwork','coolant','oil','def','fuel','ppe','permit','equipment','maintenance','other')),
  description text not null,
  status text not null default 'requested'
    check (status in ('requested','acknowledged','supplied','resolved','cancelled')),
  acknowledged_by uuid references public.profiles(id),
  acknowledged_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fleet_dt_shift_needs_dispatch
  on public.fleet_dt_shift_needs(business_id, status, created_at desc);

alter table public.fleet_dt_shift_needs enable row level security;

drop policy if exists "fleet_dt_shift_needs_select" on public.fleet_dt_shift_needs;
create policy "fleet_dt_shift_needs_select" on public.fleet_dt_shift_needs
  for select using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop policy if exists "fleet_dt_shift_needs_insert" on public.fleet_dt_shift_needs;
create policy "fleet_dt_shift_needs_insert" on public.fleet_dt_shift_needs
  for insert with check (driver_id = auth.uid() or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

drop policy if exists "fleet_dt_shift_needs_update" on public.fleet_dt_shift_needs;
create policy "fleet_dt_shift_needs_update" on public.fleet_dt_shift_needs
  for update using (public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

drop trigger if exists set_fleet_dt_shift_needs_updated_at on public.fleet_dt_shift_needs;
create trigger set_fleet_dt_shift_needs_updated_at
  before update on public.fleet_dt_shift_needs
  for each row execute function public.set_updated_at();

create table if not exists public.fleet_kpi_alerts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  mode_id text not null,
  shift_id uuid references public.fleet_dt_shifts(id) on delete cascade,
  driver_id uuid references public.profiles(id),
  truck_id uuid references public.fleet_equipment(id),
  kpi_id text not null,
  kpi_label text not null,
  measured_value numeric,
  target_value numeric,
  severity text not null check (severity in ('green','yellow','red')),
  summary text not null,
  dispatch_acknowledged_by uuid references public.profiles(id),
  dispatch_acknowledged_at timestamptz,
  admin_critical boolean generated always as (severity = 'red') stored,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_fleet_kpi_alerts_business
  on public.fleet_kpi_alerts(business_id, severity, created_at desc);

alter table public.fleet_kpi_alerts enable row level security;

drop policy if exists "fleet_kpi_alerts_select" on public.fleet_kpi_alerts;
create policy "fleet_kpi_alerts_select" on public.fleet_kpi_alerts
  for select using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop policy if exists "fleet_kpi_alerts_write" on public.fleet_kpi_alerts;
create policy "fleet_kpi_alerts_write" on public.fleet_kpi_alerts
  for all using (public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']))
  with check (public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

create table if not exists public.fleet_time_off_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  start_date date not null,
  end_date date not null,
  request_type text not null default 'time_off'
    check (request_type in ('time_off','sick','vacation','personal','other')),
  note text,
  status text not null default 'requested'
    check (status in ('requested','approved','denied','cancelled')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_fleet_time_off_business
  on public.fleet_time_off_requests(business_id, start_date, status);

alter table public.fleet_time_off_requests enable row level security;

drop policy if exists "fleet_time_off_select" on public.fleet_time_off_requests;
create policy "fleet_time_off_select" on public.fleet_time_off_requests
  for select using (
    user_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop policy if exists "fleet_time_off_insert" on public.fleet_time_off_requests;
create policy "fleet_time_off_insert" on public.fleet_time_off_requests
  for insert with check (user_id = auth.uid() and public.fleet_dt_is_member(business_id));

drop policy if exists "fleet_time_off_update" on public.fleet_time_off_requests;
create policy "fleet_time_off_update" on public.fleet_time_off_requests
  for update using (
    user_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop trigger if exists set_fleet_time_off_updated_at on public.fleet_time_off_requests;
create trigger set_fleet_time_off_updated_at
  before update on public.fleet_time_off_requests
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
