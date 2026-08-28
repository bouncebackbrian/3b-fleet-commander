import { fleetServiceClient } from '@/lib/fleet-service-client'

export type TireStatus = 'green' | 'yellow' | 'red'
export type TireAxleType = 'steer' | 'other'
export type TireHoldClass = 'none' | 'company' | 'regulatory'

export interface TireInspectionDetail {
  tirePosition?: string | null
  tireAxleType?: TireAxleType | null
  treadDepth32nds?: number | null
  visibleDamage?: boolean | null
}

/**
 * Planning status:
 * - Federal tread minimum: 4/32 steer/front; 2/32 all other tires.
 * - Yellow is a company planning band above the minimum.
 * - Visible damage is red for company review, but is not automatically labeled
 *   a federal out-of-service condition without a specific regulatory match.
 */
export function classifyTire(detail: TireInspectionDetail): TireStatus | null {
  if (detail.visibleDamage) return 'red'
  if (detail.treadDepth32nds == null || !detail.tireAxleType) return null
  const depth = detail.treadDepth32nds
  if (detail.tireAxleType === 'steer') {
    if (depth < 4) return 'red'
    if (depth <= 6) return 'yellow'
    return 'green'
  }
  if (depth < 2) return 'red'
  if (depth <= 4) return 'yellow'
  return 'green'
}

export function tireHold(detail: TireInspectionDetail): { holdClass: TireHoldClass; regulatoryReference: string | null } {
  if (detail.treadDepth32nds != null && detail.tireAxleType === 'steer' && detail.treadDepth32nds < 4) {
    return { holdClass: 'regulatory', regulatoryReference: '49 CFR 393.75(b) — front/steering axle tread depth' }
  }
  if (detail.treadDepth32nds != null && detail.tireAxleType === 'other' && detail.treadDepth32nds < 2) {
    return { holdClass: 'regulatory', regulatoryReference: '49 CFR 393.75(c) — other tire tread depth' }
  }
  if (detail.visibleDamage) {
    return { holdClass: 'company', regulatoryReference: 'Review tire condition against 49 CFR 393.75(a)' }
  }
  return { holdClass: 'none', regulatoryReference: null }
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
