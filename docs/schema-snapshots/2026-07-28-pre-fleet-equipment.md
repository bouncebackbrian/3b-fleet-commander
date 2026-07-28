# Production Schema Snapshot — 2026-07-28, before `fleet_equipment` migration

Captured from the live "Fleet Commander" Supabase project (`goqzhdrmrdlkchmwfiur`)
immediately before applying the minimal `fleet_equipment` table and the Dump
Truck Mode migrations. Taken as the required pre-DDL checkpoint per the
approved minimal-fix plan. This is a point-in-time record for future schema
reconciliation — see `docs/SCHEMA_RECONCILIATION.md` for the tracked follow-up.

## Row counts (context: near-empty database)

| Table | Rows |
|---|---|
| `businesses` | 1 |
| `profiles` | 0 |
| `fleet_business_members` | 1 |
| `fleet_loads` | 0 |

## `businesses` (live columns)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| name | text | NO | — |
| slug | text | NO | — |
| owner_id | uuid | YES | — |
| active | boolean | YES | `true` |
| created_at | timestamptz | YES | `now()` |
| updated_at | timestamptz | YES | `now()` |
| type | text | NO | `'carrier'` |
| stripe_customer_id | text | YES | — |
| billing_email | text | YES | — |
| subscription_status | text | YES | `'none'` |
| trial_ends_at | timestamptz | YES | — |
| current_period_end | timestamptz | YES | — |

**No `company_name` column. No `three_b_biz_id` column.** The name field is
`name`. There is no 3B Business ID column anywhere on this table.

Constraints: PK `id`; UNIQUE `stripe_customer_id`; UNIQUE `slug`.

RLS policies:
- `Members can read their business` (SELECT): `id IN (select business_id from fleet_business_members where user_id = auth.uid() and active = true)`
- `Owner can update their business` (UPDATE): `owner_id = auth.uid()`

## `profiles` (live columns)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | — (FK → `auth.users.id`) |
| full_name | text | YES | — |
| phone | text | YES | — |
| cdl_number | text | YES | — |
| cdl_state | text | YES | — |
| cdl_class | text | YES | — |
| cdl_expiry | date | YES | — |
| medical_expiry | date | YES | — |
| hazmat | boolean | YES | `false` |
| role | text | YES | `'driver'` |
| business_id | **text** | YES | — |
| created_at | timestamptz | YES | `now()` |
| updated_at | timestamptz | YES | `now()` |
| three_b_id | text | YES | — |

**No `first_name`/`last_name` split — it's a single `full_name` column.**
`three_b_id` does exist and is usable as-is. Note `business_id` here is
`text`, not `uuid` (unrelated to Dump Truck Mode, which never reads this
column — flagged for the reconciliation doc only).

Constraints: PK `id`; FK `id` → `auth.users`.

RLS: `profiles_own` (ALL): `auth.uid() = id`.

## `fleet_business_members` (live columns)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| business_id | uuid | NO | — |
| user_id | uuid | NO | — |
| role | text | NO | — |
| active | boolean | YES | `true` |
| created_at | timestamptz | YES | `now()` |

No check constraint on `role` (free text). Only role value currently in use:
`'owner'` (the one existing row). Matches what the Dump Truck Mode RLS
policies (`fleet_dt_has_role`) check for.

Constraints: PK `id`; FK `business_id` → `businesses.id`; UNIQUE
`(business_id, user_id)`.

RLS:
- `Admin/owner can read all business members` (SELECT): role in
  `('admin','owner_operator')` — note this existing policy checks for the
  string `'owner_operator'`, not `'owner'`; unrelated to Dump Truck Mode
  (governs reads of this table only, not the `fleet_dt_has_role()` function
  Dump Truck Mode's own policies use, which is `SECURITY DEFINER` and reads
  `fleet_business_members.role` directly).
- `Members can read their own membership` (SELECT): `user_id = auth.uid()`.

## `fleet_equipment`

**Does not exist.** Confirmed via `list_tables` — absent from the live
schema entirely, despite a full historical migration for it
(`supabase/migrations/20260623_fleet_equipment.sql`) existing unapplied in
the repository.

## Applied migration history (live, per `list_migrations`)

Stops at `20260607225423_create_fleet_audit_logs`. Everything in the repo's
`supabase/migrations/` directory dated after that — `20260606_3b_identity_arch.sql`,
`20260622_fleet_driver_score.sql`, `20260623_fleet_*.sql` (equipment, hos,
fuel, emergency_events, rewards) — was **never applied** to this database.
