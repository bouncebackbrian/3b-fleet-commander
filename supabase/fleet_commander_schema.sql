-- ============================================================
-- 3B FLEET COMMANDER — Supabase Schema
-- Run this in: Fleet Commander Supabase project > SQL Editor
-- ============================================================

-- ── Profiles (one per auth user) ────────────────────────────
create table if not exists public.profiles (
  id              uuid references auth.users on delete cascade primary key,
  email           text unique,
  full_name       text,
  role            text not null default 'driver'
                    check (role in ('driver','dispatcher','owner-operator','admin')),

  -- 3B Ecosystem identity links (populated when user connects 3B ID)
  three_b_id      text unique,          -- '3B-USR-XXXXXX'  from ecosystem profiles table
  three_b_biz_id  text,                 -- '3B-BIZ-XXXXXX'  from ecosystem businesses table
  three_b_linked  boolean default false,

  -- Driver details (pre-fills Trip Planner / Dispatch)
  tractor_number  text,
  trailer_number  text,
  cdl_number      text,
  cdl_state       char(2),
  phone           text,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Auto-create profile row whenever a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Updated_at auto-stamp
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- RLS: users can only read/write their own profile
alter table public.profiles enable row level security;

drop policy if exists "profiles_self" on public.profiles;
create policy "profiles_self" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Existing data tables (already in use by the app)
-- loads, delays, fuel_entries — add user scoping if needed later
-- For now Fleet Commander is single-user per account; RLS can be added per-team.

-- ── Loads: scope by user when multi-driver is needed ────────
-- alter table public.loads add column if not exists user_id uuid references auth.users;
-- (uncomment when you're ready for per-driver load isolation)

-- ── Expenses: Tax-deductible road expense tracking ───────────
-- Mirrors the localStorage 3b-expenses schema for cloud sync.
-- Run this when you're ready to add Supabase-backed expense sync.
create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users on delete cascade not null,

  -- Core fields
  date          date           not null default current_date,
  category      text           not null,                        -- fuel | parking | meals | lodging | ...
  amount        numeric(10,2)  not null check (amount > 0),
  description   text,
  location      text,
  load_number   text,

  -- IRS deductibility
  deduct_pct    int            not null default 100 check (deduct_pct between 0 and 100),
  deduct_amount numeric(10,2)  generated always as (amount * deduct_pct / 100.0) stored,
  is_deductible boolean        not null default true,

  -- Axle weight ticket (optional — filled from Scale Checker)
  scale_gross   int,           -- lbs
  scale_steer   int,
  scale_drives  int,
  scale_trailer int,
  scale_ok      boolean,       -- true = all axles within legal limits

  created_at    timestamptz    default now()
);

alter table public.expenses enable row level security;

drop policy if exists "expenses_self" on public.expenses;
create policy "expenses_self" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Index for common queries
create index if not exists expenses_user_date on public.expenses(user_id, date desc);
create index if not exists expenses_user_category on public.expenses(user_id, category);

-- ── Scale weight checks (standalone — can be linked to expenses) ─
-- Stores weigh ticket data independent of expense records.
-- Optional: use when driver wants to log weight check without a cost.
create table if not exists public.scale_checks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users on delete cascade not null,
  checked_at    timestamptz    default now(),
  origin        text,
  destination   text,
  load_number   text,

  -- Axle weights (lbs)
  gross         int,
  steer         int,
  drives        int,
  trailer       int,

  -- Per-axle if 5-axle detail mode
  drive1        int,
  drive2        int,
  trail1        int,
  trail2        int,

  -- Analysis result
  all_legal     boolean,
  violations    text[],        -- e.g. ARRAY['drives','gross']
  recommendations jsonb,       -- free-form JSON from the analyzer

  expense_id    uuid references public.expenses(id) on delete set null
);

alter table public.scale_checks enable row level security;

drop policy if exists "scale_checks_self" on public.scale_checks;
create policy "scale_checks_self" on public.scale_checks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists scale_checks_user on public.scale_checks(user_id, checked_at desc);
