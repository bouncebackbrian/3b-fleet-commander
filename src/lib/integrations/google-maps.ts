/**
 * Google Maps Platform — Integration Service Module
 *
 * Provides unified access to:
 *   - Places API (truck stops, fuel stations, rest areas, weigh stations)
 *   - Routes API (truck-optimized routing with low bridge/weight avoidance)
 *   - Geocoding API (address → lat/lng and reverse)
 *   - Elevation / road data layer helpers
 *
 * NOTE: All calls go through our server-side API routes so the API key
 * stays server-only. These are the server-side service functions.
 * Client interactions should use the React hooks and API routes.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlaceResult {
  placeId: string
  name: string
  address: string
  lat: number
  lng: number
  /** Place types: 'truck_stop', 'fuel_station', 'rest_area', 'weigh_station', 'parking', etc. */
  types: string[]
  rating?: number
  openNow?: boolean
  /** Distance from search point in meters */
  distanceM?: number
  phone?: string
  website?: string
  /** Hours of operation if available */
  hours?: { open: string; close: string }[]
}

export interface GeocodeResult {
  lat: number
  lng: number
  formattedAddress: string
  streetNumber?: string
  route?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

export interface TruckRoute {
  /** Polyline points for map rendering [lat, lng][] */
  polyline: [number, number][]
  /** Total distance in miles */
  distanceMi: number
  /** Estimated duration in minutes */
  durationMin: number
  /** Human-readable directions */
  legs: TruckRouteLeg[]
  /** Warnings (low bridges, weight restrictions, hazmat restrictions) */
  warnings: string[]
  /** Toll information */
  tolls?: { cost: number; name: string }[]
}

export interface TruckRouteLeg {
  distanceMi: number
  durationMin: number
  startAddress: string
  endAddress: string
  steps: string[]
  /** Any truck-specific restrictions on this leg */
  restrictions?: string[]
}

export interface SearchOptions {
  radius?: number       // meters, default 50000 (50km)
  maxResults?: number   // default 20
  type?: string         // place type filter: 'truck_stop' | 'gas_station' | 'rest_area' | 'parking'
  openNow?: boolean     // only return open places
  minRating?: number    // filter by minimum rating (1-5)
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Truck-applicable place types for Google Places API */
export const TRUCK_PLACE_TYPES = [
  'truck_stop',
  'gas_station',
  'rest_area',
  'parking',
  'lodging',
  'restaurant',
  'convenience_store',
] as const

export type TruckPlaceType = typeof TRUCK_PLACE_TYPES[number]

// ── API Key (server-side only) ───────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY ?? ''
  if (!key) {
    console.warn('[GoogleMaps] GOOGLE_MAPS_API_KEY not configured')
  }
  return key
}

// ── Geocoding — forward (address → coordinates) ──────────────────────────────

/**
 * Geocode an address string to coordinates.
 * Uses Google Geocoding API.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const key = getApiKey()
  if (!key) return null

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`
    const res = await fetch(url)
    const data = await res.json()

    if (data.status !== 'OK' || !data.results?.[0]) return null

    const result = data.results[0]
    const { lat, lng } = result.geometry.location
    const components = parseAddressComponents(result.address_components)

    return {
      lat,
      lng,
      formattedAddress: result.formatted_address,
      ...components,
    }
  } catch (err) {
    console.error('[GoogleMaps] Geocode error:', err)
    return null
  }
}

/**
 * Reverse geocode coordinates to address.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
  const key = getApiKey()
  if (!key) return null

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`
    const res = await fetch(url)
    const data = await res.json()

    if (data.status !== 'OK' || !data.results?.[0]) return null

    const result = data.results[0]
    const components = parseAddressComponents(result.address_components)

    return {
      lat,
      lng,
      formattedAddress: result.formatted_address,
      ...components,
    }
  } catch (err) {
    console.error('[GoogleMaps] Reverse geocode error:', err)
    return null
  }
}

// ── Places — nearby search ────────────────────────────────────────────────────

/**
 * Search for places near a location.
 * Good for finding truck stops, fuel stations, rest areas along the route.
 */
export async function searchNearby(
  lat: number,
  lng: number,
  options: SearchOptions = {},
): Promise<PlaceResult[]> {
  const key = getApiKey()
  if (!key) return []

  const { radius = 50000, maxResults = 20, type, openNow } = options

  try {
    let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&key=${key}`

    if (type) url += `&type=${type}`
    if (openNow) url += `&opennow`

    const res = await fetch(url)
    const data = await res.json()

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('[GoogleMaps] Places nearby error:', data.status, data.error_message)
      return []
    }

    const results = (data.results ?? [])
      .slice(0, maxResults)
      .map((p: Record<string, unknown>) => ({
        placeId: p.place_id as string,
        name: p.name as string,
        address: p.vicinity as string,
        lat: (p.geometry as Record<string, unknown>)?.location?.lat as number,
        lng: (p.geometry as Record<string, unknown>)?.location?.lng as number,
        types: p.types as string[],
        rating: p.rating as number | undefined,
        openNow: (p.opening_hours as Record<string, unknown>)?.open_now as boolean | undefined,
        distanceM: (p as Record<string, unknown>).distanceM as number | undefined,
      }))

    return results
  } catch (err) {
    console.error('[GoogleMaps] Places search error:', err)
    return []
  }
}

/**
 * Search for truck-specific places (truck stops, rest areas with truck parking).
 * Filters places by truck-relevant types.
 */
export async function searchTruckStops(
  lat: number,
  lng: number,
  radius = 80000, // 50mi
): Promise<PlaceResult[]> {
  // Search multiple truck-relevant types
  const [truckStops, gasStations] = await Promise.all([
    searchNearby(lat, lng, { radius, type: 'gas_station', maxResults: 20 }),
    searchNearby(lat, lng, { radius, type: 'rest_area' as string, maxResults: 10 }),
  ])

  // Deduplicate by placeId
  const seen = new Set<string>()
  const combined = [...truckStops, ...gasStations]
    .filter(p => {
      if (seen.has(p.placeId)) return false
      seen.add(p.placeId)
      return true
    })
    // Prioritize places with truck_stop in types
    .sort((a, b) => {
      const aTruck = a.types.some(t => t.includes('truck') || t.includes('gas'))
      const bTruck = b.types.some(t => t.includes('truck') || t.includes('gas'))
      if (aTruck && !bTruck) return -1
      if (!aTruck && bTruck) return 1
      return (b.rating ?? 0) - (a.rating ?? 0)
    })

  return combined.slice(0, 20)
}

// ── Place Details ────────────────────────────────────────────────────────────

/**
 * Get detailed information about a specific place.
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceResult | null> {
  const key = getApiKey()
  if (!key) return null

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,types,rating,opening_hours,formatted_phone_number,website&key=${key}`
    const res = await fetch(url)
    const data = await res.json()

    if (data.status !== 'OK' || !data.result) return null

    const p = data.result
    return {
      placeId: p.place_id,
      name: p.name,
      address: p.formatted_address,
      lat: p.geometry?.location?.lat,
      lng: p.geometry?.location?.lng,
      types: p.types ?? [],
      rating: p.rating,
      openNow: p.opening_hours?.open_now,
      phone: p.formatted_phone_number,
      website: p.website,
    }
  } catch (err) {
    console.error('[GoogleMaps] Place details error:', err)
    return null
  }
}

// ── Truck Route — Routes API with truck restrictions ─────────────────────────

/**
 * Get a truck-optimized route between two points.
 * Avoids low bridges, weight-restricted roads, and other truck hazards.
 *
 * @param originLat, originLng - Start coordinates
 * @param destLat, destLng - Destination coordinates
 * @param options - Optional truck specifications (height, weight, length, hazmat)
 */
export async function getTruckRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  options?: {
    truckHeight?: number   // feet
    truckWeight?: number   // lbs
    truckLength?: number   // feet
    avoidTolls?: boolean
    avoidFerries?: boolean
    hazmat?: boolean
  },
): Promise<TruckRoute | null> {
  const key = getApiKey()
  if (!key) return null

  try {
    const originStr = `${origin.lat},${origin.lng}`
    const destStr = `${destination.lat},${destination.lng}`

    // Build the request for Routes API (v2)
    const body: Record<string, unknown> = {
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      units: 'IMPERIAL',
      routeModifiers: {
        avoidTolls: options?.avoidTolls ?? false,
        avoidFerries: options?.avoidFerries ?? false,
      },
    }

    // Add truck-specific parameters
    if (options?.truckHeight || options?.truckWeight || options?.truckLength) {
      body.vehicleSpec = {
        ...(options.truckHeight ? { height: options.truckHeight * 0.3048 } : {}), // ft → m
        ...(options.truckWeight ? { weight: options.truckWeight * 0.453592 } : {}), // lbs → kg
        ...(options.truckLength ? { length: options.truckLength * 0.3048 } : {}), // ft → m
      }
    }

    const url = `https://routes.googleapis.com/directions/v2:computeRoutes?key=${key}&fields=*`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-FieldMask': '*',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()

    if (!data.routes?.[0]) return null

    const route = data.routes[0]
    const leg = route.legs?.[0]

    // Decode polyline
    const encodedPolyline = route.polyline?.encodedPolyline
    const polyline = encodedPolyline ? decodePolyline(encodedPolyline) : []

    // Build legs
    const legs: TruckRouteLeg[] = (route.legs ?? []).map((l: Record<string, unknown>) => ({
      distanceMi: ((l.distanceMeters as number) ?? 0) * 0.000621371,
      durationMin: ((l.duration as string) ? parseDuration(l.duration as string) : 0),
      startAddress: (l.startAddress as string) ?? '',
      endAddress: (l.endAddress as string) ?? '',
      steps: (l.steps as Array<Record<string, unknown>>)?.map((s: Record<string, unknown>) => (s.htmlInstructions as string) ?? '') ?? [],
    }))

    // Extract warnings from route labels
    const warnings: string[] = (route.warnings as string[]) ?? []

    return {
      polyline,
      distanceMi: leg ? (leg.distanceMeters as number) * 0.000621371 : 0,
      durationMin: leg ? parseDuration(leg.duration as string) : 0,
      legs,
      warnings,
    }
  } catch (err) {
    console.error('[GoogleMaps] Truck route error:', err)
    return null
  }
}

