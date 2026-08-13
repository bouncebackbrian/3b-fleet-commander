import { describe, it, expect } from 'vitest'
import {
  statusForScore, categoryScore, overallScore, buildPareto, KPI_CATALOG, CATEGORY_WEIGHT,
  monthRange, previousMonth, ratioScore, targetVarianceScore,
} from './sqcdp'

describe('KPI_CATALOG', () => {
  it('every entry has a unique id', () => {
    const ids = KPI_CATALOG.map(k => k.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('category weights sum to 1', () => {
    const total = Object.values(CATEGORY_WEIGHT).reduce((a, b) => a + b, 0)
    expect(Math.round(total * 100) / 100).toBe(1)
  })
})

describe('statusForScore', () => {
  it('green at 90+', () => { expect(statusForScore(90)).toBe('green'); expect(statusForScore(100)).toBe('green') })
  it('yellow at 80-89', () => { expect(statusForScore(80)).toBe('yellow'); expect(statusForScore(89.9)).toBe('yellow') })
  it('red below 80', () => { expect(statusForScore(79.9)).toBe('red'); expect(statusForScore(0)).toBe('red') })
  it('no_data for null', () => { expect(statusForScore(null)).toBe('no_data') })
})

describe('categoryScore', () => {
  it('averages only the computable KPIs, ignoring nulls', () => {
    const result = categoryScore([
      { kpiId: 'a', score: 100, displayValue: '100%' },
      { kpiId: 'b', score: 70, displayValue: '70%' },
      { kpiId: 'c', score: null, displayValue: '—' },
    ])
    expect(result.score).toBe(85)
    expect(result.computableCount).toBe(2)
    expect(result.totalCount).toBe(3)
    expect(result.status).toBe('yellow')
  })

  it('is green when the renormalized average clears 90', () => {
    const result = categoryScore([{ kpiId: 'a', score: 95, displayValue: '95%' }])
    expect(result.score).toBe(95)
    expect(result.status).toBe('green')
  })

  it('returns no_data when nothing in the category is computable', () => {
    const result = categoryScore([{ kpiId: 'a', score: null, displayValue: '—' }])
    expect(result.score).toBeNull()
    expect(result.status).toBe('no_data')
  })
})

describe('overallScore', () => {
  it('weights categories 30/20/20/20/10', () => {
    const score = overallScore({ safety: 100, quality: 100, cost: 100, delivery: 100, people: 100 })
    expect(score).toBe(100)
  })

  it('renormalizes when some categories have no data, rather than treating them as 0', () => {
    // Only safety (30%) and people (10%) have data — renormalized weight is 30/(30+10)=.75, 10/(30+10)=.25
    const score = overallScore({ safety: 100, quality: null, cost: null, delivery: null, people: 0 })
    expect(score).toBe(75)
  })

  it('returns null when no category has data', () => {
    expect(overallScore({ safety: null, quality: null, cost: null, delivery: null, people: null })).toBeNull()
  })
})

describe('monthRange', () => {
  it('returns the first and last day of the month', () => {
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })
  it('handles a leap year February', () => {
    expect(monthRange('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })
  it('handles December correctly (year rollover for "next month")', () => {
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', end: '2026-12-31' })
  })
})

describe('previousMonth', () => {
  it('steps back one month within a year', () => {
    expect(previousMonth('2026-08')).toBe('2026-07')
  })
  it('rolls back across a year boundary', () => {
    expect(previousMonth('2026-01')).toBe('2025-12')
  })
})

describe('ratioScore', () => {
  it('computes a direct percentage', () => {
    expect(ratioScore(96, 100)).toBe(96)
  })
  it('caps at 100 even if numerator exceeds denominator', () => {
    expect(ratioScore(5, 4)).toBe(100)
  })
  it('returns null for a zero denominator rather than dividing by zero', () => {
    expect(ratioScore(0, 0)).toBeNull()
  })
})

describe('targetVarianceScore', () => {
  it('scores 100 when actual is at or under target', () => {
    expect(targetVarianceScore(60, 60)).toBe(100)
    expect(targetVarianceScore(30, 60)).toBe(100)
  })
  it('scores 100 when actual is zero (perfect)', () => {
    expect(targetVarianceScore(0, 60)).toBe(100)
  })
  it('scales down proportionally as actual exceeds target', () => {
    expect(targetVarianceScore(120, 60)).toBe(50)
  })
})

describe('buildPareto', () => {
  it('ranks causes by impact descending', () => {
    const rows = buildPareto([
      { cause: 'A', count: 1, impact: 10, impactUnit: 'count' },
      { cause: 'B', count: 1, impact: 50, impactUnit: 'count' },
      { cause: 'C', count: 1, impact: 20, impactUnit: 'count' },
    ])
    expect(rows.map(r => r.cause)).toEqual(['B', 'C', 'A'])
    expect(rows.map(r => r.rank)).toEqual([1, 2, 3])
  })

  it('computes percent and cumulative percent correctly', () => {
    const rows = buildPareto([
      { cause: 'A', count: 1, impact: 80, impactUnit: 'count' },
      { cause: 'B', count: 1, impact: 20, impactUnit: 'count' },
    ])
    expect(rows[0].percent).toBe(80)
    expect(rows[0].cumulativePercent).toBe(80)
    expect(rows[1].percent).toBe(20)
    expect(rows[1].cumulativePercent).toBe(100)
  })

  it('flags the vital few making up the first ~80% of impact', () => {
    const rows = buildPareto([
      { cause: 'A', count: 1, impact: 50, impactUnit: 'count' },
      { cause: 'B', count: 1, impact: 30, impactUnit: 'count' },
      { cause: 'C', count: 1, impact: 15, impactUnit: 'count' },
      { cause: 'D', count: 1, impact: 5, impactUnit: 'count' },
    ])
    // cumulative before each: A=0, B=50, C=80, D=95 -> top80 needs cumulativeBefore < 80
    expect(rows.map(r => r.top80)).toEqual([true, true, false, false])
  })

  it('handles zero total impact without dividing by zero', () => {
    const rows = buildPareto([{ cause: 'A', count: 0, impact: 0, impactUnit: 'count' }])
    expect(rows[0].percent).toBe(0)
    expect(rows[0].cumulativePercent).toBe(0)
  })

  it('returns an empty array for no causes', () => {
    expect(buildPareto([])).toEqual([])
  })
})
