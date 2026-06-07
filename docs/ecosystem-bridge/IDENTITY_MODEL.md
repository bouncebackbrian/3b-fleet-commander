# 3B Identity & Business Architecture v2.0

> **Status:** Locked — implement before any product database migration.  
> This is the canonical architecture for all 3B Ecosystem products.  
> Last updated: 2026-06-06

---

## The Architecture

Most systems think: `User → Business`

The 3B Ecosystem works: `3B ID → Identity Verification → 3B Business ID → Products`

```
Create 3B ID
       ↓
Identity Verification
       ↓
Create 3B Business ID
       ↓
Business Formation → EIN → Virtual Address → Domain → Website
       ↓
Business Banking
       ↓
Funding Readiness → Funding Machine
       ↓
Business Credit Builder
       ↓
Growth Capital
```

---

## 3B User Identity (3B-U-XXXXXXXX)

One person. One identity. One 3B ID.

**ID Format:** `3B-U-00000001` (sequential, zero-padded, 8 digits)

**Table:** `public.profiles`

| Field | Type | Notes |
|-------|------|-------|
| `three_b_id` | text unique | `3B-U-00000001` — auto-generated on signup |
| `first_name` | text | |
| `last_name` | text | |
| `email` | text unique | Supabase auth email |
| `phone` | text | |
| `address_line1/2, city, state, zip` | text | For identity verification |
| `verification_status` | enum | `unverified` → `pending` → `verified` |
| `has_fleet, has_credit, has_funding…` | boolean | Product entitlements per identity |
| `default_business_id` | uuid → businesses | Active business context |

**Auto-creation:** A profile row (and 3B-U ID) is created automatically when a user signs up via Supabase auth.

---

## 3B Business Registry (3B-B-XXXXXXXX)

A 3B ID can own multiple businesses. Each gets a unique 3B-B ID.

**ID Format:** `3B-B-00000001` (sequential, zero-padded, 8 digits)

**Table:** `public.businesses`

Example — Brian Martin (`3B-U-00000001`) owns:

```
Bounce Back Coffee     → 3B-B-00000001
3B Ecosystem           → 3B-B-00000002
Future Trucking Co.    → 3B-B-00000003
```

**Key fields:** `company_name`, `entity_type`, `formation_date`, `ein`, `mc_number`, `dot_number`, `business_type`, `owner_id → profiles.id`

---

## Business Members — Two Independent Layers

### Layer 1: Ecosystem Governance (`business_members`)

Controls who can access a business across ALL 3B products.

```sql
create table business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id     uuid not null references profiles(id)  on delete cascade,
  role        text not null default 'employee'
    check (role in ('owner','partner','manager','employee','advisor')),
  invited_by  uuid references profiles(id),
  joined_at   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (business_id, user_id)
);
```

| Role | Who They Are | Billing Anchor? |
|------|-------------|----------------|
| `owner` | Equity owner, controls everything | ✅ Yes |
| `partner` | Equity partner, same access as owner | ✅ Yes |
| `manager` | Manages operations, no equity | ❌ No |
| `employee` | Team member, standard access | ❌ No |
| `advisor` | Advisory relationship, read-only | ❌ No |

### Layer 2: Fleet Commander Operations (`fleet_business_members`)

Controls what a user sees *inside Fleet Commander*. Independent of Layer 1.

| Role | What They See |
|------|--------------|
| `owner` | Everything — fleet health, reports, billing |
| `driver` | Their own loads, HOS, trips |
| `dispatcher` | All loads, dispatch feed, escalations |
| `admin` | Account settings, user management |
| `broker` | Load board, rate confirmations, assignment |
| `fleet_manager` | Multi-business fleet view |

**A user can hold roles in both layers simultaneously.** Example: someone who is a `partner` in `business_members` (owns equity) AND a `dispatcher` in `fleet_business_members` (runs day-to-day ops).

---

## Bankability Score (0–100)

The bankability score tells you how ready a business is for funding before you talk to a lender.

**Function:** `calc_bankability_score(businesses)` — callable in SQL and mirrored in `src/lib/identity-registry.ts`

| Factor | Points | Why Lenders Care |
|--------|--------|-----------------|
| Entity Formed | 10 | Legitimate business exists |
| EIN | 10 | Can open accounts and file taxes |
| Business Address | 10 | Physical/virtual — not a personal address |
| Business Phone | 10 | Dedicated line, not a cell |
| Website | 10 | Professional web presence |
| Domain Email | 10 | `you@yourcompany.com`, not Gmail |
| Bank Account | 15 | Money flows somewhere real |
| Revenue | 15 | Business actually generates income (7 pts if generating, 15 if documented) |
| Business Credit | 10 | Has its own credit profile (5 pts if building, 10 if established) |
| **Total** | **100** | |

---

## How Each Product Connects

```
3B ID (profiles.id)
  │
  ├─ Fleet Commander
  │    └─ 3B ID → Select Business → fleet_business_members (operational roles)
  │         fleet_loads.user_id     = profiles.id
  │         fleet_loads.business_id = businesses.id
  │
  ├─ Funding Machine
  │    └─ 3B ID → Select Business → funding_profiles.business_id
  │
  ├─ Credit Builder (Personal)
  │    └─ 3B ID → personal_credit_profiles.user_id
  │
  ├─ Content Command
  │    └─ 3B ID → Select Business → content_assets.business_id
  │
  └─ Media Group
       └─ 3B ID → Select Business → domains.business_id → websites.domain_id
```

---

## EXT05 — Identity & Business Registry Module

**Modules:**
- Create 3B ID (auto on signup)
- Verify Identity (`unverified → pending → verified`)
- Create Business (assigns 3B-B ID)
- Invite Team Members (fleet_team_invites)
- Manage Ownership (business_members roles)

**Business Registry Dashboard** — for every business:

| Field | Source |
|-------|--------|
| Business Name | `businesses.company_name` |
| 3B Business ID | `businesses.three_b_biz_id` |
| Owner | `profiles.first_name + last_name` |
| Entity Type | `businesses.entity_type` |
| State | `businesses.state_of_formation` |
| EIN Status | `businesses.has_ein` |
| Website | `businesses.has_website` |
| Funding Status | `businesses.has_funding` |
| Credit Status | `businesses.credit_status` |
| Bankability Score | `calc_bankability_score(businesses.*)` |

---

## Schema Files

| File | Purpose |
|------|---------|
| `supabase/3b_ecosystem_schema.sql` | Canonical ecosystem schema (run in 3B Ecosystem Supabase project) |
| `supabase/migrations/20260606_3b_identity_arch.sql` | Fleet Commander migration (run in Fleet Commander Supabase project) |
| `src/lib/identity-registry.ts` | TypeScript types + client-side bankability score + data fetching |
| `src/lib/profile.ts` | Profile and business types for Fleet Commander UI |
| `src/lib/auth-adapter.ts` | Auth bridge — resolves Fleet Commander operational role from fleet_business_members |

---

## Open Questions

| Question | Options | Who Decides |
|----------|---------|-------------|
| Billing anchor: business or individual? | Business pays for all members vs individual seats | Founder |
| Owner-op: flat fee or per-seat? | $X/month flat vs $X per driver | Founder |
| External broker access: invite-only? | Broker receives invite link vs self-registers | Product |
| Partner: same billing rights as owner? | Full billing access vs owner-only | Founder |
| Verification: manual or automated? | Human review vs third-party (Stripe Identity, Persona) | Founder |
