# Fleet Commander — Activation Roadmap

> Step-by-step path from standalone prototype → approved Core 3B product.  
> No step should be started without the prerequisite being complete.  
> Last updated: 2026-05-29

---

## Phase 0 — Governance (Zero Code, Max Impact)

These are the highest-leverage actions. Nothing in Phase 1+ matters until Phase 0 is done.

### Step 0.1 — Assign Formal Owner
**What:** Replace "ASSUMPTION: Founder" with a real name on the product record.  
**Where:** `docs/products/3b-fleet-commander/owner_and_scope.md` in the ecosystem worktree  
**Who:** Founder / product owner  
**Done when:** Name + role is written and committed to the governance record

---

### Step 0.2 — Submit Seed Pack for Approval
**What:** The seed pack exists (`seed_pack.md`). It has never been formally approved.  
**Where:** `docs/products/3b-fleet-commander/seed_pack.md`  
**How:** Open a Launch Case using the HQ template → get sign-off → record decision in `evidence/evidence_index.md`  
**Done when:** Approval recorded in evidence index with Trace_ID + Case_ID

---

### Step 0.3 — Designate Canonical Root
**What:** Eliminate the duplicate source-of-truth failure condition.  
**Decision:** Standalone `C:\Fleet_Commander\3b-fleet-commander` = runtime canonical root until monorepo migration.  
**Action:** Add a one-line note to `Products/fleet-commander/README.md` stating this.  
**Done when:** Both governance locations reference the standalone as runtime canonical

---

### Step 0.4 — Complete Promotion Gate Checklist
**What:** Walk through every item in `promotion_review_packet.md`  
**Done when:** All checkboxes pass → product status promoted from `NOT_INSTANTIATED` → `INCUBATING`

---

### Step 0.5 — Open Launch Case
**Template:** `E:\3B_ECOSYSTEM_V1.1\3B EcoSystem HQ - Documents\Launch_Case_Template.md`  
**Escalation Tier:** T2 (promotion event)  
**Done when:** Case opened, Case_ID assigned, record in SharePoint HQ

---

## Phase 1 — Pre-Migration Groundwork (Code, No Runtime Swap)

These can be built in the standalone repo right now. They make the eventual migration cheaper.

### Step 1.1 — Auth Adapter Pattern
**File to create:** `src/lib/auth-adapter.ts`

```typescript
// auth-adapter.ts — bridge layer
// Today: wraps Supabase. Tomorrow: wraps auth-3boost.
// No engine touches supabase-browser directly after this.

export async function getCurrentUser() {
  // STANDALONE MODE: Supabase auth
  const { createClient } = await import('@/lib/supabase-browser')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getSession() {
  const { createClient } = await import('@/lib/supabase-browser')
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// When auth-3boost is ready, swap these implementations.
// No calling code changes required.
```

**Migration payoff:** Every engine that needs a user ID calls `auth-adapter.ts`. The swap to auth-3boost is a single file change.

---

### Step 1.2 — Business ID Schema Migration
**What:** Add `business_id` to all fleet tables in Supabase.  
**Why now:** This unblocks multi-tenant fleet (one business, many drivers). Star Freight needs this.

```sql
-- Migration: add_business_id_to_fleet_tables.sql

-- 1. businesses table (the anchor)
CREATE TABLE IF NOT EXISTS businesses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text UNIQUE NOT NULL,       -- e.g. 'star-freight-services'
  owner_id     uuid,                       -- 3B ID of the account owner
  created_at   timestamptz DEFAULT now(),
  active       boolean DEFAULT true
);

-- 2. Business membership (driver/dispatcher/admin per business)
CREATE TABLE IF NOT EXISTS fleet_business_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES businesses(id),
  user_id      uuid NOT NULL,
  role         text NOT NULL CHECK (role IN ('driver','dispatcher','admin','owner_operator')),
  active       boolean DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (business_id, user_id)
);

-- 3. Add business_id to fleet tables
ALTER TABLE fleet_loads          ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);
ALTER TABLE fleet_ops_events     ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);
ALTER TABLE fleet_driver_updates ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);
ALTER TABLE fleet_alerts         ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);
ALTER TABLE fleet_escalations    ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);
ALTER TABLE fleet_load_health    ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);
ALTER TABLE fleet_notifications  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

-- 4. Seed Star Freight Services
INSERT INTO businesses (name, slug) VALUES ('Star Freight Services', 'star-freight-services')
ON CONFLICT (slug) DO NOTHING;
```

**Done when:** Migration applied to Supabase project `goqzhdrmrdlkchmwfiur`

---

### Step 1.3 — Nav Config Layer
**What:** Extract `MODE_TAB_HREFS` from `userMode.ts` into a JSON config.  
**File to create:** `src/config/navConfig.ts`

