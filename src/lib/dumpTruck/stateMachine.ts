/**
 * Dump Truck Mode — driver flow state machine
 *
 * The append-only fleet_dt_events log is the source of truth (spec §5).
 * This module derives a pure "flow state" from the ordered primary-sequence
 * event types recorded so far, and exposes what the driver may legally do
 * next. It never mutates anything — callers persist events and re-derive.
 *
 * Secondary/parallel actions (break, delay, fuel stop, note, photo, ticket,
 * correction request) are available whenever the shift is open and are not
 * part of the primary-sequence fold.
 */

import type { DumpTruckEventType } from './types'

export type FlowStateId =
  | 'not_clocked_in'
  | 'clocked_in'
  | 'pretrip_in_progress'
  | 'pretrip_complete'
  | 'truck_picked_up'
  | 'driving_empty_to_pickup'
  | 'at_pickup'
  | 'loading'
  | 'driving_loaded_to_dump'
  | 'at_dump'
  | 'unloading'
  | 'unloaded_at_dump'
  | 'driving_to_next'
  | 'at_yard_end'
  | 'posttrip_in_progress'
  | 'posttrip_complete'
  | 'truck_dropped_off'
  | 'clocked_out'
  | 'submitted'

interface Transition {
  from: FlowStateId[]
  to: FlowStateId
}

/** Primary-sequence transition graph. Events not listed here (breaks, delays,
 * fuel stops, notes, photos, tickets, corrections, arrive_yard_for_pickup)
 * are parallel actions and never change the flow state. */
export const PRIMARY_TRANSITIONS: Partial<Record<DumpTruckEventType, Transition>> = {
  clock_in:              { from: ['not_clocked_in'],                                                to: 'clocked_in' },
  truck_picked_up:       { from: ['clocked_in'],                                                     to: 'truck_picked_up' },
  pretrip_started:       { from: ['truck_picked_up'],                                                to: 'pretrip_in_progress' },
  pretrip_completed:     { from: ['pretrip_in_progress'],                                             to: 'pretrip_complete' },
  depart_yard:           { from: ['pretrip_complete'],                                                to: 'driving_empty_to_pickup' },
  arrive_pickup:         { from: ['driving_empty_to_pickup', 'driving_to_next'],                      to: 'at_pickup' },
  loading_started:       { from: ['at_pickup'],                                                       to: 'loading' },
  depart_pickup:         { from: ['loading'],                                                         to: 'driving_loaded_to_dump' },
  arrive_dump:           { from: ['driving_loaded_to_dump'],                                          to: 'at_dump' },
  unloading_started:     { from: ['at_dump'],                                                         to: 'unloading' },
  unloading_completed:   { from: ['unloading'],                                                       to: 'unloaded_at_dump' },
  depart_dump:           { from: ['unloaded_at_dump'],                                                to: 'driving_to_next' },
  arrive_yard:           { from: ['driving_to_next', 'driving_empty_to_pickup', 'truck_picked_up'],   to: 'at_yard_end' },
  posttrip_started:      { from: ['at_yard_end'],                                                     to: 'posttrip_in_progress' },
  posttrip_completed:    { from: ['posttrip_in_progress'],                                            to: 'posttrip_complete' },
  truck_dropped_off:     { from: ['posttrip_complete'],                                                to: 'truck_dropped_off' },
  clock_out:             { from: ['truck_dropped_off'],                                                to: 'clocked_out' },
  shift_submitted:       { from: ['clocked_out'],                                                      to: 'submitted' },
}

/** Events that are always legal while the shift is open (do not gate the primary flow). */
export const PARALLEL_EVENT_TYPES: DumpTruckEventType[] = [
  'arrive_yard_for_pickup',
  'break_started', 'break_ended',
  'delay_started', 'delay_ended',
  'fuel_stop_started', 'fuel_stop_ended',
  'note', 'photo_captured', 'ticket_captured', 'location_logged',
  'correction_requested', 'event_corrected',
]

/**
 * Fold an ordered list of primary-sequence event types into the current flow state.
 * Out-of-order or not-yet-legal events are ignored (never throws) — callers
 * should validate with `canFireEvent` before persisting an event, but replay
 * must stay robust against corrections/out-of-order sync arrivals.
 */
export function computeFlowState(eventTypesInOrder: DumpTruckEventType[]): FlowStateId {
  let state: FlowStateId = 'not_clocked_in'
  for (const eventType of eventTypesInOrder) {
    const transition = PRIMARY_TRANSITIONS[eventType]
    if (!transition) continue // parallel/unknown event — doesn't move the flow
    if (transition.from.includes(state)) {
      state = transition.to
    }
  }
  return state
}

/** Whether firing `eventType` from `state` is a legal primary-sequence move. */
export function canFireEvent(state: FlowStateId, eventType: DumpTruckEventType): boolean {
  if (PARALLEL_EVENT_TYPES.includes(eventType)) {
    return isShiftOpen(state)
  }
  const transition = PRIMARY_TRANSITIONS[eventType]
  if (!transition) return false
  return transition.from.includes(state)
}

