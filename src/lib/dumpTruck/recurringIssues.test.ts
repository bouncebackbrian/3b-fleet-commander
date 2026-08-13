import { describe, it, expect } from 'vitest'
import { groupRecurringIssues, type RecurringIssueDefect } from './recurringIssues'

function defect(over: Partial<RecurringIssueDefect>): RecurringIssueDefect {
  return {
    id: crypto.randomUUID(),
    truckId: 'truck-1',
    description: 'Windshield chips or cracks — Cracked windshield',
    severity: 'non_safety',
    status: 'open',
    createdAt: '2026-08-01T00:00:00Z',
    ...over,
  }
}

describe('groupRecurringIssues', () => {
  it('collapses same-category rows across differently-worded descriptions', () => {
    const groups = groupRecurringIssues([
      defect({ description: 'Windshield and mirrors — Crack on passenger side', createdAt: '2026-08-01T00:00:00Z' }),
      defect({ description: 'Windshield chips or cracks — Cracked windshield', createdAt: '2026-08-05T00:00:00Z' }),
      defect({ description: 'Windshield chips or cracks — Two cracks on passenger side', createdAt: '2026-08-10T00:00:00Z' }),
    ])
    expect(groups.length).toBe(2)
    const chips = groups.find(g => g.category === 'windshield chips or cracks')!
    expect(chips.totalCount).toBe(2)
    expect(chips.sampleDescription).toBe('Windshield chips or cracks — Two cracks on passenger side')
  })

  it('sorts by total occurrences descending', () => {
    const groups = groupRecurringIssues([
      defect({ description: 'Tires — low tread', createdAt: '2026-08-01T00:00:00Z' }),
      defect({ description: 'Windshield — crack', createdAt: '2026-08-01T00:00:00Z' }),
      defect({ description: 'Windshield — crack', createdAt: '2026-08-05T00:00:00Z' }),
      defect({ description: 'Windshield — crack', createdAt: '2026-08-10T00:00:00Z' }),
    ])
    expect(groups[0].category).toBe('windshield')
    expect(groups[0].totalCount).toBe(3)
  })

  it('tracks how many are still open vs resolved', () => {
    const groups = groupRecurringIssues([
      defect({ description: 'Fuel level — low', status: 'open' }),
      defect({ description: 'Fuel level — low', status: 'resolved' }),
      defect({ description: 'Fuel level — low', status: 'acknowledged' }),
    ])
    expect(groups[0].totalCount).toBe(3)
    expect(groups[0].openCount).toBe(2)
  })

  it('keeps the highest severity seen for the category', () => {
    const groups = groupRecurringIssues([
      defect({ description: 'Lighting defects — flickers', severity: 'non_safety' }),
      defect({ description: 'Lighting defects — wires cutting out', severity: 'safety_critical' }),
      defect({ description: 'Lighting defects — dim', severity: 'monitor' }),
    ])
    expect(groups[0].highestSeverity).toBe('safety_critical')
  })

  it('tracks distinct trucks affected by the category', () => {
    const groups = groupRecurringIssues([
      defect({ description: 'Tires — low tread', truckId: 'truck-1' }),
      defect({ description: 'Tires — low tread', truckId: 'truck-2' }),
      defect({ description: 'Tires — low tread', truckId: 'truck-1' }),
    ])
    expect(groups[0].truckIds.sort()).toEqual(['truck-1', 'truck-2'])
  })

  it('returns an empty list for no defects', () => {
    expect(groupRecurringIssues([])).toEqual([])
  })
})
