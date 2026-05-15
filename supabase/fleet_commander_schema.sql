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
