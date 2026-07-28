-- ============================================================
-- 3B FLEET COMMANDER — Dump Truck Mode: decouple driver/actor columns from
-- this project's local profiles(id) / auth.users
-- Migration: 20260728_fleet_dt_decouple_profiles_fk
--
-- ROOT CAUSE (found live, 2026-07-28 night, while a real driver was trying
-- to clock in): every Dump Truck Mode migration FK'd driver_id/created_by/
-- uploaded_by/actor_id/etc. columns to public.profiles(id), and
-- profiles.id itself hard-FKs to THIS project's own auth.users(id)
-- (profiles_id_fkey, on delete cascade).
--
-- But per docs/ecosystem-bridge/SHARED_AUTH_ARCHITECTURE.md / ADR-001,
-- real identity/session is owned by the separate "Core_Eco" Supabase
-- project (rkwdryneutgyqrnbuwaz), not this "Fleet Commander" project
-- (goqzhdrmrdlkchmwfiur) — see src/lib/auth-server-client.ts. A user who
-- signs in via Core_Eco can have NO matching row in this project's local
-- auth.users at all. Confirmed live: bouncebackbrian@outlook.com resolves
-- to id bf568e3f-af39-4487-9649-953ddefd1216 in Core_Eco (real session,
-- signed in 2026-07-28) with zero matching row in Fleet's own auth.users —
-- so every insert keyed to that real session id violated these FKs.
--
-- fleet_business_members.user_id already has NO such constraint and
-- already works correctly with Core_Eco ids (that's how login/role
-- resolution in requireFleetAuth() functions at all). This migration
-- brings every other Dump Truck Mode driver/actor column in line with
-- that existing, working, unconstrained pattern — it does not touch
-- profiles.id's own FK to auth.users, and does not touch RLS (none of
-- these columns are referenced by RLS policies; policies here check
-- fleet_business_members via fleet_dt_has_role()/fleet_dt_is_member()).
--
-- This is a real, pre-existing architecture gap, not something this
-- migration invents — tracked in docs/SCHEMA_RECONCILIATION.md. The
-- correct long-term fix is a proper Core_Eco → Fleet identity sync
-- (auto-provision a local profiles row, or drop Fleet's local profiles
-- table in favor of reading Core_Eco directly) — out of scope tonight.
-- ============================================================

alter table public.fleet_equipment                          drop constraint if exists fleet_equipment_created_by_fkey;
alter table public.fleet_dt_sites                            drop constraint if exists fleet_dt_sites_verified_by_fkey;
alter table public.fleet_dt_sites                            drop constraint if exists fleet_dt_sites_created_by_fkey;
alter table public.fleet_dt_jobs                              drop constraint if exists fleet_dt_jobs_driver_id_fkey;
alter table public.fleet_dt_jobs                              drop constraint if exists fleet_dt_jobs_created_by_fkey;
alter table public.fleet_dt_shifts                            drop constraint if exists fleet_dt_shifts_driver_id_fkey;
alter table public.fleet_dt_shifts                            drop constraint if exists fleet_dt_shifts_submitted_by_fkey;
alter table public.fleet_dt_events                            drop constraint if exists fleet_dt_events_driver_id_fkey;
alter table public.fleet_dt_events                            drop constraint if exists fleet_dt_events_created_by_fkey;
alter table public.fleet_dt_vehicle_custody                   drop constraint if exists fleet_dt_vehicle_custody_driver_id_fkey;
alter table public.fleet_dt_drive_segments                    drop constraint if exists fleet_dt_drive_segments_driver_id_fkey;
alter table public.fleet_dt_load_cycles                       drop constraint if exists fleet_dt_load_cycles_driver_id_fkey;
alter table public.fleet_dt_documents                         drop constraint if exists fleet_dt_documents_uploaded_by_fkey;
alter table public.fleet_dt_inspection_template_versions      drop constraint if exists fleet_dt_inspection_template_versions_created_by_fkey;
alter table public.fleet_dt_inspections                       drop constraint if exists fleet_dt_inspections_driver_id_fkey;
alter table public.fleet_dt_inspections                       drop constraint if exists fleet_dt_inspections_override_by_fkey;
alter table public.fleet_dt_defects                           drop constraint if exists fleet_dt_defects_resolved_by_fkey;
alter table public.fleet_dt_defects                           drop constraint if exists fleet_dt_defects_reported_by_fkey;
alter table public.fleet_dt_incidents                         drop constraint if exists fleet_dt_incidents_driver_id_fkey;
alter table public.fleet_dt_corrections                       drop constraint if exists fleet_dt_corrections_actor_id_fkey;
alter table public.fleet_dt_fuel_entries                      drop constraint if exists fleet_dt_fuel_entries_created_by_fkey;
alter table public.fleet_dt_fuel_entries                      drop constraint if exists fleet_dt_fuel_entries_driver_id_fkey;
alter table public.fleet_dt_pay_policies                      drop constraint if exists fleet_dt_pay_policies_created_by_fkey;
alter table public.fleet_dt_driver_record_exports             drop constraint if exists fleet_dt_driver_record_exports_driver_id_fkey;

-- Correct the misrouted id already written tonight (Fleet-local auth id
-- 7f5b2267-8c43-4e76-a913-5106445c5344, used before this bug was found,
-- instead of the real Core_Eco session id bf568e3f-af39-4487-9649-953ddefd1216
-- for bouncebackbrian@outlook.com).
update public.fleet_business_members
  set user_id = 'bf568e3f-af39-4487-9649-953ddefd1216'
  where user_id = '7f5b2267-8c43-4e76-a913-5106445c5344';

update public.fleet_dt_jobs
  set driver_id  = 'bf568e3f-af39-4487-9649-953ddefd1216',
      created_by = 'bf568e3f-af39-4487-9649-953ddefd1216'
  where driver_id = '7f5b2267-8c43-4e76-a913-5106445c5344';

update public.fleet_equipment
  set created_by = 'bf568e3f-af39-4487-9649-953ddefd1216'
  where created_by = '7f5b2267-8c43-4e76-a913-5106445c5344';

notify pgrst, 'reload schema';