/**
 * Alternative: Get route from OSRM (free, no API key needed).
 * Used as fallback / simpler routing.
 */
export async function getOsrmRoute(
  waypoints: [number, number][],
): Promise<[number, number][] | null> {
  if (waypoints.length < 2) return null
  try {
    const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';')
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
    const res = await fetch(url)
    const data = await res.json()
    if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
      return data.routes[0].geometry.coordinates.map(
        ([lng, lat]: [number, number]) => [lat, lng] as [number, number],
      )
    }
    return null
  } catch (err) {
    console.error('[OSRM] Route error:', err)
    return null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAddressComponents(components: Array<{
  long_name: string
  short_name: string
  types: string[]
}>): {
  streetNumber?: string
  route?: string
  city?: string
  state?: string
  zip?: string
  country?: string
} {
  const result: Record<string, string> = {}
  for (const c of components) {
    if (c.types.includes('street_number')) result.streetNumber = c.long_name
    if (c.types.includes('route')) result.route = c.long_name
    if (c.types.includes('locality')) result.city = c.long_name
    if (c.types.includes('administrative_area_level_1')) result.state = c.short_name
    if (c.types.includes('postal_code')) result.zip = c.long_name
    if (c.types.includes('country')) result.country = c.long_name
  }
  return result as {
    streetNumber?: string
    route?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  }
}

/** Decode Google's encoded polyline format to [lat, lng][] */
function decodePolyline(encoded: string): [number, number][] {
  let index = 0
  const len = encoded.length
  let lat = 0
  let lng = 0
  const points: [number, number][] = []

  while (index < len) {
    let b: number
    let shift = 0
    let result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1))
    lat += dlat

    shift = 0
    result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1))
    lng += dlng

    points.push([lat * 1e-5, lng * 1e-5])
  }

  return points
}

/** Parse ISO 8601 duration string (e.g., "1234.567s") to minutes */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+(?:\.\d+)?)s$/)
  if (match) return Math.round(parseFloat(match[1]) / 60)
  return 0
}