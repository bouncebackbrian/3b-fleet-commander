import { describe, it, expect } from 'vitest'
import { computeArrivalPlan, computeArrivalRisk, requiredArrivalChangedMaterially } from './dispatchPlanning'

describe('computeArrivalPlan', () => {
  it('matches the spec acceptance test exactly (David/07, 6:30 AM required, 40-min drive)', () => {
    const plan = computeArrivalPlan({
      requiredArrivalAt: '2026-08-20T13:30:00.000Z', // 6:30 AM PDT (UTC-7)
      driveMinutes: 40,
      settings: { pretripMinutes: 20, earlyArrivalBufferMinutes: 10 },
    })
    expect(plan.targetArrivalAt).toBe('2026-08-20T13:20:00.000Z') // 6:20 AM
    expect(plan.leaveYardAt).toBe('2026-08-20T12:40:00.000Z')     // 5:40 AM
    expect(plan.yardArrivalAt).toBe('2026-08-20T12:20:00.000Z')   // 5:20 AM
  })

  it('matches the worked example in the spec body (no early-arrival buffer)', () => {
    const plan = computeArrivalPlan({
      requiredArrivalAt: '2026-08-20T13:30:00.000Z', // 6:30 AM
      driveMinutes: 40,
      settings: { pretripMinutes: 20, earlyArrivalBufferMinutes: 0 },
    })
    expect(plan.yardArrivalAt).toBe('2026-08-20T12:30:00.000Z') // 5:30 AM
  })

  it('handles a zero drive time (pickup site is the yard itself)', () => {
    const plan = computeArrivalPlan({
      requiredArrivalAt: '2026-08-20T13:30:00.000Z',
      driveMinutes: 0,
      settings: { pretripMinutes: 20, earlyArrivalBufferMinutes: 10 },
    })
    expect(plan.yardArrivalAt).toBe('2026-08-20T13:00:00.000Z') // 6:00 AM
  })
})

describe('computeArrivalRisk', () => {
  const required = '2026-08-20T13:30:00.000Z'

  it('is on_time when estimated arrival is at or before required', () => {
    expect(computeArrivalRisk('2026-08-20T13:25:00.000Z', required, 10)).toBe('on_time')
    expect(computeArrivalRisk(required, required, 10)).toBe('on_time')
  })

  it('is at_risk within the configured late window', () => {
    expect(computeArrivalRisk('2026-08-20T13:35:00.000Z', required, 10)).toBe('at_risk') // +5 min
    expect(computeArrivalRisk('2026-08-20T13:40:00.000Z', required, 10)).toBe('at_risk') // +10 min, boundary
  })

  it('is late beyond the configured late window', () => {
    expect(computeArrivalRisk('2026-08-20T13:41:00.000Z', required, 10)).toBe('late')
    expect(computeArrivalRisk('2026-08-20T14:30:00.000Z', required, 10)).toBe('late')
  })
})

describe('requiredArrivalChangedMaterially', () => {
  it('is false when nothing changed', () => {
    expect(requiredArrivalChangedMaterially('2026-08-20T13:30:00.000Z', '2026-08-20T13:30:00.000Z', 10)).toBe(false)
  })

  it('is true the first time a required arrival is set', () => {
    expect(requiredArrivalChangedMaterially(null, '2026-08-20T13:30:00.000Z', 10)).toBe(true)
  })

  it('is true when cleared', () => {
    expect(requiredArrivalChangedMaterially('2026-08-20T13:30:00.000Z', null, 10)).toBe(true)
  })

  it('is false for a change smaller than the threshold', () => {
    expect(requiredArrivalChangedMaterially('2026-08-20T13:30:00.000Z', '2026-08-20T13:35:00.000Z', 10)).toBe(false)
  })

  it('is true for a change at or beyond the threshold', () => {
    expect(requiredArrivalChangedMaterially('2026-08-20T13:30:00.000Z', '2026-08-20T13:40:00.000Z', 10)).toBe(true)
    expect(requiredArrivalChangedMaterially('2026-08-20T13:30:00.000Z', '2026-08-20T14:00:00.000Z', 10)).toBe(true)
  })
})
