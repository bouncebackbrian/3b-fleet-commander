import { describe, it, expect } from 'vitest'
import {
  getWeekRange, getPreviousWeekRange, resolveRange, splitIntoWeeks, lastNWeeks,
  sumPairedDurationSeconds, buildCategoryTimeFromEvents, bucketDelaySecondsByReason,
  splitRegularOvertime, estimateHourlyGrossPay, estimateGrossPay, DEFAULT_PAY_POLICY,
  buildDailyHoursRow, buildRangeSummary, applyRevenueShareFloor, sumRangeSummaries, applyWeeklyOvertimeSplit,
  detectShiftIntegrityWarnings,
  type TimedEvent, type PayPolicy, type RangeSummary, type DailyHoursRow, type ShiftIntegrityWarning,
} from './hours'

/** Minimal valid DailyHoursRow for applyWeeklyOvertimeSplit tests — only
 *  workDate/totalShiftHours/shiftMiles matter to that function; everything
 *  else is a zeroed placeholder to satisfy the interface. */
function makeRow(workDate: string, totalShiftHours: number, overrides: Partial<DailyHoursRow> = {}): DailyHoursRow {
  return {
    workDate, shiftId: `shift-${workDate}`, clockInAt: null, clockOutAt: null,
    totalShiftHours, rawCalculatedHours: totalShiftHours, verifiedHoursOverride: null,
    paidHours: totalShiftHours, nonPaidOperationalHours: 0, pendingPayableHours: 0,
    customerBillableHours: totalShiftHours, nonBilledOperationalHours: 0, pendingBillableHours: 0,
    regularHours: totalShiftHours, overtimeHours: 0, doubleTimeHours: 0,
    pretripHours: 0, posttripHours: 0, onDutyNotDrivingHours: 0, emptyDrivingHours: 0, loadedDrivingHours: 0,
    loadingWaitingHours: 0, unloadingWaitingHours: 0, fuelingHours: 0, delayHours: 0, trafficDelayHours: 0,
    mechanicalDelayHours: 0, adminDelayHours: 0, otherDelayHours: 0, unpaidBreakHours: 0, paidBreakHours: 0, vehicleCustodyHours: 0,
    manualYardTravelHours: 0, truckUnit: null, trailerUnit: null, jobsWorked: '', customersWorked: '', brokersWorked: '',
    loadsCompleted: 0, quantityHauled: 0, startOdometer: null, endOdometer: null, shiftMiles: null,
    hourlyEstimatedEarnings: 0, estimatedGrossEarnings: 0, payrollApprovedGrossEarnings: null,
    submissionStatus: 'clocked_out', payrollApprovalStatus: 'not_implemented', exceptionStatus: 'none',
    integrityWarnings: [],
    ...overrides,
  }
}

describe('getWeekRange', () => {
  it('returns Monday–Sunday for a mid-week Wednesday', () => {
    // 2026-07-29 is a Wednesday
    const r = getWeekRange(new Date('2026-07-29T12:00:00Z'))
    expect(r.start).toBe('2026-07-27') // Monday
    expect(r.end).toBe('2026-08-02')   // Sunday
  })

  it('treats Sunday as the last day of its own week, not the next', () => {
    const r = getWeekRange(new Date('2026-08-02T12:00:00Z')) // Sunday
    expect(r.start).toBe('2026-07-27')
    expect(r.end).toBe('2026-08-02')
  })
})

describe('getPreviousWeekRange', () => {
  it('returns the 7 days before the current week', () => {
    const r = getPreviousWeekRange(new Date('2026-07-29T12:00:00Z'))
    expect(r.start).toBe('2026-07-20')
    expect(r.end).toBe('2026-07-26')
  })
})

describe('splitIntoWeeks', () => {
  it('returns a single week when the range falls entirely inside one', () => {
    const weeks = splitIntoWeeks({ start: '2026-07-28', end: '2026-07-30' })
    expect(weeks).toEqual([{ start: '2026-07-27', end: '2026-08-02' }])
  })

  it('splits a multi-week range into full Monday–Sunday weeks, not clipped to the requested end', () => {
    // 2026-07-29 (Wed) to 2026-08-10 (Mon) spans 3 calendar weeks
    const weeks = splitIntoWeeks({ start: '2026-07-29', end: '2026-08-10' })
    expect(weeks).toEqual([
      { start: '2026-07-27', end: '2026-08-02' },
      { start: '2026-08-03', end: '2026-08-09' },
      { start: '2026-08-10', end: '2026-08-16' },
    ])
  })

  it('returns exactly one week when start and end land on the same week boundary', () => {
    const weeks = splitIntoWeeks({ start: '2026-07-27', end: '2026-08-02' })
    expect(weeks).toEqual([{ start: '2026-07-27', end: '2026-08-02' }])
  })
})

