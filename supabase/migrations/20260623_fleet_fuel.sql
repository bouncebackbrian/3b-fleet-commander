-- ============================================================
-- 3B FLEET COMMANDER — Fuel Purchases & Fuel Management
-- Migration: 20260623_fleet_fuel
--
-- Dedicated fuel purchase tracking table. FuelEntry type from
-- types/index.ts: gallons, pricePerGal, totalCost, fuelType,
-- loadNumber, receiptSaved, location.
-- ============================================================

-- ── Fuel purchase type ─────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'fuel_purchase_type') then
    create type public.fuel_purchase_type as enum (
      'tractor', 'reefer', 'def', 'gasoline', 'other'
    );
  end if;
end;
$$;

-- ── fleet_fuel_purchases ──────────────────────────────────────
create table if not exists public.fleet_fuel_purchases (
  id                uuid        primary key default gen_random_uuid(),

  -- Business scoping
  business_id       uuid        references public.businesses(id) on delete cascade,
  equipment_id      uuid        references public.fleet_equipment(id) on delete set null,

  -- Fuel details
  fuel_type         public.fuel_purchase_type not null default 'tractor',
  gallons           numeric(8,2) not null check (gallons > 0),
  price_per_gallon  numeric(6,3),                  -- price per gallon (e.g. 3.849)
  total_cost        numeric(10,2) not null,         -- total transaction amount

  -- Location
  station_name      text,                           -- "Pilot #123" or "TA - Dallas"
  location          text,                           -- "Dallas, TX"
  latitude          numeric(10,7),
  longitude         numeric(10,7),

  -- Transaction details
  transaction_date  date        not null default current_date,
  transaction_time  timestamptz not null default now(),
  odometer          integer,                        -- odometer reading at fill-up

  -- Load linkage
  load_number       text,
  load_id           uuid        references public.fleet_loads(id) on delete set null,

  -- Receipt
  receipt_saved     boolean     not null default false,
  receipt_url       text,                           -- Supabase Storage URL
  receipt_storage_path text,                        -- path in Storage bucket

  -- Notes
  notes             text,

  -- Tax / IFTA
  is_ifta_eligible  boolean     not null default true,
  ifta_state        char(2),                        -- state where fuel was purchased (for IFTA)
  tax_rate          numeric(5,4),                   -- applicable fuel tax rate

  -- Identity
  user_id           uuid        references auth.users on delete cascade,
  driver_id         uuid        references public.profiles(id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────
create index if not exists idx_fuel_purchases_date
  on public.fleet_fuel_purchases(transaction_date desc);

create index if not exists idx_fuel_purchases_user
  on public.fleet_fuel_purchases(user_id, transaction_date desc);

create index if not exists idx_fuel_purchases_load
  on public.fleet_fuel_purchases(load_number) where load_number is not null;

create index if not exists idx_fuel_purchases_equipment
  on public.fleet_fuel_purchases(equipment_id, transaction_date desc);

create index if not exists idx_fuel_purchases_ifta
  on public.fleet_fuel_purchases(is_ifta_eligible, ifta_state, transaction_date desc);

-- ── RLS ───────────────────────────────────────────────────────
alter table public.fleet_fuel_purchases enable row level security;

drop policy if exists "fuel_purchases_select" on public.fleet_fuel_purchases;
create policy "fuel_purchases_select" on public.fleet_fuel_purchases
  for select using (
    user_id = auth.uid()
    or business_id in (
      select business_id from public.fleet_business_members where user_id = auth.uid()
    )
  );

drop policy if exists "fuel_purchases_insert" on public.fleet_fuel_purchases;
create policy "fuel_purchases_insert" on public.fleet_fuel_purchases
  for insert with check (user_id = auth.uid());

drop policy if exists "fuel_purchases_update" on public.fleet_fuel_purchases;
create policy "fuel_purchases_update" on public.fleet_fuel_purchases
  for update using (user_id = auth.uid());

-- ── updated_at trigger ────────────────────────────────────────
drop trigger if exists set_fuel_purchases_updated_at on public.fleet_fuel_purchases;
create trigger set_fuel_purchases_updated_at
  before update on public.fleet_fuel_purchases
  for each row execute function public.set_updated_at();


-- ============================================================
-- Fuel Price Reference (station-level pricing)
-- ============================================================
create table if not exists public.fuel_price_reference (
  id                uuid        primary key default gen_random_uuid(),

  station_name      text        not null,
  location          text        not null,
  price_per_gallon  numeric(6,3) not null,
  fuel_type         text        not null default 'diesel',

  reported_at       timestamptz not null default now(),
  reported_by       uuid        references auth.users(id) on delete set null,

  unique (station_name, location, fuel_type, date(reported_at))
);

create index if not exists idx_fuel_prices_location
  on public.fuel_price_reference(location, reported_at desc);

alter table public.fuel_price_reference enable row level security;

drop policy if exists "fuel_prices_select" on public.fuel_price_reference;
create policy "fuel_prices_select" on public.fuel_price_reference
  for select using (true);

drop policy if exists "fuel_prices_insert" on public.fuel_price_reference;
create policy "fuel_prices_insert" on public.fuel_price_reference
  for insert with check (true);

notify pgrst, 'reload schema';