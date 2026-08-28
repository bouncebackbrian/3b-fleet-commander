-- Defect accountability: distinguish company-review holds from regulatory/safety hard holds.
-- Dispatch may acknowledge/override company holds. Regulatory/safety hard holds must be resolved before release.

alter table public.fleet_dt_defects
  add column if not exists hold_class text not null default 'none'
    check (hold_class in ('none','company','regulatory')),
  add column if not exists regulatory_reference text,
  add column if not exists dispatch_acknowledged_by uuid references public.profiles(id),
  add column if not exists dispatch_acknowledged_at timestamptz,
  add column if not exists dispatch_override_reason text,
  add column if not exists dispatch_override_at timestamptz;

create index if not exists idx_fleet_dt_defects_holds
  on public.fleet_dt_defects(business_id, hold_class, status)
  where hold_class <> 'none' and status in ('open','acknowledged','deferred');

notify pgrst, 'reload schema';
