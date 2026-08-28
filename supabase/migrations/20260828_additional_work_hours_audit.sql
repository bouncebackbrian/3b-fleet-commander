-- Additional Work Hours: driver-recorded work outside customer/broker timesheets.
-- The driver's original note is immutable. Company review/corrections are append-only
-- revisions so both sides can see what changed, who changed it, and when.

create table if not exists public.fleet_additional_work_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  shift_id uuid not null references public.fleet_dt_shifts(id) on delete cascade,
  driver_id uuid not null references public.profiles(id),
  driver_three_b_id text,
  work_date date not null,
  customer_hours numeric(8,2) not null default 0,
  additional_work_hours numeric(8,2) not null check (additional_work_hours >= 0),
  original_driver_note text,
  status text not null default 'pending_review'
    check (status in ('pending_review','verified','corrected','disputed')),
  current_work_hours numeric(8,2) not null check (current_work_hours >= 0),
  current_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_by_three_b_id text,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, shift_id)
);

create index if not exists idx_fleet_additional_work_hours_driver
  on public.fleet_additional_work_hours(business_id, driver_id, work_date desc);
create index if not exists idx_fleet_additional_work_hours_status
  on public.fleet_additional_work_hours(business_id, status, work_date desc);

create table if not exists public.fleet_additional_work_hours_revisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  additional_work_id uuid not null references public.fleet_additional_work_hours(id) on delete cascade,
  shift_id uuid not null references public.fleet_dt_shifts(id) on delete cascade,
  driver_id uuid not null references public.profiles(id),
  actor_user_id uuid not null references public.profiles(id),
  actor_three_b_id text,
  actor_scope text not null check (actor_scope in ('driver','dispatch','admin')),
  action text not null check (action in ('driver_note_added','reviewed','hours_changed','note_changed','status_changed','disputed')),
  previous_hours numeric(8,2),
  new_hours numeric(8,2),
  previous_note text,
  new_note text,
  previous_status text,
  new_status text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_fleet_additional_work_revisions_record
  on public.fleet_additional_work_hours_revisions(additional_work_id, created_at asc);
create index if not exists idx_fleet_additional_work_revisions_shift
  on public.fleet_additional_work_hours_revisions(business_id, shift_id, created_at asc);

alter table public.fleet_additional_work_hours enable row level security;
alter table public.fleet_additional_work_hours_revisions enable row level security;

-- Driver can see their own record; dispatch/admin can see records within the business.
drop policy if exists "fleet_additional_work_select" on public.fleet_additional_work_hours;
create policy "fleet_additional_work_select" on public.fleet_additional_work_hours
  for select using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll'])
  );

-- Driver may create the initial record only for their own shift.
drop policy if exists "fleet_additional_work_insert" on public.fleet_additional_work_hours;
create policy "fleet_additional_work_insert" on public.fleet_additional_work_hours
  for insert with check (
    driver_id = auth.uid()
    and shift_id in (
      select id from public.fleet_dt_shifts
      where driver_id = auth.uid() and business_id = fleet_additional_work_hours.business_id
    )
  );

-- Company review is handled server-side; do not expose direct client UPDATE.

drop policy if exists "fleet_additional_work_revision_select" on public.fleet_additional_work_hours_revisions;
create policy "fleet_additional_work_revision_select" on public.fleet_additional_work_hours_revisions
  for select using (
    driver_id = auth.uid()
    or public.fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager','payroll'])
  );

-- Driver can append their own note/dispute revision. Company changes are server-side.
drop policy if exists "fleet_additional_work_revision_insert_driver" on public.fleet_additional_work_hours_revisions;
create policy "fleet_additional_work_revision_insert_driver" on public.fleet_additional_work_hours_revisions
  for insert with check (
    actor_user_id = auth.uid()
    and driver_id = auth.uid()
    and actor_scope = 'driver'
    and action in ('driver_note_added','disputed')
  );

notify pgrst, 'reload schema';