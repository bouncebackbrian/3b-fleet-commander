/**
 * Dump Truck Mode — driver hours aggregation (spec §10)
 *
 * Pure functions only. The service layer fetches shift/event/segment/
 * custody/load-cycle rows and calls these to build the portal + CSV rows.
 *
 * Scope note: "pay period" is treated as an alias for the calendar week
 * (Monday–Sunday) — there is no configurable semi-monthly/biweekly pay
 * period entity in this build. Earnings are estimated using a single
 * hourly-rate + daily-overtime policy only (see fleet_dt_pay_policies);
 * per-load/per-mile/per-ton/detention/percentage rate types and the
 * payroll approval workflow are not implemented — `payrollApprovedGrossEarnings`
 * is always null and `payrollApprovalStatus` always reports 'not_implemented'.
 */

import type { DumpTruckEventType, DriveSegmentCategory } from './types'

const MS_PER_HOUR = 3600000

// ── Date range resolution ───────────────────────────────────────────────────

export interface DateRange {
  start: string // YYYY-MM-DD, inclusive
  end: string   // YYYY-MM-DD, inclusive
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Monday-start week containing `reference`. */
export function getWeekRange(reference: Date): DateRange {
  const d = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()))
  const day = d.getUTCDay() // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + diffToMonday)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return { start: toDateOnly(monday), end: toDateOnly(sunday) }
}

export function getPreviousWeekRange(reference: Date): DateRange {
  const thisWeek = getWeekRange(reference)
  const start = new Date(`${thisWeek.start}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - 7)
  const end = new Date(`${thisWeek.end}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() - 7)
  return { start: toDateOnly(start), end: toDateOnly(end) }
}

export type RangeType = 'current_week' | 'previous_week' | 'current_pay_period' | 'previous_pay_period' | 'custom'

export function resolveRange(rangeType: RangeType, reference: Date, custom?: DateRange): DateRange {
  switch (rangeType) {
    case 'current_week':
    case 'current_pay_period':
      return getWeekRange(reference)
    case 'previous_week':
    case 'previous_pay_period':
      return getPreviousWeekRange(reference)
    case 'custom':
      if (!custom) throw new Error('custom range requires start/end')
      return custom
  }
}

// ── Paired-event duration summing (loading, unloading, delay, break, fuel, pre/post-trip) ──

export interface TimedEvent {
  eventType: DumpTruckEventType
  effectiveAt: string
  notes?: string | null
}

/** Sums duration between each `startType` and the next `endType` seen after it. Unmatched opens are ignored (never invents an end time). */
export function sumPairedDurationSeconds(events: TimedEvent[], startType: DumpTruckEventType, endType: DumpTruckEventType): number {
  const sorted = [...events].sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))
  let total = 0
  let openAt: string | null = null
  for (const e of sorted) {
    if (e.eventType === startType) {
      openAt = e.effectiveAt
    } else if (e.eventType === endType && openAt) {
      total += Math.max(0, (new Date(e.effectiveAt).getTime() - new Date(openAt).getTime()) / 1000)
      openAt = null
    }
  }
  return total
}

// ── Delay-reason bucketing ───────────────────────────────────────────────────
// DelaySheet stores the driver-picked reason as the leading segment of
// delay_started.notes (e.g. "Traffic — backed up on I-80"). Bucketing by that
// reason gives dispatch "other work" categories (traffic, mechanical, etc)
// beyond the single lumped delay total — spec follow-up, not a DB column.

const TRAFFIC_DELAY_REASONS = ['traffic']
const MECHANICAL_DELAY_REASONS = ['waiting for mechanic', 'breakdown']

function delayReason(notes: string | null | undefined): string {
  if (!notes) return 'Other'
  const reason = notes.split('—')[0].trim()
  return reason || 'Other'
}

