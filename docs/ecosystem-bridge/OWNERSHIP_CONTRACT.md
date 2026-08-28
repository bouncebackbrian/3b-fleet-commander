# 3B Ecosystem — Universal Ownership Contract

Status: canonical product rule

## One ownership model

Every durable record created by a 3B product must resolve to exactly one ownership context:

1. **3B ID / user-owned** — personal records that follow the person across employers and businesses.
2. **3B Business ID / business-owned** — records owned by a company, owner-operator business, or other registered 3B business.
3. **Shared operational** — evidence created while a 3B ID is operating for a 3B Business ID and legitimately relevant to both contexts.

The public identifiers are `profiles.three_b_id` (`3B-U-XXXXXXXX`) and `businesses.three_b_biz_id` (`3B-B-XXXXXXXX`). Database foreign keys should use the internal UUIDs `profiles.id` and `businesses.id`.

## Examples

### User-owned
- Driver Pro personal mileage and tax-purpose trips
- Driver-paid expenses not yet reimbursed
- Personal document vault items
- Personal pay history and independent notes
- Personal vehicle records

### Business-owned
- Trucks and trailers
- Dispatch jobs and customer rates
- Company subscriptions and invoices
- Company profitability reports
- Company maintenance records
- Internal management notes

### Shared operational
- A driver's shift for a company
- GPS/time evidence generated during a company shift
- Load/ticket/POD evidence
- Fueling event on a company truck performed by a driver
- Breakdown/delay/post-trip evidence
- Driver time corrections and approvals

## Access is not ownership

Ownership says whose record it is. Permissions say who may view or act on it.

A dispatcher may have access to a business-owned or shared record without owning it. A driver may retain appropriate evidence from a shared record without gaining access to business-only customer rates, internal notes, or other employees' data.

## Billing

- Fleet Commander Company subscriptions are owned/billed by a 3B Business ID.
- An owner-operator is still a 3B Business ID with one or more trucks and may also be the driver under the owner's 3B ID.
- Driver Free access is granted through a business relationship and operating-mode permission.
- Driver Pro is owned/billed by the 3B ID and survives employer changes.

## Expense Tracker bridge

Operational expenses must preserve `owner_type`, `payer_type`, `user_id`, `business_id`, source product/event IDs and an idempotency key. This allows 3B Expense Tracker to display the same real transaction in the correct personal and/or business context without creating duplicate financial transactions.

Example: a driver pays $85 for fuel on a company truck. The fuel event is shared operational evidence. The driver's financial view can show $85 paid out-of-pocket/reimbursable. The company view can show $85 operating cost. The bridge still represents one source transaction.

## Product implementation rule

New features must not invent a separate ownership system. Before persisting or exporting a durable record, the feature must be able to answer:

- Which 3B ID created/performed it?
- Which 3B ID owns it, if personal?
- Which 3B Business ID owns it, if business-owned?
- Is it shared operational evidence?
- Who paid, where money is involved?
- Which permission/role grants access?
- What source/idempotency key prevents duplicate cross-product records?

Use `src/lib/3b-ownership.ts` as the shared TypeScript contract for normalized ownership semantics.