```typescript
// navConfig.ts — replaces hardcoded MODE_TAB_HREFS
// When ecosystem nav is ready, this module reads from hub-portal config instead.

export interface NavEntry {
  label:    string
  href:     string
  icon?:    string
  roles:    string[]    // which roles see this tab
  enabled:  boolean     // false = hidden (matches hubNav.ts pattern)
}

export const FLEET_NAV: NavEntry[] = [
  { label: 'Dashboard',  href: '/dashboard',  icon: '🏠', roles: ['driver','dispatcher','owner_operator'], enabled: true },
  { label: 'Dispatch',   href: '/dispatch',   icon: '📡', roles: ['dispatcher','owner_operator'],          enabled: true },
  { label: 'Trips',      href: '/trips',      icon: '🗺',  roles: ['driver','dispatcher'],                  enabled: true },
  { label: 'HOS',        href: '/hos',        icon: '⏱',  roles: ['driver'],                               enabled: true },
  { label: 'Maintenance',href: '/maintenance',icon: '🔧', roles: ['dispatcher','owner_operator'],          enabled: true },
  { label: 'Reports',    href: '/reports',    icon: '📊', roles: ['owner_operator'],                       enabled: true },
]
```

**Migration payoff:** When hubNav.ts is ready, this module reads from it instead. No UI changes.

---

### Step 1.4 — Entitlement Stub
**What:** Define the tier/feature matrix even before billing is wired.  
**File to create:** `src/config/entitlements.ts`

```typescript
// entitlements.ts — tier-gated feature flags
// Today: everything enabled (standalone dev mode)
// Tomorrow: reads from 3Boost entitlement matrix

export type FleetTier = 'starter' | 'pro' | 'enterprise'

export const FLEET_FEATURES: Record<string, FleetTier[]> = {
  dispatch_ops_ai:       ['starter', 'pro', 'enterprise'],
  driver_ops_cockpit:    ['starter', 'pro', 'enterprise'],
  hos_planning:          ['pro', 'enterprise'],
  escalation_engine:     ['pro', 'enterprise'],
  ops_event_log:         ['pro', 'enterprise'],
  notification_router:   ['enterprise'],
  role_ops_view:         ['pro', 'enterprise'],
  multi_driver:          ['pro', 'enterprise'],
}

export function hasFeature(feature: string, tier: FleetTier = 'enterprise'): boolean {
  // STANDALONE: always return true until entitlement matrix is wired
  if (process.env.NEXT_PUBLIC_ENTITLEMENT_MODE !== 'enforced') return true
  return FLEET_FEATURES[feature]?.includes(tier) ?? false
}
```

---

## Phase 2 — Ecosystem Integration (After Phase 0 Approval)

### Step 2.1 — Register in hubNav.ts
```typescript
// In: hub-portal/config/hubNav.ts
// Add Fleet Commander entry (enabled: false until rollout confirmed)
{
  id:      'fleet-commander',
  label:   'Fleet Commander',
  href:    '/fleet',
  icon:    '🚛',
  family:  'fleet',
  enabled: false,   // flip to true at rollout
  roles:   ['driver', 'dispatcher', 'owner_operator'],
  tier:    ['pro', 'enterprise'],
}
```

### Step 2.2 — Swap Auth
Replace `supabase-browser.ts` auth calls with `auth-3boost` in `auth-adapter.ts`.  
All engines continue working without changes.

### Step 2.3 — Wire Identity SOR
Replace Supabase user resolution in `identity.ts` with `identity-sor` API call.  
`business_id` flows through from the membership table.

### Step 2.4 — Wire Entitlement Matrix
Replace `hasFeature()` stub with live 3Boost entitlement check.  
Feature gates activate per-business based on their subscription tier.

---

## Phase 3 — Monorepo Migration

### Step 3.1 — Move to apps/fleet-commander
```
git mv C:\Fleet_Commander\3b-fleet-commander → apps/fleet-commander
```
Adjust Vercel root directory. Adjust import paths.

### Step 3.2 — Run Hardening Gate
Follow `Hardening_Sweep_SOP.md` from HQ Docs.  
Every item must pass before nav is enabled.

### Step 3.3 — Enable Nav + Go Live
Flip `hubNav.ts` entry to `enabled: true`.  
Fleet Commander is live inside the 3B Ecosystem Hub.

### Step 3.4 — Post-Launch Review
File `Post_Launch_Review_Template.md` with Trace_ID + Case_ID.  
Record in SharePoint HQ.

---

## Dependency Chain (Critical Path)

```
Step 0.1 (Owner assigned)
  └── Step 0.2 (Seed pack approved)
        └── Step 0.4 (Promotion gate passed)
              └── Step 0.5 (Launch Case opened)
                    └── Phase 2 unlocked

Steps 1.1–1.4 run in parallel with Phase 0 (no approval needed)
  └── 1.2 (Business ID schema) → unblocks Star Freight onboarding
  └── 1.1 (Auth adapter) → makes Phase 2.2 trivial
  └── 1.3 (Nav config) → makes Phase 2.1 trivial
  └── 1.4 (Entitlement stub) → makes Phase 2.4 trivial
```

---

## Decision Log

| Date | Decision | Owner |
|---|---|---|
| 2026-06-05 | Stripe custom domain `pay.bouncebackbrian.com` confirmed active (Checkout, Payment Links, Portal). Payment routing made config-driven via `NEXT_PUBLIC_STRIPE_PAYMENT_DOMAIN` + `NEXT_PUBLIC_CREDIT_URL`. Trace_ID: 3B-20260604-0001. Next: live validation on custom domain. | S2 |
| 2026-05-29 | Standalone build designated runtime canonical root | TBD (formalize) |
| 2026-05-29 | Phase 1 pre-work authorized without waiting for Phase 0 | Founder |
| — | Formal intake approval | PENDING |
| — | Business ID model design | PENDING |
| — | Billing ownership: business-billed vs user-billed | PENDING (T2) |
