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
    .select('id, unit_number, equipment_type, status, current_lat, current_lng')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .order('unit_number', { ascending: true })
  if (error) throw error

  const rows = (data ?? []).map(r => ({
    id: r.id, unitNumber: r.unit_number, equipmentType: r.equipment_type, status: r.status,
    currentLat: r.current_lat != null ? Number(r.current_lat) : null,
    currentLng: r.current_lng != null ? Number(r.current_lng) : null,
  }))
  return {
    trucks: rows.filter(r => !TRAILER_EQUIPMENT_TYPES.has(r.equipmentType)),
    trailers: rows.filter(r => TRAILER_EQUIPMENT_TYPES.has(r.equipmentType)),
  }
}
