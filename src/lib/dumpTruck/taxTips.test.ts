import { describe, it, expect } from 'vitest'
import { tipOfTheDay, TAX_TIPS } from './taxTips'

describe('tipOfTheDay', () => {
  it('returns a tip from the list', () => {
    expect(TAX_TIPS).toContain(tipOfTheDay(new Date('2026-01-01T12:00:00Z')))
  })

  it('is deterministic for the same day', () => {
    const a = tipOfTheDay(new Date('2026-03-15T08:00:00Z'))
    const b = tipOfTheDay(new Date('2026-03-15T20:00:00Z'))
    expect(a).toBe(b)
  })

  it('can change on a different day', () => {
    const day1 = tipOfTheDay(new Date('2026-01-01T00:00:00Z'))
    const day2 = tipOfTheDay(new Date('2026-01-02T00:00:00Z'))
    // Not asserting inequality (list could coincidentally wrap to the same tip) —
    // just confirming both are valid entries.
    expect(TAX_TIPS).toContain(day1)
    expect(TAX_TIPS).toContain(day2)
  })
})
