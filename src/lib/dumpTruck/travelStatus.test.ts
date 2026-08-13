import { describe, it, expect } from 'vitest'
import { travelStatusFor } from './travelStatus'
import type { FlowStateId } from './stateMachine'

const ALL_STATES: FlowStateId[] = [
  'not_clocked_in', 'clocked_in', 'pretrip_in_progress', 'pretrip_complete', 'truck_picked_up',
  'driving_empty_to_pickup', 'at_pickup', 'loading', 'loaded_at_pickup', 'driving_loaded_to_dump',
  'at_dump', 'unloading', 'unloaded_at_dump', 'driving_to_next', 'at_yard_end',
  'posttrip_in_progress', 'posttrip_complete', 'truck_dropped_off', 'clocked_out', 'submitted',
]

describe('travelStatusFor', () => {
  it('classifies every flow state (no state falls through unmapped)', () => {
    for (const state of ALL_STATES) {
      expect(travelStatusFor(state)).toBeTruthy()
    }
  })

  it('treats pre-departure yard states as at_yard', () => {
    expect(travelStatusFor('clocked_in')).toBe('at_yard')
    expect(travelStatusFor('pretrip_complete')).toBe('at_yard')
    expect(travelStatusFor('truck_picked_up')).toBe('at_yard')
  })

  it('treats both driving legs as outbound', () => {
    expect(travelStatusFor('driving_empty_to_pickup')).toBe('outbound')
    expect(travelStatusFor('driving_loaded_to_dump')).toBe('outbound')
  })

  it('treats pickup and dump work as job_site', () => {
    expect(travelStatusFor('at_pickup')).toBe('job_site')
    expect(travelStatusFor('loading')).toBe('job_site')
    expect(travelStatusFor('at_dump')).toBe('job_site')
    expect(travelStatusFor('unloading')).toBe('job_site')
  })

  it('treats the return leg through posttrip as inbound', () => {
    expect(travelStatusFor('driving_to_next')).toBe('inbound')
    expect(travelStatusFor('at_yard_end')).toBe('inbound')
    expect(travelStatusFor('posttrip_in_progress')).toBe('inbound')
  })

  it('treats not-yet-clocked-in and post-shift states as off_duty', () => {
    expect(travelStatusFor('not_clocked_in')).toBe('off_duty')
    expect(travelStatusFor('clocked_out')).toBe('off_duty')
    expect(travelStatusFor('submitted')).toBe('off_duty')
  })
})
