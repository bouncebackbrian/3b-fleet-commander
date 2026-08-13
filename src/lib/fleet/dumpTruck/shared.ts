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

export type PreferredLanguage = 'en' | 'es'

export interface DriverBusinessMeta {
  driverName: string
  threebId: string | null
  businessName: string
  threebBizId: string | null
  /** Spec §6 EN/ES foundation — the driver's chosen UI language. Storage +
   *  toggle only; a full translation pipeline for free-text content
   *  (notes, defect descriptions, etc.) is not built yet. */
  preferredLanguage: PreferredLanguage
}

/**
 * Driver + tenant identity fields used to header CSV/PDF exports (spec §10).
 *
 * SCHEMA NOTE (2026-07-28): the live `profiles` table has a single
 * `full_name` column, not `first_name`/`last_name`, and the live
 * `businesses` table has `name`, not `company_name`. `three_b_biz_id`
 * (2026-07-29: now a live column, previously it wasn't — see
 * docs/SCHEMA_RECONCILIATION.md) is read for real below.
 */
export async function getDriverBusinessMeta(businessId: string, driverId: string): Promise<DriverBusinessMeta> {
  const [{ data: profile }, { data: business }] = await Promise.all([
    fleetServiceClient.from('profiles').select('full_name, three_b_id, preferred_language').eq('id', driverId).maybeSingle(),
    fleetServiceClient.from('businesses').select('name, three_b_biz_id').eq('id', businessId).maybeSingle(),
  ])

  return {
    driverName: profile?.full_name || 'Unnamed Driver',
    threebId: profile?.three_b_id ?? null,
    businessName: business?.name ?? 'Unknown Business',
    threebBizId: business?.three_b_biz_id ?? null,
    preferredLanguage: (profile?.preferred_language as PreferredLanguage) ?? 'en',
  }
}

export async function setPreferredLanguage(userId: string, language: PreferredLanguage): Promise<void> {
  const { error } = await fleetServiceClient.from('profiles').update({ preferred_language: language }).eq('id', userId)
  if (error) throw error
}

export interface BusinessMeta {
  businessName: string
  threebBizId: string | null
}

/** Business-only identity fields — used to header dispatch-wide (multi-driver) CSV/PDF exports. */
export async function getBusinessMeta(businessId: string): Promise<BusinessMeta> {
  const { data: business } = await fleetServiceClient.from('businesses').select('name, three_b_biz_id').eq('id', businessId).maybeSingle()
  return {
    businessName: business?.name ?? 'Unknown Business',
    threebBizId: business?.three_b_biz_id ?? null,
  }
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