/** Sums delay_started→delay_ended durations, bucketed by the reason on delay_started.notes. */
export function bucketDelaySecondsByReason(events: TimedEvent[]): Record<string, number> {
  const sorted = [...events].sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))
  const totals: Record<string, number> = {}
  let openAt: string | null = null
  let openReason = 'Other'
  for (const e of sorted) {
    if (e.eventType === 'delay_started') {
      openAt = e.effectiveAt
      openReason = delayReason(e.notes)
    } else if (e.eventType === 'delay_ended' && openAt) {
      const seconds = Math.max(0, (new Date(e.effectiveAt).getTime() - new Date(openAt).getTime()) / 1000)
      totals[openReason] = (totals[openReason] ?? 0) + seconds
      openAt = null
    }
  }
  return totals
}

function sumReasonBucket(totals: Record<string, number>, reasons: string[]): number {
  const lowerReasons = reasons.map(r => r.toLowerCase())
  return Object.entries(totals)
    .filter(([reason]) => lowerReasons.includes(reason.toLowerCase()))
    .reduce((sum, [, seconds]) => sum + seconds, 0)
}

export interface CategoryTimeSeconds {
  pretripSeconds: number
  posttripSeconds: number
  loadingSeconds: number
  unloadingSeconds: number
  fuelingSeconds: number
  delaySeconds: number
  breakSeconds: number
  trafficDelaySeconds: number
  mechanicalDelaySeconds: number
  otherDelaySeconds: number
}

export function buildCategoryTimeFromEvents(events: TimedEvent[]): CategoryTimeSeconds {
  const delaySeconds = sumPairedDurationSeconds(events, 'delay_started', 'delay_ended')
  const delayByReason = bucketDelaySecondsByReason(events)
  const trafficDelaySeconds = sumReasonBucket(delayByReason, TRAFFIC_DELAY_REASONS)
  const mechanicalDelaySeconds = sumReasonBucket(delayByReason, MECHANICAL_DELAY_REASONS)

  return {
    pretripSeconds: sumPairedDurationSeconds(events, 'pretrip_started', 'pretrip_completed'),
    posttripSeconds: sumPairedDurationSeconds(events, 'posttrip_started', 'posttrip_completed'),
    loadingSeconds: sumPairedDurationSeconds(events, 'loading_started', 'loading_completed'),
    unloadingSeconds: sumPairedDurationSeconds(events, 'unloading_started', 'unloading_completed'),
    fuelingSeconds: sumPairedDurationSeconds(events, 'fuel_stop_started', 'fuel_stop_ended'),
    delaySeconds,
    breakSeconds: sumPairedDurationSeconds(events, 'break_started', 'break_ended'),
    trafficDelaySeconds,
    mechanicalDelaySeconds,
    otherDelaySeconds: Math.max(0, delaySeconds - trafficDelaySeconds - mechanicalDelaySeconds),
  }
}

// ── Regular / overtime split ─────────────────────────────────────────────────

export interface HoursSplit {
  regularHours: number
  overtimeHours: number
}

export function splitRegularOvertime(totalHours: number, dailyOtThresholdHours: number): HoursSplit {
  const regularHours = Math.min(totalHours, dailyOtThresholdHours)
  const overtimeHours = Math.max(0, totalHours - dailyOtThresholdHours)
  return { regularHours: round2(regularHours), overtimeHours: round2(overtimeHours) }
}

export interface PayPolicy {
  baseHourlyRate: number
  dailyOtThresholdHours: number
  otMultiplier: number
  /**
   * 2026-07-29: a driver can be paid hourly (default) or per-mile.
   * 2026-08-13: 'greater_of_hourly_or_revenue_share' added for Cal-Neva's
   * proposed comp structure (greater of $X/hr or Y% of the truck's billed
   * revenue) — see applyRevenueShareFloor() below and getPayPolicyForDriver.
   */
  payType: 'hourly' | 'per_mile' | 'greater_of_hourly_or_revenue_share'
  ratePerMile?: number | null
  /** Only used when payType is greater_of_hourly_or_revenue_share. */
  revenueSharePct?: number | null
  /** Minimum paid hours when dispatched but no truck/work is available
   *  (spec: 4-hour dispatch/breakdown minimum). Not auto-applied anywhere
   *  yet — no signal in this app distinguishes "no work available" from
   *  any other non-shift day; apply manually via the "Other" hours entry
   *  until that signal exists. */
  dispatchMinimumHours?: number
}