describe('lastNWeeks', () => {
  it('returns N consecutive weeks ending with the week containing the reference date', () => {
    const weeks = lastNWeeks(4, new Date('2026-08-19T12:00:00Z')) // Wednesday, week of 8/17-8/23
    expect(weeks).toEqual([
      { start: '2026-07-27', end: '2026-08-02' },
      { start: '2026-08-03', end: '2026-08-09' },
      { start: '2026-08-10', end: '2026-08-16' },
      { start: '2026-08-17', end: '2026-08-23' },
    ])
  })

  it('returns just the current week when count is 1', () => {
    const weeks = lastNWeeks(1, new Date('2026-08-19T12:00:00Z'))
    expect(weeks).toEqual([{ start: '2026-08-17', end: '2026-08-23' }])
  })
})

describe('resolveRange', () => {
  const ref = new Date('2026-07-29T12:00:00Z')
  it('aliases current_pay_period to the current week', () => {
    expect(resolveRange('current_pay_period', ref)).toEqual(resolveRange('current_week', ref))
  })
  it('aliases previous_pay_period to the previous week', () => {
    expect(resolveRange('previous_pay_period', ref)).toEqual(resolveRange('previous_week', ref))
  })
  it('returns the given custom range verbatim', () => {
    expect(resolveRange('custom', ref, { start: '2026-01-01', end: '2026-01-15' })).toEqual({ start: '2026-01-01', end: '2026-01-15' })
  })
  it('throws if custom is requested without a range', () => {
    expect(() => resolveRange('custom', ref)).toThrow()
  })
})

describe('sumPairedDurationSeconds', () => {
  it('sums duration between matched start/end pairs', () => {
    const events: TimedEvent[] = [
      { eventType: 'loading_started', effectiveAt: '2026-07-27T08:00:00Z' },
      { eventType: 'loading_completed', effectiveAt: '2026-07-27T08:15:00Z' },
      { eventType: 'loading_started', effectiveAt: '2026-07-27T10:00:00Z' },
      { eventType: 'loading_completed', effectiveAt: '2026-07-27T10:10:00Z' },
    ]
    expect(sumPairedDurationSeconds(events, 'loading_started', 'loading_completed')).toBe(25 * 60)
  })

  it('ignores an unmatched open start — never invents an end time', () => {
    const events: TimedEvent[] = [{ eventType: 'delay_started', effectiveAt: '2026-07-27T08:00:00Z' }]
    expect(sumPairedDurationSeconds(events, 'delay_started', 'delay_ended')).toBe(0)
  })
})

describe('buildCategoryTimeFromEvents', () => {
  it('buckets every paired category independently', () => {
    const events: TimedEvent[] = [
      { eventType: 'pretrip_started', effectiveAt: '2026-07-27T06:00:00Z' },
      { eventType: 'pretrip_completed', effectiveAt: '2026-07-27T06:20:00Z' },
      { eventType: 'delay_started', effectiveAt: '2026-07-27T09:00:00Z' },
      { eventType: 'delay_ended', effectiveAt: '2026-07-27T09:30:00Z' },
    ]
    const cat = buildCategoryTimeFromEvents(events)
    expect(cat.pretripSeconds).toBe(20 * 60)
    expect(cat.delaySeconds).toBe(30 * 60)
    expect(cat.loadingSeconds).toBe(0)
  })
})

describe('bucketDelaySecondsByReason', () => {
  it('buckets delay duration under the reason prefix on delay_started.notes', () => {
    const events: TimedEvent[] = [
      { eventType: 'delay_started', effectiveAt: '2026-07-27T08:00:00Z', notes: 'Traffic — backed up on I-80' },
      { eventType: 'delay_ended', effectiveAt: '2026-07-27T08:20:00Z' },
      { eventType: 'delay_started', effectiveAt: '2026-07-27T10:00:00Z', notes: 'Waiting for mechanic' },
      { eventType: 'delay_ended', effectiveAt: '2026-07-27T10:30:00Z' },
      { eventType: 'delay_started', effectiveAt: '2026-07-27T12:00:00Z', notes: 'Scale line' },
      { eventType: 'delay_ended', effectiveAt: '2026-07-27T12:10:00Z' },
    ]
    const buckets = bucketDelaySecondsByReason(events)
    expect(buckets['Traffic']).toBe(20 * 60)
    expect(buckets['Waiting for mechanic']).toBe(30 * 60)
    expect(buckets['Scale line']).toBe(10 * 60)
  })

  it('falls back to Other when notes are missing', () => {
    const events: TimedEvent[] = [
      { eventType: 'delay_started', effectiveAt: '2026-07-27T08:00:00Z' },
      { eventType: 'delay_ended', effectiveAt: '2026-07-27T08:15:00Z' },
    ]
    expect(bucketDelaySecondsByReason(events)).toEqual({ Other: 15 * 60 })
  })
})

