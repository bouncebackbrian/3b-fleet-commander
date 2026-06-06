-- ============================================================
-- 3B Identity & Business Architecture v2.0
-- Migration: Fleet Commander Supabase project
-- Date: 2026-06-06
-- ============================================================
-- Establishes the canonical 3B identity layer in Fleet Commander's
-- own database. All fleet operational tables (fleet_loads,
-- fleet_missions, etc.) scope their records through this layer.
--
-- Architecture enforced here:
--   3B-U-00000001 (person)
--     ↓
--   3B-B-00000001 (business)
--     ↓
--   Fleet Commander data (loads, missions, drivers…)
--
-- Safe to run multiple times (IF NOT EXISTS guards throughout).
-- ============================================================


-- ── Sequential ID sequences ───────────────────────────────────
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


-- ── Profiles (3B User Identity) ───────────────────────────────
-- One row per person. Auto-created on auth.users insert.
create table if not exists public.profiles (
  id                   uuid references auth.users on delete cascade primary key,
  three_b_id           text unique not null default public.generate_3b_user_id(),

  -- Split name fields for form pre-fill and verification
  first_name           text,
  last_name            text,
  email                text unique not null,
  phone                text,

  -- Address (for identity verification + virtual address services)
  address_line1        text,
  address_line2        text,
  city                 text,
  state                char(2),
  zip                  text,

  -- Verification lifecycle
  verification_status  text not null default 'unverified'
    check (verification_status in ('unverified','pending','verified')),
  verified_at          timestamptz,

  -- Display
  avatar_url           text,

  -- Product entitlements (what this 3B ID can access)
  has_fleet            boolean not null default false,
  has_credit           boolean not null default false,
  has_funding          boolean not null default false,
  has_payments         boolean not null default false,
  has_media            boolean not null default false,
  has_content          boolean not null default false,

  -- CDL / driver credentials (used by Fleet Commander)
  cdl_number           text,
  cdl_state            char(2),
  cdl_class            text,
  cdl_expires          date,
  endorsements         text,
  tractor_number       text,
  trailer_number       text,

  -- Stripe customer (for billing)
  stripe_customer_id   text,

  -- Active business context (nullable; set when user selects a business)
  default_business_id  uuid,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);


-- ── Businesses (3B Business Registry) ────────────────────────
-- A profile can own multiple businesses. Each gets a 3B-B ID.
-- Fleet Commander scopes all operational data through business_id.
create table if not exists public.businesses (
  id                   uuid primary key default gen_random_uuid(),
  three_b_biz_id       text unique not null default public.generate_3b_biz_id(),

  -- Identity
  company_name         text not null,
  slug                 text unique,
  entity_type          text check (entity_type in (
                         'LLC','S-Corp','C-Corp','Sole Prop','Partnership','Non-Profit'
                       )),
  formation_date       date,

  -- Tax & regulatory
  ein                  text,
  mc_number            text,
  dot_number           text,
  state_of_formation   char(2),

  -- Contact
  address              text,
  city                 text,
  state                char(2),
  zip                  text,
  business_phone       text,
  website              text,
  domain_email         text,

  -- Owner (the 3B user who controls this business)
  owner_id             uuid references public.profiles(id),

  -- Business type
  business_type        text not null default 'carrier'
    check (business_type in (
      'owner_op',
      'carrier',
      'brokerage',
      'fleet_management',
      'service',
      'other'
    )),

  -- Which 3B products are active for this business
  has_fleet            boolean not null default false,
  has_funding          boolean not null default false,
  has_credit           boolean not null default false,
  has_payments         boolean not null default false,
  has_media            boolean not null default false,
  has_content          boolean not null default false,

  -- Stripe connect account
  stripe_account_id    text,

  -- ── Bankability Factors (0–100 score) ────────────────────────
  -- Tracked as explicit booleans so each factor can be:
  --   a) set manually during onboarding
  --   b) auto-verified via third-party service
  --   c) used to compute the bankability score
  has_ein              boolean not null default false,
  has_business_address boolean not null default false,
  has_business_phone   boolean not null default false,
  has_website          boolean not null default false,
  has_domain_email     boolean not null default false,
  has_bank_account     boolean not null default false,
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
  foreign key (default_business_id) references public.businesses(id) on delete set null;


-- ── Bankability Score function (0–100) ───────────────────────
-- Called as: select calc_bankability_score(b.*) from businesses b
-- Keeping this as a function (not a stored generated column) means
-- the weights can be tuned without a table rewrite.
create or replace function public.calc_bankability_score(b public.businesses)
returns int language sql stable as $$
  select
    -- Entity Formed: 10 pts
    case when b.formation_date  is not null then 10 else 0 end +
    -- EIN: 10 pts
    case when b.has_ein                     then 10 else 0 end +
    -- Business Address: 10 pts
    case when b.has_business_address        then 10 else 0 end +
    -- Business Phone: 10 pts
    case when b.has_business_phone          then 10 else 0 end +
    -- Website: 10 pts
    case when b.has_website                 then 10 else 0 end +
    -- Domain Email: 10 pts
    case when b.has_domain_email            then 10 else 0 end +
    -- Bank Account: 15 pts
    case when b.has_bank_account            then 15 else 0 end +
    -- Revenue: 15 pts (partial credit for in-progress)
    case
      when b.revenue_status = 'documented'  then 15
      when b.revenue_status = 'generating'  then 7
      else 0
    end +
    -- Business Credit: 10 pts (partial credit for building)
    case
      when b.credit_status = 'established'  then 10
      when b.credit_status = 'building'     then 5
      else 0
    end
$$;


