import { describe, it, expect } from 'vitest'
import { computeFuelEfficiency, validateFuelEntry, computeFuelCostPerLoad, DEFAULT_UNREALISTIC_JUMP_MILES } from './fuel'

describe('computeFuelEfficiency', () => {
  it('computes miles, mpg, and cost per mile when all inputs are present', () => {
    const r = computeFuelEfficiency({ odometer: 45500, priorOdometer: 45300, gallons: 25, totalCost: 112.50 })
    expect(r.milesSincePrior).toBe(200)
    expect(r.mpg).toBe(8)
    expect(r.costPerMile).toBe(0.563) // 112.50 / 200 = 0.5625, rounded to 3dp
  })

  it('returns nulls when the prior odometer is unknown, never fabricating a number', () => {
    const r = computeFuelEfficiency({ odometer: 45500, priorOdometer: null, gallons: 25, totalCost: 100 })
    expect(r.milesSincePrior).toBeNull()
    expect(r.mpg).toBeNull()
    expect(r.costPerMile).toBeNull()
  })

  it('does not compute mpg or cost-per-mile if odometer went backwards', () => {
    const r = computeFuelEfficiency({ odometer: 45000, priorOdometer: 45300, gallons: 25, totalCost: 100 })
    expect(r.milesSincePrior).toBeNull()
    expect(r.mpg).toBeNull()
  })

  it('leaves mpg null when gallons is zero or missing (avoids divide-by-zero)', () => {
    const r = computeFuelEfficiency({ odometer: 45500, priorOdometer: 45300, gallons: 0, totalCost: 100 })
    expect(r.mpg).toBeNull()
  })
})

describe('validateFuelEntry', () => {
  it('flags a decreasing odometer', () => {
    const flags = validateFuelEntry({ odometer: 45000, priorOdometer: 45300, totalCost: 100 })
    expect(flags.decreasingOdometer).toBe(true)
  })

  it('flags an unrealistic mileage jump past the default threshold', () => {
    const flags = validateFuelEntry({ odometer: 45300 + DEFAULT_UNREALISTIC_JUMP_MILES + 1, priorOdometer: 45300, totalCost: 100 })
    expect(flags.unrealisticJump).toBe(true)
  })

  it('does not flag a normal day of driving', () => {
    const flags = validateFuelEntry({ odometer: 45500, priorOdometer: 45300, totalCost: 100 })
    expect(flags.decreasingOdometer).toBe(false)
    expect(flags.unrealisticJump).toBe(false)
  })

  it('honors a custom jump threshold', () => {
    const flags = validateFuelEntry({ odometer: 45450, priorOdometer: 45300, totalCost: 100, maxReasonableJumpMiles: 100 })
    expect(flags.unrealisticJump).toBe(true)
  })

  it('flags a missing or zero total', () => {
    expect(validateFuelEntry({ odometer: null, priorOdometer: null, totalCost: null }).missingTotal).toBe(true)
    expect(validateFuelEntry({ odometer: null, priorOdometer: null, totalCost: 0 }).missingTotal).toBe(true)
    expect(validateFuelEntry({ odometer: null, priorOdometer: null, totalCost: 45.2 }).missingTotal).toBe(false)
  })
})

describe('computeFuelCostPerLoad', () => {
  it('divides total shift fuel cost across loads completed', () => {
    expect(computeFuelCostPerLoad(150, 5)).toBe(30)
  })

  it('returns null when no loads were completed (avoids divide-by-zero)', () => {
    expect(computeFuelCostPerLoad(150, 0)).toBeNull()
  })
})
