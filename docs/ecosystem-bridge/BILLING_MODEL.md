# Fleet Commander — Billing & Revenue Model

> Designed for: per-module subscriptions + % of deal (platform cut).  
> The system does the work — no manual invoicing, no chasing.  
> Last updated: 2026-05-29

---

## The Two Revenue Streams

```
STREAM 1 — Subscriptions (recurring)
  └── Per module access
  └── Bundle discount for 3+ modules
  └── Billed monthly per business

STREAM 2 — Platform Transaction Fee (per load)
  └── % of rate confirmation when broker routes load through Fleet Commander
  └── Auto-calculated at load close
  └── Auto-invoiced — system does it, no human needed
```

---

## Stream 1: Module Subscriptions

### Modules (Sections)

| Module | Who Needs It | Includes |
|---|---|---|
| **Dispatch** | Dispatchers, owner-ops | DispatchOps AI, load health, stall detection, escalation engine |
| **Driver** | Drivers, owner-ops | DriverOps Cockpit, HOS clock, break timers, detention clock |
| **HOS Planning** | Dispatchers, owner-ops | HOS simulation, legal ETA, rest stop planning |
| **Maintenance** | Fleet owners, dispatchers | PM scheduler, violation vault, inspection records |
| **Broker** | Brokers, owner-ops with broker authority | Load board, rate confirmation, assignment flow |
| **Reports** | Fleet owners, operators | Fleet performance, ops event history, KPIs |

### Pricing Tiers

```
Per Module (à la carte):
  Dispatch Module    → $X/mo per business
  Driver Module      → $Y/mo per seat (per active driver)
  HOS Planning       → $Z/mo per business
  Maintenance        → $W/mo per business
  Broker Module      → $V/mo per business
  Reports            → $U/mo per business

Bundle (3+ modules):
  Core Bundle (Dispatch + Driver + HOS)  → [X+Y+Z] × 0.80  (20% off)
  Full Fleet Bundle (all modules)        → [total] × 0.70  (30% off)

Owner-Operator Flat Rate:
  All modules, 1 driver seat             → $OO/mo flat
  (Designed for single-seat operations — most affordable entry)
```

> **Open Decision:** Set the actual $ amounts. Suggested range: $15–$45/module/month.  
> Owner-op flat rate should be below $99/mo to stay competitive.

---

## Stream 2: Platform Transaction Fee (The Real Play)

### How It Works

```
1. Broker posts or assigns a load inside Fleet Commander
2. Dispatcher / carrier accepts
3. Load is tracked end-to-end (pickup → delivery → POD)
4. Rate confirmation is recorded in the system
5. On load close → Fleet Commander auto-calculates platform fee
6. Fee is added to the business's monthly invoice (or charged immediately)
7. No manual work. The system does it.
```

### Fee Structure

```
Brokered loads (broker → dispatcher/carrier via FC):
  Platform fee = X% of gross rate confirmation amount

Direct loads (carrier self-dispatches, no broker in FC):
  No transaction fee (subscription only)

Example at 0.75%:
  $2,000 load → $15.00 platform fee
  $4,500 load → $33.75 platform fee
  $8,000 load → $60.00 platform fee

Example at 1%:
  $2,000 load → $20.00
  $5,000 load → $50.00
  $10,000 load → $100.00
```

> **Open Decision:** Set the %. Industry context:  
> — DAT/Truckstop load boards: flat listing fees ($X/load or subscription)  
> — Convoy/Flexport: ~3–5% of load value  
> — Suggested range for Fleet Commander: 0.5% – 1.5%  
> — Start lower to drive adoption, raise as network grows

### Who Pays the Fee?

Three options (decision required):

| Option | Who Pays | How |
|---|---|---|
| **A — Broker pays** | The broker is charged the % | Broker subscribes to Broker Module + pays fee per booked load |
| **B — Carrier pays** | The carrier/dispatcher pays the % | Deducted from rate or added to their invoice |
| **C — Split** | Broker and carrier split the % | Each pays half — most balanced, harder to explain |

> **Recommendation: Option A (Broker pays).**  
> Brokers already pay for access to DAT/Truckstop. They understand per-load fees.  
> Carriers get full rate + subscription value. Easier to sell to owner-ops.

---

## Revenue Flow Diagram

```
Load Created
    │
    ├─ Self-dispatched (no broker in FC)
    │     └── No transaction fee. Subscription only.
    │
    └─ Brokered through FC
          │
          ├─ Broker assigns load via Broker Module
          ├─ Dispatcher accepts in Dispatch Module
          ├─ Driver picks up, tracks in Driver Module
          ├─ POD uploaded
          ├─ Load closed
          │
          └─ SYSTEM AUTO-CALCULATES:
                Rate: $X,XXX
                Platform fee (Y%): $XX.XX
                Invoice generated automatically
                Added to broker's monthly statement
```

---

## Database Schema

### `fleet_rate_confirmations`
Tracks the financial terms of each load.

