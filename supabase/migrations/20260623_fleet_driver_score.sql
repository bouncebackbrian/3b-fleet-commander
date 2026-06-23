-- ============================================================
-- 3B FLEET COMMANDER — Driver Score & Performance
-- Migration: 20260623_fleet_driver_score
--
-- Driver Score metric — aggregate of safety, fuel efficiency,
-- on-time delivery, and HOS compliance.
-- ============================================================

-- ── driver_score_config ─────────────────────────────────────
-- Per-business configurable weights for the score formula
create table if not exists public.driver_score_config (
  id                uuid        primary key default gen_random_uuid(),
  business_id       uuid        not null references public.businesses(id) on delete cascade unique,

  -- Weights (must sum to 100)
  safety_weight     integer     not null default 30,
  fuel_efficiency_weight integer not null default 20,
  on_time_weight    integer     not null default 20,
  hos_compliance_weight integer  not null default 20,
  engagement_weight integer     not null default 10,

  -- Safety thresholds
  accident_penalty  integer     not null default 20,    -- points deducted per accident
  violation_penalty integer     not null default 10,    -- points deducted per violation
  critical_violation_penalty integer not null default 30,

  -- Fuel efficiency baseline (mpg)
  fuel_baseline_mpg numeric(4,2) not null default 6.5,

  -- Custom name for the score
  score_label       text        not null default 'Driver Score',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint weights_sum_100 check (
    safety_weight + fuel_efficiency_weight + on_time_weight +
    hos_compliance_weight + engagement_weight = 100
  )
);

