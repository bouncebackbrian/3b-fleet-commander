/**
 * Dump Truck Mode — geofence matching
 *
 * Pure haversine distance + nearest-site-within-radius matching. Used both
 * client-side (instant "Saved at <site>" confirmation) and server-side
 * (authoritative matched_site_id stamped on the event row).
 */

const EARTH_RADIUS_M = 6371000

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_M * c
}

export interface GeofenceSite {
  id: string
  lat: number | null
  lng: number | null
  geofenceRadiusM: number
}

export interface GeofenceMatch {
  siteId: string
  distanceM: number
}

/**
 * Returns the nearest site whose geofence contains the point, or null if
 * no site's geofence contains it (still a valid, saved event — just no
 * confirmed site match, per spec §6: "Save the event even if the location
 * request fails" / falls outside all known geofences).
 */
export function matchSite(
  point: { lat: number; lng: number },
  sites: GeofenceSite[],
): GeofenceMatch | null {
  let best: GeofenceMatch | null = null

  for (const site of sites) {
    if (site.lat == null || site.lng == null) continue
    const distanceM = haversineMeters(point.lat, point.lng, site.lat, site.lng)
    if (distanceM > site.geofenceRadiusM) continue
    if (!best || distanceM < best.distanceM) {
      best = { siteId: site.id, distanceM }
    }
  }

  return best
}

/** Distance-to-nearest-site even when outside every geofence — useful for exception review. */
export function nearestSite(
  point: { lat: number; lng: number },
  sites: GeofenceSite[],
): GeofenceMatch | null {
  let best: GeofenceMatch | null = null
  for (const site of sites) {
    if (site.lat == null || site.lng == null) continue
    const distanceM = haversineMeters(point.lat, point.lng, site.lat, site.lng)
    if (!best || distanceM < best.distanceM) {
      best = { siteId: site.id, distanceM }
    }
  }
  return best
}
