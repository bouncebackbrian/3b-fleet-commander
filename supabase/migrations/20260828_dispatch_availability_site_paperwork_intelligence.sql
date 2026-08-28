-- Fleet Commander / 3B Ecosystem
-- Dispatch planning intelligence: driver availability, site memory, product-specific
-- location rules, signed-paperwork exceptions, and business integration costs.

create table if not exists public.fleet_driver_availability_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('time_off','early_out')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  requested_release_at timestamptz,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','denied','cancelled','adjusted')),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  adjusted_release_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_fleet_driver_availability_business_time
  on public.fleet_driver_availability_requests(business_id, starts_at, status);
create index if not exists idx_fleet_driver_availability_driver
  on public.fleet_driver_availability_requests(driver_id, starts_at desc);
alter table public.fleet_driver_availability_requests enable row level security;
create policy "availability_driver_select" on public.fleet_driver_availability_requests
  for select using (driver_id = auth.uid() or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));
create policy "availability_driver_insert" on public.fleet_driver_availability_requests
  for insert with check (driver_id = auth.uid() and public.fleet_dt_is_member(business_id));
create policy "availability_driver_update_self" on public.fleet_driver_availability_requests
  for update using (driver_id = auth.uid() or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

create table if not exists public.fleet_site_memory (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  canonical_name text not null,
  site_type text not null default 'other',
  aliases text[] not null default '{}',
  address text,
  lat double precision,
  lng double precision,
  geofence_radius_m integer,
  preferred_entrance text,
  load_point text,
  dump_point text,
  scale_location text,
  gate_instructions text,
  truck_access_notes text,
  contact_name text,
  contact_phone text,
  operating_hours text,
  average_wait_minutes integer,
  source_driver_id uuid references public.profiles(id),
  source_note text,
  confidence text not null default 'field_input' check (confidence in ('field_input','dispatch_confirmed','admin_confirmed')),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_fleet_site_memory_business on public.fleet_site_memory(business_id, active, canonical_name);
alter table public.fleet_site_memory enable row level security;
create policy "site_memory_member_select" on public.fleet_site_memory
  for select using (public.fleet_dt_is_member(business_id));
create policy "site_memory_member_insert" on public.fleet_site_memory
  for insert with check (public.fleet_dt_is_member(business_id));
create policy "site_memory_dispatch_update" on public.fleet_site_memory
  for update using (public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']) or source_driver_id = auth.uid());

create table if not exists public.fleet_site_product_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  site_id uuid not null references public.fleet_site_memory(id) on delete cascade,
  product_key text not null,
  product_label text,
  preferred_location_label text,
  pickup_or_drop text check (pickup_or_drop in ('pickup','drop','both')),
  lat double precision,
  lng double precision,
  instructions text not null,
  source_driver_id uuid references public.profiles(id),
  status text not null default 'field_input' check (status in ('field_input','confirmed','superseded')),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, product_key, status)
);
create index if not exists idx_fleet_site_product_rules_lookup on public.fleet_site_product_rules(business_id, product_key, status);
alter table public.fleet_site_product_rules enable row level security;
create policy "site_product_member_select" on public.fleet_site_product_rules for select using (public.fleet_dt_is_member(business_id));
create policy "site_product_member_insert" on public.fleet_site_product_rules for insert with check (public.fleet_dt_is_member(business_id));
create policy "site_product_dispatch_update" on public.fleet_site_product_rules
  for update using (public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']) or source_driver_id = auth.uid());

create table if not exists public.fleet_dt_paperwork_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  shift_id uuid references public.fleet_dt_shifts(id) on delete set null,
  job_id uuid references public.fleet_dt_jobs(id) on delete set null,
  load_cycle_id uuid references public.fleet_dt_load_cycles(id) on delete set null,
  driver_id uuid not null references public.profiles(id),
  requirement_type text not null default 'signed_scan',
  source_document_id uuid references public.fleet_dt_documents(id) on delete set null,
  signed_document_id uuid references public.fleet_dt_documents(id) on delete set null,
  driver_note text not null,
  status text not null default 'awaiting_dispatch' check (status in ('awaiting_dispatch','acknowledged','driver_action_required','resolved','admin_escalated')),
  escalated_at timestamptz not null default now(),
  dispatch_acknowledged_by uuid references public.profiles(id),
  dispatch_acknowledged_at timestamptz,
  dispatch_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_fleet_paperwork_dispatch_queue
  on public.fleet_dt_paperwork_exceptions(business_id, status, escalated_at desc);
alter table public.fleet_dt_paperwork_exceptions enable row level security;
create policy "paperwork_exception_select" on public.fleet_dt_paperwork_exceptions
  for select using (driver_id = auth.uid() or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));
create policy "paperwork_exception_driver_insert" on public.fleet_dt_paperwork_exceptions
  for insert with check (driver_id = auth.uid() and public.fleet_dt_is_member(business_id));
create policy "paperwork_exception_dispatch_update" on public.fleet_dt_paperwork_exceptions
  for update using (public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

-- Lading can be manual-only, photo/PDF-backed, or both. Signature state remains
-- separate from the immutable source BOL document.
alter table public.fleet_dt_lading_inputs
  alter column document_id drop not null,
  add column if not exists input_method text not null default 'manual' check (input_method in ('manual','photo','pdf','manual_and_photo')),
  add column if not exists signature_required boolean not null default true,
  add column if not exists signature_status text not null default 'pending' check (signature_status in ('pending','signed','signed_scan_missing','complete','waived')),
  add column if not exists signed_document_id uuid references public.fleet_dt_documents(id) on delete set null,
  add column if not exists driver_signature text,
  add column if not exists driver_signed_at timestamptz;

-- Daily/shift certification is distinct from per-load paperwork signatures.
alter table public.fleet_dt_shifts
  add column if not exists driver_final_signature text,
  add column if not exists driver_final_signed_at timestamptz;

-- Company-paid intelligence/integration costs can be included in profitability.
create table if not exists public.fleet_business_operating_costs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  cost_type text not null,
  provider text,
  amount numeric(12,2) not null,
  cadence text not null default 'monthly' check (cadence in ('per_use','daily','weekly','monthly','annual','one_time')),
  effective_from date not null default current_date,
  effective_to date,
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.fleet_business_operating_costs enable row level security;
create policy "business_cost_admin_select" on public.fleet_business_operating_costs
  for select using (public.fleet_dt_has_role(business_id, array['owner','admin']));
create policy "business_cost_admin_write" on public.fleet_business_operating_costs
  for all using (public.fleet_dt_has_role(business_id, array['owner','admin']))
  with check (public.fleet_dt_has_role(business_id, array['owner','admin']));

notify pgrst, 'reload schema';