-- ============================================================
-- 3B ECOSYSTEM — Shared Identity Schema
-- Run this in: 3B Ecosystem Supabase project > SQL Editor
-- This is the CENTRAL identity store for Fleet Commander,
-- 3Boost (credit repair), payments, and future 3B products.
-- ============================================================

-- ── 3B ID generator ─────────────────────────────────────────
-- Produces: 3B-USR-A1B2C3
create or replace function public.generate_3b_id(prefix text)
returns text language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return prefix || result;
end;
$$;

-- ── Profiles (3B-USR) ────────────────────────────────────────
create table if not exists public.profiles (
  id             uuid references auth.users on delete cascade primary key,
  three_b_id     text unique default public.generate_3b_id('3B-USR-'),
  email          text unique not null,
  full_name      text,
  phone          text,
  avatar_url     text,

  -- Products this identity has access to
  has_fleet      boolean default false,   -- Fleet Commander
  has_credit     boolean default false,   -- 3Boost credit repair
  has_payments   boolean default false,   -- 3B Payments

  -- Driver / CDL details
  cdl_number     text,
  cdl_state      char(2),
  cdl_class      text,
  cdl_expires    date,
  endorsements   text,

  -- Credit repair client link
  credit_file_id text,

  -- Stripe customer
  stripe_customer_id text,

  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ── Businesses (3B-BIZ) ──────────────────────────────────────
create table if not exists public.businesses (
  id               uuid primary key default gen_random_uuid(),
  three_b_biz_id   text unique default public.generate_3b_id('3B-BIZ-'),
  company_name     text not null,
  ein              text,
  mc_number        text,
  dot_number       text,
  address          text,
  city             text,
  state            char(2),
  zip              text,

  -- Owner's 3B ID
  owner_id         uuid references public.profiles(id),

  -- Products
  has_fleet        boolean default false,
  has_payments     boolean default false,

  -- Stripe merchant
  stripe_account_id text,

  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ── Profile → Business membership ────────────────────────────
create table if not exists public.business_members (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid references public.businesses(id) on delete cascade,
  profile_id   uuid references public.profiles(id) on delete cascade,
  role         text default 'driver' check (role in ('owner','admin','dispatcher','driver')),
  joined_at    timestamptz default now(),
  unique(business_id, profile_id)
);

-- ── Auto-create profile on signup ────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── RLS ──────────────────────────────────────────────────────
alter table public.profiles        enable row level security;
alter table public.businesses      enable row level security;
alter table public.business_members enable row level security;

create policy "profiles_self"     on public.profiles        for all using (auth.uid() = id);
create policy "biz_member_read"   on public.businesses      for select
  using (id in (select business_id from public.business_members where profile_id = auth.uid()));
create policy "biz_owner_write"   on public.businesses      for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "members_self"      on public.business_members for select
  using (profile_id = auth.uid());

-- ── Updated_at triggers ───────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger set_profiles_updated_at   before update on public.profiles   for each row execute procedure public.set_updated_at();
create trigger set_businesses_updated_at before update on public.businesses for each row execute procedure public.set_updated_at();

-- ============================================================
-- HOW FLEET COMMANDER CONNECTS
-- 1. Add these env vars to Fleet Commander Vercel project:
--    3B_ECOSYSTEM_SUPABASE_URL  = (this project's URL)
--    3B_ECOSYSTEM_SUPABASE_KEY  = (this project's anon key)
-- 2. At login, look up profiles WHERE email = user.email
--    → pull three_b_id, three_b_biz_id, has_fleet
-- 3. Store in Fleet Commander profiles.three_b_id
-- ============================================================