```sql
CREATE TABLE fleet_rate_confirmations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id         uuid REFERENCES fleet_loads(id),
  business_id     uuid REFERENCES businesses(id),
  broker_business_id uuid REFERENCES businesses(id),  -- who booked the load
  gross_rate      numeric(10,2) NOT NULL,              -- full rate amount
  fuel_surcharge  numeric(10,2) DEFAULT 0,
  accessorials    numeric(10,2) DEFAULT 0,
  total_rate      numeric(10,2) GENERATED ALWAYS AS (gross_rate + fuel_surcharge + accessorials) STORED,
  currency        text DEFAULT 'USD',
  confirmed_at    timestamptz DEFAULT now(),
  confirmed_by    uuid,                                -- user who confirmed
  created_at      timestamptz DEFAULT now()
);
```

### `fleet_platform_fees`
Auto-calculated when a brokered load closes.

```sql
CREATE TABLE fleet_platform_fees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id         uuid REFERENCES fleet_loads(id),
  rate_conf_id    uuid REFERENCES fleet_rate_confirmations(id),
  business_id     uuid REFERENCES businesses(id),     -- who is billed
  fee_pct         numeric(5,4) NOT NULL,              -- e.g. 0.0075 = 0.75%
  fee_basis       numeric(10,2) NOT NULL,             -- rate amount fee is based on
  fee_amount      numeric(10,2) NOT NULL,             -- calculated fee $
  fee_type        text DEFAULT 'broker_transaction',
  status          text DEFAULT 'pending'
    CHECK (status IN ('pending','invoiced','paid','waived','disputed')),
  invoice_id      uuid,                               -- FK to billing invoice
  created_at      timestamptz DEFAULT now()
);
```

### `fleet_billing_subscriptions`
One row per module per business.

```sql
CREATE TABLE fleet_billing_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid REFERENCES businesses(id),
  module          text NOT NULL
    CHECK (module IN ('dispatch','driver','hos_planning','maintenance','broker','reports','bundle_core','bundle_full','owner_op_flat')),
  tier            text DEFAULT 'monthly'
    CHECK (tier IN ('monthly','annual')),
  price_cents     integer NOT NULL,                   -- price in cents (avoids float issues)
  seat_count      integer DEFAULT 1,                  -- for per-seat modules (driver)
  active          boolean DEFAULT true,
  started_at      timestamptz DEFAULT now(),
  cancelled_at    timestamptz,
  stripe_sub_id   text,                               -- Stripe subscription ID
  created_at      timestamptz DEFAULT now(),
  UNIQUE (business_id, module)
);
```

### `fleet_billing_invoices`
Monthly invoice per business — combines subscription + transaction fees.

```sql
CREATE TABLE fleet_billing_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid REFERENCES businesses(id),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  subscription_total_cents integer DEFAULT 0,
  transaction_fee_total_cents integer DEFAULT 0,
  total_cents     integer GENERATED ALWAYS AS (subscription_total_cents + transaction_fee_total_cents) STORED,
  status          text DEFAULT 'draft'
    CHECK (status IN ('draft','sent','paid','overdue','void')),
  stripe_invoice_id text,
  due_date        date,
  paid_at         timestamptz,
  created_at      timestamptz DEFAULT now()
);
```

---

## Automation: "The System Does the Work"

### What Gets Automated

| Event | Trigger | System Action |
|---|---|---|
| Load closes (POD uploaded / delivered status) | `fleet_driver_updates.type = 'delivered'` | Calculate platform fee → create `fleet_platform_fees` row |
| End of billing period | Monthly cron | Aggregate all fees + subscriptions → generate `fleet_billing_invoices` row |
| Invoice generated | Invoice created | Auto-send to business owner email (notification_router) |
| Payment due | Invoice due date | Auto-reminder via notification_router (email + in-app) |
| Subscription changes | User adds/removes module | Prorate and update Stripe subscription |

### The Fee Calculation Engine (to build)
`src/lib/billingEngine.ts`:
- `calculatePlatformFee(loadId)` — reads rate conf, applies fee %, creates fee record
- `generateMonthlyInvoice(businessId, period)` — aggregates all charges
- `applyBundleDiscount(businessId)` — checks if bundle threshold hit, recalculates
- `syncToStripe(invoice)` — pushes invoice to Stripe for collection

---

## What Needs to Be Decided Before Building Billing

| Decision | Options | Impact |
|---|---|---|
| % fee amount | 0.5% / 0.75% / 1% / tiered | Core revenue model |
| Who pays the fee | Broker / Carrier / Split | Sales motion + legal |
| Per-module pricing | $X per module | Subscription revenue |
| Owner-op flat rate | $59 / $79 / $99 | Owner-op adoption |
| Annual discount | 10% / 15% / 20% off | Cash flow vs flexibility |
| Payment processor | Stripe / Braintree | Integration work |
| Bundle threshold | 3 modules / any 2 / full suite | Bundle attractiveness |

---

## T2 Escalation: Billing Ownership Model

From the governance risks register — decision required before activation:

- **Business-billed:** Star Freight pays one invoice that covers all its members (drivers, dispatchers)
  - Simpler for the customer
  - Larger invoice = higher perceived value
  - Owner is accountable for the subscription

- **User-billed:** Each person pays their own seat
  - Messier for fleets
  - Better for independent contractors (owner-ops especially)
  
> **Recommendation: Business-billed for carriers/fleets, user-billed for solo owner-ops.**  
> The `fleet_billing_subscriptions` schema above supports both — `seat_count` handles driver seats,  
> while the subscription is owned by the `business_id`.