export const DEFAULT_PAY_POLICY: PayPolicy = {
  baseHourlyRate: 32.00,
  dailyOtThresholdHours: 8.00,
  otMultiplier: 1.50,
  payType: 'hourly',
}

/** Single hourly-rate + daily-OT estimate only — see module doc for scope. */
export function estimateHourlyGrossPay(split: HoursSplit, policy: PayPolicy): number {
  const regularPay = split.regularHours * policy.baseHourlyRate
  const otPay = split.overtimeHours * policy.baseHourlyRate * policy.otMultiplier
  return round2(regularPay + otPay)
}

/**
 * Estimated gross pay for the day, honoring the driver's pay type.
 * per_mile drivers are paid on shiftMiles * ratePerMile (0 if miles unknown
 * — never fabricated); hourly drivers use the existing hourly+OT estimate.
 */
export function estimateGrossPay(split: HoursSplit, policy: PayPolicy, shiftMiles: number | null): number {
  if (policy.payType === 'per_mile') {
    return round2((shiftMiles ?? 0) * (policy.ratePerMile ?? 0))
  }
  return estimateHourlyGrossPay(split, policy)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface RevenueShareFloorResult {
  finalPay: number
  usedRevenueShare: boolean
  revenueShareAmount: number
}

/**
 * The "greater of" comparison for payType = greater_of_hourly_or_revenue_share
 * (spec: driver gets whichever is larger, the hourly-rate floor or their cut
 * of the truck's billed revenue). This is inherently a weekly comparison
 * (Cal-Neva's proposal's pay period is Monday-Sunday) — callers pass the
 * driver's hourly-based pay already summed for the period, and the truck
 * revenue for that same period, not per-day figures.
 */
export function applyRevenueShareFloor(hourlyBasedPay: number, periodRevenue: number, revenueSharePct: number): RevenueShareFloorResult {
  const revenueShareAmount = round2(periodRevenue * (revenueSharePct / 100))
  if (revenueShareAmount > hourlyBasedPay) {
    return { finalPay: revenueShareAmount, usedRevenueShare: true, revenueShareAmount }
  }
  return { finalPay: round2(hourlyBasedPay), usedRevenueShare: false, revenueShareAmount }
}

// ── Daily row assembly ───────────────────────────────────────────────────────

export interface DailyHoursRowInput {
  workDate: string
  shiftId: string
  shiftState: string
  clockInAt: string | null
  clockOutAt: string | null
  events: TimedEvent[]
  driveSecondsByCategory: Record<DriveSegmentCategory, number>
  custodySeconds: number
  truckUnit: string | null
  trailerUnit: string | null
  jobNumbers: string[]
  customerNames: string[]
  brokerNames: string[]
  loadsCompleted: number
  quantityHauled: number
  startOdometer: number | null
  endOdometer: number | null
  hasOpenCorrectionRequest: boolean
  payPolicy: PayPolicy
  /** Manual yard<->first/last-stop travel time (spec: driver-entered, since
   *  no Maps routing API is configured yet) — added to totalShiftHours on
   *  top of the clocked duration, never used to edit clockInAt/clockOutAt. */
  manualStartTravelMinutes?: number | null
  manualEndTravelMinutes?: number | null
  now?: Date
}

export interface DailyHoursRow {
  workDate: string
  shiftId: string
  clockInAt: string | null
  clockOutAt: string | null
  totalShiftHours: number
  regularHours: number
  overtimeHours: number
  doubleTimeHours: number
  pretripHours: number
  posttripHours: number
  onDutyNotDrivingHours: number
  emptyDrivingHours: number
  loadedDrivingHours: number
  loadingWaitingHours: number
  unloadingWaitingHours: number
  fuelingHours: number
  delayHours: number
  trafficDelayHours: number
  mechanicalDelayHours: number
  otherDelayHours: number
  unpaidBreakHours: number
  paidBreakHours: number
  vehicleCustodyHours: number
  manualYardTravelHours: number
  truckUnit: string | null
  trailerUnit: string | null
  jobsWorked: string
  customersWorked: string
  brokersWorked: string
  loadsCompleted: number
  quantityHauled: number
  startOdometer: number | null
  endOdometer: number | null
  shiftMiles: number | null
  hourlyEstimatedEarnings: number
  estimatedGrossEarnings: number
  payrollApprovedGrossEarnings: null
  submissionStatus: string
  payrollApprovalStatus: 'not_implemented'
  exceptionStatus: 'none' | 'correction_requested'
}

export function buildDailyHoursRow(input: DailyHoursRowInput): DailyHoursRow {
  const now = input.now ?? new Date()
  const clockedHours = input.clockInAt
    ? round2((new Date(input.clockOutAt ?? now.toISOString()).getTime() - new Date(input.clockInAt).getTime()) / MS_PER_HOUR)
    : 0
  const manualYardTravelHours = round2(
    ((input.manualStartTravelMinutes ?? 0) + (input.manualEndTravelMinutes ?? 0)) / 60,
  )
  const totalShiftHours = round2(clockedHours + manualYardTravelHours)

  const split = splitRegularOvertime(totalShiftHours, input.payPolicy.dailyOtThresholdHours)
  const cat = buildCategoryTimeFromEvents(input.events)

  const driveTotalSeconds = Object.values(input.driveSecondsByCategory).reduce((a, b) => a + b, 0)
  const nonDrivingKnownSeconds =
    cat.pretripSeconds + cat.posttripSeconds + cat.loadingSeconds + cat.unloadingSeconds +
    cat.fuelingSeconds + cat.delaySeconds + cat.breakSeconds
  const onDutyNotDrivingSeconds = Math.max(
    0,
    totalShiftHours * 3600 - driveTotalSeconds - nonDrivingKnownSeconds,
  )

  const shiftMiles =
    input.startOdometer != null && input.endOdometer != null && input.endOdometer >= input.startOdometer
      ? input.endOdometer - input.startOdometer
      : null

  const hourlyEstimatedEarnings = estimateGrossPay(split, input.payPolicy, shiftMiles)

  return {
    workDate: input.workDate,
    shiftId: input.shiftId,
    clockInAt: input.clockInAt,
    clockOutAt: input.clockOutAt,
    totalShiftHours,
    regularHours: split.regularHours,
    overtimeHours: split.overtimeHours,
    doubleTimeHours: 0,
    pretripHours: round2(cat.pretripSeconds / 3600),
    posttripHours: round2(cat.posttripSeconds / 3600),
    onDutyNotDrivingHours: round2(onDutyNotDrivingSeconds / 3600),
    emptyDrivingHours: round2((input.driveSecondsByCategory.empty ?? 0) / 3600),
    loadedDrivingHours: round2((input.driveSecondsByCategory.loaded ?? 0) / 3600),
    loadingWaitingHours: round2(cat.loadingSeconds / 3600),
    unloadingWaitingHours: round2(cat.unloadingSeconds / 3600),
    fuelingHours: round2(cat.fuelingSeconds / 3600),
    delayHours: round2(cat.delaySeconds / 3600),
    trafficDelayHours: round2(cat.trafficDelaySeconds / 3600),
    mechanicalDelayHours: round2(cat.mechanicalDelaySeconds / 3600),
    otherDelayHours: round2(cat.otherDelaySeconds / 3600),
    unpaidBreakHours: round2(cat.breakSeconds / 3600),
    paidBreakHours: 0,
    vehicleCustodyHours: round2(input.custodySeconds / 3600),
    manualYardTravelHours,
    truckUnit: input.truckUnit,
    trailerUnit: input.trailerUnit,
    jobsWorked: [...new Set(input.jobNumbers)].join('; '),
    customersWorked: [...new Set(input.customerNames)].join('; '),
    brokersWorked: [...new Set(input.brokerNames)].join('; '),
    loadsCompleted: input.loadsCompleted,
    quantityHauled: input.quantityHauled,
    startOdometer: input.startOdometer,
    endOdometer: input.endOdometer,
    shiftMiles,
    hourlyEstimatedEarnings,
    estimatedGrossEarnings: hourlyEstimatedEarnings,
    payrollApprovedGrossEarnings: null,
    submissionStatus: input.shiftState,
    payrollApprovalStatus: 'not_implemented',
    exceptionStatus: input.hasOpenCorrectionRequest ? 'correction_requested' : 'none',
  }
}

// ── Range summary ─────────────────────────────────────────────────────────

export interface RangeSummary {
  daysWorked: number
  totalRegularHours: number
  totalOvertimeHours: number
  totalDoubleTimeHours: number
  totalDriveHours: number
  totalCustodyHours: number
  totalLoads: number
  totalQuantity: number
  totalMiles: number
  totalFuelingHours: number
  totalTrafficDelayHours: number
  totalMechanicalDelayHours: number
  totalOtherDelayHours: number
  estimatedGrossEarnings: number
  payrollApprovedGrossEarnings: null
}

export function buildRangeSummary(rows: DailyHoursRow[]): RangeSummary {
  return {
    daysWorked: rows.length,
    totalRegularHours: round2(sum(rows.map(r => r.regularHours))),
    totalOvertimeHours: round2(sum(rows.map(r => r.overtimeHours))),
    totalDoubleTimeHours: 0,
    totalDriveHours: round2(sum(rows.map(r => r.emptyDrivingHours + r.loadedDrivingHours))),
    totalCustodyHours: round2(sum(rows.map(r => r.vehicleCustodyHours))),
    totalLoads: sum(rows.map(r => r.loadsCompleted)),
    totalQuantity: round2(sum(rows.map(r => r.quantityHauled))),
    totalMiles: sum(rows.map(r => r.shiftMiles ?? 0)),
    totalFuelingHours: round2(sum(rows.map(r => r.fuelingHours))),
    totalTrafficDelayHours: round2(sum(rows.map(r => r.trafficDelayHours))),
    totalMechanicalDelayHours: round2(sum(rows.map(r => r.mechanicalDelayHours))),
    totalOtherDelayHours: round2(sum(rows.map(r => r.otherDelayHours))),
    estimatedGrossEarnings: round2(sum(rows.map(r => r.estimatedGrossEarnings))),
    payrollApprovedGrossEarnings: null,
  }
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0)
}

