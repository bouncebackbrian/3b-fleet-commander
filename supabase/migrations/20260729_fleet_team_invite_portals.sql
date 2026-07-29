-- ============================================================
-- 3B FLEET COMMANDER — Team invites carry portal grants
-- Migration: 20260729_fleet_team_invite_portals
--
-- Companion to 20260729_fleet_portal_permissions.sql: invites now carry a
-- set of portal grants (driver/dispatch/broker/admin, each view or manage)
-- instead of a single legacy role. `role` stays for display/backward-compat
-- (NOT NULL, so a best-effort label is still computed on invite) but is no
-- longer authoritative — /api/team/accept inserts the real
-- fleet_member_portal_grants rows from portal_grants on acceptance.
-- ============================================================

alter table public.fleet_team_invites
  add column if not exists portal_grants jsonb not null default '[]'::jsonb;

comment on column public.fleet_team_invites.portal_grants is
  'Array of {portal, permission_level} objects — the real grants applied to fleet_member_portal_grants on accept. role column is a display-only best-effort label.';

notify pgrst, 'reload schema';