describe('buildCategoryTimeFromEvents — traffic/mechanical breakdown', () => {
  it('splits delaySeconds into traffic, mechanical, and other buckets', () => {
    const events: TimedEvent[] = [
      { eventType: 'delay_started', effectiveAt: '2026-07-27T08:00:00Z', notes: 'Traffic' },
      { eventType: 'delay_ended', effectiveAt: '2026-07-27T08:20:00Z' },
      { eventType: 'delay_started', effectiveAt: '2026-07-27T10:00:00Z', notes: 'Breakdown' },
      { eventType: 'delay_ended', effectiveAt: '2026-07-27T10:30:00Z' },
      { eventType: 'delay_started', effectiveAt: '2026-07-27T12:00:00Z', notes: 'Weather' },
      { eventType: 'delay_ended', effectiveAt: '2026-07-27T12:15:00Z' },
    ]
    const cat = buildCategoryTimeFromEvents(events)
    expect(cat.delaySeconds).toBe(65 * 60)
    expect(cat.trafficDelaySeconds).toBe(20 * 60)
    expect(cat.mechanicalDelaySeconds).toBe(30 * 60)
    expect(cat.otherDelaySeconds).toBe(15 * 60)
  })
})

describe('splitRegularOvertime / estimateHourlyGrossPay', () => {
  it('splits an 8-hour day as all regular', () => {
    const split = splitRegularOvertime(8, 8)
    expect(split).toEqual({ regularHours: 8, overtimeHours: 0 })
  })

  it('splits a 10-hour day into 8 regular + 2 overtime', () => {
    const split = splitRegularOvertime(10, 8)
    expect(split).toEqual({ regularHours: 8, overtimeHours: 2 })
  })

  it('estimates gross pay using the $32/hr, 1.5x default policy', () => {
    const split = splitRegularOvertime(10, 8)
    const pay = estimateHourlyGrossPay(split, DEFAULT_PAY_POLICY)
    // 8 * 32 + 2 * 32 * 1.5 = 256 + 96 = 352
    expect(pay).toBe(352)
  })
})

describe('estimateGrossPay — per-mile vs hourly', () => {
  it('uses the hourly+OT estimate for payType hourly', () => {
    const split = splitRegularOvertime(10, 8)
    expect(estimateGrossPay(split, DEFAULT_PAY_POLICY, 120)).toBe(352) // miles ignored
  })

  it('uses shiftMiles * ratePerMile for payType per_mile', () => {
    const split = splitRegularOvertime(10, 8)
    const policy: PayPolicy = { ...DEFAULT_PAY_POLICY, payType: 'per_mile', ratePerMile: 0.65 }
    expect(estimateGrossPay(split, policy, 120)).toBe(78) // 120 * 0.65
  })

  it('never fabricates per-mile pay when miles are unknown', () => {
    const split = splitRegularOvertime(10, 8)
    const policy: PayPolicy = { ...DEFAULT_PAY_POLICY, payType: 'per_mile', ratePerMile: 0.65 }
    expect(estimateGrossPay(split, policy, null)).toBe(0)
  })
})

