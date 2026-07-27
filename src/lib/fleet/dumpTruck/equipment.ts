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
}

export async function listDumpTruckEquipment(businessId: string): Promise<{ trucks: EquipmentOption[]; trailers: EquipmentOption[] }> {
  const { data, error } = await fleetServiceClient
    .from('fleet_equipment')
    .select('id, unit_number, equipment_type, status')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .order('unit_number', { ascending: true })
  if (error) throw error

  const rows = (data ?? []).map(r => ({ id: r.id, unitNumber: r.unit_number, equipmentType: r.equipment_type, status: r.status }))
  return {
    trucks: rows.filter(r => r.equipmentType !== 'trailer_dump'),
    trailers: rows.filter(r => r.equipmentType === 'trailer_dump'),
  }
}
