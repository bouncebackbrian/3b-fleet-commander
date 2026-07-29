/**
 * Dump Truck Mode — navigation launch links
 *
 * Builds destination links for Google Maps, Apple Maps, and (best-effort)
 * Trucker Path, plus copy-address/copy-coordinates fallbacks (spec §6).
 *
 * Trucker Path: as of this build there is no confirmed, documented deep-link
 * scheme for launching directly to a destination. Per spec instruction we do
 * NOT hard-code an undocumented URL scheme — `buildTruckerPathLaunch` opens
 * the Trucker Path web app and the caller must show Copy Address / Copy
 * Coordinates alongside it as the reliable fallback. Replace with an official
 * deep link if/when Trucker Path publishes one.
 *
 * Google Maps and Apple Maps are navigation launch options only — not proof
 * of truck-safe routing. Always show the site's route notes/restrictions
 * before launching (enforced in the UI layer, not here).
 */

import type { DumpTruckSite, PreferredNavPoint } from './types'

export interface NavDestination {
  lat: number | null
  lng: number | null
  address: string | null
  label: string
  sourcePoint: PreferredNavPoint
}

/** Resolve which coordinates/address to navigate to, honoring the site's preferred nav point. */
export function resolveNavDestination(site: DumpTruckSite): NavDestination {
  const address = formatAddress(site)

  const pointsInPreferenceOrder: { point: PreferredNavPoint; lat: number | null; lng: number | null }[] = [
    { point: 'entrance', lat: site.entranceLat, lng: site.entranceLng },
    { point: 'gate', lat: site.entranceLat, lng: site.entranceLng },
    { point: 'scale', lat: site.scaleLat, lng: site.scaleLng },
    { point: 'site_pin', lat: site.lat, lng: site.lng },
    { point: 'address', lat: site.lat, lng: site.lng },
  ]

  const preferred = pointsInPreferenceOrder.find(p => p.point === site.preferredNavPoint)
  const preferredHasCoords = preferred && preferred.lat != null && preferred.lng != null
  const chosen = preferredHasCoords ? preferred : pointsInPreferenceOrder.find(p => p.lat != null && p.lng != null)

  if (chosen && chosen.lat != null && chosen.lng != null) {
    return { lat: chosen.lat, lng: chosen.lng, address, label: site.name, sourcePoint: chosen.point }
  }

  return { lat: null, lng: null, address, label: site.name, sourcePoint: 'address' }
}

function formatAddress(site: DumpTruckSite): string | null {
  const parts = [site.addressLine1, site.addressLine2, site.city, site.state, site.postalCode]
    .filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

function destinationParam(dest: NavDestination): string {
  if (dest.lat != null && dest.lng != null) return `${dest.lat},${dest.lng}`
  if (dest.address) return dest.address
  return ''
}

export function buildGoogleMapsUrl(dest: NavDestination): string | null {
  const param = destinationParam(dest)
  if (!param) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(param)}&travelmode=driving`
}

export function buildAppleMapsUrl(dest: NavDestination): string | null {
  if (dest.lat != null && dest.lng != null) {
    return `https://maps.apple.com/?daddr=${dest.lat},${dest.lng}&dirflg=d`
  }
  if (dest.address) {
    return `https://maps.apple.com/?daddr=${encodeURIComponent(dest.address)}&dirflg=d`
  }
  return null
}

/**
 * Best-effort Trucker Path launch. No confirmed destination-import deep link
 * exists — this opens the Trucker Path web property; UI must present
 * Copy Address / Copy Coordinates next to it (spec §6).
 */
export function buildTruckerPathLaunch(): { url: string; supportsDestination: false } {
  return { url: 'https://www.truckerpath.com/', supportsDestination: false }
}

export interface NavLaunchOption {
  provider: 'google_maps' | 'apple_maps' | 'trucker_path' | 'copy_address' | 'copy_coordinates'
  label: string
  url: string | null
  copyValue: string | null
}

/**
 * Build navigate options for a bare GPS point (an event's captured lat/lng —
 * a scale queue, a random stop, a logged location) rather than a known Site.
 * No address/restrictions context exists for these, so it's just the map
 * launchers + copy-coordinates fallback.
 */
export function buildCoordNavLaunchOptions(lat: number, lng: number, label: string): NavLaunchOption[] {
  const dest: NavDestination = { lat, lng, address: null, label, sourcePoint: 'site_pin' }
  const coords = formatCoordinates(lat, lng)

  return [
    { provider: 'google_maps', label: 'Google Maps', url: buildGoogleMapsUrl(dest), copyValue: null },
    { provider: 'apple_maps', label: 'Apple Maps', url: buildAppleMapsUrl(dest), copyValue: null },
    { provider: 'copy_coordinates', label: 'Copy Coordinates', url: null, copyValue: coords },
  ]
}

/** Build the full set of navigate options the UI renders as large buttons. */
export function buildNavLaunchOptions(site: DumpTruckSite): NavLaunchOption[] {
  const dest = resolveNavDestination(site)
  const truckerPath = buildTruckerPathLaunch()
  const coords = dest.lat != null && dest.lng != null ? formatCoordinates(dest.lat, dest.lng) : null

  return [
    { provider: 'google_maps', label: 'Google Maps', url: buildGoogleMapsUrl(dest), copyValue: null },
    { provider: 'apple_maps', label: 'Apple Maps', url: buildAppleMapsUrl(dest), copyValue: null },
    { provider: 'trucker_path', label: 'Open Trucker Path', url: truckerPath.url, copyValue: null },
    { provider: 'copy_address', label: 'Copy Address', url: null, copyValue: dest.address },
    { provider: 'copy_coordinates', label: 'Copy Coordinates', url: null, copyValue: coords },
  ]
}
