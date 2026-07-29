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

export interface CategoryTimeSeconds {
  pretripSeconds: number
  posttripSeconds: number
  loadingSeconds: number
  unloadingSeconds: number
  fuelingSeconds: number
  delaySeconds: number
  breakSeconds: number
}

export function buildCategoryTimeFromEvents(events: TimedEvent[]): CategoryTimeSeconds {
  return {
    pretripSeconds: sumPairedDurationSeconds(events, 'pretrip_started', 'pretrip_completed'),
    posttripSeconds: sumPairedDurationSeconds(events, 'posttrip_started', 'posttrip_completed'),
    loadingSeconds: sumPairedDurationSeconds(events, 'loading_started', 'loading_completed'),
    unloadingSeconds: sumPairedDurationSeconds(events, 'unloading_started', 'unloading_completed'),
    fuelingSeconds: sumPairedDurationSeconds(events, 'fuel_stop_started', 'fuel_stop_ended'),
    delaySeconds: sumPairedDurationSeconds(events, 'delay_started', 'delay_ended'),
    breakSeconds: sumPairedDurationSeconds(events, 'break_started', 'break_ended'),
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
}

export const DEFAULT_PAY_POLICY: PayPolicy = {
  baseHourlyRate: 32.00,
  dailyOtThresholdHours: 8.00,
  otMultiplier: 1.50,
}

/** Single hourly-rate + daily-OT estimate only — see module doc for scope. */
export function estimateHourlyGrossPay(split: HoursSplit, policy: PayPolicy): number {
  const regularPay = split.regularHours * policy.baseHourlyRate
  const otPay = split.overtimeHours * policy.baseHourlyRate * policy.otMultiplier
  return round2(regularPay + otPay)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
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

  const hourlyEstimatedEarnings = estimateHourlyGrossPay(split, input.payPolicy)

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
    estimatedGrossEarnings: round2(sum(rows.map(r => r.estimatedGrossEarnings))),
    payrollApprovedGrossEarnings: null,
  }
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0)
}
