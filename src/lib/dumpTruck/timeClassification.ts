/**
 * Dump Truck Mode — non-paid/non-billed time classification (pure functions)
 *
 * Three time concepts, kept strictly separate per spec:
 *   1. Operational time — what actually happened (unchanged: hours.ts's
 *      existing totalShiftHours/rawCalculatedHours already IS "Total
 *      Operational Time" — a full clock-span figure that includes
 *      breakdown/return-to-yard/post-trip time exactly as recorded).
 *   2. Driver payable time — independently classified per segment.
 *   3. Customer billable time — independently classified per segment.
 *
 * This module never infers one from the other, and never mutates
 * operational time — it only computes how much of it is currently
 * approved as payable/billable given a set of classified segments
 * (management adjustments + breakdowns + the business's default policy for
 * routine return-to-yard/post-trip time).
 */

import type { TimedEvent } from './hours'

// ── 15-minute round-up rule ─────────────────────────────────────────────────
// Any ESTIMATED/manual return-drive allowance used for reconciliation rounds
// up to the nearest 15 minutes (spec: 31->45, 36->45, 44->45, 46->60, 62->75).
// Never applied to actual GPS/timestamp-derived durations — those are used
// verbatim (see computeReturnToYardSeconds below, which is exact).

export function roundUpToQuarterHour(minutes: number): number {
  if (minutes <= 0) return 0
  return Math.ceil(minutes / 15) * 15
}

// ── Return-to-yard duration (from actual recorded events) ──────────────────

const FINAL_LEG_TYPES = new Set<TimedEvent['eventType']>(['depart_dump', 'depart_pickup'])

/**
 * Actual return-to-yard duration: the gap between the last productive
 * depart (depart_dump/depart_pickup) before the day's arrive_yard event and
 * that arrival. Returns null when the shift has no arrive_yard event yet, or
 * no qualifying depart before it — never fabricates a duration from
 * incomplete data (source-priority rule #1: actual GPS/timestamps first).
 */
export function computeReturnToYardSeconds(events: TimedEvent[]): number | null {
  const sorted = [...events].sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))
  const arriveYard = [...sorted].reverse().find(e => e.eventType === 'arrive_yard')
  if (!arriveYard) return null

  const lastLeg = [...sorted]
    .filter(e => FINAL_LEG_TYPES.has(e.eventType) && e.effectiveAt <= arriveYard.effectiveAt)
    .pop()
  if (!lastLeg) return null

  return Math.max(0, (new Date(arriveYard.effectiveAt).getTime() - new Date(lastLeg.effectiveAt).getTime()) / 1000)
}

// ── Classified segments -> payable/billable split ──────────────────────────

export type PayBillDecision = 'yes' | 'no' | 'pending'

export interface ClassifiedSegment {
  category: string
  hours: number
  driverPayable: PayBillDecision
  customerBillable: PayBillDecision
  /** Partial-split override — approved payable hours, defaults to full `hours` when driverPayable='yes' and 0 otherwise. Never exceeds `hours`. */
  payableHoursOverride?: number | null
  /** Partial-split override — approved billable hours, same default rule. */
  billableHoursOverride?: number | null
}

export interface OperationalTimeSplit {
  totalOperationalHours: number
  paidHours: number
  nonPaidOperationalHours: number
  pendingPayableHours: number
  customerBillableHours: number
  nonBilledOperationalHours: number
  pendingBillableHours: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function resolvedHours(decision: PayBillDecision, fullHours: number, override: number | null | undefined): number {
  if (override != null) return Math.min(Math.max(0, override), fullHours)
  return decision === 'yes' ? fullHours : 0
}

/**
 * totalOperationalHours already includes every classified segment's hours
 * (they're sub-intervals of the shift's clock span) plus whatever
 * unclassified "assumed payable/billable" productive time remains (normal
 * hauling). Segments removed from the assumed-payable/billable pool are
 * replaced with only their approved payable/billable portion — pending
 * segments are held out of both the paid and non-paid buckets until
 * management decides, per spec ("PENDING REVIEW" is not the same as "no").
 */
export function computeOperationalTimeSplit(
  totalOperationalHours: number,
  segments: ClassifiedSegment[],
): OperationalTimeSplit {
  let classifiedHours = 0
  let approvedPayable = 0
  let nonPaid = 0
  let pendingPay = 0
  let approvedBillable = 0
  let nonBilled = 0
  let pendingBill = 0

  for (const s of segments) {
    classifiedHours += s.hours

    const payHrs = resolvedHours(s.driverPayable, s.hours, s.payableHoursOverride)
    approvedPayable += payHrs
    if (s.driverPayable === 'pending' && s.payableHoursOverride == null) pendingPay += s.hours
    else nonPaid += Math.max(0, s.hours - payHrs)

    const billHrs = resolvedHours(s.customerBillable, s.hours, s.billableHoursOverride)
    approvedBillable += billHrs
    if (s.customerBillable === 'pending' && s.billableHoursOverride == null) pendingBill += s.hours
    else nonBilled += Math.max(0, s.hours - billHrs)
  }

  const unclassifiedHours = Math.max(0, totalOperationalHours - classifiedHours)
  const paidHours = round2(unclassifiedHours + approvedPayable)
  const customerBillableHours = round2(unclassifiedHours + approvedBillable)

  return {
    totalOperationalHours: round2(totalOperationalHours),
    paidHours,
    nonPaidOperationalHours: round2(nonPaid),
    pendingPayableHours: round2(pendingPay),
    customerBillableHours,
    nonBilledOperationalHours: round2(nonBilled),
    pendingBillableHours: round2(pendingBill),
  }
}

/** Non-paid hours valued at a reference rate — an analytics figure only, never a payroll amount (spec: label as opportunity cost, not "amount owed"). */
export function computeNonPaidTimeValue(nonPaidOperationalHours: number, referenceHourlyRate: number): number {
  return round2(nonPaidOperationalHours * referenceHourlyRate)
}

// ── Category catalogs (shared by service layer validation + UI dropdowns) ──

export const MANAGEMENT_ADJUSTMENT_CATEGORIES = [
  'breakdown_roadside', 'shop_repair_waiting', 'return_to_yard', 'posttrip', 'fueling', 'paperwork',
  'dispatch_required_waiting', 'customer_delay', 'scale_delay', 'weather', 'road_closure', 'truck_dropoff',
  'training', 'drug_testing', 'administrative', 'corrected_paper_sheet_hours', 'other',
] as const
export type ManagementAdjustmentCategory = (typeof MANAGEMENT_ADJUSTMENT_CATEGORIES)[number]

export const BREAKDOWN_CATEGORIES = [
  'tire', 'engine', 'transmission', 'air_system', 'brake', 'overheating', 'electrical',
  'fuel', 'hydraulic', 'suspension', 'accident', 'stuck', 'other',
] as const
export type BreakdownCategory = (typeof BREAKDOWN_CATEGORIES)[number]
