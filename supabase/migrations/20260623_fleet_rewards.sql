-- ============================================================
-- 3B FLEET COMMANDER — Rewards & Gamification
-- Migration: 20260623_fleet_rewards
--
-- Driver rewards program: points, achievements, badges,
-- milestones, and rewards catalog.
-- ============================================================

-- ── Reward event types ─────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'reward_event_type') then
    create type public.reward_event_type as enum (
      'safe_driving',          -- No accidents in period
      'fuel_efficiency',       -- Above-average MPG
      'on_time_delivery',      -- Perfect on-time streak
      'hos_compliance',        -- No HOS violations
      'milestone_miles',       -- Mileage milestones (10k, 50k, 100k, etc.)
      'milestone_loads',       -- Load count milestones
      'perfect_week',          -- 7 days no violations
      'perfect_month',         -- 30 days no violations
      'referral',              -- Referred another driver
      'training_completed',    -- Completed training module
      'inspection_pass',       -- Passed DOT inspection
      'driver_of_month',       -- Top driver score for month
      'emergency_response',    -- Handled emergency well
      'engagement',            -- High app engagement
      'manual_override'        -- Fleet manager awarded
    );
  end if;
end;
$$;

-- ── driver_reward_points ───────────────────────────────────
-- Running tally of points per driver
create table if not exists public.driver_reward_points (
  id                uuid        primary key default gen_random_uuid(),

  driver_id         uuid        not null references public.profiles(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  business_id       uuid        references public.businesses(id) on delete cascade,

  -- Point totals
  total_points      integer     not null default 0,
  current_balance   integer     not null default 0,
  lifetime_points   integer     not null default 0,
  redeemed_points   integer     not null default 0,
  expired_points    integer     not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (driver_id, business_id)
);

-- ── driver_reward_events ───────────────────────────────────
-- Each row = one reward event (points earned, badge awarded, etc.)
create table if not exists public.driver_reward_events (
  id                uuid        primary key default gen_random_uuid(),

  driver_id         uuid        not null references public.profiles(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  business_id       uuid        references public.businesses(id) on delete cascade,

  event_type        public.reward_event_type not null,
  event_name        text        not null,           -- Human-readable: "10,000 Safe Miles"
  description       text,

  -- Points
  points_awarded    integer     not null default 0,

  -- Badge info
  badge_awarded     text,                           -- badge identifier / slug
  badge_url         text,                           -- badge image URL (Storage)

  -- Milestone context
  milestone_value   text,                           -- e.g. "100000" for miles, "50" for loads
  milestone_unit    text,                           -- "miles" | "loads" | "days" | "weeks"

  -- Metadata
  metadata          jsonb       default '{}'::jsonb,

  awarded_at        timestamptz not null default now(),
  awarded_by        uuid        references auth.users(id) on delete set null,

  created_at        timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────
create index if not exists idx_reward_points_driver
  on public.driver_reward_points(driver_id);

create index if not exists idx_reward_points_balance
  on public.driver_reward_points(business_id, current_balance desc);

create index if not exists idx_reward_events_driver
  on public.driver_reward_events(driver_id, awarded_at desc);

create index if not exists idx_reward_events_type
  on public.driver_reward_events(event_type, awarded_at desc);

create index if not exists idx_reward_events_business
  on public.driver_reward_events(business_id, awarded_at desc);

-- ── RLS ───────────────────────────────────────────────────────
alter table public.driver_reward_points enable row level security;

drop policy if exists "reward_points_select" on public.driver_reward_points;
create policy "reward_points_select" on public.driver_reward_points
  for select using (
    user_id = auth.uid()
    or business_id in (
      select business_id from public.fleet_business_members where user_id = auth.uid()
    )
  );

drop policy if exists "reward_points_update" on public.driver_reward_points;
create policy "reward_points_update" on public.driver_reward_points
  for update using (user_id = auth.uid());

drop trigger if exists set_reward_points_updated_at on public.driver_reward_points;
create trigger set_reward_points_updated_at
  before update on public.driver_reward_points
  for each row execute function public.set_updated_at();

alter table public.driver_reward_events enable row level security;

drop policy if exists "reward_events_select" on public.driver_reward_events;
create policy "reward_events_select" on public.driver_reward_events
  for select using (
    user_id = auth.uid()
    or business_id in (
      select business_id from public.fleet_business_members where user_id = auth.uid()
    )
  );

drop policy if exists "reward_events_insert" on public.driver_reward_events;
create policy "reward_events_insert" on public.driver_reward_events
  for insert with check (user_id = auth.uid());


-- ============================================================
-- Rewards Catalog (redeemable items)
-- ============================================================
create table if not exists public.rewards_catalog (
  id                uuid        primary key default gen_random_uuid(),

  business_id       uuid        not null references public.businesses(id) on delete cascade,

  -- Reward details
  name              text        not null,
  description       text,
  category          text        not null default 'merchandise'
    check (category in ('merchandise', 'gift_card', 'cash_bonus', 'paid_time_off',
                        'fuel_discount', 'maintenance_credit', 'training', 'other')),

  -- Cost in points
  point_cost        integer     not null check (point_cost > 0),

  -- Availability
  quantity_total    integer,                         -- null = unlimited
  quantity_remaining integer,
  is_active         boolean     not null default true,
  expires_at        date,

  -- Media
  image_url         text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Rewards redemptions ──────────────────────────────────────
create table if not exists public.rewards_redemptions (
  id                uuid        primary key default gen_random_uuid(),

  reward_id         uuid        not null references public.rewards_catalog(id) on delete cascade,
  driver_id         uuid        not null references public.profiles(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  business_id       uuid        references public.businesses(id) on delete cascade,

  -- Points used
  points_spent      integer     not null check (points_spent > 0),

  -- Redemption status
  status            text        not null default 'pending'
    check (status in ('pending', 'approved', 'fulfilled', 'cancelled')),

  -- Fulfillment
  fulfilled_at      timestamptz,
  fulfilled_by      uuid        references auth.users(id) on delete set null,
  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Indexes
create index if not exists idx_catalog_business
  on public.rewards_catalog(business_id, is_active);

create index if not exists idx_redemptions_driver
  on public.rewards_redemptions(driver_id, created_at desc);

create index if not exists idx_redemptions_status
  on public.rewards_redemptions(status);

-- RLS
alter table public.rewards_catalog enable row level security;

drop policy if exists "catalog_select" on public.rewards_catalog;
create policy "catalog_select" on public.rewards_catalog
  for select using (
    business_id in (
      select business_id from public.fleet_business_members where user_id = auth.uid()
    )
  );

drop policy if exists "catalog_write" on public.rewards_catalog;
create policy "catalog_write" on public.rewards_catalog
  for all using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

alter table public.rewards_redemptions enable row level security;

drop policy if exists "redemptions_select" on public.rewards_redemptions;
create policy "redemptions_select" on public.rewards_redemptions
  for select using (
    user_id = auth.uid()
    or business_id in (
      select business_id from public.fleet_business_members where user_id = auth.uid()
    )
  );

drop policy if exists "redemptions_insert" on public.rewards_redemptions;
create policy "redemptions_insert" on public.rewards_redemptions
  for insert with check (user_id = auth.uid());

drop policy if exists "redemptions_update" on public.rewards_redemptions;
create policy "redemptions_update" on public.rewards_redemptions
  for update using (
    business_id in (
      select business_id from public.fleet_business_members
      where user_id = auth.uid()
      and role in ('owner', 'admin', 'dispatcher', 'fleet_manager')
    )
  );

drop trigger if exists set_rewards_catalog_updated_at on public.rewards_catalog;
create trigger set_rewards_catalog_updated_at
  before update on public.rewards_catalog
  for each row execute function public.set_updated_at();

drop trigger if exists set_redemptions_updated_at on public.rewards_redemptions;
create trigger set_redemptions_updated_at
  before update on public.rewards_redemptions
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';