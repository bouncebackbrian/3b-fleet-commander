import { describe, it, expect } from 'vitest'
import { hasBlockingDefect, validateInspectionSubmission, canDispatchWithDefects } from './inspections'
import type { InspectionTemplateItem, InspectionItemInput } from './types'

describe('hasBlockingDefect', () => {
  it('is false when every item passes', () => {
    expect(hasBlockingDefect([{ result: 'pass', severity: null }])).toBe(false)
  })

  it('is false for a non-safety defect', () => {
    expect(hasBlockingDefect([{ result: 'defect', severity: 'non_safety' }])).toBe(false)
  })

  it('is true for a safety-critical or out-of-service defect', () => {
    expect(hasBlockingDefect([{ result: 'defect', severity: 'safety_critical' }])).toBe(true)
    expect(hasBlockingDefect([{ result: 'pass', severity: null }, { result: 'defect', severity: 'out_of_service' }])).toBe(true)
  })
})

describe('validateInspectionSubmission', () => {
  const template: InspectionTemplateItem[] = [
    { key: 'odometer', label: 'Odometer reading', category: 'identity', requiresOdometer: true, allowNa: false },
    { key: 'tarp_system', label: 'Tarp system', category: 'dump_body', requiresOdometer: false, allowNa: true },
    { key: 'horn', label: 'Horn', category: 'cab', requiresOdometer: false, allowNa: false },
  ]

  it('passes when every item is submitted and odometer is present', () => {
    const submitted: InspectionItemInput[] = [
      { itemKey: 'odometer', itemLabel: 'Odometer reading', category: 'identity', result: 'pass', severity: null, notes: null },
      { itemKey: 'tarp_system', itemLabel: 'Tarp system', category: 'dump_body', result: 'not_applicable', severity: null, notes: null },
      { itemKey: 'horn', itemLabel: 'Horn', category: 'cab', result: 'pass', severity: null, notes: null },
    ]
    const result = validateInspectionSubmission(template, submitted, 45210)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('flags a missing item', () => {
    const submitted: InspectionItemInput[] = [
      { itemKey: 'odometer', itemLabel: 'Odometer reading', category: 'identity', result: 'pass', severity: null, notes: null },
    ]
    const result = validateInspectionSubmission(template, submitted, 45210)
    expect(result.valid).toBe(false)
    expect(result.missingItemKeys).toEqual(['tarp_system', 'horn'])
  })

  it('rejects Not Applicable on an item that does not allow it', () => {
    const submitted: InspectionItemInput[] = [
      { itemKey: 'odometer', itemLabel: 'Odometer reading', category: 'identity', result: 'pass', severity: null, notes: null },
      { itemKey: 'tarp_system', itemLabel: 'Tarp system', category: 'dump_body', result: 'not_applicable', severity: null, notes: null },
      { itemKey: 'horn', itemLabel: 'Horn', category: 'cab', result: 'not_applicable', severity: null, notes: null },
    ]
    const result = validateInspectionSubmission(template, submitted, 45210)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Horn'))).toBe(true)
  })

  it('requires odometer when a template item demands it', () => {
    const submitted: InspectionItemInput[] = [
      { itemKey: 'odometer', itemLabel: 'Odometer reading', category: 'identity', result: 'pass', severity: null, notes: null },
      { itemKey: 'tarp_system', itemLabel: 'Tarp system', category: 'dump_body', result: 'not_applicable', severity: null, notes: null },
      { itemKey: 'horn', itemLabel: 'Horn', category: 'cab', result: 'pass', severity: null, notes: null },
    ]
    const result = validateInspectionSubmission(template, submitted, null)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Odometer is required'))).toBe(true)
  })
})

describe('canDispatchWithDefects', () => {
  it('allows dispatch with no open blocking defects', () => {
    expect(canDispatchWithDefects([{ severity: 'non_safety', status: 'open' }], null)).toBe(true)
  })

  it('blocks dispatch with an open safety-critical defect and no override', () => {
    expect(canDispatchWithDefects([{ severity: 'safety_critical', status: 'open' }], null)).toBe(false)
  })

  it('allows dispatch with a documented override reason for a safety-critical defect', () => {
    expect(canDispatchWithDefects([{ severity: 'safety_critical', status: 'acknowledged' }], 'Fleet manager approved temp repair, service scheduled')).toBe(true)
  })

  it('never bypasses an out-of-service defect, even with a documented override reason', () => {
    expect(canDispatchWithDefects([{ severity: 'out_of_service', status: 'acknowledged' }], 'Fleet manager approved temp repair, service scheduled')).toBe(false)
  })

  it('ignores a resolved defect even if it was severe', () => {
    expect(canDispatchWithDefects([{ severity: 'out_of_service', status: 'resolved' }], null)).toBe(true)
  })
})
