# Schema Reconciliation — Tracked Follow-Up

Opened: 2026-07-28, while deploying Dump Truck Mode to production.

**This is a tracked problem statement, not a plan that's been executed.**
Nothing in this document has been built. Do not treat any section below as
done. It exists so the drift discovered during the Dump Truck Mode
deployment isn't lost, and so nobody repeats the discovery process from
scratch.

## Why this exists

While deploying Dump Truck Mode (2026-07-28), applying its migrations to
the live "Fleet Commander" Supabase project (`goqzhdrmrdlkchmwfiur`)
surfaced that the live database does not match either the repository's
migration files or some of the repository's own application code
(`identity-registry.ts`). Specifically:

1. **The live database's applied-migration history stops at
   `20260607225423_create_fleet_audit_logs`.** Every migration file in
   `supabase/migrations/` dated after that — `20260606_3b_identity_arch.sql`,
   `20260622_fleet_driver_score.sql`, `20260623_fleet_equipment.sql`,
   `20260623_fleet_hos.sql`, `20260623_fleet_fuel.sql`,
   `20260623_fleet_emergency_events.sql`, `20260623_fleet_rewards.sql` —
   exists in the repo but was **never applied** to this database. (Also
   note the filename dates don't match the applied version timestamps
   1:1 — e.g. `20260520_fleet_missions_columns.sql` shows as version
   `20260520` while other early files show as long numeric timestamps —
   suggesting at least some of this history was recorded outside a
   straightforward `supabase db push` of the files as they exist today.)

2. **`businesses` has no 3B Business ID column.** The table has `name`
   (not `company_name`) and no `three_b_biz_id` or equivalent — despite
   `src/lib/identity-registry.ts`'s `ThreeBBusiness` interface documenting
   `company_name`, `three_b_biz_id`, and a whole bankability-score feature
   set (`has_ein`, `has_business_address`, `revenue_status`, etc.) as if
   they exist. **None of those columns exist in production.** Either
   `identity-registry.ts` was written against a schema that was planned but
   never migrated, or it was written against a different Supabase project
   than the live "Fleet Commander" one. This needs a person with history
   context to determine which.

3. **`profiles` has `full_name`, not `first_name`/`last_name`.** Same
   `identity-registry.ts` mismatch pattern — its `ThreeBProfile` interface
   documents `first_name`, `last_name`, `verification_status`, `has_fleet`,
   `has_credit`, `cdl_number`, etc. `cdl_number` and a handful of others do
   exist; `first_name`/`last_name`/`verification_status`/`has_*` do not.

4. **`fleet_equipment` did not exist at all** before this deployment added
   a deliberately minimal version of it (see below).

5. **`fleet_business_members.role` values in code vs. in the database
   disagree in one place.** The table's own pre-existing RLS policy
   ("Admin/owner can read all business members") checks for
   `role in ('admin','owner_operator')`, but the one real row in the table
   uses `role = 'owner'`, and `fleet-auth-guard.ts`'s `canWrite()` also
   assumes `'owner'`. This predates Dump Truck Mode and wasn't touched, but
   is worth knowing about — that pre-existing policy may already be
   effectively a no-op for actual "owner" users.

