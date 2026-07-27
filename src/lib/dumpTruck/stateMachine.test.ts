import { describe, it, expect } from 'vitest'
import {
  computeFlowState, canFireEvent, getPrimaryAction, isShiftOpen, isCustodyOpen, flowStateToShiftState,
} from './stateMachine'
import type { DumpTruckEventType } from './types'

describe('computeFlowState', () => {
  it('starts not_clocked_in with no events', () => {
    expect(computeFlowState([])).toBe('not_clocked_in')
  })

  it('walks the full happy path for one load cycle then ends the shift', () => {
    const sequence: DumpTruckEventType[] = [
      'clock_in', 'truck_picked_up', 'pretrip_started', 'pretrip_completed',
      'depart_yard', 'arrive_pickup', 'loading_started', 'loading_completed',
      'depart_pickup', 'arrive_dump', 'unloading_started', 'unloading_completed',
      'depart_dump', 'arrive_yard', 'posttrip_started', 'posttrip_completed',
      'truck_dropped_off', 'clock_out', 'shift_submitted',
    ]
    expect(computeFlowState(sequence)).toBe('submitted')
  })

  it('loops back to at_pickup for a second load after depart_dump', () => {
    const sequence: DumpTruckEventType[] = [
      'clock_in', 'truck_picked_up', 'pretrip_started', 'pretrip_completed',
      'depart_yard', 'arrive_pickup', 'loading_started', 'loading_completed',
      'depart_pickup', 'arrive_dump', 'unloading_started', 'unloading_completed',
      'depart_dump', 'arrive_pickup',
    ]
    expect(computeFlowState(sequence)).toBe('at_pickup')
  })

  it('ignores parallel events entirely (break/delay/note do not move flow state)', () => {
    const sequence: DumpTruckEventType[] = [
      'clock_in', 'break_started', 'break_ended', 'note', 'truck_picked_up', 'delay_started',
    ]
    expect(computeFlowState(sequence)).toBe('truck_picked_up')
  })

  it('ignores an event fired from an illegal state (out-of-order / duplicate)', () => {
    // depart_yard fired twice in a row — second one is illegal from driving_empty_to_pickup
    const sequence: DumpTruckEventType[] = [
      'clock_in', 'truck_picked_up', 'pretrip_started', 'pretrip_completed',
      'depart_yard', 'depart_yard',
    ]
    expect(computeFlowState(sequence)).toBe('driving_empty_to_pickup')
  })

  it('does not allow depart_yard before pretrip is completed', () => {
    const sequence: DumpTruckEventType[] = ['clock_in', 'truck_picked_up', 'depart_yard']
    expect(computeFlowState(sequence)).toBe('truck_picked_up')
  })
})

describe('canFireEvent', () => {
  it('allows clock_in only from not_clocked_in', () => {
    expect(canFireEvent('not_clocked_in', 'clock_in')).toBe(true)
    expect(canFireEvent('clocked_in', 'clock_in')).toBe(false)
  })

  it('allows parallel events any time the shift is open, never when not clocked in or submitted', () => {
    expect(canFireEvent('at_pickup', 'delay_started')).toBe(true)
    expect(canFireEvent('not_clocked_in', 'delay_started')).toBe(false)
    expect(canFireEvent('submitted', 'note')).toBe(false)
  })

  it('rejects an unknown event type', () => {
    expect(canFireEvent('clocked_in', 'bogus_event' as DumpTruckEventType)).toBe(false)
  })
})

describe('getPrimaryAction', () => {
  it('offers Add Another Load with Arrived Yard as the alternate action after leaving the dump', () => {
    const action = getPrimaryAction('driving_to_next')
    expect(action.eventType).toBe('arrive_pickup')
    expect(action.secondary?.eventType).toBe('arrive_yard')
  })

  it('opens the pretrip checklist rather than firing a single event', () => {
    expect(getPrimaryAction('pretrip_in_progress').opensChecklist).toBe('pretrip')
  })

  it('requires odometer for truck pickup and drop-off', () => {
    expect(getPrimaryAction('clocked_in').requiresOdometer).toBe(true)
    expect(getPrimaryAction('posttrip_complete').requiresOdometer).toBe(true)
  })
})

describe('isShiftOpen / isCustodyOpen', () => {
  it('shift is closed before clock-in and after submission', () => {
    expect(isShiftOpen('not_clocked_in')).toBe(false)
    expect(isShiftOpen('submitted')).toBe(false)
    expect(isShiftOpen('truck_picked_up')).toBe(true) // any other state is "open"
  })

  it('custody is open only while the truck is actually in hand', () => {
    expect(isCustodyOpen('clocked_in')).toBe(false)
    expect(isCustodyOpen('truck_picked_up')).toBe(true)
    expect(isCustodyOpen('at_dump')).toBe(true)
    expect(isCustodyOpen('truck_dropped_off')).toBe(false)
  })
})

describe('flowStateToShiftState', () => {
  it('collapses every mid-day driving/loading state to active', () => {
    for (const s of ['driving_empty_to_pickup', 'at_pickup', 'loading', 'loaded_at_pickup', 'driving_loaded_to_dump', 'at_dump', 'unloading', 'unloaded_at_dump', 'driving_to_next', 'at_yard_end'] as const) {
      expect(flowStateToShiftState(s)).toBe('active')
    }
  })

  it('maps the boundary states 1:1', () => {
    expect(flowStateToShiftState('not_clocked_in')).toBe('draft')
    expect(flowStateToShiftState('clocked_in')).toBe('clocked_in')
    expect(flowStateToShiftState('clocked_out')).toBe('clocked_out')
    expect(flowStateToShiftState('submitted')).toBe('submitted')
  })
})
