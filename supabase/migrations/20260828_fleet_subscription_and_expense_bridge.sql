-- Fleet Commander subscription ownership + 3B Expense Tracker bridge
-- 2026-08-28
--
-- Commercial model:
--   * Company / owner-operator pays for commercial Fleet Commander.
--   * Company subscription governs Dispatch/Admin, active trucks, and enabled modes.
--   * Driver Free receives company-assigned access.
--   * Driver Pro belongs to the person's 3B ID and persists across employers.
--
-- Expense model:
--   * Keep mode-specific operational ledgers as source-of-truth.
--   * Link qualifying records into one normalized 3B expense bridge.
--   * Explicit payer + owner + source prevents duplicate counting.
--   * Fuel remains sourced from the mode fuel ledger, not duplicated as a second raw expense.

create table if not exists public.fleet_company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  status text not null default 'active'
    check (status in ('trialing','active','past_due','cancelled')),
  active_truck_count integer not null default 1 check (active_truck_count >= 0),
  stripe_customer_id text,
  stripe_subscription_id text,
  started_at timestamptz not null default now(),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id)
);

create table if not exists public.fleet_company_mode_entitlements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  mode text not null,
  active boolean not null default true,
  stripe_subscription_item_id text,
  started_at timestamptz not null default now(),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, mode)
);

create table if not exists public.fleet_driver_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null default 'driver_free'
    check (plan in ('driver_free','driver_pro')),
  status text not null default 'active'
    check (status in ('trialing','active','past_due','cancelled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  started_at timestamptz not null default now(),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- A user can be assigned different roles in different operating modes.
-- Example: Dump Truck dispatcher + Water Truck driver.
create table if not exists public.fleet_user_mode_grants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null,
  driver_access boolean not null default false,
  dispatch_access boolean not null default false,
  admin_access boolean not null default false,
  active boolean not null default true,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (business_id, user_id, mode)
);

-- Normalized pointer into 3B Expense Tracker logic.
-- This table is intentionally a BRIDGE, not a replacement for mode source tables.
create table if not exists public.fleet_expense_links (
  id uuid primary key default gen_random_uuid(),

  -- identity / tenancy
  business_id uuid references public.businesses(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  mode text,

  -- source record identity; prevents duplicate imports
  source_system text not null,
  source_table text not null,
  source_record_id uuid not null,
  source_event_type text,

  -- accounting ownership
  owner_scope text not null
    check (owner_scope in ('driver','company','shared_operational')),
  paid_by_scope text not null
    check (paid_by_scope in ('driver','company','third_party','unknown')),
  reimbursable boolean not null default false,
  reimbursement_status text not null default 'not_applicable'
    check (reimbursement_status in ('not_applicable','pending','approved','paid','rejected')),

  -- normalized financial fields for Expense Tracker consumption
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  occurred_at timestamptz not null,
  vendor text,
  payment_method text,
  document_id uuid,
  notes text,

  -- tax / business-use context
  tax_classification text,
  business_purpose text,
  deductible_candidate boolean not null default false,

  -- optional operational attribution
  truck_id uuid,
  driver_id uuid,
  shift_id uuid,
  job_id uuid,

  -- sync lifecycle
  expense_tracker_status text not null default 'pending'
    check (expense_tracker_status in ('pending','synced','ignored','error')),
  expense_tracker_record_id text,
  synced_at timestamptz,
  sync_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source_system, source_table, source_record_id)
);

create index if not exists fleet_expense_links_business_idx
  on public.fleet_expense_links (business_id, occurred_at desc);
create index if not exists fleet_expense_links_user_idx
  on public.fleet_expense_links (user_id, occurred_at desc);
create index if not exists fleet_expense_links_sync_idx
  on public.fleet_expense_links (expense_tracker_status, created_at);

comment on table public.fleet_expense_links is
  'Normalized bridge from Fleet Commander operational expense/fuel records into 3B Expense Tracker. Source tables remain authoritative; unique source identity prevents duplicate counting.';
