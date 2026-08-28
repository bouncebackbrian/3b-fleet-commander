export type FuelKind = 'diesel' | 'truck_diesel' | 'regular' | 'def'

export type FuelProviderCapability =
  | 'station_search'
  | 'fuel_prices'
  | 'truck_access'
  | 'def_availability'
  | 'routing'
  | 'detour_distance'
  | 'traffic'

export type FuelProviderStatus = 'ready' | 'placeholder' | 'disabled'

export interface FuelProviderDefinition {
  id: string
  name: string
  status: FuelProviderStatus
  capabilities: FuelProviderCapability[]
  envVars: string[]
  notes: string
}

/**
 * Shared provider registry for Fuel Finder.
 *
 * IMPORTANT:
 * - This file intentionally contains NO API keys and performs NO external calls.
 * - Providers remain placeholders until credentials/configuration are supplied.
 * - Driver, Dispatch, and Admin should consume Fuel Finder through one shared
 *   service so provider changes do not leak into mode-specific UI.
 */
export const FUEL_PROVIDER_REGISTRY: FuelProviderDefinition[] = [
  {
    id: 'google_places',
    name: 'Google Places API',
    status: 'placeholder',
    capabilities: ['station_search', 'fuel_prices'],
    envVars: ['GOOGLE_MAPS_API_KEY'],
    notes: 'Candidate primary station lookup and gasoline/diesel price source. Places supports fuelOptions/fuelPrices where available, including diesel and truck diesel. DEF availability is not guaranteed by the fuel-price model.',
  },
  {
    id: 'here_routing',
    name: 'HERE Routing API v8',
    status: 'placeholder',
    capabilities: ['routing', 'detour_distance', 'traffic', 'truck_access'],
    envVars: ['HERE_API_KEY'],
    notes: 'Candidate truck-aware routing and detour-cost provider. Supports truck transport mode and vehicle dimensions/weight parameters.',
  },
  {
    id: 'fuel_price_secondary',
    name: 'Secondary Fuel Price Provider',
    status: 'placeholder',
    capabilities: ['fuel_prices'],
    envVars: ['FUEL_PRICE_API_URL', 'FUEL_PRICE_API_KEY'],
    notes: 'Reserved adapter for a commercial fuel-price feed if Google coverage is incomplete or a fleet-specific provider is selected later.',
  },
  {
    id: 'truck_stop_metadata',
    name: 'Truck Stop / DEF Metadata Provider',
    status: 'placeholder',
    capabilities: ['truck_access', 'def_availability'],
    envVars: ['TRUCK_STOP_API_URL', 'TRUCK_STOP_API_KEY'],
    notes: 'Reserved adapter for truck-lane, parking, scale, shower, and pump-DEF metadata when a provider is selected.',
  },
]

export interface FuelFinderQuery {
  lat: number
  lng: number
  fuelKinds: FuelKind[]
  radiusMiles: number
  routeDestination?: { lat: number; lng: number } | null
  assetId?: string | null
}

export interface FuelFinderStation {
  providerStationId: string
  name: string
  address: string | null
  lat: number
  lng: number
  distanceMiles: number | null
  detourMiles: number | null
  detourMinutes: number | null
  truckFriendly: boolean | null
  defAvailable: boolean | null
  openNow: boolean | null
  prices: Partial<Record<FuelKind, number>>
  priceUpdatedAt: string | null
  providerIds: string[]
}

export function configuredFuelProviders(env: NodeJS.ProcessEnv = process.env): FuelProviderDefinition[] {
  return FUEL_PROVIDER_REGISTRY.map(provider => ({
    ...provider,
    status: provider.envVars.length > 0 && provider.envVars.every(key => Boolean(env[key])) ? 'ready' : provider.status,
  }))
}