-- ── Business Members (Ecosystem Governance Layer) ─────────────
-- Controls who can access each business across ALL 3B products.
-- Separate from fleet_business_members which has Fleet Commander's
-- operational roles (driver, dispatcher, broker, fleet_manager).
--
-- Roles:
--   owner    — equity owner, billing anchor, full control
--   partner  — equity partner, same access level as owner
--   manager  — manages operations, no equity
--   employee — standard team member access
--   advisor  — read-only advisory visibility
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


-- ── Fleet Commander: operational membership table ─────────────
-- Separate from business_members. These are fleet-specific roles
-- that govern what a user sees inside Fleet Commander.
-- A user can be a 'partner' in business_members AND a 'dispatcher'
-- in fleet_business_members at the same time.
create table if not exists public.fleet_business_members (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'driver'
    check (role in ('owner','driver','dispatcher','admin','broker','fleet_manager')),
  active       boolean not null default true,
  joined_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (business_id, user_id)
);

-- Cross-business relationships (broker ↔ carrier, fleet manager ↔ owner-op)
create table if not exists public.fleet_business_relationships (
  id                  uuid primary key default gen_random_uuid(),
  primary_business_id uuid not null references public.businesses(id) on delete cascade,
  related_business_id uuid not null references public.businesses(id) on delete cascade,
  relationship_type   text not null
    check (relationship_type in ('broker_carrier','fleet_manager_carrier','owner_op_network')),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (primary_business_id, related_business_id, relationship_type)
);


-- ── Team invites ──────────────────────────────────────────────
create table if not exists public.fleet_team_invites (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  invited_by    uuid not null references public.profiles(id),
  email         text not null,
  role          text not null default 'driver'
    check (role in ('owner','driver','dispatcher','admin','broker','fleet_manager')),
  token         text unique not null default gen_random_uuid()::text,
  status        text not null default 'pending'
    check (status in ('pending','accepted','expired','revoked')),
  expires_at    timestamptz not null default (now() + interval '7 days'),
  accepted_at   timestamptz,
  accepted_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);


-- ── Auto-create profile on signup ─────────────────────────────
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
  before update on public.profiles for each row execute procedure public.set_updated_at();

drop trigger if exists set_businesses_updated_at on public.businesses;
create trigger set_businesses_updated_at
  before update on public.businesses for each row execute procedure public.set_updated_at();


-- ── Row Level Security ────────────────────────────────────────
alter table public.profiles               enable row level security;
alter table public.businesses             enable row level security;
alter table public.business_members       enable row level security;
alter table public.fleet_business_members enable row level security;
alter table public.fleet_team_invites     enable row level security;
alter table public.fleet_business_relationships enable row level security;

-- Profiles
drop policy if exists "profiles_self" on public.profiles;
create policy "profiles_self" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Businesses: members can read; owner can write
drop policy if exists "biz_member_read" on public.businesses;
drop policy if exists "biz_owner_write" on public.businesses;
create policy "biz_member_read" on public.businesses
  for select using (
    id in (select business_id from public.business_members where user_id = auth.uid())
    or
    id in (select business_id from public.fleet_business_members where user_id = auth.uid())
  );
create policy "biz_owner_write" on public.businesses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Business members (ecosystem)
drop policy if exists "biz_members_self" on public.business_members;
drop policy if exists "biz_members_owner_manage" on public.business_members;
create policy "biz_members_self" on public.business_members
  for select using (user_id = auth.uid());
create policy "biz_members_owner_manage" on public.business_members
  for all using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

-- Fleet business members
drop policy if exists "fleet_members_self" on public.fleet_business_members;
drop policy if exists "fleet_members_owner_manage" on public.fleet_business_members;
create policy "fleet_members_self" on public.fleet_business_members
  for select using (user_id = auth.uid());
create policy "fleet_members_owner_manage" on public.fleet_business_members
  for all using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

-- Team invites: owner/admin can read/write; target email can read
drop policy if exists "invites_owner" on public.fleet_team_invites;
create policy "invites_owner" on public.fleet_team_invites
  for all using (
    business_id in (select id from public.businesses where owner_id = auth.uid())
  );

-- Business relationships
drop policy if exists "biz_rel_member_read" on public.fleet_business_relationships;
create policy "biz_rel_member_read" on public.fleet_business_relationships
  for select using (
    primary_business_id in (select business_id from public.fleet_business_members where user_id = auth.uid())
    or
    related_business_id in (select business_id from public.fleet_business_members where user_id = auth.uid())
  );


-- ── Indexes ───────────────────────────────────────────────────
create index if not exists idx_profiles_three_b_id         on public.profiles(three_b_id);
create index if not exists idx_profiles_email               on public.profiles(email);
create index if not exists idx_profiles_verification        on public.profiles(verification_status);
create index if not exists idx_businesses_three_b_biz_id   on public.businesses(three_b_biz_id);
create index if not exists idx_businesses_owner_id          on public.businesses(owner_id);
create index if not exists idx_businesses_slug              on public.businesses(slug);
create index if not exists idx_biz_members_user_id          on public.business_members(user_id);
create index if not exists idx_biz_members_business_id      on public.business_members(business_id);
create index if not exists idx_fleet_members_user_id        on public.fleet_business_members(user_id);
create index if not exists idx_fleet_members_business_id    on public.fleet_business_members(business_id);
create index if not exists idx_fleet_members_active         on public.fleet_business_members(user_id, active);
create index if not exists idx_invites_token                on public.fleet_team_invites(token);
create index if not exists idx_invites_email                on public.fleet_team_invites(email);
create index if not exists idx_biz_rel_primary              on public.fleet_business_relationships(primary_business_id);
create index if not exists idx_biz_rel_related              on public.fleet_business_relationships(related_business_id);
