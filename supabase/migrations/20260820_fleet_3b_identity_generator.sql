-- ============================================================
-- 3B Identity — real sequential ID generator (3B-B-XXXXXXXX / 3B-U-XXXXXXXX)
-- Migration: 20260820_fleet_3b_identity_generator
--
-- docs/SCHEMA_RECONCILIATION.md flagged this explicitly: "No 3B ID or 3B
-- Business ID generator function exists anywhere in this database...
-- three_b_id/three_b_biz_id values are not fabricated anywhere in this
-- codebase; building that sequential-id generator is real, separate,
-- unbuilt work." This migration is that work.
--
-- Format (docs/ecosystem-bridge/IDENTITY_MODEL.md): sequential, zero-padded,
-- 8 digits — 3B-B-00000001 for businesses, 3B-U-00000001 for people.
--
-- Two pieces:
--   1. A real sequence-backed generator function per ID type (never a
--      client-chosen or hand-typed value).
--   2. A BEFORE INSERT trigger on businesses/profiles that calls it
--      automatically whenever a new row has no ID yet — matches the
--      documented "auto-generated on signup" behavior for profiles and
--      gives businesses the same guarantee going forward.
--
-- Existing rows created before this migration (which is every row today —
-- three_b_biz_id/three_b_id are unconditionally null in production) are
-- backfilled once, ordered by created_at so the oldest real record claims
-- the lowest number, exactly as if the generator had existed all along.
-- ============================================================

create sequence if not exists public.three_b_biz_id_seq;
create sequence if not exists public.three_b_user_id_seq;

create or replace function public.generate_three_b_biz_id()
returns text
language sql
as $$
  select '3B-B-' || lpad(nextval('public.three_b_biz_id_seq')::text, 8, '0');
$$;

create or replace function public.generate_three_b_user_id()
returns text
language sql
as $$
  select '3B-U-' || lpad(nextval('public.three_b_user_id_seq')::text, 8, '0');
$$;

create or replace function public.set_three_b_biz_id()
returns trigger
language plpgsql
as $$
begin
  if new.three_b_biz_id is null then
    new.three_b_biz_id := public.generate_three_b_biz_id();
  end if;
  return new;
end;
$$;

create or replace function public.set_three_b_user_id()
returns trigger
language plpgsql
as $$
begin
  if new.three_b_id is null then
    new.three_b_id := public.generate_three_b_user_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_three_b_biz_id on public.businesses;
create trigger trg_set_three_b_biz_id
  before insert on public.businesses
  for each row execute function public.set_three_b_biz_id();

drop trigger if exists trg_set_three_b_user_id on public.profiles;
create trigger trg_set_three_b_user_id
  before insert on public.profiles
  for each row execute function public.set_three_b_user_id();

-- One-time backfill for rows that already exist (every row as of this
-- migration) — oldest created_at gets the lowest sequence number, same
-- ordering the generator would have produced had it existed from the start.
do $$
declare
  r record;
begin
  for r in select id from public.businesses where three_b_biz_id is null order by created_at asc loop
    update public.businesses set three_b_biz_id = public.generate_three_b_biz_id() where id = r.id;
  end loop;

  for r in select id from public.profiles where three_b_id is null order by created_at asc loop
    update public.profiles set three_b_id = public.generate_three_b_user_id() where id = r.id;
  end loop;
end $$;

notify pgrst, 'reload schema';
