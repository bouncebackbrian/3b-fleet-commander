# Dump Truck Mode — Build Summary & Handoff

Status: **Phase 1 (Foundation) + Phase 2 (Driver Mode) + Phase 3 (fuel/
mileage/receipts + driver hours portal) complete.** Payroll approval,
billing/broker, live dispatch view, and reports (spec §11–§13, §18) are
**not built** — see [Known Limitations](#known-limitations).

This scope was agreed with the requester up front, phase by phase: build a
real, working vertical slice end-to-end (schema → API → driver UI) rather
than a thin layer across every phase at once.

---

## 0. Phase 3 — What Changed

Added on top of the Phase 1+2 foundation (§1–§10 below still describe that
work and remain accurate):

- **Fuel entries** (spec §9): full capture (vendor, odometer, fuel type,
  gallons, price/gal, total, tax, payment method, full-tank flag, notes),
  receipt photo through the existing private `fleet-dt-documents` pipeline
  (file-hash duplicate detection reused as-is), and OCR pre-fill via the
  **existing** `/api/scan-expense` endpoint (Claude vision) — no new AI
  endpoint was built. OCR results populate the form; the driver must review
  and confirm before saving (`driver_verified`).
- **Mileage validation** (spec §9): miles/MPG/cost-per-mile computed from
  the vehicle's prior fuel-entry odometer reading; decreasing-odometer and
  unrealistic-mileage-jump flags are computed and surfaced as warnings —
  never block the save.
- **Load tickets** (spec §7/§9): a driver can now photograph a scale or
  delivery ticket and attach it — with a ticket number — to a specific load
  cycle (`fleet_dt_load_cycles.scale_ticket_doc_id` /
  `delivery_ticket_doc_id` / `ticket_number`, columns that existed since
  Phase 1 but were unused until now).
- **Driver Hours Portal** at `/driver/hours` (spec §10): current/previous
  week, current/previous pay period (see scope note below), and custom-range
  views; a daily-detail table and range summary computed entirely from
  Phase 1/2 data (events, drive segments, vehicle custody, load cycles) —
  no payroll dependency for the time/operational figures.
- **Driver Personal Records CSV export** (spec §10): "Export My Records"
  produces a detail CSV (one row per shift) and a summary CSV, both headed
  with generation time, selected range, and an explicit "estimates only, not
  a pay stub" notice. Every export writes an audit row to the new
  `fleet_dt_driver_record_exports` table (driver, tenant, range, row count,
  timestamp) before the file streams back — nothing is publicly cached.
- **Minimal pay policy** (spec §10's seed example): a business-configurable
  single hourly rate + daily-overtime-threshold + multiplier
  (`fleet_dt_pay_policies`, defaulting to the spec's own $32/hr, 8hr, 1.5×
  example when unset), editable from `/admin/dump-truck` (owner/admin only).
  This powers the "Estimated Gross Earnings" column — **it is explicitly not**
  the multi-rate-type engine (per-load/per-mile/per-ton/percentage/
  detention/minimum-guarantee/weekly-OT/double-time) spec §10 "Pay Rules"
  and the Admin Payroll Portal (§11) describe. See Known Limitations.
- **RLS gap fix**: while building the hours portal's correction-request
  flow, found that the Phase 1 `fleet_dt_events` insert policy blocked
  drivers from firing `correction_requested` on a shift they had already
  submitted — exactly the shifts a driver would need to dispute. Migration
  `20260728_fleet_dt_events_correction_policy.sql` carves out that one event
  type; every other event type keeps the original open-shift-only
  restriction. The matching server-side state-machine gate
  (`recordEvent()`) was patched the same way.

New routes:

| Route | Purpose |
|---|---|
| `/driver/hours` | Weekly/pay-period hours portal + CSV export |
| `/api/fleet/dump-truck/fuel` | Create/list fuel entries (multipart, optional receipt) |
| `/api/fleet/dump-truck/load-cycles` | List a shift's load cycles |
| `/api/fleet/dump-truck/load-cycles/[id]/ticket` | Attach a scale/delivery ticket |
| `/api/fleet/dump-truck/hours` | Hours summary JSON for a date range |
| `/api/fleet/dump-truck/hours/export` | Driver Personal Records CSV (detail/summary) |
| `/api/fleet/dump-truck/pay-policy` | Get/set the minimal hourly+OT policy (owner/admin write) |

New migrations, applied after the three Phase 1/2 migrations:

4. `20260728_fleet_dt_fuel_hours.sql` — `fleet_dt_fuel_entries`,
   `fleet_dt_pay_policies`, `fleet_dt_driver_record_exports`, RLS on all three.
5. `20260728_fleet_dt_events_correction_policy.sql` — the RLS fix above.

**Update, same day:** all five migrations were subsequently applied to the
live "Fleet Commander" Supabase project (`goqzhdrmrdlkchmwfiur`) as part of
a production deployment — see the new §3 "Deployment Status" below, which
also covers a schema-drift discovery (`fleet_equipment` didn't exist in
production) and two more migrations that resulted from it. This section's
original text is left as written at the time for the record; §3 is the
current source of truth on what's actually live.

New tests: `fuel.test.ts` (11), `hours.test.ts` (14), `csv.test.ts` (3) —
**90/90 vitest tests passing** total (was 60 after Phase 1+2).

---

## 1. What Was Built

- Full Supabase schema for the dump-truck operational domain: sites, jobs,
  shifts, append-only events, vehicle custody, drive segments, load cycles,
  inspections (with versioned templates), defects, documents, incidents,
  corrections. RLS on every table.
- A pure, unit-tested driver-flow state machine, drive-segment pairing,
  geofence matching, offline durable queue, and navigation link builder
  (`src/lib/dumpTruck/*`, 60 passing vitest tests).
- Server-side services + API routes wired through the existing
  `requireFleetAuth()` / `fleetServiceClient` pattern (no new auth system).
- A full iPad-landscape Driver Mode cockpit at `/driver/dump-truck`: clock-in
  → truck pickup → pre-trip → depart yard → arrive/load/leave pickup →
  arrive/dump/leave dump → repeat loads → arrive yard → post-trip → drop-off
  → clock-out → submit day, plus delay/note/photo/ticket/defect/incident
  quick actions, an offline queue with sync status, and per-site Navigate
  (Google Maps / Apple Maps / Trucker Path / copy) buttons.
- A minimal `/admin/dump-truck` screen to create sites and jobs so the
  driver flow is testable end-to-end.

## 2. Routes / Screens Added

| Route | Purpose |
|---|---|
| `/driver/dump-truck` | Driver Mode cockpit (iPad landscape) |
| `/admin/dump-truck` | Minimal site/job setup (dispatcher+) |
| `/api/fleet/dump-truck/context` | Driver bootstrap (shift, sites, jobs, defects, timeline) |
| `/api/fleet/dump-truck/shifts` | Clock in |
| `/api/fleet/dump-truck/shifts/[id]/submit` | Submit day |
| `/api/fleet/dump-truck/events` | Record any operational event (idempotent) |
| `/api/fleet/dump-truck/inspections` | Start pre-trip/post-trip |
| `/api/fleet/dump-truck/inspections/[id]` | Complete pre-trip/post-trip |
| `/api/fleet/dump-truck/documents` | Upload photo/ticket/receipt |
| `/api/fleet/dump-truck/incidents` | Driver incident report |
| `/api/fleet/dump-truck/defects` | Standalone defect report |
| `/api/fleet/dump-truck/sites`, `/jobs`, `/equipment`, `/drivers` | Admin CRUD/reads |

Both routes are registered in the app's two live navigation systems
(`src/components/layout/Sidebar.tsx` and `src/lib/userMode.ts`) and added to
the protected-route list in `src/middleware.ts`. Note: `src/config/navConfig.ts`
also received an entry for consistency, but that file is pre-existing
forward-looking scaffolding not yet wired into any rendered component —
same as its neighbors.

## 3. Database Migrations — Deployment Status

**Status as of 2026-07-28: applied and verified on the live "Fleet
Commander" Supabase project (`goqzhdrmrdlkchmwfiur`).** This section
documents what was actually done and how it was verified — not a plan, an
after-the-fact record.

### What happened

The project was found paused (`INACTIVE`) and was restored
(`mcp__Supabase__restore_project`) before any of this work. Applying the
five Dump Truck Mode migrations then surfaced real schema drift: the live
database's applied-migration history stopped in early June, well before
several migration files that exist in this repo — most critically,
**`fleet_equipment` did not exist at all**, despite every Dump Truck Mode
table foreign-keying trucks/trailers to it, and despite a full historical
migration for it sitting unapplied in `supabase/migrations/20260623_fleet_equipment.sql`.
Live `profiles`/`businesses` also don't match the columns
`identity-registry.ts` (existing repo code) assumes. Full detail, and what
remains as tracked follow-up work, is in **`docs/SCHEMA_RECONCILIATION.md`**
— read it before assuming any identity/business column not listed here
exists in production.

Given that discovery, the approved path was a **minimal, scope-limited
fix** — not a backfill of the full unapplied migration history — plus
adapting Dump Truck Mode's code to the live schema instead of the schema
its files were originally written against.

### Migrations applied, in order

1. `20260728_fleet_equipment_minimal.sql` — **new**, added to close the gap
   above. A deliberately minimal, self-contained `fleet_equipment` table
   (`id`, `business_id`, `unit_number`, `equipment_type`, `status`, `vin`,
   `license_plate`, `notes`) — only what Dump Truck Mode's code reads. Not
   the full historical equipment registry (maintenance schedules, odometer
   logs, DOT/MC numbers) — that remains a reconciliation-project decision.
2. `20260727_fleet_dt_core.sql`
3. `20260727_fleet_dt_inspections_docs.sql`
4. `20260727_fleet_dt_seed_templates.sql`
5. `20260728_fleet_dt_fuel_hours.sql`
6. `20260728_fleet_dt_events_correction_policy.sql`
7. `20260728_fleet_dt_lock_down_helper_functions.sql` — **new**, hardening:
   the security advisor flagged `fleet_dt_has_role`/`fleet_dt_is_member`
   (both `SECURITY DEFINER`) as directly callable by the unauthenticated
   `anon` role via RPC. Revoked `EXECUTE` from `public`/`anon`, kept it for
   `authenticated`/`service_role` (required for RLS policies to evaluate).
   Practical risk was low (the functions only return a boolean gated on
   `auth.uid()`, which is null for anon) but there was no reason to leave
   it open.
8. `20260728_fleet_dt_jobs_dispatch_fields.sql` — **new**, adds 13 nullable
   columns to `fleet_dt_jobs` (`load_time`, `order_date`, `delivery_date`,
   `cosignee_name`, `ordered_by`, `contact_phone`, `truck_type`,
   `directions`, `travel_time_minutes`, `fuel_surcharge`, `price_per_hour`,
   `price_per_ton`, `material_cost`) so the admin Jobs form can capture
   everything on the real paper dispatch ticket the business uses today,
   not just the fields Dump Truck Mode originally needed operationally.

Two files also touched code, not schema, to match the live database:
`src/lib/fleet/dumpTruck/shared.ts` (`getDriverBusinessMeta`) and
`src/lib/fleet/dumpTruck/jobs.ts` (`listDrivers`) now query
`profiles.full_name` and `businesses.name` instead of the non-existent
`first_name`/`last_name`/`company_name` columns. 3B Business ID
(`threebBizId`) is hard-coded `null` in every Dump Truck Mode output —
never fabricated — because no such column exists in production yet.

### How it was verified (all before merging to `main`)

- **Schema snapshot taken first**: `docs/schema-snapshots/2026-07-28-pre-fleet-equipment.md`
  — full column/constraint/RLS dump of `businesses`, `profiles`,
  `fleet_business_members` before any DDL, for future reconciliation.
- **Every migration's `apply_migration` call returned success** — checked
  individually, not assumed from a batch.
- **`mcp__Supabase__list_migrations` confirms all 7 are recorded** as
  applied, in order, after the pre-existing June history.
- **Security advisor run twice** (before and after the lock-down
  migration): confirmed every pre-existing `WARN`/`ERROR` finding
  (permissive `USING (true)` policies on `fleet_loads`, `delays`,
  `attachments`, etc.) predates this session and was not introduced or
  worsened by it — i.e., **no existing RLS policy was weakened**. The two
  new-function findings were fixed.
- **Full transactional dry-run**: a single `BEGIN … ROLLBACK` block created
  one truck, one trailer, one yard/pickup/dump site, one job, one shift,
  and walked the *entire* clock-in → truck-pickup → pre-trip → load cycle
  (loading/unloading, drive segments empty+loaded+empty) → post-trip →
  truck-drop-off → clock-out → submit-day → post-submission
  `correction_requested` sequence — plus a document/ticket attach, a
  standalone defect, a fuel entry, an incident, a dispatcher correction, a
  pay policy row, and an export audit row. All 16 tables' foreign keys,
  check constraints, and unique constraints resolved correctly together.
  Rolled back and confirmed **zero residual rows** in any new table
  afterward (row counts re-checked post-rollback).
- **Exact CSV/query column lists checked directly**: `profiles.full_name`,
  `profiles.three_b_id`, `businesses.name`, `fleet_equipment` columns, and
  `fleet_dt_shift_summary` (the view) all selected without error against
  the live schema.
- **Storage bucket confirmed**: `fleet-dt-documents` exists, `public: false`.
- Existing tables were never `ALTER`ed or `DROP`ped by this work, so
  existing Fleet Commander functionality's schema is provably unchanged —
  confirmed by re-checking row counts on `businesses`/`profiles`/
  `fleet_business_members`/`fleet_loads` matched the pre-DDL snapshot.

### Not verified

- **No live UI/browser test against the deployed app** — this was schema
  and SQL-level verification via the Supabase MCP tools, not a logged-in
  end-to-end click-through of `/driver/dump-truck` in a browser. See §11 for
  what a real pre-release check should still include.
- **RLS was reviewed by policy text and the advisor tool, not by
  attempting cross-tenant access as two real authenticated users** — the
  dry-run above ran as service role (bypasses RLS by design, like the SQL
  editor), which validates schema/constraint correctness but not RLS
  enforcement itself.

Also fixed, unrelated but blocking (carried over from Phase 1+2, still true):
`tsconfig.json` was type-checking Deno edge functions under
`supabase/functions/` as part of the Next.js build (pre-existing bug, now
excluded), and `src/lib/stripe.ts` pinned an API version string that no
longer matched the installed `stripe` package type (bumped
`2026-05-27.dahlia` → `2026-06-24.dahlia`).

## 4. Existing Systems Reused

- **Auth/tenant/role**: `requireFleetAuth()`, `fleetServiceClient`, `canWrite()`
  from `fleet-auth-guard.ts` — no new auth path.
- **Identity**: `profiles.three_b_id` (3B ID), `businesses` / `fleet_business_members`
  (3B Business ID + tenant roles) — no duplicate identity tables.
- **Trucks/trailers**: `fleet_equipment`. Correction (2026-07-28): this table
  did not actually exist in the live database when first written — see §3
  "Deployment Status" and `docs/SCHEMA_RECONCILIATION.md`. A minimal version
  was added as part of deploying Dump Truck Mode rather than a new
  Dump-Truck-specific vehicle table, keeping the "reuse, don't duplicate"
  intent even though the thing being reused had to be created first.
- **Audit logging**: `src/lib/fleet/audit.ts` → `fleet_audit_logs`, called
  from every mutation.
- **Toast/offline-banner UI patterns**: `useToast`, `useOnlineStatus`.
- **Migration/RLS conventions**: matched existing `fleet_*` tables (`set_updated_at`
  trigger, `fleet_business_members`-based RLS, `notify pgrst, 'reload schema'`).
- **OCR** (Phase 3): reused the existing `/api/scan-expense` Claude-vision
  endpoint as-is for fuel receipt reading — no new AI/OCR endpoint was built.
- **Receipt storage + duplicate detection** (Phase 3): fuel/ticket photos go
  through the same `uploadDocument()` / `fleet_dt_documents` / file-hash-dedupe
  path Phase 2 built for inspection photos and generic tickets.

## 5. New Environment Variables

None. Dump Truck Mode uses the same `NEXT_PUBLIC_SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` / Core_Eco auth vars already documented in
`.env.example`.

## 6. Test Results

- `npm run test` (vitest): **90/90 passing** (was 60 after Phase 1+2, +30
  from Phase 3) — state machine transitions, drive-segment pairing/duration/
  mileage/exception handling, geofence matching, offline-queue dedupe/
  backoff/retry, navigation link building, inspection validation +
  defect-severity dispatch blocking, fuel efficiency/validation flags,
  hours category-time aggregation + regular/OT split + daily-row assembly +
  range summary + week/pay-period range resolution, CSV serialization/escaping.
- `npx tsc --noEmit`: clean (zero errors in any file touched this session).
- `npm run build`: **succeeds** (Next.js production build; verified again
  after every Phase 3 file was added, using placeholder Supabase env vars
  only to satisfy static-generation — see §3 for why that does not mean
  anything was deployed).
- No integration/RLS/E2E tests were added — see limitations below; this
  environment has no live Supabase project or browser test runner to run
  them against. This includes the RLS fix in migration 5 above — it has not
  been exercised against a real database.

## 7. Known Limitations

Everything the master prompt calls out as "do not claim completion if
unfinished" applies here — being explicit, and updated for Phase 3:

**Still not built (unchanged from Phase 1+2):**
- **Payroll approval workflow, Admin Payroll Portal (§11), billing/broker
  engine (§12), live dispatch map (§13), fleet-wide reports (§18) — not
  built.**
- **The 3B Business ID and full identity model are not actually in the
  production database** — see `docs/SCHEMA_RECONCILIATION.md`. This was
  discovered, not introduced, by this work, but it means "3B Business ID"
  is currently a TypeScript-only concept in `identity-registry.ts`, not a
  real column. Dump Truck Mode leaves it `null` everywhere rather than
  fabricating one.
- **Side-effect writes are not one DB transaction.** Recording an event and
  its derived custody/segment/load-cycle rows (and now fuel entries/ticket
  attachments) are sequential Supabase calls, not a single atomic RPC. A
  Postgres RPC function is the right hardening step before production load.
- **No RLS/tenant-isolation automated tests**, including the Phase 3 fuel/
  pay-policy/export tables and the correction-policy RLS fix — nothing in
  this session executed SQL against a live project (see §3).
- **Admin location directory is minimal** — no geocoding, reverse-geocoding,
  map pin-drop, verification workflow, or restriction/operating-hours
  editors (spec §6's full `/admin/locations` experience).
- **Trucks/trailers have no admin UI in this repo at all** (pre-existing
  gap) — created directly in Supabase.
- **No push/Teams/SMS notification wiring** for incidents or safety-critical
  defects.
- **Dispatcher-facing correction review UI does not exist.** A driver can
  fire `correction_requested` (now fireable on closed shifts too, and
  surfaced with a request form on `/driver/hours`); there is still no screen
  for dispatch/admin to review it and write a `fleet_dt_corrections` row.

### 7.1 Requested end-to-end driver/dispatch flow (2026-07-29, not built)

The intended full flow, as described by the person running the live trial —
recorded precisely so a future session has a real spec instead of
re-deriving it. Status of each piece as of tonight:

1. **Driver logs in and reviews today's assigned job** — pickup/dump site,
   material — as a step *before* clocking in. **Partially there**: this
   info already renders in the driver cockpit's left rail whenever a job is
   assigned, clocked in or not. **Missing**: there is no discrete "confirm
   today's order" screen/acknowledgment gate — it's ambient info, not a
   step the driver affirmatively confirms.
2. **Clock In** — first mandatory step, timestamps arrival. **Built.**
3. **Pre-trip inspection** — safety-critical/OOS defects block progress;
   anything else does not. **Built.**
4. **On a clean (or acceptably-defected) pre-trip, it gets sent to
   admin/dispatch and the day starts.** **Not built.** Completing a
   pre-trip today just writes rows to `fleet_dt_inspections`/
   `fleet_dt_defects` — nothing notifies anyone, and there is no
   dispatcher-facing screen to see it even on request.
5. **Dispatch/admin, when creating a job's pickup/dump sites, capture as
   much address/notes detail as possible, and Google Maps / Apple Maps /
   Trucker Path launch links auto-generate from that address for the
   driver.** **Already built** (Phase 1 `src/lib/dumpTruck/navigation.ts` +
   `NavigateSheet`) — works today from whatever address or coordinates a
   site has on file; no new work needed here. (Live example of the gap this
   closes: the "3D Dayton" pickup site had only a name on file with no
   address, so Navigate produced nothing for it — fixed tonight using the
   real address off a Dayton Materials scale ticket photo, `20 Ricci Road,
   Dayton, NV 89403`.)
6. **End-of-shift post-trip report, with documentation attachable, sent to
   admin/business/dispatch.** **Partially there**: post-trip inspection
   (photos, defects, notes) and Submit Day already exist and write real
   rows. **Missing**: same gap as #4 — nothing notifies anyone, and there's
   no admin screen to review a submitted day's post-trip report.

**The real remaining gap across #4 and #6 is one piece of missing
infrastructure, not two**: a notification channel (email/SMS/push/Teams —
undecided) plus an actual dispatcher/admin review screen for pre-trip and
post-trip reports. Both already have real data sitting in
`fleet_dt_inspections`/`fleet_dt_defects`/`fleet_dt_shifts` waiting to be
surfaced — this is a "build the screen and the notify step," not a data
model problem. Deliberately not started tonight (very late in a long live
session, and it needs real product decisions — which channel, who receives
it, what the review screen looks like — rather than being guessed at).
  The table and RLS policy exist and are ready for that screen.

**New in Phase 3, scoped down from the full spec — read this before treating
the hours portal or fuel numbers as authoritative:**
- **Pay policy is single-rate hourly + daily-OT only.** No per-load,
  per-mile, per-ton, percentage, flat-day, weekly-overtime, double-time,
  detention, or minimum-daily-guarantee rate types (spec §10 "Pay Rules").
  No rate-type mixing, no versioned/snapshotted policy history, no
  effective-dating beyond the single current row per business.
- **"Pay period" is not a real, configurable entity.** `current_pay_period`
  and `previous_pay_period` are literal aliases for the calendar week
  (Monday–Sunday) in `src/lib/dumpTruck/hours.ts`. There is no
  semi-monthly/biweekly/custom pay-period concept anywhere in the schema.
- **No payroll approval, ever, in this build.** `payrollApprovedGrossEarnings`
  is hard-coded `null` and `payrollApprovalStatus` is hard-coded
  `'not_implemented'` in every row and every CSV export — there is no code
  path that could set them to anything else.
- **Date-range filtering uses UTC calendar-day boundaries**, not a per-driver
  or per-business local timezone. A shift that starts near midnight local
  time can land in the "wrong" week if the business isn't UTC-aligned.
- **"Miles since prior odometer" is fuel-entry-to-fuel-entry only** — not
  blended with vehicle-custody start/end odometer readings, so a shift with
  custody odometer but no fuel purchase won't feed the next fuel entry's
  mileage calculation.
- **Fueling duration is not auto-tracked.** Logging a fuel entry (the
  dollars/gallons record) does not fire `fuel_stop_started`/
  `fuel_stop_ended` timing events, so the hours portal's "Fueling Hours"
  column will read 0 unless a driver separately fires those events (the
  event types exist from Phase 2 but nothing in the UI triggers them).
- **Paid vs. unpaid break classification does not exist.** All
  `break_started`/`break_ended` time is reported as "Unpaid Break Hours";
  "Paid Break Hours" is hard-coded 0 in every row.
- **No "Financial OS" backend to link fuel entries into.** The only
  pre-existing "expense system" in this repo (`ExpenseScanSheet.tsx`) is
  itself just a `localStorage` array (`3b-expenses`), not a real backend —
  there was nothing durable to integrate with, so fuel entries are not
  cross-linked to it.
- **Fuel efficiency / inspection-defect / broker-billing reports (spec §18)
  were not built.** The underlying data (fuel entries, MPG, cost/mile) exists
  and is queryable, but no report screen surfaces it yet.
- **CSV columns for rate types this build doesn't support are either omitted
  or explicitly labeled unavailable** (e.g. "Payroll-Approved Gross
  Earnings" always reads `N/A — payroll approval not implemented`) rather
  than being silently left blank with no explanation.

## 8. Deployment Steps

**Status: done, for the `goqzhdrmrdlkchmwfiur` ("Fleet Commander") Supabase
project, as of 2026-07-28** — see §3 for exactly what was applied and how
it was verified. If deploying Dump Truck Mode to a *different* Supabase
project, redo these steps there; nothing about this database-side work
carries over automatically:

1. Confirm `fleet_equipment` exists first — if not, apply
   `20260728_fleet_equipment_minimal.sql` (or a richer equipment migration,
   if the target project already has a fuller one — check before applying
   blindly, per `docs/SCHEMA_RECONCILIATION.md`).
2. Apply the 6 remaining migrations listed in §3, in order.
3. Regenerate TypeScript DB types if your workflow does so
   (`supabase gen types typescript`) — this build hand-wrote row mappers in
   `src/lib/fleet/dumpTruck/*.ts` rather than depending on generated types,
   so this is optional, not required.
4. Confirm the `fleet-dt-documents` Storage bucket was created
   (`select * from storage.buckets where id = 'fleet-dt-documents'`).
5. Deploy the app as usual (`npm run build`, Vercel or existing pipeline) —
   no new env vars needed.
6. `npm run test` in CI if you want the 90 unit tests gating merges.

### 8.1 Production merge — verified 2026-07-28

`claude/new-session-mgyqti` was fast-forward merged into `main`
(`37e86e6..a5252f6`) and pushed, triggering a Vercel production build for
`3b-fleet-commander` (deployment `dpl_GbJfcWuV4fxHnjUsiJQLi4B2m2Ad`, commit
`a5252f6`). What was actually verified, and how:

- **Build succeeded** — deployment `readyState: READY`, `target: production`,
  confirmed via the Vercel API (`get_project` / `list_deployments`).
- **Live at the production domain** — `fleet.bouncebackbrian.com` (the
  project's assigned production domain) now points at this deployment.
- **No runtime errors** — `get_runtime_errors` for the project returned zero
  errors in the 2 hours following the deploy.
- **Routes resolve, not 500** — `/driver/dump-truck`, `/admin/dump-truck`,
  and `/driver/hours` were each fetched directly against
  `fleet.bouncebackbrian.com` and returned HTTP 200, server-rendering the
  `/login` screen (expected — these routes require an authenticated session
  and correctly redirect rather than erroring).

What was **not** verified: an actual authenticated click-through of the
Dump Truck driver cockpit, admin setup screens, or hours portal in a real
browser session against the restored production database — no real user
credentials for the live `goqzhdrmrdlkchmwfiur` project were available in
this environment. The HTTP-level checks above confirm the deployment is
live, builds cleanly, and the routes are wired up and don't crash
pre-authentication; they do not confirm post-login UI behavior. Do a manual
sign-in smoke test before relying on this in the field.

## 9. Admin Setup Steps

1. Make sure at least one truck (`fleet_equipment`, `equipment_type` other
   than `trailer_dump`, `status = 'active'`) exists for the business.
2. Sign in as an owner/admin/dispatcher and open **Dump Truck Setup**
   (`/admin/dump-truck`).
3. Add a **yard** site, at least one **pickup** (or customer) site, and one
   **dump** (or disposal) site — lat/lng are optional but required for
   geofence auto-matching and Navigate buttons to work.
4. Add a job: job number, customer, driver, truck, pickup site, dump site.
5. (Optional) Scroll to **Driver Hours — Estimated Pay Policy** on the same
   page and set the business's hourly rate / daily OT threshold / OT
   multiplier — owner/admin only. Leave it unset to use the built-in
   $32/hr, 8hr, 1.5× default.
6. Have the driver open **Dump Truck** (`/driver/dump-truck`) on an iPad in
   landscape.

## 10. Driver Quick-Start

1. Tap **Clock In**, pick your truck (and trailer, if used) and yard.
2. Tap **Truck Picked Up**, enter starting odometer.
3. Tap **Start Pre-Trip**, work through the checklist, tap **Complete
   Pre-Trip**. A safety-critical or out-of-service defect will block the
   next step until dispatch resolves or overrides it.
4. Tap **Depart Yard** → drive → **Arrived Pickup** → **Start Loading** →
   **Loading Complete** → **Leave Pickup** → drive → **Arrived Dump** →
   **Start Unloading** → **Dumped** → **Leave Dump**.
5. From there, tap **Add Another Load** to loop back to pickup, or
   **Arrived Yard / End Location** when done for the day.
6. Use the right-rail quick actions any time: **Delay**, **Note**, **Photo**,
   **Load Ticket** (attach a scale/delivery ticket photo + number to a
   specific load), **Add Fuel** (scan a receipt for auto-fill, review, and
   save — gallons/price/total/odometer), **Defect**, **Incident**. Tap a
   site's **🧭 Navigate** button in the left rail to launch Google Maps /
   Apple Maps / Trucker Path, or copy the address/coordinates.
7. Back at the yard: **Start Post-Trip** → complete checklist → **Truck
   Dropped Off** (ending odometer, condition, fuel, keys) → **Clock Out** →
   **Submit Day**.
8. If you lose signal mid-shift, keep tapping — events queue locally (you'll
   see a sync count in the top bar) and send automatically once you're back
   in range. Clock-in, inspections, fuel entries, ticket uploads, and
   submit-day need a connection.
9. Tap **📊 Hours** (top bar) any time to open **My Hours**
   (`/driver/hours`): pick Current/Previous Week, Current/Previous Pay
   Period (currently an alias for the calendar week — see Known
   Limitations), or a custom range. Review daily hours, tap **Request
   Correction** on any shift (including already-submitted ones) to flag an
   issue for dispatch/payroll, and use **Export My Records** for a detail or
   summary CSV. All dollar figures shown are estimates, not a pay stub.
