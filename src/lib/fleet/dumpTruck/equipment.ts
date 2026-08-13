/**
 * fleet/dumpTruck/equipment.ts — reuses the existing fleet_equipment registry
 * (no new truck/trailer tables — spec §2 "reuse existing fleet infrastructure").
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'

export interface EquipmentOption {
  id: string
  unitNumber: string
  equipmentType: string
  status: string
  currentLat: number | null
  currentLng: number | null
  holdStatus: 'none' | 'on_hold'
  holdReason: string | null
}

/**
 * Trailer equipment_type values — everything else is treated as a truck.
 * Explicit allowlist rather than "not trailer_dump" so a pup trailer isn't
 * mistaken for a truck (real fleets mix tractor+semi-trailer combos with
 * straight-truck+pup-trailer combos like a Super 10, and the two trailer
 * types must never show up in the same dropdown as each other's truck).
 *
 * - 'trailer_dump'  — semi dump trailer, pairs with a 'tractor'
 * - 'pup_trailer'   — pony/pup trailer, pairs with a 'super_10'
 *
 * Truck types are intentionally NOT a closed enum here (fleet_equipment has
 * no check constraint on equipment_type) — 'tractor', 'straight_dump_truck',
 * 'super_10', and any future value all fall through to "truck" by default.
 */
const TRAILER_EQUIPMENT_TYPES = new Set(['trailer_dump', 'pup_trailer'])

export async function listDumpTruckEquipment(businessId: string): Promise<{ trucks: EquipmentOption[]; trailers: EquipmentOption[] }> {
  const { data, error } = await fleetServiceClient
    .from('fleet_equipment')
    .select('id, unit_number, equipment_type, status, current_lat, current_lng, hold_status, hold_reason')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .order('unit_number', { ascending: true })
  if (error) throw error

  const rows = (data ?? []).map(r => ({
    id: r.id, unitNumber: r.unit_number, equipmentType: r.equipment_type, status: r.status,
    currentLat: r.current_lat != null ? Number(r.current_lat) : null,
    currentLng: r.current_lng != null ? Number(r.current_lng) : null,
    holdStatus: r.hold_status, holdReason: r.hold_reason,
  }))
  return {
    trucks: rows.filter(r => !TRAILER_EQUIPMENT_TYPES.has(r.equipmentType)),
    trailers: rows.filter(r => TRAILER_EQUIPMENT_TYPES.has(r.equipmentType)),
  }
}

// ── Dispatch-authorized safety hold (spec §5.1) ──────────────────────────────
// A hold is a hard, dispatch-only block on starting new vehicle custody —
// distinct from the driver-side documented defect override, which lets a
// driver continue past an open safety-critical defect that hasn't been
// escalated to a formal hold. See defectDisposition.ts for the rules on
// which dispatch actions set/clear a hold.

export interface TruckHoldState {
  truckId: string
  holdStatus: 'none' | 'on_hold'
  holdReason: string | null
  holdAt: string | null
  holdBy: string | null
  releasedAt: string | null
  releasedBy: string | null
  releaseInstruction: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function holdStateFromRow(r: any): TruckHoldState {
  return {
    truckId: r.id, holdStatus: r.hold_status, holdReason: r.hold_reason, holdAt: r.hold_at,
    holdBy: r.hold_by, releasedAt: r.released_at, releasedBy: r.released_by, releaseInstruction: r.release_instruction,
  }
}

export async function getTruckHoldState(businessId: string, truckId: string): Promise<TruckHoldState | null> {
  const { data, error } = await fleetServiceClient
    .from('fleet_equipment')
    .select('id, hold_status, hold_reason, hold_at, hold_by, released_at, released_by, release_instruction')
    .eq('business_id', businessId)
    .eq('id', truckId)
    .maybeSingle()
  if (error) throw error
  return data ? holdStateFromRow(data) : null
}

export async function placeTruckOnHold(businessId: string, truckId: string, reason: string, actorId: string): Promise<TruckHoldState> {
  const { data, error } = await fleetServiceClient
    .from('fleet_equipment')
    .update({
      hold_status: 'on_hold', hold_reason: reason, hold_at: new Date().toISOString(), hold_by: actorId,
      released_at: null, released_by: null, release_instruction: null,
    })
    .eq('business_id', businessId).eq('id', truckId)
    .select('id, hold_status, hold_reason, hold_at, hold_by, released_at, released_by, release_instruction')
    .single()
  if (error) throw error
  return holdStateFromRow(data)
}

export async function releaseTruckHold(businessId: string, truckId: string, instruction: string, actorId: string): Promise<TruckHoldState> {
  const { data, error } = await fleetServiceClient
    .from('fleet_equipment')
    .update({ hold_status: 'none', released_at: new Date().toISOString(), released_by: actorId, release_instruction: instruction })
    .eq('business_id', businessId).eq('id', truckId)
    .select('id, hold_status, hold_reason, hold_at, hold_by, released_at, released_by, release_instruction')
    .single()
  if (error) throw error
  return holdStateFromRow(data)
}
