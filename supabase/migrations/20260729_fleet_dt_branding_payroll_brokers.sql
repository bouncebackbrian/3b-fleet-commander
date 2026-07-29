-- ============================================================
-- 3B FLEET COMMANDER — Business branding, payroll payments, broker directory
-- Migration: 20260729_fleet_dt_branding_payroll_brokers
--
-- Three asks bundled: (1) business logo storage for branded report PDFs,
-- (2) per-driver-per-pay-period check#/amount-paid tracking, (3) a real
-- broker directory replacing the free-text fleet_dt_jobs.broker_name field.
-- ============================================================

-- ── Part A: business logo ────────────────────────────────────────────────────

alter table public.businesses
  add column if not exists logo_storage_path text;

-- ── Part C: pay-period payments ──────────────────────────────────────────────

create table if not exists public.fleet_dt_payroll_payments (
  id             uuid        primary key default gen_random_uuid(),
  business_id    uuid        not null references public.businesses(id) on delete cascade,
  driver_id      uuid        not null references public.profiles(id),

  period_start   date        not null,
  period_end     date        not null,
  check_number   text,
  amount_paid    numeric(10,2),
  paid_at        date,
  paid_by        uuid        references public.profiles(id),
  notes          text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (business_id, driver_id, period_start, period_end)
);

create index if not exists idx_fleet_dt_payroll_payments_business_period
  on public.fleet_dt_payroll_payments(business_id, period_start, period_end);

alter table public.fleet_dt_payroll_payments enable row level security;

drop policy if exists "fleet_dt_payroll_payments_select" on public.fleet_dt_payroll_payments;
create policy "fleet_dt_payroll_payments_select" on public.fleet_dt_payroll_payments
  for select using (fleet_dt_is_member(business_id));

drop policy if exists "fleet_dt_payroll_payments_write" on public.fleet_dt_payroll_payments;
create policy "fleet_dt_payroll_payments_write" on public.fleet_dt_payroll_payments
  for all using (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']))
  with check (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager']));

-- ── Part D: broker directory ──────────────────────────────────────────────────

create table if not exists public.fleet_brokers (
  id             uuid        primary key default gen_random_uuid(),
  business_id    uuid        not null references public.businesses(id) on delete cascade,

  name           text        not null,
  contact_name   text,
  phone          text,
  email          text,
  notes          text,
  active         boolean     not null default true,

  created_by     uuid        references public.profiles(id),
  created_at     timestamptz not null default now(),

  unique (business_id, name)
);

alter table public.fleet_brokers enable row level security;

drop policy if exists "fleet_brokers_select" on public.fleet_brokers;
create policy "fleet_brokers_select" on public.fleet_brokers
  for select using (fleet_dt_is_member(business_id));

drop policy if exists "fleet_brokers_write" on public.fleet_brokers;
create policy "fleet_brokers_write" on public.fleet_brokers
  for all using (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','broker']))
  with check (fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','broker']));

alter table public.fleet_dt_jobs
  add column if not exists broker_id uuid references public.fleet_brokers(id);

-- Backfill: one fleet_brokers row per distinct existing broker_name per business,
-- then link matching jobs to it. broker_name itself is left untouched (legacy
-- display fallback for jobs never linked to a directory entry).
insert into public.fleet_brokers (business_id, name)
select distinct j.business_id, j.broker_name
from public.fleet_dt_jobs j
where j.broker_name is not null
  and trim(j.broker_name) <> ''
  and not exists (
    select 1 from public.fleet_brokers b
    where b.business_id = j.business_id and b.name = j.broker_name
  );

update public.fleet_dt_jobs j
set broker_id = b.id
from public.fleet_brokers b
where b.business_id = j.business_id
  and b.name = j.broker_name
  and j.broker_id is null;

notify pgrst, 'reload schema';
