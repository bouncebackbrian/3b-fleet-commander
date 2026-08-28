import { fleetServiceClient } from '@/lib/fleet-service-client'
import { isAssetOperatingMode, type AssetOperatingMode } from '@/lib/fleet/asset-modes'

export type CurrentDriverAsset = {
  id: string
  unitNumber: string
  operatingMode: AssetOperatingMode | null
} | null

/**
 * Resolve the driver's most recently used asset inside the active business.
 * The asset owns the trucking/operating classification; the business does not.
 */
export async function getCurrentDriverAsset(businessId: string, driverId: string): Promise<CurrentDriverAsset> {
  const { data: shift } = await fleetServiceClient
    .from('fleet_dt_shifts')
    .select('truck_id')
    .eq('business_id', businessId)
    .eq('driver_id', driverId)
    .not('truck_id', 'is', null)
    .order('clock_in_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!shift?.truck_id) return null

  const { data: asset } = await fleetServiceClient
    .from('fleet_equipment')
    .select('id,unit_number,ops_profile')
    .eq('business_id', businessId)
    .eq('id', shift.truck_id)
    .maybeSingle()

  if (!asset) return null

  return {
    id: asset.id,
    unitNumber: asset.unit_number,
    operatingMode: isAssetOperatingMode(asset.ops_profile) ? asset.ops_profile : null,
  }
}
