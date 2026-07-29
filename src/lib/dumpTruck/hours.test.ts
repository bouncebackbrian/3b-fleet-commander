import { describe, it, expect } from 'vitest'
import {
  getWeekRange, getPreviousWeekRange, resolveRange,
  sumPairedDurationSeconds, buildCategoryTimeFromEvents,
  splitRegularOvertime, estimateHourlyGrossPay, DEFAULT_PAY_POLICY,
  buildDailyHoursRow, buildRangeSummary, type TimedEvent,
} from './hours'

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
      unpaidBreakHours: 0, paidBreakHours: 0, doubleTimeHours: 0, hourlyEstimatedEarnings: 0,
      manualYardTravelHours: 0,
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
