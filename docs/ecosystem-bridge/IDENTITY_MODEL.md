# Fleet Commander — Identity & Membership Model

> Resolves the T2 escalation item: Business ID membership + user roles.  
> Designed to handle all real-world Fleet Commander user types.  
> Last updated: 2026-05-29

---

## The Three Operating Contexts

Fleet Commander users don't fit a single "business employee" pattern.
There are three distinct operating contexts, each with different role relationships.

---

### Context A — Owner-Operator (Single-Seat Business)

```
Owner-Op LLC (business)
  └── 1 person = owner + driver + dispatcher (all the same user)
  └── May use an external broker for loads
  └── May use a fleet management service
```

**Identity shape:**
- Business type: `owner_op`
- One user with role `owner` — inherits driver + dispatcher rights automatically
- No separate dispatcher account needed
- Broker = external entity with load visibility (not a member)

**Real example:** Independent trucker with their own authority, dispatches themselves.

---

### Context B — Small Fleet / Carrier

```
Carrier Business (e.g. Star Freight Services)
  └── Owner (billing anchor, may or may not drive)
  └── Drivers (employees or contractors)
  └── Dispatcher (could be the owner, a dedicated employee, or outsourced)
  └── Broker (could be in-house or external)
```

**Identity shape:**
- Business type: `carrier`
- Owner has role `owner` — billing anchor, full access
- Drivers have role `driver` — see their loads, HOS, their own ops
- Dispatcher has role `dispatcher` — sees all loads, dispatch ops, escalations
- Broker (if in-house) has role `broker` — sees loads, can assign/book

**Real example:** Star Freight Services — one owner, several company drivers, dedicated dispatcher.

---

### Context C — Fleet Management Company

```
Fleet Mgmt Co (separate business entity)
  └── Manages multiple owner-ops or small carriers on their behalf
  └── Provides dispatch services as a product
  └── May also have broker relationships
```

**Identity shape:**
- Fleet Mgmt Co has its own business record (`fleet_management`)
- Each owner-op they manage is a SEPARATE business record (`owner_op`)
- A cross-business relationship links Fleet Mgmt → Owner-Op
- Fleet manager role (`fleet_manager`) spans multiple businesses

**Real example:** A dispatch service that works for 10 independent owner-ops.

---

## Role Matrix

| Role | Who They Are | What They See | Billing Anchor? |
|---|---|---|---|
| `owner` | Business owner (owner-op or fleet owner) | Everything | ✅ Yes |
| `driver` | Drives trucks, always a user | Their loads, their HOS, their mode | ❌ No |
| `dispatcher` | Manages loads (employee or owner-op doing dispatch) | All loads, escalations, dispatch feed | ❌ No |
| `admin` | Business account manager (not necessarily ops) | Account settings, user management | ❌ No |
| `broker` | Books/assigns loads (in-house or external) | Load board, rate confirmation, assignment | ❌ No |
| `fleet_manager` | Manages multiple businesses (external service) | All businesses they manage | ❌ No (billed separately) |

---

## Key Design Decisions

### Decision 1: Owner-Operator is BOTH a business AND a user
An owner-op doesn't need a separate dispatcher account.  
Role `owner` on an `owner_op` business implicitly grants dispatch + driver access.  
The UI shows them dispatcher AND driver views based on what they're doing.

### Decision 2: Dispatcher can be an owner-op OR an employee
Same role name (`dispatcher`), different business context.  
- Owner-op dispatching themselves → role `owner` on their own business
- Employee dispatcher at Star Freight → role `dispatcher` on Star Freight's business record
- External dispatch service → `fleet_manager` on a `fleet_management` business with a cross-business relationship

### Decision 3: Broker is a relationship, not just a role
A broker can be:
- An **in-house role** on a carrier business (Star Freight has someone who does brokering)
- An **external business** (a brokerage company) with a relationship to the carrier
- An **owner-op** who also has broker authority on their own loads

