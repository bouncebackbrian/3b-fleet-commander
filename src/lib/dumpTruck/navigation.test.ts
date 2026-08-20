import { describe, it, expect } from 'vitest'
import { resolveNavDestination, buildGoogleMapsUrl, buildAppleMapsUrl, buildNavLaunchOptions, formatCoordinates } from './navigation'
import type { DumpTruckSite } from './types'

function makeSite(overrides: Partial<DumpTruckSite> = {}): DumpTruckSite {
  return {
    id: 'site-1', businessId: 'biz-1', siteType: 'dump', name: 'Lockwood Dump Site',
    addressLine1: '123 Lockwood Rd', addressLine2: null, city: 'Sparks', state: 'NV', postalCode: '89434', country: 'US',
    lat: 39.55, lng: -119.55, geofenceRadiusM: 300,
    entranceLat: null, entranceLng: null, scaleLat: null, scaleLng: null,
    preferredNavPoint: 'address',
    customerName: null, brokerName: null, instructions: null, routeNotes: null,
    gateCode: null, gateInstructions: null, restrictions: {}, approachDirection: null, avoidNotes: null,
    contactName: null, contactPhone: null, operatingHours: {},
    active: true, verified: true, aliases: [],
    ...overrides,
  }
}

describe('resolveNavDestination', () => {
  it('prefers the entrance point when preferredNavPoint is entrance', () => {
    const site = makeSite({ preferredNavPoint: 'entrance', entranceLat: 39.551, entranceLng: -119.551 })
    const dest = resolveNavDestination(site)
    expect(dest.lat).toBe(39.551)
    expect(dest.lng).toBe(-119.551)
    expect(dest.sourcePoint).toBe('entrance')
  })

  it('falls back to the site pin when the preferred point has no coordinates', () => {
    const site = makeSite({ preferredNavPoint: 'gate', entranceLat: null, entranceLng: null, lat: 39.55, lng: -119.55 })
    const dest = resolveNavDestination(site)
    expect(dest.lat).toBe(39.55)
    expect(dest.lng).toBe(-119.55)
  })

  it('falls back to address-only when no site has coordinates at all', () => {
    const site = makeSite({ lat: null, lng: null })
    const dest = resolveNavDestination(site)
    expect(dest.lat).toBeNull()
    expect(dest.address).toContain('Lockwood Rd')
  })
})

describe('link builders', () => {
  it('builds a Google Maps destination link from coordinates', () => {
    const dest = resolveNavDestination(makeSite())
    const url = buildGoogleMapsUrl(dest)
    expect(url).toContain('google.com/maps/dir')
    expect(url).toContain('39.55')
  })

  it('builds an Apple Maps destination link from coordinates', () => {
    const dest = resolveNavDestination(makeSite())
    const url = buildAppleMapsUrl(dest)
    expect(url).toContain('maps.apple.com')
  })

  it('returns null links when there is neither coordinates nor address', () => {
    const site = makeSite({ lat: null, lng: null, addressLine1: null, city: null, state: null, postalCode: null })
    const dest = resolveNavDestination(site)
    expect(buildGoogleMapsUrl(dest)).toBeNull()
    expect(buildAppleMapsUrl(dest)).toBeNull()
  })

  it('formats coordinates to 6 decimal places', () => {
    expect(formatCoordinates(39.55, -119.55)).toBe('39.550000, -119.550000')
  })
})

describe('buildNavLaunchOptions', () => {
  it('always includes Trucker Path and both copy fallbacks, never claiming destination support for Trucker Path', () => {
    const options = buildNavLaunchOptions(makeSite())
    const truckerPath = options.find(o => o.provider === 'trucker_path')
    expect(truckerPath?.url).toBeTruthy()
    expect(options.find(o => o.provider === 'copy_address')?.copyValue).toContain('Lockwood')
    expect(options.find(o => o.provider === 'copy_coordinates')?.copyValue).toBe('39.550000, -119.550000')
  })
})