describe('buildDailyHoursRow', () => {
  it('assembles a full row from raw shift/event/segment inputs', () => {
    const row = buildDailyHoursRow({
      workDate: '2026-07-27',
      shiftId: 'shift-1',
      shiftState: 'submitted',
      clockInAt: '2026-07-27T06:00:00Z',
      clockOutAt: '2026-07-27T16:00:00Z', // 10 hours
      events: [
        { eventType: 'pretrip_started', effectiveAt: '2026-07-27T06:00:00Z' },
        { eventType: 'pretrip_completed', effectiveAt: '2026-07-27T06:15:00Z' },
      ],
      driveSecondsByCategory: { empty: 3600, loaded: 7200, yard_transfer: 0, fuel: 0, maintenance: 0, other: 0 },
      custodySeconds: 9 * 3600,
      truckUnit: 'DT-01',
      trailerUnit: null,
      jobNumbers: ['JOB-1', 'JOB-1'],
      customerNames: ['Cal-Neva Trucking'],
      brokerNames: [],
      loadsCompleted: 4,
      quantityHauled: 80,
      startOdometer: 45000,
      endOdometer: 45120,
      hasOpenCorrectionRequest: false,
      payPolicy: DEFAULT_PAY_POLICY,
    })

    expect(row.totalShiftHours).toBe(10)
    expect(row.regularHours).toBe(8)
    expect(row.overtimeHours).toBe(2)
    expect(row.pretripHours).toBe(0.25)
    expect(row.emptyDrivingHours).toBe(1)
    expect(row.loadedDrivingHours).toBe(2)
    expect(row.shiftMiles).toBe(120)
    expect(row.jobsWorked).toBe('JOB-1') // deduped
    expect(row.estimatedGrossEarnings).toBe(352)
    expect(row.payrollApprovedGrossEarnings).toBeNull()
    expect(row.payrollApprovalStatus).toBe('not_implemented')
    expect(row.exceptionStatus).toBe('none')
  })

  it('reproduces the David Carson non-paid-time acceptance test end-to-end (10.5h clocked, breakdown+return+posttrip all non-paid/non-billed)', () => {
    const row = buildDailyHoursRow({
      workDate: '2026-08-20', shiftId: 's-david', shiftState: 'submitted',
      clockInAt: '2026-08-20T13:00:00Z', clockOutAt: '2026-08-20T23:30:00Z', // 10.5h clocked span
      events: [], driveSecondsByCategory: { empty: 0, loaded: 0, yard_transfer: 0, fuel: 0, maintenance: 0, other: 0 },
      custodySeconds: 0, truckUnit: '07', trailerUnit: null,
      jobNumbers: [], customerNames: [], brokerNames: [],
      loadsCompleted: 0, quantityHauled: 0, startOdometer: null, endOdometer: null,
      hasOpenCorrectionRequest: false, payPolicy: DEFAULT_PAY_POLICY,
      classifiedSegments: [
        { category: 'breakdown_roadside', hours: 1.50, driverPayable: 'no', customerBillable: 'no' },
        { category: 'return_to_yard', hours: 0.70, driverPayable: 'no', customerBillable: 'no' },
        { category: 'posttrip', hours: 0.30, driverPayable: 'no', customerBillable: 'no' },
      ],
    })
    expect(row.totalShiftHours).toBe(10.5)
    expect(row.paidHours).toBe(8)
    expect(row.nonPaidOperationalHours).toBe(2.5)
    expect(row.customerBillableHours).toBe(8)
    expect(row.nonBilledOperationalHours).toBe(2.5)
    expect(row.regularHours).toBe(8) // NOT 8.5 (OT threshold) — pay is based on paidHours, not totalShiftHours
    expect(row.overtimeHours).toBe(0)
    expect(row.estimatedGrossEarnings).toBe(256) // 8h x $32/hr, not 10.5h
  })

  it('flags exceptionStatus when a correction was requested', () => {
    const row = buildDailyHoursRow({
      workDate: '2026-07-27', shiftId: 's', shiftState: 'active',
      clockInAt: '2026-07-27T06:00:00Z', clockOutAt: null,
      events: [], driveSecondsByCategory: { empty: 0, loaded: 0, yard_transfer: 0, fuel: 0, maintenance: 0, other: 0 },
      custodySeconds: 0, truckUnit: null, trailerUnit: null,
      jobNumbers: [], customerNames: [], brokerNames: [],
      loadsCompleted: 0, quantityHauled: 0, startOdometer: null, endOdometer: null,
      hasOpenCorrectionRequest: true, payPolicy: DEFAULT_PAY_POLICY,
      now: new Date('2026-07-27T08:00:00Z'),
    })
    expect(row.exceptionStatus).toBe('correction_requested')
    expect(row.totalShiftHours).toBe(2) // clocked in but not out — uses `now`
  })

  it('adds manual yard-travel minutes to total hours without touching clock times', () => {
    const row = buildDailyHoursRow({
      workDate: '2026-07-27', shiftId: 's', shiftState: 'submitted',
      clockInAt: '2026-07-27T06:00:00Z', clockOutAt: '2026-07-27T14:00:00Z', // 8 hours clocked
      events: [], driveSecondsByCategory: { empty: 0, loaded: 0, yard_transfer: 0, fuel: 0, maintenance: 0, other: 0 },
      custodySeconds: 0, truckUnit: null, trailerUnit: null,
      jobNumbers: [], customerNames: [], brokerNames: [],
      loadsCompleted: 0, quantityHauled: 0, startOdometer: null, endOdometer: null,
      hasOpenCorrectionRequest: false, payPolicy: DEFAULT_PAY_POLICY,
      manualStartTravelMinutes: 15, manualEndTravelMinutes: 30,
    })
    expect(row.clockInAt).toBe('2026-07-27T06:00:00Z')
    expect(row.clockOutAt).toBe('2026-07-27T14:00:00Z')
    expect(row.manualYardTravelHours).toBe(0.75) // 45 min
    expect(row.totalShiftHours).toBe(8.75)
  })
})

