-- ── Phase 4D: 3B ID Profile Schema ──────────────────────────────────────────
-- Run this in Supabase → SQL Editor
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT guards throughout)
-- Existing fleet_missions rows are unaffected (new columns default to NULL)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. public.profiles ───────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                  uuid        primary key references auth.users(id) on delete cascade,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  display_name        text,
  full_name           text,
  email               text,
  role                text        default 'driver',
  -- 3B identity
  three_b_id          text        unique,
  three_b_biz_id      text,
  three_b_linked      boolean     default false,
  -- Driver credentials
  cdl_number          text,
  cdl_state           char(2),
  phone               text,
  tractor_number      text,
  trailer_number      text,
  -- Default business link (FK added after business_profiles is created)
  default_business_id uuid
);

-- ── 2. public.business_profiles ──────────────────────────────────────────────
create table if not exists public.business_profiles (
  id                   uuid        primary key default gen_random_uuid(),
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  owner_user_id        uuid        references auth.users(id) on delete set null,
  business_name        text,
  threeb_business_id   text        unique,
  business_type        text        default 'fleet',
  status               text        default 'active'
);

-- ── 3. FK: profiles.default_business_id → business_profiles ──────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'fk_profiles_default_business'
  ) then
    alter table public.profiles
      add constraint fk_profiles_default_business
      foreign key (default_business_id)
      references public.business_profiles(id)
      on delete set null;
  end if;
end $$;

-- ── 4. Add nullable identity columns to fleet_missions ───────────────────────
-- Safe: existing rows get NULL, no data loss, no required migration of old records
alter table public.fleet_missions
  add column if not exists user_id     uuid references auth.users(id) on delete set null,
  add column if not exists business_id uuid references public.business_profiles(id) on delete set null;

-- Index for fast lookup by user
create index if not exists idx_fleet_missions_user_id on public.fleet_missions(user_id);

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
alter table public.profiles          enable row level security;
alter table public.business_profiles enable row level security;

-- Drop existing policies first (idempotent re-run safety)
drop policy if exists "profiles: own read"   on public.profiles;
drop policy if exists "profiles: own insert" on public.profiles;
drop policy if exists "profiles: own update" on public.profiles;
drop policy if exists "biz: owner read"      on public.business_profiles;
drop policy if exists "biz: owner insert"    on public.business_profiles;
drop policy if exists "biz: owner update"    on public.business_profiles;

-- profiles: each user sees/edits only their own row
create policy "profiles: own read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: own insert"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: own update"
  on public.profiles for update
  using (auth.uid() = id);

-- business_profiles: owner manages their own businesses
create policy "biz: owner read"
  on public.business_profiles for select
  using (auth.uid() = owner_user_id);

create policy "biz: owner insert"
  on public.business_profiles for insert
  with check (auth.uid() = owner_user_id);

create policy "biz: owner update"
  on public.business_profiles for update
  using (auth.uid() = owner_user_id);

-- ── 6. Auto-create profile on first sign-up ──────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role, three_b_linked)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'driver',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 7. Backfill: create profile rows for any existing auth users ─────────────
insert into public.profiles (id, email, display_name, role)
select
  id,
  email,
  coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  'driver'
from auth.users
on conflict (id) do nothing;
