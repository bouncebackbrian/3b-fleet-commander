export type AssetOperatingMode =
  | 'dump_truck'
  | 'water_truck'
  | 'hotshot'
  | 'otr'
  | 'regional'
  | 'local'
  | 'business_vehicle'

export const ASSET_OPERATING_MODES: AssetOperatingMode[] = [
  'dump_truck', 'water_truck', 'hotshot', 'otr', 'regional', 'local', 'business_vehicle',
]

const SLUG_BY_MODE: Record<AssetOperatingMode, string> = {
  dump_truck: 'dump-truck',
  water_truck: 'water-truck',
  hotshot: 'hotshot',
  otr: 'otr',
  regional: 'regional',
  local: 'local',
  business_vehicle: 'business-vehicle',
}

const MODE_BY_SLUG = Object.fromEntries(
  Object.entries(SLUG_BY_MODE).map(([mode, slug]) => [slug, mode]),
) as Record<string, AssetOperatingMode>

export function isAssetOperatingMode(value: unknown): value is AssetOperatingMode {
  return typeof value === 'string' && ASSET_OPERATING_MODES.includes(value as AssetOperatingMode)
}

export function assetModeToSlug(mode: AssetOperatingMode): string {
  return SLUG_BY_MODE[mode]
}

export function slugToAssetMode(slug: string): AssetOperatingMode | null {
  return MODE_BY_SLUG[slug] ?? null
}