describe('buildRangeSummary', () => {
  it('sums figures across multiple daily rows', () => {
    const base = {
      clockInAt: null, clockOutAt: null, truckUnit: null, trailerUnit: null,
      jobsWorked: '', customersWorked: '', brokersWorked: '',
      payrollApprovedGrossEarnings: null as null, submissionStatus: 'submitted',
      payrollApprovalStatus: 'not_implemented' as const, exceptionStatus: 'none' as const,
      pretripHours: 0, posttripHours: 0, onDutyNotDrivingHours: 0,
      loadingWaitingHours: 0, unloadingWaitingHours: 0, fuelingHours: 0, delayHours: 0,
      trafficDelayHours: 0, mechanicalDelayHours: 0, otherDelayHours: 0,
      unpaidBreakHours: 0, paidBreakHours: 0, doubleTimeHours: 0, hourlyEstimatedEarnings: 0,
      manualYardTravelHours: 0, integrityWarnings: [] as ShiftIntegrityWarning[],
      rawCalculatedHours: 0, verifiedHoursOverride: null as DailyHoursRow['verifiedHoursOverride'], adminDelayHours: 0,
      paidHours: 0, nonPaidOperationalHours: 0, pendingPayableHours: 0,
      customerBillableHours: 0, nonBilledOperationalHours: 0, pendingBillableHours: 0,
    }
    const rows = [
      { ...base, workDate: '2026-07-27', shiftId: 's1', totalShiftHours: 10, regularHours: 8, overtimeHours: 2, emptyDrivingHours: 1, loadedDrivingHours: 2, vehicleCustodyHours: 9, loadsCompleted: 4, quantityHauled: 80, startOdometer: null, endOdometer: null, shiftMiles: 120, estimatedGrossEarnings: 352 },
      { ...base, workDate: '2026-07-28', shiftId: 's2', totalShiftHours: 8, regularHours: 8, overtimeHours: 0, emptyDrivingHours: 1, loadedDrivingHours: 1, vehicleCustodyHours: 7, loadsCompleted: 3, quantityHauled: 60, startOdometer: null, endOdometer: null, shiftMiles: 100, estimatedGrossEarnings: 256 },
    ]
    const summary = buildRangeSummary(rows)
    expect(summary.daysWorked).toBe(2)
    expect(summary.totalRegularHours).toBe(16)
    expect(summary.totalOvertimeHours).toBe(2)
    expect(summary.totalLoads).toBe(7)
    expect(summary.totalMiles).toBe(220)
    expect(summary.estimatedGrossEarnings).toBe(608)
    expect(summary.payrollApprovedGrossEarnings).toBeNull()
  })
})

describe('sumRangeSummaries', () => {
  const summary = (overrides: Partial<RangeSummary>): RangeSummary => ({
    daysWorked: 0, totalRegularHours: 0, totalOvertimeHours: 0, totalDoubleTimeHours: 0, totalDriveHours: 0,
    totalCustodyHours: 0, totalLoads: 0, totalQuantity: 0, totalMiles: 0, totalFuelingHours: 0,
    totalTrafficDelayHours: 0, totalMechanicalDelayHours: 0, totalOtherDelayHours: 0,
    estimatedGrossEarnings: 0, payrollApprovedGrossEarnings: null,
    totalPaidHours: 0, totalNonPaidOperationalHours: 0, totalPendingPayableHours: 0,
    totalCustomerBillableHours: 0, totalNonBilledOperationalHours: 0, totalPendingBillableHours: 0,
    ...overrides,
  })

  it('sums each field across summaries', () => {
    const result = sumRangeSummaries([
      summary({ daysWorked: 5, totalRegularHours: 40, totalLoads: 20, estimatedGrossEarnings: 1400 }),
      summary({ daysWorked: 4, totalRegularHours: 32, totalLoads: 15, estimatedGrossEarnings: 1000 }),
    ])
    expect(result.daysWorked).toBe(9)
    expect(result.totalRegularHours).toBe(72)
    expect(result.totalLoads).toBe(35)
    expect(result.estimatedGrossEarnings).toBe(2400)
  })

  it('preserves a revenue-share-adjusted earnings figure rather than re-deriving from raw hours', () => {
    // Simulates one driver whose per-driver summary was bumped by applyRevenueShareFloor
    // above what their raw daily hourly rows alone would sum to.
    const result = sumRangeSummaries([summary({ estimatedGrossEarnings: 1500 })])
    expect(result.estimatedGrossEarnings).toBe(1500)
  })

  it('returns all zeros for an empty list', () => {
    const result = sumRangeSummaries([])
    expect(result.daysWorked).toBe(0)
    expect(result.estimatedGrossEarnings).toBe(0)
  })
})

