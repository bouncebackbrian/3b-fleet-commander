# ADR-010 — Fleet Commander: Unify Trucking-Type Systems

## Status
PROPOSED — data-model design only. No migration applied. Pending Brian Martin review.

## Date
2026-08-11

## Author
Prepared for founder review (Claude Code session, founder-directed — discovered live during
Cal-Neva Trucking shift logging on 2026-08-11, see Context).

## Depends On
- ADR-007 (Sprint 0 Canonical Decisions) — general multi-tenant/business-scoping precedent.

## Context

While logging today's Cal-Neva Trucking (business `34f00ed3-1759-4534-afad-34b6b000792f`)
dump-truck shift live against the Fleet Commander Supabase project
(`goqzhdrmrdlkchmwfiur`), the founder pulled up the driver app's "Command Center" screen
and found it showing a stale, unrelated load (`SMOKE-001`, Memphis TN → Nashville TN,
dated 2026-06-08, marked "Phase 2 smoke test — delivered"). Investigation found this is
not a caching bug — it's two disconnected systems living in the same database:

1. **`fleet_dt_*` (Dump Truck module)** — the system actively used today. Properly
   multi-tenant: every table hangs off `business_id`, RLS enforced via
   `fleet_dt_has_role(business_id, roles)` against `fleet_business_members` /
   `fleet_role_portal_map` / `fleet_member_portal_grants`. Covers shifts, vehicle
   custody, pretrip/posttrip inspections, defects, jobs, load cycles, sites, drive
   segments, fuel entries, documents, driver-record exports, 1099 filings.

2. **`loads` / `fleet_missions` / `fleet_active_missions` (OTR long-haul module)** — an
   older, `user_id`-scoped load/settlement tracker (broker, dispatcher, cpm_rate,
   deadhead_miles, tonu_rate, lumper_cost, detention_pay, reload strength, overnight
   parking). **Has no `business_id` column at all.** The only real row is tied to
   `user_id: 7f5b2267-8c43-4e76-a913-5106445c5344`.

That `user_id` turned out to be a **second `profiles` row also named "Brian Martin"**,
distinct from `bf568e3f-af39-4487-9649-953ddefd1216` (the driver identity every Cal-Neva
DT shift today is under). This was flagged earlier in the session as a possible duplicate
data-entry bug — it is not. It is the same person represented under two different,
never-merged products: an early solo owner-operator OTR prototype, and the current
multi-tenant Fleet Commander DT module.

The founder's direction: **make this one system with different options depending on
trucking type**, rather than two disconnected schemas competing for the same driver app
screen.

## Decision (proposed — not yet applied)

1. **Keep `fleet_dt_*` as the canonical multi-tenant core pattern.** It already has the
   right shape (business-scoped, RLS via role/portal grants, audit-logged via
   `fleet_audit_logs` per ADR-006). Do not redesign it to accommodate OTR fields —
   dump-truck (pit/site/scale-ticket/axle) and OTR long-haul (broker/lane/deadhead/
   settlement) data don't overlap enough to merge into one flat schema.

2. **Classify operation type at the truck (`fleet_equipment`) level, not the business
   level.** A business can run mixed equipment (e.g., dump trucks and a long-haul
   tractor). Add `fleet_equipment.operation_type` (`'dump_truck' | 'otr_ftl' | 'otr_ltl'
   | ...`, extensible) so the app can pick the correct workflow/screen set per truck
   without assuming one type per company.

3. **Build a sibling `fleet_otr_*` module mirroring the `fleet_dt_*` pattern** — business-
   scoped, same RLS/audit infrastructure, tables for OTR jobs/loads/settlements carrying
   the broker/cpm/deadhead/lumper/detention fields currently orphaned in `loads`. Migrate
   the one real historical row (`load_number 0242109`, Billings MT → Goodyear AZ) into it
   once a business is assigned to that lane.

4. **Generalize the RLS role-check function** (`fleet_dt_has_role`) into a
   module-parameterized version (or a sibling `fleet_otr_has_role` sharing the same
   `fleet_role_portal_map` / `fleet_member_portal_grants` tables) so both modules use one
   permissions system instead of duplicating auth logic.

