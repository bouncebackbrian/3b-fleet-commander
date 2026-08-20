import { describe, it, expect } from 'vitest'
import {
  roundUpToQuarterHour, computeReturnToYardSeconds, computeOperationalTimeSplit, computeNonPaidTimeValue,
  type ClassifiedSegment,
} from './timeClassification'
import type { TimedEvent } from './hours'

describe('roundUpToQuarterHour', () => {
  it('matches every example in the spec', () => {
    expect(roundUpToQuarterHour(31)).toBe(45)
    expect(roundUpToQuarterHour(36)).toBe(45)
    expect(roundUpToQuarterHour(44)).toBe(45)
    expect(roundUpToQuarterHour(46)).toBe(60)
    expect(roundUpToQuarterHour(62)).toBe(75)
  })

  it('leaves an exact multiple of 15 unchanged', () => {
    expect(roundUpToQuarterHour(45)).toBe(45)
    expect(roundUpToQuarterHour(0)).toBe(0)
  })

  it('never returns negative for non-positive input', () => {
    expect(roundUpToQuarterHour(-5)).toBe(0)
  })
})

describe('computeReturnToYardSeconds', () => {
  it('matches the acceptance test — 3:45 PM departure to 4:27 PM yard arrival (42 min)', () => {
    const events: TimedEvent[] = [
      { eventType: 'depart_pickup', effectiveAt: '2026-08-20T18:00:00.000Z' },
      { eventType: 'arrive_dump', effectiveAt: '2026-08-20T18:30:00.000Z' },
      { eventType: 'depart_dump', effectiveAt: '2026-08-20T22:45:00.000Z' }, // 3:45 PM PDT
      { eventType: 'arrive_yard', effectiveAt: '2026-08-20T23:27:00.000Z' }, // 4:27 PM PDT
    ]
    expect(computeReturnToYardSeconds(events)).toBe(42 * 60)
  })

  it('returns null with no arrive_yard event', () => {
    const events: TimedEvent[] = [{ eventType: 'depart_dump', effectiveAt: '2026-08-20T22:45:00.000Z' }]
    expect(computeReturnToYardSeconds(events)).toBeNull()
  })

  it('returns null with no qualifying depart before arrive_yard', () => {
    const events: TimedEvent[] = [{ eventType: 'arrive_yard', effectiveAt: '2026-08-20T23:27:00.000Z' }]
    expect(computeReturnToYardSeconds(events)).toBeNull()
  })
})

describe('computeOperationalTimeSplit', () => {
  it('matches the full David Carson acceptance test', () => {
    const segments: ClassifiedSegment[] = [
      { category: 'breakdown_roadside', hours: 1.50, driverPayable: 'no', customerBillable: 'no' },
      { category: 'return_to_yard', hours: 0.70, driverPayable: 'no', customerBillable: 'no' },
      { category: 'posttrip', hours: 0.30, driverPayable: 'no', customerBillable: 'no' },
    ]
    const split = computeOperationalTimeSplit(10.50, segments)
    expect(split.totalOperationalHours).toBe(10.50)
    expect(split.paidHours).toBe(8.00)
    expect(split.nonPaidOperationalHours).toBe(2.50)
    expect(split.customerBillableHours).toBe(8.00)
    expect(split.nonBilledOperationalHours).toBe(2.50)
    expect(split.pendingPayableHours).toBe(0)
    expect(split.pendingBillableHours).toBe(0)
  })

  it('handles a partial payable/billable split (spec example)', () => {
    const segments: ClassifiedSegment[] = [
      { category: 'breakdown_roadside', hours: 2.50, driverPayable: 'yes', customerBillable: 'no', payableHoursOverride: 1.00 },
    ]
    const split = computeOperationalTimeSplit(2.50, segments)
    expect(split.paidHours).toBe(1.00)
    expect(split.nonPaidOperationalHours).toBe(1.50)
    expect(split.customerBillableHours).toBe(0)
    expect(split.nonBilledOperationalHours).toBe(2.50)
  })

  it('holds pending segments out of both the paid and non-paid buckets', () => {
    const segments: ClassifiedSegment[] = [
      { category: 'breakdown_roadside', hours: 1.00, driverPayable: 'pending', customerBillable: 'pending' },
    ]
    const split = computeOperationalTimeSplit(9.00, segments)
    expect(split.paidHours).toBe(8.00) // unclassified 8.00 + approved 0
    expect(split.nonPaidOperationalHours).toBe(0)
    expect(split.pendingPayableHours).toBe(1.00)
    expect(split.pendingBillableHours).toBe(1.00)
  })

  it('with no classified segments, all operational time is paid/billable (today\'s existing behavior, unchanged)', () => {
    const split = computeOperationalTimeSplit(8.00, [])
    expect(split.paidHours).toBe(8.00)
    expect(split.nonPaidOperationalHours).toBe(0)
    expect(split.customerBillableHours).toBe(8.00)
    expect(split.nonBilledOperationalHours).toBe(0)
  })
})

describe('computeNonPaidTimeValue', () => {
  it('is a simple hours x rate figure, matching the spec examples', () => {
    expect(computeNonPaidTimeValue(2.50, 32)).toBe(80.00)
    expect(computeNonPaidTimeValue(3.25, 32)).toBe(104.00)
  })
})
