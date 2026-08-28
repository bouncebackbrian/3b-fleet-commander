# Fleet Commander — Production Checklist

> **Last updated:** 2026-08-28
> **Live URL:** https://fleet.bouncebackbrian.com
> **Core 3Boost / Core_Eco:** rkwdryneutgyqrnbuwaz — auth + person/business identity source of truth
> **Fleet operations DB:** goqzhdrmrdlkchmwfiur — memberships, portal grants, assets, jobs, shifts, reports
> **GitHub:** bouncebackbrian/3b-fleet-commander

---

## Current Architecture

1. Core 3Boost creates and owns the permanent person and business identity.
2. A business receives its permanent `3B-B-XXXXXXXX` identity in Core.
3. Fleet Commander `/start` lists only businesses already available to the signed-in Core user.
4. `POST /api/fleet/provision-business` verifies the Core relationship, mirrors the same business UUID/3B ID into Fleet, provisions Fleet membership/Admin access, and sets the selected business as the active Fleet context.
5. Fleet APIs resolve the explicit active business. Multi-business users are never routed by “first membership wins.”
6. Company profile identity data stays in Core; operational assets/jobs/shifts/reports stay in Fleet.
7. A Fleet provisioning failure never deletes or rolls back the Core business.

---

## Release Repair — 2026-08-28

- [x] Driver Clock In occurs before Pre-Trip.
- [x] Removed blind “Yard to First Stop” travel-time question from Clock In.
- [x] Core business-creation and company-profile RPC signatures verified in Core_Eco.
- [x] Company profile includes normal company phone and optional Quick Text / Reply number.
- [x] Cal-Neva Trucking and Star Freight use their existing permanent business UUIDs/3B Business IDs across Core and Fleet.
- [x] Fleet setup no longer creates businesses; business creation belongs to Core 3Boost.
- [x] Setup assets read from Fleet DB using the selected Core business UUID.
- [x] Fleet provisioning is retry-safe and does not roll back Core identity.
- [x] Multi-company Fleet authorization now requires an explicit active business context.
- [x] Company dashboard stays locked until provisioning succeeds for the selected business.
- [ ] Verify the newest `main` commit is the commit deployed by Vercel.
- [ ] Smoke-test `/start` while signed in: select Cal-Neva, confirm assets 06/07/08, switch to Star Freight, confirm data does not cross companies.
- [ ] Smoke-test Driver flow: Assigned Job visible → Clock In → Pre-Trip → operational workflow → Post-Trip → Clock Out.

---

## Deployment Verification

A successful Vercel build is not enough by itself. For every release, verify all three:

- GitHub `main` head SHA
- Vercel deployment commit SHA
- live behavior at `fleet.bouncebackbrian.com`

The 2026-08-28 Vercel log supplied during repair showed a successful deployment of commit `d4e4e7bb50f5392f62f171b7bb68913af99816e3`. Later Core/Fleet activation fixes were committed after that deployment and therefore require a newer deployment before they can be considered live.

---

## Database Boundary

### Core 3Boost / Core_Eco

Owns:
- authentication/session
- person identity
- permanent 3B user identity
- business registry
- permanent 3B business identity
- company profile identity fields
- business membership/governance relationship

### Fleet Operations DB

Owns:
- Fleet memberships
- Driver / Dispatch / Admin portal grants
- assets and asset evidence
- jobs/sites/dispatch
- shifts/events/hours
- inspections/defects/incidents
- fuel/expenses
- operational reports and KPIs

Never combine records across business UUIDs. Portfolio-level rollups, if added later, must be an explicit separate view rather than implicit Fleet behavior.

---

## Rollback Procedure

1. Vercel: redeploy the last known-good deployment.
2. Code: revert the bad commit on `main` and push.
3. Database: use an explicit corrective migration. Do not drop production operational tables as a rollback shortcut.

Core identity and Fleet operational data are separate sources of truth. A Fleet rollback must not delete Core person/business identity.
