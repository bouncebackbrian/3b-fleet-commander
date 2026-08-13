/**
 * travelStatus.ts — spec §5.3's INBOUND/OUTBOUND/JOB SITE concepts, derived
 * purely from the existing flow state. Adds a large, explicit "where is this
 * truck right now" label to the cockpit without adding new events, buttons,
 * or touching stateMachine.ts's transition graph in any way — this is a
 * read-only projection of the flow state that already exists.
 */
import type { FlowStateId } from './stateMachine'

export type TravelStatus = 'off_duty' | 'at_yard' | 'outbound' | 'job_site' | 'inbound'

const AT_YARD: FlowStateId[] = ['clocked_in', 'pretrip_in_progress', 'pretrip_complete', 'truck_picked_up']
const OUTBOUND: FlowStateId[] = ['driving_empty_to_pickup', 'driving_loaded_to_dump']
const JOB_SITE: FlowStateId[] = ['at_pickup', 'loading', 'loaded_at_pickup', 'at_dump', 'unloading', 'unloaded_at_dump']
const INBOUND: FlowStateId[] = ['driving_to_next', 'at_yard_end', 'posttrip_in_progress', 'posttrip_complete', 'truck_dropped_off']

export function travelStatusFor(flowState: FlowStateId): TravelStatus {
  if (AT_YARD.includes(flowState)) return 'at_yard'
  if (OUTBOUND.includes(flowState)) return 'outbound'
  if (JOB_SITE.includes(flowState)) return 'job_site'
  if (INBOUND.includes(flowState)) return 'inbound'
  return 'off_duty' // not_clocked_in, clocked_out, submitted
}

export const TRAVEL_STATUS_LABEL: Record<TravelStatus, string> = {
  off_duty: 'Off Duty',
  at_yard: 'At Yard',
  outbound: 'Outbound',
  job_site: 'Job Site',
  inbound: 'Inbound',
}

export const TRAVEL_STATUS_ICON: Record<TravelStatus, string> = {
  off_duty: '⚪', at_yard: '🏠', outbound: '➡️', job_site: '📍', inbound: '⬅️',
}