6. **CRITICAL, found live in production on 2026-07-28 night, blocked a real
   driver from clocking in:** every Dump Truck Mode table's driver/actor
   columns (`driver_id`, `created_by`, `uploaded_by`, `actor_id`, etc. —
   24 foreign keys across `fleet_dt_shifts`, `fleet_dt_events`,
   `fleet_dt_jobs`, `fleet_equipment`, and 14 other tables) hard-FK to
   `public.profiles(id)`, and `profiles.id` itself hard-FKs to **this
   project's own local `auth.users`**. But per
   `docs/ecosystem-bridge/SHARED_AUTH_ARCHITECTURE.md` (ADR-001), real
   identity/session is owned by a **separate** Supabase project, "Core_Eco"
   (`rkwdryneutgyqrnbuwaz`) — see `src/lib/auth-server-client.ts`,
   `src/lib/supabase-browser.ts`. A user validated via Core_Eco can have
   (and in this case did have) **zero matching row in Fleet's local
   `auth.users`**: `bouncebackbrian@outlook.com` resolves to
   `bf568e3f-af39-4487-9649-953ddefd1216` in Core_Eco (a real, active
   session, signed in 2026-07-28) with nothing matching in Fleet's own
   `auth.users`/`profiles`. Every write keyed to that real session id threw
   a foreign-key violation — surfacing to the driver as "Could not load
   shift data" and every clock-in attempt silently failing.
   `fleet_business_members.user_id` already had **no such constraint** and
   already worked correctly with Core_Eco ids (that's the only reason
   login/role resolution worked at all). Fixed by
   `supabase/migrations/20260728_fleet_dt_decouple_profiles_fk.sql`, which
   drops all 24 `profiles(id)` FKs on Dump Truck Mode tables (bringing them
   in line with `fleet_business_members`'s existing working pattern) and
   corrects the one Fleet-local id that had already been written
   (`7f5b2267-...`) to the real Core_Eco session id (`bf568e3f-...`) for
   the affected business_members/jobs/equipment rows. Verified via a
   transactional dry-run of a full clock-in insert (shift + event) after
   the fix, zero residue.

## What Dump Truck Mode did about it (scope-limited, per explicit direction)

Given a live, largely-empty database (1 `businesses` row, 0 `profiles` rows
at the time — see `docs/schema-snapshots/2026-07-28-pre-fleet-equipment.md`
for the full point-in-time snapshot) and an explicit instruction not to
backfill the historical migration chain as part of this feature:

- Added `supabase/migrations/20260728_fleet_equipment_minimal.sql` — a
  small, self-contained table with only the columns Dump Truck Mode reads
  (`id`, `business_id`, `unit_number`, `equipment_type`, `status`, plus
  `vin`/`license_plate`/`notes` for basic usability). It does not attempt
  to be the full equipment registry the unapplied historical migration
  describes (maintenance schedules, odometer logs, DOT/MC numbers, lease
  tracking).
- Adapted `src/lib/fleet/dumpTruck/shared.ts` (`getDriverBusinessMeta`) and
  `src/lib/fleet/dumpTruck/jobs.ts` (`listDrivers`) to query
  `profiles.full_name` and `businesses.name` instead of the non-existent
  `first_name`/`last_name`/`company_name` columns.
- `threebBizId` is hard-coded `null` everywhere in Dump Truck Mode's CSV
  exports and driver-facing displays — never fabricated, never silently
  defaulted to something misleading.

## What still needs a real reconciliation project

None of this was done, and doing it was explicitly out of scope for Dump
Truck Mode:

1. **Decide whether the unapplied historical migrations
   (`20260606_3b_identity_arch.sql` onward) should ever be applied to this
   database**, or whether they were superseded by a different, undocumented
   path that already added `three_b_id`/`cdl_number`/etc. piecemeal. Applying
   them now, unreviewed, risks colliding with manual/dashboard changes made
   since — they need a line-by-line diff against the *current* live schema
   first, not a blind `supabase db push`.
2. **Add a real 3B Business ID column** (`businesses.three_b_biz_id` or
   equivalent) if that concept is meant to be a first-class identity field
   in production — right now it exists only in application-layer TypeScript
   types (`identity-registry.ts`), not in the database those types describe.
3. **Reconcile `identity-registry.ts` against reality** — either the code
   is ahead of a migration that needs to be written, or it's pointed at the
   wrong project/schema. Determine which before trusting anything the
   Business Registry Dashboard / bankability score UI shows in production.
4. **Decide on a canonical equipment registry.** The minimal
   `fleet_equipment` this deployment added is intentionally thin. If a real
   registry (VIN, DOT#, maintenance, odometer history) is wanted, design it
   against the live schema as it exists after step 1 is resolved, not
   against the unapplied historical file in isolation.
5. **Get this database's `list_migrations` history and the repo's
   `supabase/migrations/` directory back in sync** as a general practice —
   right now they've been silently diverging, which is exactly how this
   session's `fleet_equipment` surprise happened. A CI check that fails a
   PR when local migration files don't match what's applied to the target
   project would catch this going forward.
6. **Build a real Core_Eco → Fleet identity bridge.** Dropping the
   `profiles(id)` FKs (item 6 above) unblocks writes tonight but is a
   patch, not a fix — Fleet's local `profiles` table (driver names, CDL
   info, etc.) is now silently disconnected from whichever driver id a
   Core_Eco session actually has, for every table that used to enforce it.
   The real fix is provisioning a matching local identity (via the Supabase
   Admin API, not hand-written SQL into `auth.users`) the first time a
   Core_Eco user touches Fleet Commander — or dropping Fleet's local
   `profiles`/`auth.users` dependency entirely in favor of reading identity
   straight from Core_Eco. Until that exists, any driver whose Fleet
   membership was set up manually (as `bouncebackbrian@outlook.com`'s was,
   tonight) needs their `fleet_business_members.user_id` and any
   `fleet_dt_jobs.driver_id` verified against their **actual Core_Eco
   session id**, not whatever id happens to exist in Fleet's own
   `auth.users` — the two are not guaranteed to match and, per this
   incident, sometimes don't.

## Snapshots

- `docs/schema-snapshots/2026-07-28-pre-fleet-equipment.md` — full column/
  constraint/RLS dump of `businesses`, `profiles`, `fleet_business_members`
  taken immediately before this deployment touched anything.