5. **Merge the duplicate "Brian Martin" identity.** Retire or merge
   `7f5b2267-8c43-4e76-a913-5106445c5344` into `bf568e3f-af39-4487-9649-953ddefd1216`
   (or the reverse — whichever is the properly onboarded, business-linked profile) so one
   person maps to one driver identity across both modules. Requires care: `profiles.id`
   is presumably an `auth.users` foreign key, so this may be an auth-level merge, not a
   simple row update.

6. **App-side:** the "Command Center" / driver-app screen (repo
   `bouncebackbrian/3b-fleet-commander`, not in this monorepo — not attached to this
   session) needs to route to the correct module's UI based on the active truck's
   `operation_type`, instead of unconditionally querying the legacy `loads` table. This
   ADR does not implement that change; it requires that repo attached in a follow-up
   session.

## Related findings (same session, DT module — separate from trucking-type unification)

These surfaced while confirming the Dump Truck Mode screen was reading live data
correctly (it is, once the correct job is selected in its dropdown). Not part of the
trucking-type decision above, but worth fixing in the same repo pass:

1. **`fleet_dt_jobs` has no `shift_id`.** Jobs link to `driver_id` and `truck_id` only,
   not to a specific shift/day. When a driver has more than one `status: active` job
   (e.g. today's `PO-26005` alongside a stale, never-closed `17019` from 2026-08-04), the
   app has no reliable way to know which job belongs to today's shift — it has to guess,
   and on 2026-08-11 it guessed wrong (defaulted to `17019` until manually switched).
   Recommend adding a shift-to-job link (either `shift_id` on `fleet_dt_jobs`, or a
   join table if a shift can span multiple jobs) so the driver app can resolve "today's
   job" deterministically instead of picking from all `active` jobs for the driver.

   **Founder's proposed UI fix (2026-08-11), on top of the schema fix above:** the Job
   field on the Dump Truck Mode screen should stop being an open dropdown over every
   `active` job. It's too easy to mis-tap and log events (times, tickets, defects) against
   the wrong job by accident — which is exactly what happened today before the mistake was
   caught. Instead:
   - The main screen should show a **current-job-only view** — once `shift_id` resolves
     which job is "today's," that's the only job selectable/displayed for logging, no
     dropdown browsing during normal operation.
   - Move full job browsing/history to a separate, explicit **"Review Jobs"** button/
     screen, clearly outside the event-logging flow, so looking something up can't
     accidentally become logging a timestamp against it.

2. **~~Dump Truck Mode's primary CTA button skips the "arrive" step~~ — CORRECTED
   2026-08-13, not a real bug.** Original finding, from a screenshot only: after
   `depart_dump`, the button read "Load [Material]" with no visible arrive step.
   With `bouncebackbrian/3b-fleet-commander` actually attached and read
   (`src/lib/dumpTruck/stateMachine.ts`, `actionLabels.ts`), the state machine is
   correct: `loading_started` only fires `from: ['at_pickup']`, which only reaches
   that state via `arrive_pickup`, and `arrive_pickup`'s label renders as
   `"Arrived at {pickupSiteName}"`, not `"Load {material}"` — that label is only
   reachable from `at_pickup` state, meaning arrival had already legitimately
   fired. The screenshot's true explanation is unresolved (likely the same job-
   default bug in finding #1 showing a stale flow state, or the driver having
   already tapped arrive before the screenshot), not a sequencing defect. 110/110
   existing tests pass and cover this path (`stateMachine.test.ts`,
   `actionLabels.test.ts`). No code change made for this finding — leaving it
   here so the original (wrong) claim isn't silently dropped from the record.

3. **Proposed: proactive "pit closing soon" driver alert (founder request, 2026-08-11).**
   `fleet_dt_sites.operating_hours` now has real close-time data (added this session for
   3D Dayton: 07:00-15:30 Mon-Fri). The driver needs a proactive nudge as close time
   approaches, plus an estimate of how many more loads are realistically gettable —
   accounting for the rule of thumb that you need to be in the yard 20-30 min before
   close to actually get loaded, not just arrive.
   - There's already a `fleet_alerts` table shaped for exactly this (title/body/
     tier/category/action_label, `acked`/`dismissed` workflow) but it's empty — nothing
     computes into it today.
   - This session did the calculation manually in chat as a proof of concept: using
     today's live `fleet_dt_load_cycles` timestamps, average cycle-time segments were
     derived (pit turnaround ~16 min, loaded transit pickup→dump ~37 min, dump turnaround
     ~18 min, empty return dump→pickup ~36 min ⇒ ~107 min full cycle), then projected
     forward against the site's close time and the 20-30 min buffer to estimate remaining
     feasible loads (worked correctly: flagged load #4 as comfortable, load #5 as a close
     call).
   - To make this real (not manual-in-chat): a scheduled job (Supabase Edge Function on a
     timer, or computed on each `arrive`/`depart` event write) should compute, per active
     shift: `site.operating_hours` close time − 20-30 min buffer, minus a rolling average
     of that driver/truck's own cycle-time segments today (falling back to a
     site/material default when there's no same-day history yet), and write a
     `fleet_alerts` row when the driver is getting close to the cutoff for another load.
     Needs a decision on where the compute lives (DB function/trigger vs. app-side vs.
     Edge Function) before building.

