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

New migrations (apply after the three Phase 1/2 migrations, same caveat —
**not applied to any live Supabase project by this session**, see §3 below):

4. `20260728_fleet_dt_fuel_hours.sql` — `fleet_dt_fuel_entries`,
   `fleet_dt_pay_policies`, `fleet_dt_driver_record_exports`, RLS on all three.
5. `20260728_fleet_dt_events_correction_policy.sql` — the RLS fix above.

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

## 3. Database Migrations Added

Applied in this order (`supabase/migrations/`):

1. `20260727_fleet_dt_core.sql` — sites, jobs, shifts, events, vehicle
   custody, drive segments, load cycles, RLS, `fleet_dt_shift_summary` view.
2. `20260727_fleet_dt_inspections_docs.sql` — documents, inspection
   templates/versions/items, inspections, defects, incidents, corrections,
   private `fleet-dt-documents` Storage bucket + RLS.
3. `20260727_fleet_dt_seed_templates.sql` — the default Dump Truck pre-trip
   (47 items) and post-trip (16 items) checklist templates from spec §8.
4. `20260728_fleet_dt_fuel_hours.sql` — `fleet_dt_fuel_entries`,
   `fleet_dt_pay_policies`, `fleet_dt_driver_record_exports`, RLS on all three.
5. `20260728_fleet_dt_events_correction_policy.sql` — fixes the
   `fleet_dt_events` insert policy so a driver's `correction_requested`
   event can still fire after their shift is submitted/locked (every other
   event type keeps the original open-shift-only restriction).

**None of these five migrations have been applied to any live Supabase
project by this session — verified false, not just unstated.** This
environment has no Supabase credentials or CLI link configured
(`SUPABASE_SERVICE_ROLE_KEY` etc. are unset placeholders used only to get
`next build` to complete its static-generation pass). Nothing in this
session ran `supabase db push`, called the Supabase MCP `apply_migration`
tool, or executed SQL against `goqzhdrmrdlkchmwfiur` or any other project.
Apply all five migrations, in the numeric order above, via `supabase db
push` or the SQL editor before testing against a real database — Phase 3's
API routes will fail at runtime (relations do not exist) until that happens.

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
- **Trucks/trailers**: `fleet_equipment` (already had `trailer_dump` and
  `straight_truck`/`tractor` types) — no new vehicle table.
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

1. Apply all five migrations above, in numeric order, to the Fleet Supabase
   project. **This has not been done by this session — do it before
   expecting any Dump Truck Mode route to work against a real database.**
2. Regenerate TypeScript DB types if your workflow does so
   (`supabase gen types typescript`) — this build hand-wrote row mappers in
   `src/lib/fleet/dumpTruck/*.ts` rather than depending on generated types,
   so this is optional, not required.
3. Confirm the `fleet-dt-documents` Storage bucket was created by the second
   migration (`select * from storage.buckets where id = 'fleet-dt-documents'`).
4. Deploy the app as usual (`npm run build`, Vercel or existing pipeline) —
   no new env vars needed.
5. `npm run test` in CI if you want the 60 unit tests gating merges.

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
