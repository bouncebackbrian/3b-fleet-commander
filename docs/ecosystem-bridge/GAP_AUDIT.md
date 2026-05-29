# Fleet Commander — Full Gap Audit

> Compares standalone build (`3b-fleet-commander`) against Core 3B Ecosystem requirements.  
> Last updated: 2026-05-29

---

## Audit Method

Every file in the standalone build was reviewed against five ecosystem requirements:
1. **Auth** — must use `services/auth-3boost`, not Supabase auth
2. **Identity** — must use `services/identity-sor` for user resolution
3. **API routing** — must go through `services/api-gateway`
4. **Navigation** — must be config-driven via `hub-portal/config/hubNav.ts`
5. **Billing/Entitlements** — must use entitlement matrix, not standalone RLS

---

## Gap Category 1 — Authentication

### What exists (standalone)
```
src/lib/supabase-browser.ts     → createBrowserClient() — direct Supabase auth
src/lib/supabase-server.ts      → server-side Supabase client
src/lib/supabaseFleetStore.ts   → supabase.auth.getUser() calls throughout
src/lib/identity.ts             → reads from Supabase user object
src/lib/guards.ts               → auth guards using Supabase session
```

### What's required (ecosystem)
```
services/auth-3boost            → JWT issuance, session management
services/identity-sor           → canonical user identity resolution
services/api-gateway            → all API calls routed through gateway
```

### Gap
- Every `supabase.auth.getUser()` call needs to swap to `auth-3boost` token validation
- Every `createBrowserClient()` / `createServerClient()` instance needs an adapter
- `guards.ts` needs to check 3B JWT, not Supabase session
- `identity.ts` needs to resolve through `identity-sor`

### Migration complexity: 🔴 High
Every page and API route that checks auth is affected. Requires auth-3boost SDK/contract first.

---

## Gap Category 2 — Navigation

### What exists (standalone)
```
src/lib/userMode.ts             → MODE_TAB_HREFS hardcoded route map
src/app/layout.tsx              → renders nav from userMode
src/components/NavBar.tsx       → uses hardcoded links
```

### What's required (ecosystem)
```
hub-portal/config/hubNav.ts     → ALL nav must register here, config-driven
                                   Fleet Commander entry: enabled=false until rollout
```

### Gap
- `userMode.ts` is a standalone nav system — the entire concept must be replaced
- No Fleet Commander entry in `hubNav.ts` (blocked until intake approval anyway)
- Nav links inside components must come from hub config, not local constants

### Migration complexity: 🟡 Medium
`userMode.ts` is self-contained. Once hub nav contract is defined, it's a targeted swap.

---

## Gap Category 3 — Identity / Business ID

### What exists (standalone)
```
src/lib/identity.ts             → reads Supabase auth.user.id
src/lib/profile.ts              → driver profile keyed to Supabase user
src/lib/supabaseFleetStore.ts   → user_id from supabase.auth.getUser()
```

### What's required (ecosystem)
```
Business ID = canonical anchor for fleet company (e.g. Star Freight Services)
3B ID       = individual user within that business instance
identity-sor → resolves: 3B ID → Business ID membership → entitlements
```

### Gap
- **No Business ID model at all in standalone build** — this is the T2 blocker
- Every `user_id` foreign key in Supabase tables is a raw Supabase UUID
- Multi-tenant fleet model (one business, many drivers/dispatchers) has no schema support
- `fleet_ops_events`, `fleet_loads`, etc. all have `user_id` but no `business_id`

### Migration complexity: 🔴 High + Design Required
Requires new schema: `business_id` column on all fleet tables + membership join table.
Identity design must be done before any data migration.

### Proposed schema addition (for planning)
```sql
-- Add to all fleet tables:
ALTER TABLE fleet_loads          ADD COLUMN business_id uuid REFERENCES businesses(id);
ALTER TABLE fleet_ops_events     ADD COLUMN business_id uuid REFERENCES businesses(id);
ALTER TABLE fleet_driver_updates ADD COLUMN business_id uuid REFERENCES businesses(id);
-- etc.

-- New table:
CREATE TABLE fleet_business_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  user_id     uuid NOT NULL,  -- 3B ID
  role        text NOT NULL,  -- 'driver' | 'dispatcher' | 'admin' | 'owner'
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
```

---

## Gap Category 4 — Billing & Entitlements

### What exists (standalone)
```
Supabase RLS policies on each table (user_id = auth.uid())
No subscription tier enforcement
No feature gating
No billing integration
```

### What's required (ecosystem)
```
3Boost entitlement matrix       → feature flags per business tier
Billing service                 → business-billed (not per-user billed)
Entitlement check at API layer  → access determined by business subscription
```