export function isShiftOpen(state: FlowStateId): boolean {
  return state !== 'not_clocked_in' && state !== 'submitted'
}

export function isCustodyOpen(state: FlowStateId): boolean {
  const custodyStates: FlowStateId[] = [
    'truck_picked_up', 'pretrip_in_progress', 'pretrip_complete',
    'driving_empty_to_pickup', 'at_pickup', 'loading',
    'driving_loaded_to_dump', 'at_dump', 'unloading', 'unloaded_at_dump',
    'driving_to_next', 'at_yard_end', 'posttrip_in_progress', 'posttrip_complete',
  ]
  return custodyStates.includes(state)
}

export interface PrimaryActionSpec {
  eventType: DumpTruckEventType | null
  label: string
  requiresOdometer?: boolean
  /** A second, equally valid action offered alongside the primary one (e.g. loop vs end shift). */
  secondary?: { eventType: DumpTruckEventType; label: string }
  /** True when this state means "open the checklist sheet" rather than fire one event directly. */
  opensChecklist?: 'pretrip' | 'posttrip'
  /** True when this state means "open submit-day review" rather than fire an event. */
  opensSubmit?: boolean
}

const PRIMARY_ACTION_BY_STATE: Record<FlowStateId, PrimaryActionSpec> = {
  not_clocked_in:            { eventType: 'clock_in',            label: 'Clock In' },
  clocked_in:                { eventType: 'truck_picked_up',     label: 'Truck Picked Up', requiresOdometer: true },
  truck_picked_up:           { eventType: 'pretrip_started',     label: 'Start Pre-Trip' },
  pretrip_in_progress:       { eventType: null,                  label: 'Complete Pre-Trip', opensChecklist: 'pretrip' },
  pretrip_complete:          { eventType: 'depart_yard',         label: 'Depart Yard' },
  driving_empty_to_pickup:   { eventType: 'arrive_pickup',       label: 'Arrived Pickup' },
  at_pickup:                 { eventType: 'loading_started',     label: 'Start Loading' },
  loading:                   { eventType: 'depart_pickup',       label: 'Leave Pickup' },
  driving_loaded_to_dump:    { eventType: 'arrive_dump',         label: 'Arrived Dump' },
  at_dump:                   { eventType: 'unloading_started',   label: 'Start Unloading' },
  unloading:                 { eventType: 'unloading_completed', label: 'Dumped / Unloading Complete' },
  unloaded_at_dump:          { eventType: 'depart_dump',         label: 'Leave Dump' },
  driving_to_next: {
    eventType: 'arrive_pickup', label: 'Add Another Load',
    secondary: { eventType: 'arrive_yard', label: 'Arrived Yard / End Location' },
  },
  at_yard_end:                { eventType: 'posttrip_started',   label: 'Start Post-Trip' },
  posttrip_in_progress:       { eventType: null,                 label: 'Complete Post-Trip', opensChecklist: 'posttrip' },
  posttrip_complete:          { eventType: 'truck_dropped_off',  label: 'Truck Dropped Off', requiresOdometer: true },
  truck_dropped_off:          { eventType: 'clock_out',          label: 'Clock Out' },
  clocked_out:                { eventType: null,                 label: 'Submit Day', opensSubmit: true },
  submitted:                  { eventType: null,                 label: 'Day Submitted' },
}

export function getPrimaryAction(state: FlowStateId): PrimaryActionSpec {
  return PRIMARY_ACTION_BY_STATE[state]
}

// ── Mapping to the persisted fleet_dt_shifts.state column ──────────────────
// The DB state machine (spec §5) is coarser than the driver-flow state above —
// every "somewhere in the middle of the day" flow state collapses to 'active'.

import type { ShiftState } from './types'

const SHIFT_STATE_BY_FLOW_STATE: Record<FlowStateId, ShiftState> = {
  not_clocked_in: 'draft',
  clocked_in: 'clocked_in',
  pretrip_in_progress: 'pretrip_in_progress',
  pretrip_complete: 'pretrip_complete',
  truck_picked_up: 'active',
  driving_empty_to_pickup: 'active',
  at_pickup: 'active',
  loading: 'active',
  driving_loaded_to_dump: 'active',
  at_dump: 'active',
  unloading: 'active',
  unloaded_at_dump: 'active',
  driving_to_next: 'active',
  at_yard_end: 'active',
  posttrip_in_progress: 'posttrip_in_progress',
  posttrip_complete: 'posttrip_complete',
  truck_dropped_off: 'posttrip_complete',
  clocked_out: 'clocked_out',
  submitted: 'submitted',
}

export function flowStateToShiftState(flowState: FlowStateId): ShiftState {
  return SHIFT_STATE_BY_FLOW_STATE[flowState]
}
