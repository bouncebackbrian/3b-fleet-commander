-- Missed-punch safeguard + next-shift reconciliation
-- Broker/customer time and driver payable time remain independent.

create table if not exists public.fleet_dt_shift_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  driver_id uuid not null references public.profiles(id),
  shift_id uuid not null references public.fleet_dt_shifts(id) on delete cascade,
  broker_job_id uuid references public.fleet_dt_jobs(id),
  broker_end_at timestamptz not null,
  prompted_at timestamptz not null default now(),
  response_deadline_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','confirmed_working','auto_closed','resolved')),
  provisional_end_at timestamptz,
  review_required boolean not null default false,
  corrected_end_at timestamptz,
  driver_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_id)
);

create index if not exists idx_fleet_dt_shift_reconciliation_driver
  on public.fleet_dt_shift_reconciliations(driver_id, review_required, created_at desc);

alter table public.fleet_dt_shift_reconciliations enable row level security;

drop policy if exists "fleet_dt_shift_reconciliations_select" on public.fleet_dt_shift_reconciliations;
create policy "fleet_dt_shift_reconciliations_select" on public.fleet_dt_shift_reconciliations
  for select using (
    driver_id = auth.uid()
    or fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll'])
  );

drop policy if exists "fleet_dt_shift_reconciliations_write" on public.fleet_dt_shift_reconciliations;
create policy "fleet_dt_shift_reconciliations_write" on public.fleet_dt_shift_reconciliations
  for all using (
    driver_id = auth.uid()
    or fleet_dt_has_role(business_id, array['owner','admin','payroll'])
  )
  with check (
    driver_id = auth.uid()
    or fleet_dt_has_role(business_id, array['owner','admin','payroll'])
  );

drop trigger if exists set_fleet_dt_shift_reconciliations_updated_at on public.fleet_dt_shift_reconciliations;
create trigger set_fleet_dt_shift_reconciliations_updated_at
  before update on public.fleet_dt_shift_reconciliations
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