/**
 * Combines several already-built RangeSummary objects (e.g. one per driver)
 * into one business-wide total — used instead of re-deriving from raw daily
 * rows when a per-driver summary has been adjusted after the fact (e.g.
 * applyRevenueShareFloor bumping estimatedGrossEarnings above what the raw
 * daily rows alone would sum to). Re-deriving from rows would silently
 * drop that adjustment from the business total.
 */
export function sumRangeSummaries(summaries: RangeSummary[]): RangeSummary {
  return {
    daysWorked: sum(summaries.map(s => s.daysWorked)),
    totalRegularHours: round2(sum(summaries.map(s => s.totalRegularHours))),
    totalOvertimeHours: round2(sum(summaries.map(s => s.totalOvertimeHours))),
    totalDoubleTimeHours: round2(sum(summaries.map(s => s.totalDoubleTimeHours))),
    totalDriveHours: round2(sum(summaries.map(s => s.totalDriveHours))),
    totalCustodyHours: round2(sum(summaries.map(s => s.totalCustodyHours))),
    totalLoads: sum(summaries.map(s => s.totalLoads)),
    totalQuantity: round2(sum(summaries.map(s => s.totalQuantity))),
    totalMiles: sum(summaries.map(s => s.totalMiles)),
    totalFuelingHours: round2(sum(summaries.map(s => s.totalFuelingHours))),
    totalTrafficDelayHours: round2(sum(summaries.map(s => s.totalTrafficDelayHours))),
    totalMechanicalDelayHours: round2(sum(summaries.map(s => s.totalMechanicalDelayHours))),
    totalOtherDelayHours: round2(sum(summaries.map(s => s.totalOtherDelayHours))),
    estimatedGrossEarnings: round2(sum(summaries.map(s => s.estimatedGrossEarnings))),
    payrollApprovedGrossEarnings: null,
  }
}
