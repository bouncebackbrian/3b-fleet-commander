-- ============================================================
-- 3B FLEET COMMANDER — dispatch ticket signer emails
-- Migration: 20260730_fleet_dt_ticket_signer_emails
--
-- Fleet's local `profiles` table does not reliably carry email (identity/
-- email is Core_Eco-owned — see docs/SCHEMA_RECONCILIATION.md items 3/6).
-- Rather than a fragile cross-project lookup at PDF-completion time, each
-- signer's email (already available from requireFleetAuth()'s auth.email
-- at the moment they sign) is captured directly onto the ticket instance so
-- the completion email (stage 6) has real addresses to send to.
-- ============================================================

alter table public.fleet_dt_ticket_instances
  add column if not exists company_signed_by_email text,
  add column if not exists driver_signed_by_email  text;

notify pgrst, 'reload schema';