The `fleet_business_relationships` table handles external broker ↔ carrier connections.

### Decision 4: Driver is always a leaf user, never the billing anchor
Drivers belong to a business (as employee or contractor).  
They never own a billing relationship directly.  
Exception: a driver who IS an owner-op → they have an `owner` role on their OWN business, and separately a `driver` role within that same business (or the business implicitly grants both).

---

## Schema Design

```sql
-- ── Business types ────────────────────────────────────────────────────────────
-- owner_op:         single-seat operation, owner drives + dispatches
-- carrier:          fleet business with drivers + dispatcher(s)
-- brokerage:        freight broker business
-- fleet_management: manages other businesses' fleets

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS
  type text NOT NULL DEFAULT 'carrier'
  CHECK (type IN ('owner_op','carrier','brokerage','fleet_management'));

-- ── Updated role set in fleet_business_members ────────────────────────────────
-- Drop old constraint, add new one
ALTER TABLE fleet_business_members
  DROP CONSTRAINT IF EXISTS fleet_business_members_role_check;

ALTER TABLE fleet_business_members
  ADD CONSTRAINT fleet_business_members_role_check
  CHECK (role IN ('owner','driver','dispatcher','admin','broker','fleet_manager'));

-- ── Cross-business relationships ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fleet_business_relationships (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  related_business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  relationship_type   text NOT NULL
    CHECK (relationship_type IN ('broker_carrier','fleet_manager_carrier','owner_op_network')),
  active              boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (primary_business_id, related_business_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_biz_rel_primary  ON fleet_business_relationships(primary_business_id);
CREATE INDEX IF NOT EXISTS idx_biz_rel_related  ON fleet_business_relationships(related_business_id);

-- ── Update Star Freight to correct business type ──────────────────────────────
UPDATE businesses SET type = 'carrier' WHERE slug = 'star-freight-services';
```

---

## UI Role → View Mapping

| Role | `userMode.ts` equivalent | Default landing | Key panels |
|---|---|---|---|
| `owner` on `owner_op` | `owner_operator` + `driver` | Dashboard (split view) | DriverOps Cockpit + Dispatch + Reports |
| `driver` | `driver` | Dashboard | DriverOps Cockpit, HOS, Trips |
| `dispatcher` | `dispatcher` | Dispatch | DispatchOps AI, Escalation Queue, Load Health |
| `owner` on `carrier` | `owner_operator` | Dashboard | Fleet Health, Reports, Account |
| `broker` | (new — not in userMode yet) | Dispatch | Load board, rate confirmation |
| `fleet_manager` | (new — not in userMode yet) | Dashboard | Multi-business fleet view |
| `admin` | (new) | Account | User management, settings |

---

## What Needs to Change in the Codebase

### 1. `src/lib/userMode.ts`
Add `broker` and `fleet_manager` to the mode types.  
Map from membership role → display mode.

### 2. `src/lib/auth-adapter.ts`
`getCurrentUser()` should resolve the user's role within their business context.  
Return both `businessId` + `role` so every component knows who's viewing.

### 3. `src/config/navConfig.ts`
Add broker and fleet_manager nav entries.  
Owner-op gets a merged driver+dispatcher view.

### 4. `src/components/ops/RoleOpsView.tsx`
Add `broker` and `fleet_manager` view panels.  
`owner` on `owner_op` → merged DriverView + DispatcherView.

---

## Open Questions (T2 Decisions Needed)

| Question | Options | Who Decides |
|---|---|---|
| Billing anchor: who pays? | Business (Star Freight pays for all its members) vs individual users | Founder |
| Owner-op billing: per-seat or flat? | $X/month flat vs $X per driver | Founder |
| External broker access: invite-only or open? | Broker receives invite link vs self-registers | Product decision |
| Fleet manager: billed through managed businesses or direct? | Fleet Mgmt Co pays, or each owner-op they manage pays | Founder |
| Contractor driver vs employee driver: different access? | Same role, different metadata | Product decision |
