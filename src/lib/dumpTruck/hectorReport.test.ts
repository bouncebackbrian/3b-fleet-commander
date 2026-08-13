import { describe, it, expect } from 'vitest'
import { buildHectorReport } from './hectorReport'

const FIXED_DATE = new Date('2026-08-13T13:00:00-07:00')

describe('buildHectorReport', () => {
  it('includes truck unit, date, fuel, and driver name', () => {
    const text = buildHectorReport({
      truckUnitNumber: '06',
      driverName: 'Brian Martin',
      fuelLevel: '3/4 tank',
      defects: [],
      now: FIXED_DATE,
    })
    expect(text).toContain('Cal-Neva Truck 06')
    expect(text).toContain('Fuel: 3/4 tank')
    expect(text).toContain('— Brian Martin')
  })

  it('falls back gracefully when truck unit or driver name is unknown', () => {
    const text = buildHectorReport({
      truckUnitNumber: null,
      driverName: null,
      fuelLevel: '',
      defects: [],
      now: FIXED_DATE,
    })
    expect(text).toContain('Truck (unit unknown)')
    expect(text).toContain('Fuel: not reported')
    expect(text).toContain('— Driver')
  })

  it('tags safety-critical and out-of-service severities', () => {
    const text = buildHectorReport({
      truckUnitNumber: '06',
      driverName: 'Brian',
      fuelLevel: '1/2',
      defects: [
        { description: 'Headlights cutting in and out', severity: 'safety_critical' },
        { description: 'Brake issue', severity: 'out_of_service' },
        { description: 'Minor scratch', severity: 'non_safety' },
      ],
      now: FIXED_DATE,
    })
    expect(text).toContain('Headlights cutting in and out [SAFETY CRITICAL]')
    expect(text).toContain('Brake issue [OUT OF SERVICE]')
    expect(text).toContain('Minor scratch')
    expect(text).not.toContain('Minor scratch [')
  })

  it('collapses duplicate descriptions to one line', () => {
    const text = buildHectorReport({
      truckUnitNumber: '06',
      driverName: 'Brian',
      fuelLevel: '1/2',
      defects: [
        { description: 'Windshield cracked', severity: 'non_safety' },
        { description: 'windshield cracked', severity: 'non_safety' },
        { description: 'Windshield Cracked', severity: 'monitor' },
      ],
      now: FIXED_DATE,
    })
    const occurrences = text.split('Windshield cracked').length - 1
    expect(occurrences).toBe(1)
  })

  it('reports no open issues when defect list is empty', () => {
    const text = buildHectorReport({
      truckUnitNumber: '07', driverName: 'Brian', fuelLevel: 'Full', defects: [], now: FIXED_DATE,
    })
    expect(text).toContain('No open safety-critical issues on file.')
  })

  it('includes an optional free-text note', () => {
    const text = buildHectorReport({
      truckUnitNumber: '06', driverName: 'Brian', fuelLevel: '1/2',
      defects: [], note: 'Driving carefully, daylight only.', now: FIXED_DATE,
    })
    expect(text).toContain('Driving carefully, daylight only.')
  })
})
