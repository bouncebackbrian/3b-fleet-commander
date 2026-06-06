-- ============================================================
-- 3B ECOSYSTEM — Identity & Business Architecture v2.0
-- Run this in: 3B Ecosystem Supabase project > SQL Editor
-- ============================================================
--
-- Canonical flow:
--   Create 3B ID (Person)
--     ↓ Identity Verification
--   Create 3B Business ID
--     ↓
--   Products (Fleet Commander, Funding Machine, Credit Builder…)
--
-- One person gets one 3B ID:          3B-U-00000001
-- One person can own many businesses: 3B-B-00000001, 3B-B-00000002…
-- Every product connects through this layer — never bypass it.
-- ============================================================


-- ── Sequential ID generators ──────────────────────────────────
-- Sequential (not random) so IDs are human-readable and auditable.
create sequence if not exists public.three_b_user_seq start with 1 increment by 1;
create sequence if not exists public.three_b_biz_seq  start with 1 increment by 1;

create or replace function public.generate_3b_user_id()
returns text language plpgsql as $$
begin
  return '3B-U-' || lpad(nextval('public.three_b_user_seq')::text, 8, '0');
end;
$$;

create or replace function public.generate_3b_biz_id()
returns text language plpgsql as $$
begin
  return '3B-B-' || lpad(nextval('public.three_b_biz_seq')::text, 8, '0');
end;
$$;


