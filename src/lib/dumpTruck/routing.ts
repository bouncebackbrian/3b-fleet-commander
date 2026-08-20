/**
 * Dump Truck Mode — real road routing for AI dispatch trip planning
 *
 * Same OSRM public router + Nominatim geocoder already used by
 * src/app/api/plan-trip/route.ts (OTR fuel-stop planning) — reused here
 * rather than re-implemented. Server-side only (no 'use client').
 *
 * No live-traffic data source is wired up in this build (no Google/HERE
 * Maps API key configured) — trafficDurationMinutes is always null.
 * computeDispatchRoute (service layer) surfaces that as "traffic data not
 * available" rather than silently reusing the normal estimate, per the
 * spec's "clearly distinguish normal vs. traffic-adjusted" requirement.
 */

export interface LatLng {
  lat: number
  lng: number
}

export interface RouteEstimate {
  distanceMiles: number
  durationMinutes: number
  trafficDurationMinutes: null
  provider: 'osrm'
  providerVersion: string | null
  calculatedAt: string
}

/** Real road-route distance + duration via OSRM. Returns null if unreachable — callers must not fall back to straight-line estimates (spec requirement). */
export async function estimateRoute(origin: LatLng, dest: LatLng): Promise<RouteEstimate | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=false`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.[0]) return null
    const route = data.routes[0]
    return {
      distanceMiles: route.distance / 1609.344,
      durationMinutes: route.duration / 60,
      trafficDurationMinutes: null,
      provider: 'osrm',
      providerVersion: null,
      calculatedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

/** Geocode a free-text location (address, cross-street, landmark) via Nominatim — same pattern as plan-trip/scan-site. */
export async function geocodeAddress(query: string): Promise<LatLng | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=us`,
      { headers: { 'User-Agent': '3BFleetCommander/1.0 (fleet.bouncebackbrian.com)' } },
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    const lat = parseFloat(data[0].lat)
    const lng = parseFloat(data[0].lon)
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null
    return { lat, lng }
  } catch {
    return null
  }
}