### Gap
- RLS is a data security layer, not an entitlement layer — they serve different purposes
- No tier-based feature gating (e.g., "Ops Event Log only available on Pro tier")
- No billing owner model — who pays: the business (Star Freight) or the individual?
- This is a T2 escalation: **billing ownership model must be decided before activation**

### Migration complexity: 🟡 Medium (once entitlement contract exists)
Current Supabase RLS stays as security layer. Entitlement matrix sits above it.

---

## Gap Category 5 — API Routing

### What exists (standalone)
```
src/lib/supabase-browser.ts     → direct Supabase client (bypasses any gateway)
src/app/api/*                   → Next.js API routes (standalone, not gateway-registered)
All engines                     → call Supabase SDK directly
```

### What's required (ecosystem)
```
services/api-gateway            → all external API calls routed through gateway
                                   Rate limiting, auth enforcement, logging at gateway
```

### Gap
- All Supabase calls go direct — there is no gateway layer
- Next.js API routes are not registered with the ecosystem gateway
- This gap is **partially mitigated** by Supabase's own row-level security

### Migration complexity: 🟡 Medium
Can be handled by wrapping the Supabase client behind a gateway adapter without rewriting engines.

---

## Gap Category 6 — Source-of-Truth Duplication

### What exists
```
LOCATION A: C:\Fleet_Commander\3b-fleet-commander  (standalone, live)
LOCATION B: E:\Core_3b_Eco.worktrees\...\Products\fleet-commander  (governance pointer)
LOCATION C: E:\Core_3b_Eco.worktrees\...\docs\products\3b-fleet-commander  (docs)
```

### What's required (ecosystem)
- **One canonical root** — all others marked reference-only
- Duplicate source-of-truth = **governance fail condition**

### Resolution
- Standalone build (Location A) = the runtime canonical source until monorepo migration
- Location B & C = governance/planning records (reference-only)
- Explicitly document this in both locations

### Migration complexity: 🟢 Low (documentation only)

---

## Gap Category 7 — Customer Pack Activation

### Star Freight Services
All SOPs and onboarding records exist as documents only. None are runtime-activated.

| Artifact | Path | Activation Blocker |
|---|---|---|
| Business ID master prompt | `...star-freight-services/identity/` | Product approval required |
| Onboarding schema + validator | `...star-freight-services/onboarding_records/` | Product approval required |
| SOP: Add Shipping ID | `...3BFC-SFS-DRV-SOP-001` | Product approval required |
| SOP: Assign Truck/Trailer | `...3BFC-SFS-DRV-SOP-002` | Product approval required |
| SOP: Driver Check-In | `...3BFC-SFS-DRV-SOP-003` | Product approval required |
| SOP: Upload BOL Docs | `...3BFC-SFS-DRV-SOP-004` | Product approval required |

**None of these can be runtime-activated until the product intake approval is complete.**

---

## Gap Summary Matrix

| Gap | Severity | Blocks What | Can Pre-Build? |
|---|---|---|---|
| No formal intake approval | 🔴 Critical | Everything | No — governance action |
| No Business ID model | 🔴 Critical | Identity, multi-tenant | Yes — design now |
| Owner not formally assigned | 🔴 Critical | Promotion gate | No — governance action |
| Auth uses Supabase (not 3boost) | 🟡 High | Ecosystem activation | Yes — build adapter |
| Nav is hardcoded (not hubNav) | 🟡 High | Ecosystem activation | Yes — build config layer |
| No api-gateway routing | 🟡 Medium | Ecosystem compliance | Yes — build wrapper |
| No entitlement gating | 🟡 Medium | Billing compliance | Yes — design stub |
| Duplicate source-of-truth | 🟢 Low | Governance cleanliness | Yes — docs only |
| Star Freight not activated | 🟢 Low | Customer onboarding | Blocked by approval |

---

## What Can Be Done Right Now (Pre-Approval)

These items don't require formal approval and reduce the migration cost:

1. **Design the Business ID schema** — add `business_id` columns to all fleet tables (Supabase migration)
2. **Build an auth adapter stub** — `src/lib/auth-adapter.ts` that today wraps Supabase, tomorrow wraps auth-3boost
3. **Build a nav config layer** — move `MODE_TAB_HREFS` into a JSON config file that can be swapped for hubNav later
4. **Document canonical root** — add a note in both governance locations that standalone = runtime canonical until migration
5. **Draft the entitlement stub** — define the tier/feature matrix even if the billing service isn't wired yet

All of the above are in `ACTIVATION_ROADMAP.md`.