4. **Proposed: compute a daily load-count goal at job assignment/shift start, not just
   reactively near close (founder request, 2026-08-11).** Same inputs as #3 above
   (site open/close hours, expected cycle-time segments, the 20-30 min pre-close
   buffer), but run once when a job is assigned to a shift or a driver clocks in, instead
   of only firing an alert once close time is already near. Output: a target load count
   for the day (e.g. "Goal: 5 loads"), shown to the driver from the start and tracked
   against the actual `fleet_dt_shifts.load_count` as the day progresses, not sprung on
   them late.
   - Needs a place to store the computed goal — most natural fit is a new
     `fleet_dt_shifts.goal_load_count` (or similar) column, set once at shift
     start/first job assignment.
   - Cycle-time input for a brand-new site/material pairing (no same-day or historical
     data yet) has no fallback source today — first-time site/material combos would need
     a manual estimate or a conservative default until real cycle data accumulates.
   - Same open question as #3: where this computation runs (DB trigger on shift
     creation, Edge Function, or app-side at clock-in) needs a decision before building.

5. **Proposed: auto-compute drive-time-back-to-yard and auto-set shift end time
   (founder request, 2026-08-11).** Standing SOP (now recorded in
   `fleet_dt_pay_policies.notes`): when there's no time for another load, shift end time
   = (last signature/ticket time) + (drive time back to yard), rounded UP to the nearest
   half hour. Founder wants this computed automatically instead of manually reported.
   - **Prerequisite now resolved this session:** the yard didn't exist as a site at all —
     every shift's `start_yard_site_id` was null. Added `fleet_dt_sites` id
     `5a91374e-03d1-47f1-bc84-1ccbd5dc670d`, type `yard`, "Cal-Neva Trucking Yard," 4186
     Rewana Way, Reno NV, with real coordinates (39.48406, -119.77664) from a driver-shared
     Apple Maps pin — marked `verified: true`. Today's shift now has `start_yard_site_id`
     set.
   - **Still open:** pickup/dump sites (3D Dayton, 9500 USA Parkway, etc.) still have no
     `lat`/`lng` — travel-time computation needs coordinates on both ends. And the actual
     computation requires either live GPS from the driver app + a routing API (Google
     Maps Distance Matrix, Mapbox, etc. — not configured anywhere in this session) or, as
     a lighter first pass, static site-to-yard drive-time estimates stored per site once
     (less accurate — doesn't account for traffic — but needs no API key).
   - Once computed, the same rounding rule applies and the result sets
     `fleet_dt_shifts.clock_out_at` — no new storage needed beyond what already exists.

## Explicitly out of scope for this ADR

- Writing/applying the actual migration SQL (new tables, `operation_type` column,
  RLS function changes) — pending approval of the shape above.
- The `fleet_dt_*` → `fleet_otr_*` naming is a placeholder; confirm before creating tables.
- Deleting the stale `SMOKE-001` test row — cosmetic, independent of this decision,
  can happen either way.
- Any change to the `3b-fleet-commander` app repo itself.
- Deciding whether `profiles.id` merge is safe to do directly in SQL vs. requires
  Supabase Auth admin action — needs verification before execution.

## Consequences

- Once approved, next session's work is: (a) draft the actual migration, (b) attach
  `bouncebackbrian/3b-fleet-commander` to update the Command Center routing logic,
  (c) resolve the `profiles` identity merge safely.
- Until then, the "Command Center" screen will keep showing stale/wrong data for any
  business — it is not reading from the live DT data this session has been writing.

## Approval

- [ ] Approved by Brian Martin — Founder, BounceBackBrian / 3B Ecosystem (date: ______)
