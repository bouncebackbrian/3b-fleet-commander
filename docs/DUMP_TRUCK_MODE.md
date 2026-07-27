# Dump Truck Mode — Build Summary & Handoff

Status: **Phase 1 (Foundation) + Phase 2 (Driver Mode) complete.** Phases 3–6
(fuel/OCR, payroll, billing/broker, dispatch live view + reports + full test
suite) are **not built** — see [Known Limitations](#known-limitations).

This scope was agreed with the requester up front: build a real, working
vertical slice end-to-end (schema → API → driver UI) rather than a thin
layer across all six phases.

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

**These migrations were written to the repo but not applied to the live
Supabase project (`goqzhdrmrdlkchmwfiur`)** — this session has no Supabase
credentials. Apply them via `supabase db push` or the SQL editor, in the
numeric order above, before testing against a real database.

Also fixed, unrelated but blocking: `tsconfig.json` was type-checking Deno
edge functions under `supabase/functions/` as part of the Next.js build
(pre-existing bug, now excluded), and `src/lib/stripe.ts` pinned an API
version string that no longer matched the installed `stripe` package type
(bumped `2026-05-27.dahlia` → `2026-06-24.dahlia`). Both were breaking
`npm run build` before this session started.

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

## 5. New Environment Variables

None. Dump Truck Mode uses the same `NEXT_PUBLIC_SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` / Core_Eco auth vars already documented in
`.env.example`.

## 6. Test Results

- `npm run test` (vitest): **60/60 passing** — state machine transitions,
  drive-segment pairing/duration/mileage/exception handling, geofence
  matching, offline-queue dedupe/backoff/retry, navigation link building,
  inspection validation + defect-severity dispatch blocking.
- `npx tsc --noEmit`: clean (zero errors in any file touched this session).
- `npm run build`: **succeeds** (Next.js production build, all 53 routes
  including the 13 new API routes and 2 new pages compile and prerender).
- No integration/RLS/E2E tests were added — see limitations below; this
  environment has no live Supabase project or browser test runner to run
  them against.

## 7. Known Limitations

Everything the master prompt calls out as "do not claim completion if
unfinished" applies here — being explicit:

- **Fuel/receipts/OCR (§9), payroll engine (§10–11), billing/broker engine
  (§12), CSV exports (§10, §11, §12), live dispatch map (§13) — not built.**
  The Fuel quick action is present in the UI but disabled ("Coming in
  Phase 3").
- **Offline coverage is partial.** The durable offline queue covers in-shift
  operational events (the primary sequence + delay/note/break/fuel-stop
  quick actions). Clock-in, starting/completing inspections, document
  uploads, and submit-day require connectivity in this build.
- **Side-effect writes are not one DB transaction.** Recording an event and
  its derived custody/segment/load-cycle rows are sequential Supabase calls,
  not a single atomic RPC. A crash mid-sequence could leave a segment or
  load cycle out of sync with its event — acceptable for a v1 vertical
  slice, but a Postgres RPC function is the right hardening step before
  production load (tracked for Phase 6).
- **No RLS/tenant-isolation automated tests.** RLS policies exist and follow
  the same pattern as reviewed/working tables, but nothing in this session
  executed them against a live project.
- **Admin location directory is minimal** — `/admin/dump-truck` is a plain
  form + table (name, address, lat/lng, geofence radius). No geocoding,
  reverse-geocoding, map pin-drop, verification workflow, or restriction/
  operating-hours editors (spec §6's full `/admin/locations` experience).
- **No driver hours portal (`/driver/hours`) or personal CSV export.**
  Deferred with payroll — pay figures can't be estimated without the pay
  policy engine, and an hours-only export without payroll context was
  judged lower value than getting the core operational flow solid.
- **Trucks/trailers have no admin UI in this repo at all** (pre-existing
  gap, not introduced here) — they're created directly in Supabase.
- **No push/Teams/SMS notification wiring** for incidents or safety-critical
  defects — they're logged and flagged (`admin_notified` stays `false`)
  but nothing dispatches an alert yet.
- **Correction flow is driver-request-only.** A driver can fire
  `correction_requested` (an event, visible in the timeline); there's no
  dispatcher-facing UI yet to review/action it into a `fleet_dt_corrections`
  row. The table and RLS policy exist and are ready for that screen.

## 8. Deployment Steps

1. Apply the three migrations above, in order, to the Fleet Supabase project.
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
5. Have the driver open **Dump Truck** (`/driver/dump-truck`) on an iPad in
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
   **Ticket**, **Defect**, **Incident**. Tap a site's **🧭 Navigate** button
   in the left rail to launch Google Maps / Apple Maps / Trucker Path, or
   copy the address/coordinates.
7. Back at the yard: **Start Post-Trip** → complete checklist → **Truck
   Dropped Off** (ending odometer, condition, fuel, keys) → **Clock Out** →
   **Submit Day**.
8. If you lose signal mid-shift, keep tapping — events queue locally (you'll
   see a sync count in the top bar) and send automatically once you're back
   in range. Clock-in, inspections, and submit-day need a connection.
