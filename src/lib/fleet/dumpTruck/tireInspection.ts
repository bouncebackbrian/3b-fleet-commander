import { fleetServiceClient } from '@/lib/fleet-service-client'

export type TireStatus = 'green' | 'yellow' | 'red'
export type TireAxleType = 'steer' | 'other'

export interface TireInspectionDetail {
  tirePosition?: string | null
  tireAxleType?: TireAxleType | null
  treadDepth32nds?: number | null
  visibleDamage?: boolean | null
}

/**
 * Maintenance planning thresholds.
 * Red aligns with the federal minimum tread-depth thresholds used for
 * commercial vehicles (4/32 steer, 2/32 other). Yellow provides replacement
 * planning lead time; it is not itself an out-of-service determination.
 */
export function classifyTire(detail: TireInspectionDetail): TireStatus | null {
  if (detail.visibleDamage) return 'red'
  if (detail.treadDepth32nds == null || !detail.tireAxleType) return null
  const depth = detail.treadDepth32nds
  if (detail.tireAxleType === 'steer') {
    if (depth <= 4) return 'red'
    if (depth <= 6) return 'yellow'
    return 'green'
  }
  if (depth <= 2) return 'red'
  if (depth <= 4) return 'yellow'
  return 'green'
}

export async function persistTireInspectionDetails(
  inspectionId: string,
  items: Array<{
    itemKey?: string
    itemLabel?: string
    tirePosition?: string | null
    tireAxleType?: TireAxleType | null
    treadDepth32nds?: number | null
    visibleDamage?: boolean | null
  }>,
): Promise<void> {
  for (const item of items) {
    const isTire = (item.itemLabel ?? '').toLowerCase().includes('tire') || item.tirePosition || item.treadDepth32nds != null || item.visibleDamage != null
    if (!isTire || !item.itemKey) continue
    const status = classifyTire(item)
    const { error } = await fleetServiceClient
      .from('fleet_dt_inspection_items')
      .update({
        tire_position: item.tirePosition ?? null,
        tire_axle_type: item.tireAxleType ?? null,
        tread_depth_32nds: item.treadDepth32nds ?? null,
        visible_damage: item.visibleDamage ?? null,
        tire_status: status,
      })
      .eq('inspection_id', inspectionId)
      .eq('item_key', item.itemKey)
    if (error) throw error
  }
}
