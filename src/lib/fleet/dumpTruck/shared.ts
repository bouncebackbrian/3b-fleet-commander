/**
 * fleet/dumpTruck/shared.ts — shared server-side helpers for Dump Truck Mode services
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { computeFlowState, flowStateToShiftState, type FlowStateId } from '@/lib/dumpTruck/stateMachine'
import type { DumpTruckEventType } from '@/lib/dumpTruck/types'

export async function getThreebId(userId: string): Promise<string | null> {
  const { data } = await fleetServiceClient
    .from('profiles')
    .select('three_b_id')
    .eq('id', userId)
    .maybeSingle()
  return data?.three_b_id ?? null
}

/** Ordered primary-sequence event types for a shift, used to derive the flow state. */
export async function getShiftFlowState(shiftId: string): Promise<FlowStateId> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_events')
    .select('event_type, effective_at')
    .eq('shift_id', shiftId)
    .order('effective_at', { ascending: true })
  if (error) throw error
  const types = (data ?? []).map(r => r.event_type as DumpTruckEventType)
  return computeFlowState(types)
}

/** Recompute and persist fleet_dt_shifts.state from the shift's event history. */
export async function syncShiftState(shiftId: string): Promise<void> {
  const flowState = await getShiftFlowState(shiftId)
  const { error } = await fleetServiceClient
    .from('fleet_dt_shifts')
    .update({ state: flowStateToShiftState(flowState) })
    .eq('id', shiftId)
  if (error) throw error
}

export class DumpTruckError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}