describe('applyRevenueShareFloor', () => {
  it('uses the hourly-based pay when it is larger than the revenue share', () => {
    // 40 hrs * $35/hr = $1400 hourly floor; 25% of $4000 revenue = $1000
    const result = applyRevenueShareFloor(1400, 4000, 25)
    expect(result.finalPay).toBe(1400)
    expect(result.usedRevenueShare).toBe(false)
    expect(result.revenueShareAmount).toBe(1000)
  })

  it('uses the revenue share when it is larger than the hourly-based pay', () => {
    // matches the uploaded proposal's own example: $150/h truck rate, 25% = $37.50/h > $35 floor
    const result = applyRevenueShareFloor(1400, 6000, 25)
    expect(result.finalPay).toBe(1500)
    expect(result.usedRevenueShare).toBe(true)
    expect(result.revenueShareAmount).toBe(1500)
  })

  it('falls back to the hourly floor when there is no revenue data', () => {
    const result = applyRevenueShareFloor(1400, 0, 25)
    expect(result.finalPay).toBe(1400)
    expect(result.usedRevenueShare).toBe(false)
  })

  it('ties go to the hourly-based pay (never switches on an equal amount)', () => {
    const result = applyRevenueShareFloor(1000, 4000, 25)
    expect(result.finalPay).toBe(1000)
    expect(result.usedRevenueShare).toBe(false)
  })
})

describe('applyWeeklyOvertimeSplit', () => {
  const weeklyPolicy: PayPolicy = { ...DEFAULT_PAY_POLICY, otMode: 'weekly', weeklyOtThresholdHours: 40 }

  it('four 10-hour days (40 total) — no overtime', () => {
    const rows = [
      makeRow('2026-08-10', 10), makeRow('2026-08-11', 10),
      makeRow('2026-08-12', 10), makeRow('2026-08-13', 10),
    ]
    const result = applyWeeklyOvertimeSplit(rows, weeklyPolicy)
    for (const r of result) expect(r.overtimeHours).toBe(0)
    expect(result.reduce((s, r) => s + r.regularHours, 0)).toBe(40)
  })

  it('five 10-hour days (50 total) — the last day carries the 10 OT hours', () => {
    const rows = [
      makeRow('2026-08-10', 10), makeRow('2026-08-11', 10), makeRow('2026-08-12', 10),
      makeRow('2026-08-13', 10), makeRow('2026-08-14', 10),
    ]
    const result = applyWeeklyOvertimeSplit(rows, weeklyPolicy)
    expect(result.map(r => r.regularHours)).toEqual([10, 10, 10, 10, 0])
    expect(result.map(r => r.overtimeHours)).toEqual([0, 0, 0, 0, 10])
    expect(result.reduce((s, r) => s + r.regularHours, 0)).toBe(40)
    expect(result.reduce((s, r) => s + r.overtimeHours, 0)).toBe(10)
  })

  it('a day that straddles the 40-hour line splits within that single day', () => {
    // 3 days * 10h = 30, then a 15h day -> 10 more regular (to reach 40) + 5 OT
    const rows = [
      makeRow('2026-08-10', 10), makeRow('2026-08-11', 10), makeRow('2026-08-12', 10),
      makeRow('2026-08-13', 15),
    ]
    const result = applyWeeklyOvertimeSplit(rows, weeklyPolicy)
    expect(result[3].regularHours).toBe(10)
    expect(result[3].overtimeHours).toBe(5)
  })

  it('recomputes estimatedGrossEarnings to match the corrected split', () => {
    const rows = [makeRow('2026-08-10', 45)] // single day over the weekly threshold
    const result = applyWeeklyOvertimeSplit(rows, weeklyPolicy)
    // 40 regular * $32 + 5 OT * $32 * 1.5 = 1280 + 240 = 1520
    expect(result[0].estimatedGrossEarnings).toBe(1520)
    expect(result[0].hourlyEstimatedEarnings).toBe(1520)
  })

  it('buckets separate weeks independently — no pooling across a week boundary', () => {
    // 2026-08-13 is a Thursday (week of 8/10-8/16); 2026-08-17 is the next Monday
    const rows = [
      makeRow('2026-08-10', 10), makeRow('2026-08-11', 10), makeRow('2026-08-12', 10), makeRow('2026-08-13', 10),
      makeRow('2026-08-17', 10), makeRow('2026-08-18', 10),
    ]
    const result = applyWeeklyOvertimeSplit(rows, weeklyPolicy)
    for (const r of result) expect(r.overtimeHours).toBe(0) // 40 in week 1, 20 in week 2 -- neither crosses 40
  })

  it('leaves per_mile policies completely untouched', () => {
    const rows = [makeRow('2026-08-10', 12, { shiftMiles: 100, estimatedGrossEarnings: 65, hourlyEstimatedEarnings: 65 })]
    const policy: PayPolicy = { ...DEFAULT_PAY_POLICY, payType: 'per_mile', ratePerMile: 0.65, otMode: 'weekly' }
    const result = applyWeeklyOvertimeSplit(rows, policy)
    expect(result).toBe(rows) // same reference — early-returned unchanged
  })

  it('daily-mode split (8hr threshold) still works standalone, unaffected by weekly logic', () => {
    // sanity check that splitRegularOvertime itself is untouched by this change
    const split = splitRegularOvertime(10, 8)
    expect(split.regularHours).toBe(8)
    expect(split.overtimeHours).toBe(2)
  })
})

