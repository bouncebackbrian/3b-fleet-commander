import { describe, it, expect } from 'vitest'
import {
  canApplyDisposition, nextStatusFor, setsTruckHold, clearsTruckHold,
  requiresReason, requiresInstruction, validateDisposition,
} from './defectDisposition'

describe('canApplyDisposition', () => {
  it('only allows acknowledge from open', () => {
    expect(canApplyDisposition('acknowledge', 'open')).toBe(true)
    expect(canApplyDisposition('acknowledge', 'acknowledged')).toBe(false)
    expect(canApplyDisposition('acknowledge', 'resolved')).toBe(false)
  })

  it('allows resolve from open, acknowledged, or deferred but not from resolved', () => {
    expect(canApplyDisposition('resolve', 'open')).toBe(true)
    expect(canApplyDisposition('resolve', 'acknowledged')).toBe(true)
    expect(canApplyDisposition('resolve', 'deferred')).toBe(true)
    expect(canApplyDisposition('resolve', 'resolved')).toBe(false)
  })

  it('only allows reopen from resolved or deferred', () => {
    expect(canApplyDisposition('reopen', 'resolved')).toBe(true)
    expect(canApplyDisposition('reopen', 'deferred')).toBe(true)
    expect(canApplyDisposition('reopen', 'open')).toBe(false)
    expect(canApplyDisposition('reopen', 'acknowledged')).toBe(false)
  })

  it('allows defer from open or acknowledged but not from resolved', () => {
    expect(canApplyDisposition('defer', 'open')).toBe(true)
    expect(canApplyDisposition('defer', 'acknowledged')).toBe(true)
    expect(canApplyDisposition('defer', 'resolved')).toBe(false)
  })

  it('allows hold/release/assign/request-details actions from any status', () => {
    for (const status of ['open', 'acknowledged', 'resolved', 'deferred'] as const) {
      expect(canApplyDisposition('place_on_hold', status)).toBe(true)
      expect(canApplyDisposition('mark_operable', status)).toBe(true)
      expect(canApplyDisposition('assign_maintenance', status)).toBe(true)
      expect(canApplyDisposition('request_details', status)).toBe(true)
    }
  })
})

describe('nextStatusFor', () => {
  it('acknowledge moves open -> acknowledged', () => {
    expect(nextStatusFor('acknowledge', 'open')).toBe('acknowledged')
  })
  it('resolve moves to resolved', () => {
    expect(nextStatusFor('resolve', 'acknowledged')).toBe('resolved')
  })
  it('reopen moves back to open', () => {
    expect(nextStatusFor('reopen', 'resolved')).toBe('open')
  })
  it('place_on_hold and mark_operable never change the defect status itself', () => {
    expect(nextStatusFor('place_on_hold', 'acknowledged')).toBe('acknowledged')
    expect(nextStatusFor('mark_operable', 'open')).toBe('open')
  })
})

describe('truck hold side effects', () => {
  it('only place_on_hold sets the hold', () => {
    expect(setsTruckHold('place_on_hold')).toBe(true)
    expect(setsTruckHold('acknowledge')).toBe(false)
    expect(setsTruckHold('resolve')).toBe(false)
  })
  it('only mark_operable clears the hold', () => {
    expect(clearsTruckHold('mark_operable')).toBe(true)
    expect(clearsTruckHold('resolve')).toBe(false)
  })
  it('acknowledging a defect does not by itself clear a hold (never auto-release)', () => {
    expect(clearsTruckHold('acknowledge')).toBe(false)
  })
})

describe('validateDisposition', () => {
  it('rejects an action invalid for the current status', () => {
    const result = validateDisposition({ action: 'acknowledge', currentStatus: 'resolved' })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/resolved/)
  })

  it('requires a reason for place_on_hold', () => {
    expect(validateDisposition({ action: 'place_on_hold', currentStatus: 'open' }).ok).toBe(false)
    expect(validateDisposition({ action: 'place_on_hold', currentStatus: 'open', reason: 'Cracked windshield blocks visibility' }).ok).toBe(true)
  })

  it('requires an instruction for mark_operable', () => {
    expect(validateDisposition({ action: 'mark_operable', currentStatus: 'open' }).ok).toBe(false)
    expect(validateDisposition({ action: 'mark_operable', currentStatus: 'open', instruction: 'Daylight only until glass is replaced Friday' }).ok).toBe(true)
  })

  it('does not require reason/instruction for acknowledge or resolve', () => {
    expect(validateDisposition({ action: 'acknowledge', currentStatus: 'open' }).ok).toBe(true)
    expect(validateDisposition({ action: 'resolve', currentStatus: 'acknowledged' }).ok).toBe(true)
  })

  it('rejects a blank/whitespace-only reason', () => {
    expect(validateDisposition({ action: 'place_on_hold', currentStatus: 'open', reason: '   ' }).ok).toBe(false)
  })
})