-- ── 3B User Profiles (3b_users) ──────────────────────────────
-- One row per person. One person = one 3B ID.
-- Tables: profiles (canonical), three_b_users (view alias for external access)
create table if not exists public.profiles (
  id                   uuid references auth.users on delete cascade primary key,
  three_b_id           text unique not null default public.generate_3b_user_id(),

  -- Personal identity
  first_name           text,
  last_name            text,
  email                text unique not null,
  phone                text,

  -- Address
  address_line1        text,
  address_line2        text,
  city                 text,
  state                char(2),
  zip                  text,

  -- Identity verification
  verification_status  text not null default 'unverified'
    check (verification_status in ('unverified','pending','verified')),
  verified_at          timestamptz,

  -- Avatar & display
  avatar_url           text,

  -- Product entitlements (what this identity can access)
  has_fleet            boolean not null default false,
  has_credit           boolean not null default false,
  has_funding          boolean not null default false,
  has_payments         boolean not null default false,
  has_media            boolean not null default false,
  has_content          boolean not null default false,

  -- CDL / driver credentials (for Fleet Commander)
  cdl_number           text,
  cdl_state            char(2),
  cdl_class            text,
  cdl_expires          date,
  endorsements         text,

  -- Stripe customer
  stripe_customer_id   text,

  -- Active business context (for users with multiple businesses)
  default_business_id  uuid,  -- FK added after businesses table is created

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Alias view for external services that query by ecosystem naming
create or replace view public.three_b_users as
  select * from public.profiles;


-- ── 3B Business Registry ─────────────────────────────────────
-- A user can own multiple businesses. Each gets a unique 3B-B ID.
-- This is the registry every 3B product reads to scope its data.
create table if not exists public.businesses (
  id                   uuid primary key default gen_random_uuid(),
  three_b_biz_id       text unique not null default public.generate_3b_biz_id(),

  -- Business identity
  company_name         text not null,
  slug                 text unique,
  entity_type          text check (entity_type in (
                         'LLC','S-Corp','C-Corp','Sole Prop','Partnership','Non-Profit'
                       )),
  formation_date       date,

  -- Tax & compliance
  ein                  text,
  mc_number            text,  -- motor carrier number (trucking)
  dot_number           text,  -- FMCSA DOT number (trucking)
  state_of_formation   char(2),

  -- Contact
  address              text,
  city                 text,
  state                char(2),
  zip                  text,
  business_phone       text,
  website              text,
  domain_email         text,  -- email on company domain (not gmail)

  -- Ownership — the anchor 3B profile
  owner_id             uuid references public.profiles(id),

  -- Business type (determines which products and roles apply)
  business_type        text not null default 'carrier'
    check (business_type in (
      'owner_op',        -- single-seat: owner drives + dispatches
      'carrier',         -- fleet: owner + drivers + dispatcher(s)
      'brokerage',       -- freight broker
      'fleet_management',-- manages other businesses' fleets
      'service',         -- non-trucking service business
      'other'
    )),

  -- Product activation per business
  has_fleet            boolean not null default false,
  has_funding          boolean not null default false,
  has_credit           boolean not null default false,
  has_payments         boolean not null default false,
  has_media            boolean not null default false,
  has_content          boolean not null default false,

  -- Stripe connect merchant
  stripe_account_id    text,

  -- ── Bankability Factors ──────────────────────────────────────
  -- Tracked separately from raw data so each can be verified
  -- by a human or third-party service before counting toward score.
  has_ein              boolean not null default false,    -- EIN verified on file
  has_business_address boolean not null default false,    -- physical/virtual address
  has_business_phone   boolean not null default false,    -- dedicated business line
  has_website          boolean not null default false,    -- live website
  has_domain_email     boolean not null default false,    -- email@yourdomain.com
  has_bank_account     boolean not null default false,    -- business bank account open
  revenue_status       text    not null default 'none'
    check (revenue_status in ('none','generating','documented')),
  credit_status        text    not null default 'none'
    check (credit_status in ('none','building','established')),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Late FK: profiles.default_business_id → businesses.id
alter table public.profiles
  add constraint if not exists profiles_default_business_id_fk
  foreign key (default_business_id)
  references public.businesses(id)
  on delete set null;


-- ── Bankability Score (0–100) ─────────────────────────────────
-- Row function so the formula can evolve without a schema migration.
-- Call as: select calc_bankability_score(b.*) from businesses b
--
-- Weights (mirror what lenders actually look for):
--   Entity Formed    10  —  real business, not just an idea
--   EIN              10  —  can open accounts + file taxes
--   Business Address 10  —  not a personal address
--   Business Phone   10  —  dedicated line, not a cell
--   Website          10  —  professional web presence
--   Domain Email     10  —  not gmail/yahoo
--   Bank Account     15  —  money goes somewhere real
--   Revenue          15  —  business actually generates income
--   Business Credit  10  —  has a credit profile of its own
create or replace function public.calc_bankability_score(b public.businesses)
returns int language sql stable as $$
  select
    case when b.formation_date  is not null then 10 else 0 end +
    case when b.has_ein                     then 10 else 0 end +
    case when b.has_business_address        then 10 else 0 end +
    case when b.has_business_phone          then 10 else 0 end +
    case when b.has_website                 then 10 else 0 end +
    case when b.has_domain_email            then 10 else 0 end +
    case when b.has_bank_account            then 15 else 0 end +
    case
      when b.revenue_status = 'documented'  then 15
      when b.revenue_status = 'generating'  then 7
      else 0
    end +
    case
      when b.credit_status = 'established'  then 10
      when b.credit_status = 'building'     then 5
      else 0
    end
$$;


-- ── Business Members (Governance Layer) ──────────────────────
-- Controls who has access to each business in the 3B Ecosystem.
-- These are ownership/governance roles, separate from product-
-- specific operational roles (e.g. Fleet Commander's driver/dispatcher).
--
-- Roles:
--   owner    — equity owner, billing anchor, full control
--   partner  — equity partner, similar access to owner
--   manager  — manages operations, no equity stake
--   employee — team member, limited product access
--   advisor  — advisory relationship, read-only visibility
create table if not exists public.business_members (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'employee'
    check (role in ('owner','partner','manager','employee','advisor')),
  invited_by   uuid references public.profiles(id),
  joined_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (business_id, user_id)
);


-- ── Auto-create profile on signup ─────────────────────────────
-- Every new Supabase auth user gets a 3B ID automatically.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, first_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'first_name',
      split_part(coalesce(new.raw_user_meta_data->>'full_name', ''), ' ', 1),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── updated_at triggers ───────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_businesses_updated_at on public.businesses;
create trigger set_businesses_updated_at
  before update on public.businesses
  for each row execute procedure public.set_updated_at();


-- ── Row Level Security ────────────────────────────────────────
alter table public.profiles         enable row level security;
alter table public.businesses       enable row level security;
alter table public.business_members enable row level security;

-- Profiles: each user owns their own row
drop policy if exists "profiles_self" on public.profiles;
create policy "profiles_self" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Businesses: readable by any member, writable only by owner
drop policy if exists "biz_member_read"  on public.businesses;
drop policy if exists "biz_owner_write"  on public.businesses;
create policy "biz_member_read" on public.businesses
  for select using (
    id in (
      select business_id from public.business_members
      where user_id = auth.uid()
    )
  );
create policy "biz_owner_write" on public.businesses
  for all
  using    (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Business members: users see their own memberships; owners manage all
drop policy if exists "members_self"         on public.business_members;
drop policy if exists "members_owner_manage" on public.business_members;
create policy "members_self" on public.business_members
  for select using (user_id = auth.uid());
create policy "members_owner_manage" on public.business_members
  for all using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );


-- ── Indexes ───────────────────────────────────────────────────
create index if not exists idx_profiles_three_b_id        on public.profiles(three_b_id);
create index if not exists idx_profiles_email              on public.profiles(email);
create index if not exists idx_profiles_verification       on public.profiles(verification_status);
create index if not exists idx_businesses_three_b_biz_id  on public.businesses(three_b_biz_id);
create index if not exists idx_businesses_owner_id         on public.businesses(owner_id);
create index if not exists idx_businesses_slug             on public.businesses(slug);
create index if not exists idx_biz_members_user_id         on public.business_members(user_id);
create index if not exists idx_biz_members_business_id     on public.business_members(business_id);


-- ============================================================
-- HOW EACH PRODUCT CONNECTS
--
-- Fleet Commander
--   3B ID → Select Business → fleet_business_members (driver/dispatcher roles)
--   fleet_loads.user_id      = profiles.id
--   fleet_loads.business_id  = businesses.id
--
-- Funding Machine
--   3B ID → Select Business → funding_profiles.business_id
--
-- Credit Builder (Personal)
--   3B ID → personal_credit_profiles.user_id
--
-- Content Command
--   3B ID → Select Business → content_assets.business_id
--
-- Media Group
--   3B ID → Select Business → domains.business_id → websites.domain_id
--
-- Integration pattern (Fleet Commander env vars):
--   3B_ECOSYSTEM_SUPABASE_URL = <ecosystem project URL>
--   3B_ECOSYSTEM_SUPABASE_KEY = <ecosystem anon key>
--   At login: look up profiles WHERE email = auth.user.email
--             pull three_b_id, default_business_id, has_fleet
-- ============================================================