describe('detectShiftIntegrityWarnings', () => {
  it('flags nothing for a normal same-day shift', () => {
    const warnings = detectShiftIntegrityWarnings({
      clockInAt: '2026-08-14T06:00:00Z', clockOutAt: '2026-08-14T16:30:00Z', totalShiftHours: 10.5,
      events: [
        { eventType: 'clock_in', effectiveAt: '2026-08-14T06:00:00Z' },
        { eventType: 'clock_out', effectiveAt: '2026-08-14T16:30:00Z' },
      ],
    })
    expect(warnings).toEqual([])
  })

  it('does not flag a normal late-night shift that crosses one midnight', () => {
    // Cal-Neva's real shifts routinely clock out after midnight for a ~12h day; this must stay quiet.
    const warnings = detectShiftIntegrityWarnings({
      clockInAt: '2026-08-11T13:00:00Z', clockOutAt: '2026-08-12T01:00:00Z', totalShiftHours: 12,
      events: [],
    })
    expect(warnings).toEqual([])
  })

  it('flags shift_over_16h', () => {
    const warnings = detectShiftIntegrityWarnings({
      clockInAt: '2026-08-14T06:00:00Z', clockOutAt: '2026-08-14T23:00:00Z', totalShiftHours: 17,
      events: [],
    })
    expect(warnings.map(w => w.code)).toContain('shift_over_16h')
  })

  it('flags multi_day_span when the shift spans 2+ calendar days — the Jul 31 / Aug 5 bug pattern', () => {
    const warnings = detectShiftIntegrityWarnings({
      clockInAt: '2026-07-31T16:36:16.455Z', clockOutAt: '2026-08-03T13:32:40.942Z', totalShiftHours: 68.94,
      events: [],
    })
    const codes = warnings.map(w => w.code)
    expect(codes).toContain('multi_day_span')
    expect(codes).toContain('shift_over_16h')
  })

  it('flags open_shift when there is no clock-out', () => {
    const warnings = detectShiftIntegrityWarnings({
      clockInAt: '2026-08-14T06:00:00Z', clockOutAt: null, totalShiftHours: 3,
      events: [],
    })
    expect(warnings.map(w => w.code)).toContain('open_shift')
  })

  it('flags duplicate_clock_in and duplicate_clock_out', () => {
    const warnings = detectShiftIntegrityWarnings({
      clockInAt: '2026-08-14T06:00:00Z', clockOutAt: '2026-08-14T16:00:00Z', totalShiftHours: 10,
      events: [
        { eventType: 'clock_in', effectiveAt: '2026-08-14T06:00:00Z' },
        { eventType: 'clock_in', effectiveAt: '2026-08-14T06:05:00Z' },
        { eventType: 'clock_out', effectiveAt: '2026-08-14T15:55:00Z' },
        { eventType: 'clock_out', effectiveAt: '2026-08-14T16:00:00Z' },
      ],
    })
    const codes = warnings.map(w => w.code)
    expect(codes).toContain('duplicate_clock_in')
    expect(codes).toContain('duplicate_clock_out')
  })

  it('flags event_outside_shift_window for a timestamp before clock-in or after clock-out', () => {
    const warnings = detectShiftIntegrityWarnings({
      clockInAt: '2026-08-14T06:00:00Z', clockOutAt: '2026-08-14T16:00:00Z', totalShiftHours: 10,
      events: [{ eventType: 'depart_yard', effectiveAt: '2026-08-14T17:00:00Z' }],
    })
    expect(warnings.map(w => w.code)).toContain('event_outside_shift_window')
  })

  it('flags unusually_long_custody when custody outlasts the paid shift by more than 2h', () => {
    const warnings = detectShiftIntegrityWarnings({
      clockInAt: '2026-08-14T06:00:00Z', clockOutAt: '2026-08-14T16:00:00Z', totalShiftHours: 10,
      events: [], custodyHours: 13,
    })
    expect(warnings.map(w => w.code)).toContain('unusually_long_custody')
  })

  it('does not flag custody a normal amount longer than the shift', () => {
    const warnings = detectShiftIntegrityWarnings({
      clockInAt: '2026-08-14T06:00:00Z', clockOutAt: '2026-08-14T16:00:00Z', totalShiftHours: 10,
      events: [], custodyHours: 10.5,
    })
    expect(warnings.map(w => w.code)).not.toContain('unusually_long_custody')
  })

  it('flags hours_overridden when a verified override is active', () => {
    const warnings = detectShiftIntegrityWarnings({
      clockInAt: '2026-07-27T15:00:00Z', clockOutAt: '2026-07-27T15:00:00Z', totalShiftHours: 4,
      events: [], hasVerifiedOverride: true,
    })
    expect(warnings.map(w => w.code)).toContain('hours_overridden')
  })
})