-- ── driver_scores (periodic snapshots) ─────────────────────
create table if not exists public.driver_scores (
  id                uuid        primary key default gen_random_uuid(),

  driver_id         uuid        not null references public.profiles(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  business_id       uuid        references public.businesses(id) on delete cascade,

  -- Score period
  period_start      date        not null,
  period_end        date        not null,
  score_date        date        not null default current_date,

  -- Composite score (0-100)
  overall_score     integer     not null check (overall_score between 0 and 100),

  -- Component scores
  safety_score          integer check (safety_score between 0 and 100),
  fuel_efficiency_score integer check (fuel_efficiency_score between 0 and 100),
  on_time_score         integer check (on_time_score between 0 and 100),
  hos_compliance_score  integer check (hos_compliance_score between 0 and 100),
  engagement_score      integer check (engagement_score between 0 and 100),

  -- Raw metrics
  accidents_count       integer     not null default 0,
  violations_count      integer     not null default 0,
  late_deliveries_count integer     not null default 0,
  on_time_deliveries_count integer   not null default 0,
  total_miles_driven    integer     not null default 0,
  fuel_gallons_used     numeric(8,2) not null default 0,
  fuel_mpg              numeric(4,2),
  hos_violations_count  integer     not null default 0,
  days_active           integer     not null default 0,

  -- Trend
  score_change          integer,    -- change from previous period

  created_at        timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────
create index if not exists idx_driver_scores_driver
  on public.driver_scores(driver_id, score_date desc);

create index if not exists idx_driver_scores_business
  on public.driver_scores(business_id, score_date desc);

create index if not exists idx_driver_scores_period
  on public.driver_scores(driver_id, period_start, period_end);

-- ── RLS ───────────────────────────────────────────────────────
alter table public.driver_scores enable row level security;

drop policy if exists "driver_scores_select" on public.driver_scores;
create policy "driver_scores_select" on public.driver_scores
  for select using (
    user_id = auth.uid()
    or business_id in (
      select business_id from public.fleet_business_members
      where user_id = auth.uid()
      and role in ('owner', 'admin', 'dispatcher', 'fleet_manager')
    )
  );

drop policy if exists "driver_scores_insert" on public.driver_scores;
create policy "driver_scores_insert" on public.driver_scores
  for insert with check (user_id = auth.uid());

-- Owner/admin can update scores
drop policy if exists "driver_scores_update" on public.driver_scores;
create policy "driver_scores_update" on public.driver_scores
  for update using (
    business_id in (
      select business_id from public.fleet_business_members
      where user_id = auth.uid()
      and role in ('owner', 'admin', 'fleet_manager')
    )
  );

alter table public.driver_score_config enable row level security;

drop policy if exists "driver_score_config_select" on public.driver_score_config;
create policy "driver_score_config_select" on public.driver_score_config
  for select using (
    business_id in (
      select business_id from public.fleet_business_members where user_id = auth.uid()
    )
  );

drop policy if exists "driver_score_config_write" on public.driver_score_config;
create policy "driver_score_config_write" on public.driver_score_config
  for all using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

drop trigger if exists set_driver_score_config_updated_at on public.driver_score_config;
create trigger set_driver_score_config_updated_at
  before update on public.driver_score_config
  for each row execute function public.set_updated_at();


-- ============================================================
-- Driver Score Calculation Function
-- ============================================================
create or replace function public.calc_driver_score(
  p_driver_id uuid,
  p_business_id uuid,
  p_start_date date,
  p_end_date date
) returns jsonb language plpgsql stable as $$
declare
  v_config        public.driver_score_config%rowtype;
  v_accidents     int;
  v_violations    int;
  v_critical_viol int;
  v_late_count    int;
  v_on_time_count int;
  v_total_miles   int;
  v_fuel_gallons  numeric(8,2);
  v_hos_violations int;
  v_days_active   int;
  v_safety        int := 100;
  v_fuel_eff      int := 100;
  v_on_time       int := 100;
  v_hos_comp      int := 100;
  v_engagement    int := 100;
  v_mpg           numeric(4,2);
  v_overall       int;
begin
  -- Get config for this business
  select * into v_config
  from public.driver_score_config
  where business_id = p_business_id;

  if not found then
    -- Use defaults
    v_config.safety_weight := 30;
    v_config.fuel_efficiency_weight := 20;
    v_config.on_time_weight := 20;
    v_config.hos_compliance_weight := 20;
    v_config.engagement_weight := 10;
    v_config.accident_penalty := 20;
    v_config.violation_penalty := 10;
    v_config.critical_violation_penalty := 30;
    v_config.fuel_baseline_mpg := 6.5;
  end if;

  -- Count accidents
  select count(*) into v_accidents
  from public.fleet_driver_updates
  where driver_name = (select first_name || ' ' || last_name from public.profiles where id = p_driver_id)
    and update_type = 'accident_incident'
    and date(occurred_at) between p_start_date and p_end_date;

  -- Count violations
  select count(*) filter (where severity in ('citation', 'out_of_service', 'critical')),
         count(*) filter (where severity = 'warning'),
         count(*) filter (where severity = 'info')
  into v_critical_viol, v_violations, v_days_active -- reuse v_days_active, not used yet
  from public.fleet_violations
  where user_id = p_driver_id
    and date(incident_date) between p_start_date and p_end_date;

  -- Count HOS violations
  select count(*) into v_hos_violations
  from public.hos_violations
  where driver_id = p_driver_id
    and date(occurred_at) between p_start_date and p_end_date;

  -- Compute safety score
  v_safety := greatest(0, 100
    - coalesce(v_accidents, 0) * v_config.accident_penalty
    - coalesce(v_violations, 0) * v_config.violation_penalty
    - coalesce(v_critical_viol, 0) * v_config.critical_violation_penalty
  );

  -- Compute fuel efficiency score (relative to baseline)
  select coalesce(sum(total_miles_driven), 0), coalesce(sum(fuel_gallons_used), 0)
  into v_total_miles, v_fuel_gallons
  from public.driver_scores
  where driver_id = p_driver_id
    and score_date between p_start_date and p_end_date;

  if v_fuel_gallons > 0 then
    v_mpg := least(99.99, round(v_total_miles::numeric / v_fuel_gallons, 2));
    v_fuel_eff := greatest(0, least(100, round((v_mpg / v_config.fuel_baseline_mpg) * 100)));
  end if;

  -- Count on-time deliveries
  select
    count(*) filter (where status = 'delivered' and delivery_appt is not null and actual_delivery <= delivery_appt),
    count(*) filter (where status = 'delivered' and delivery_appt is not null and actual_delivery > delivery_appt)
  into v_on_time_count, v_late_count
  from public.fleet_loads
  where driver_name = (select first_name || ' ' || last_name from public.profiles where id = p_driver_id)
    and status in ('delivered', 'completed')
    and date(load_date) between p_start_date and p_end_date;

  v_on_time := case
    when (v_on_time_count + v_late_count) > 0
    then round(100.0 * v_on_time_count / (v_on_time_count + v_late_count))
    else 100
  end;

  -- HOS compliance score
  v_hos_comp := greatest(0, 100 - coalesce(v_hos_violations, 0) * 15);

  -- Engagement score (days active in period)
  select count(distinct date(changed_at)) into v_days_active
  from public.hos_logs
  where driver_id = p_driver_id
    and date(changed_at) between p_start_date and p_end_date;

  v_engagement := least(100, round(100.0 * v_days_active / greatest(1,
    (p_end_date - p_start_date)::int
  )));

  -- Calculate overall weighted score
  v_overall := round(
    (coalesce(v_safety, 0) * v_config.safety_weight +
     coalesce(v_fuel_eff, 0) * v_config.fuel_efficiency_weight +
     coalesce(v_on_time, 0) * v_config.on_time_weight +
     coalesce(v_hos_comp, 0) * v_config.hos_compliance_weight +
     coalesce(v_engagement, 0) * v_config.engagement_weight) / 100.0
  );

  return jsonb_build_object(
    'overall_score', v_overall,
    'safety_score', v_safety,
    'fuel_efficiency_score', v_fuel_eff,
    'on_time_score', v_on_time,
    'hos_compliance_score', v_hos_comp,
    'engagement_score', v_engagement,
    'accidents_count', v_accidents,
    'violations_count', v_violations,
    'critical_violations', v_critical_viol,
    'late_deliveries', v_late_count,
    'on_time_deliveries', v_on_time_count,
    'hos_violations', v_hos_violations,
    'days_active', v_days_active,
    'fuel_mpg', v_mpg
  );
end;
$$;

notify pgrst, 'reload schema';