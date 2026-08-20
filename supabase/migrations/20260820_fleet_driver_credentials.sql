-- ============================================================
-- Driver credentials — one 3B ID, many credentials
-- Migration: 20260820_fleet_driver_credentials
--
-- Replaces the single cdl_number/cdl_state/cdl_class/cdl_expiry/
-- medical_expiry fields on profiles (which assumed one driver = one CDL)
-- with a real one-to-many table: a driver can hold a Class A CDL AND a
-- Class B passenger permit AND separate endorsements AND a medical card
-- simultaneously, each independently tracked with its own number, issuing
-- state, dates, photo, and verification status.
--
-- profiles.cdl_* / medical_expiry are left in place, untouched and
-- unread by new code — dropping a live column under a real driver's row
-- (Brian Martin's real Class A CDL/medical card data already lives there)
-- is unnecessary risk for a rename. They are backfilled into this table
-- below so the real data carries forward, then become legacy/deprecated.
--
-- Tenant scoping: this app's entire security model is single-business-
-- scoped by business_id (see every other fleet_dt_* table) — a true
-- cross-business "one identity, many businesses share one credential
-- record" model would need the ecosystem-wide 3B identity architecture
-- docs/ecosystem-bridge/IDENTITY_MODEL.md describes as a separate,
-- unbuilt product (identity-sor). Until that exists, a credential row is
-- scoped to the business that manages/verifies it, same as every other
-- driver record in this schema; the driver can still see their own
-- credentials regardless of which business row they're attached to via
-- driver_id = auth.uid().
-- ============================================================

create table if not exists public.fleet_driver_credentials (
  id                   uuid        primary key default gen_random_uuid(),
  business_id          uuid        not null references public.businesses(id) on delete cascade,
  driver_id            uuid        not null references public.profiles(id) on delete cascade,

  credential_type      text        not null check (credential_type in (
    'cdl_class_a', 'cdl_class_b', 'cdl_class_c',
    'permit_class_a', 'permit_class_b', 'permit_class_c',
    'endorsement_passenger', 'endorsement_tanker', 'endorsement_hazmat',
    'endorsement_doubles_triples', 'endorsement_school_bus',
    'medical_card', 'twic', 'other'
  )),
  label                text,        -- optional display override, e.g. a custom name for 'other'

  number               text,
  issuing_state        text,
  class                text,        -- raw class letter as printed, for rows where credential_type alone doesn't capture it
  endorsements         text[]       not null default '{}',  -- letter codes printed ON this card (e.g. CDL listing P/N/H)
  restrictions         text[]       not null default '{}',

  issue_date           date,
  expiry_date          date,

  front_doc_id         uuid        references public.fleet_dt_documents(id),
  back_doc_id          uuid        references public.fleet_dt_documents(id),

  verification_status  text        not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified')),
  verified_by           uuid        references public.profiles(id),
  verified_at            timestamptz,

  notes                  text,
  -- Soft-delete / superseded flag (a renewed CDL adds a new row rather than
  -- overwriting the old one's number/dates) — preserves credential history.
  active                  boolean     not null default true,

  created_by               uuid        references public.profiles(id),
  created_at                 timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create index if not exists idx_fleet_driver_credentials_driver on public.fleet_driver_credentials(driver_id, active);
create index if not exists idx_fleet_driver_credentials_business on public.fleet_driver_credentials(business_id, credential_type);

alter table public.fleet_driver_credentials enable row level security;

-- Select: the driver sees their own; dispatch/admin (not payroll/billing —
-- these are identity/compliance documents, not pay data) see their business's.
drop policy if exists "fleet_driver_credentials_select" on public.fleet_driver_credentials;
create policy "fleet_driver_credentials_select" on public.fleet_driver_credentials
  for select using (
    driver_id = auth.uid()
    or fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

-- Write: a driver manages their own credentials (self-service scan/entry,
-- per spec — "the driver can scan each credential separately"); dispatch/
-- admin can also enter/correct on a driver's behalf and set verification_status.
drop policy if exists "fleet_driver_credentials_write" on public.fleet_driver_credentials;
create policy "fleet_driver_credentials_write" on public.fleet_driver_credentials
  for all using (
    driver_id = auth.uid()
    or fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  )
  with check (
    driver_id = auth.uid()
    or fleet_dt_has_role(business_id, array['owner','admin','dispatcher','fleet_manager'])
  );

drop trigger if exists set_fleet_driver_credentials_updated_at on public.fleet_driver_credentials;
create trigger set_fleet_driver_credentials_updated_at
  before update on public.fleet_driver_credentials
  for each row execute function public.set_updated_at();

-- ── Backfill real existing data (profiles.cdl_*/medical_expiry) ───────────
-- Scoped to each profile's active Cal-Neva-or-whatever business membership
-- so the backfilled row is tenant-scoped correctly, not guessed.
do $$
declare
  r record;
begin
  for r in
    select p.id as driver_id, p.cdl_number, p.cdl_state, p.cdl_class, p.cdl_expiry, p.medical_expiry,
           fbm.business_id
    from public.profiles p
    join public.fleet_business_members fbm on fbm.user_id = p.id and fbm.active = true
    where p.cdl_number is not null or p.cdl_class is not null or p.medical_expiry is not null
  loop
    if r.cdl_number is not null or r.cdl_class is not null or r.cdl_expiry is not null then
      insert into public.fleet_driver_credentials
        (business_id, driver_id, credential_type, number, issuing_state, class, expiry_date, notes, created_by)
      values (
        r.business_id, r.driver_id,
        case upper(coalesce(r.cdl_class, 'A'))
          when 'B' then 'cdl_class_b'
          when 'C' then 'cdl_class_c'
          else 'cdl_class_a'
        end,
        r.cdl_number, r.cdl_state, r.cdl_class, r.cdl_expiry,
        'Backfilled from profiles.cdl_* on 2026-08-20 — pre-existing single-CDL field.',
        r.driver_id
      );
    end if;

    if r.medical_expiry is not null then
      insert into public.fleet_driver_credentials
        (business_id, driver_id, credential_type, expiry_date, notes, created_by)
      values (
        r.business_id, r.driver_id, 'medical_card', r.medical_expiry,
        'Backfilled from profiles.medical_expiry on 2026-08-20.',
        r.driver_id
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