describe('verifiedHoursOverride — paper-sheet reconciliation', () => {
  it('uses the override for totalShiftHours/pay while keeping rawCalculatedHours untouched', () => {
    // July 27: truck down, no driving, but paid 4.00h per dispatcher agreement.
    const row = buildDailyHoursRow({
      workDate: '2026-07-27', shiftId: 's', shiftState: 'submitted',
      clockInAt: '2026-07-27T15:00:00Z', clockOutAt: '2026-07-27T15:00:00Z', // zero-duration, no driving occurred
      events: [], driveSecondsByCategory: { empty: 0, loaded: 0, yard_transfer: 0, fuel: 0, maintenance: 0, other: 0 },
      custodySeconds: 0, truckUnit: 'DT-06', trailerUnit: null,
      jobNumbers: [], customerNames: [], brokerNames: [],
      loadsCompleted: 0, quantityHauled: 0, startOdometer: null, endOdometer: null,
      hasOpenCorrectionRequest: false, payPolicy: DEFAULT_PAY_POLICY,
      verifiedHoursOverride: { hours: 4, reason: 'Truck down; paid per dispatcher agreement', sourceDocument: 'Dispatcher verbal agreement' },
    })
    expect(row.rawCalculatedHours).toBe(0)
    expect(row.totalShiftHours).toBe(4)
    expect(row.regularHours).toBe(4)
    expect(row.estimatedGrossEarnings).toBe(128) // 4 * $32, no OT
    expect(row.verifiedHoursOverride?.hours).toBe(4)
    expect(row.integrityWarnings.map(w => w.code)).toContain('hours_overridden')
  })

  it('leaves totalShiftHours as the raw calculation when no override is present', () => {
    const row = buildDailyHoursRow({
      workDate: '2026-08-13', shiftId: 's', shiftState: 'submitted',
      clockInAt: '2026-08-13T06:00:00Z', clockOutAt: '2026-08-13T16:30:00Z', // 10.5h
      events: [], driveSecondsByCategory: { empty: 0, loaded: 0, yard_transfer: 0, fuel: 0, maintenance: 0, other: 0 },
      custodySeconds: 0, truckUnit: null, trailerUnit: null,
      jobNumbers: [], customerNames: [], brokerNames: [],
      loadsCompleted: 0, quantityHauled: 0, startOdometer: null, endOdometer: null,
      hasOpenCorrectionRequest: false, payPolicy: DEFAULT_PAY_POLICY,
    })
    expect(row.totalShiftHours).toBe(10.5)
    expect(row.rawCalculatedHours).toBe(10.5)
    expect(row.verifiedHoursOverride).toBeNull()
    expect(row.integrityWarnings.map(w => w.code)).not.toContain('hours_overridden')
  })
})

describe('adminDelayHours — drug testing / administrative time bucket', () => {
  it('buckets a drug-test delay separately from mechanical and other delay', () => {
    const events: TimedEvent[] = [
      { eventType: 'delay_started', effectiveAt: '2026-08-04T13:30:00Z', notes: 'Drug Test — LabCorp Reno' },
      { eventType: 'delay_ended', effectiveAt: '2026-08-04T14:00:00Z' },
      { eventType: 'delay_started', effectiveAt: '2026-08-04T14:00:00Z', notes: 'Waiting for Mechanic — air bag' },
      { eventType: 'delay_ended', effectiveAt: '2026-08-04T18:00:00Z' },
    ]
    const cat = buildCategoryTimeFromEvents(events)
    expect(cat.adminDelaySeconds).toBe(30 * 60)
    expect(cat.mechanicalDelaySeconds).toBe(4 * 3600)
    expect(cat.otherDelaySeconds).toBe(0)
  })
})
