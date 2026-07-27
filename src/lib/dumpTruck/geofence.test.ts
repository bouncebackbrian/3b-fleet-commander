import { describe, it, expect } from 'vitest'
import { haversineMeters, matchSite, nearestSite, type GeofenceSite } from './geofence'

describe('haversineMeters', () => {
  it('returns ~0 for the same point', () => {
    expect(haversineMeters(39.53, -119.78, 39.53, -119.78)).toBeCloseTo(0, 3)
  })

  it('computes a known distance (roughly Reno to Sparks, NV, a few km)', () => {
    const d = haversineMeters(39.5296, -119.8138, 39.5349, -119.7527)
    expect(d).toBeGreaterThan(4000)
    expect(d).toBeLessThan(7000)
  })
})

describe('matchSite', () => {
  const sites: GeofenceSite[] = [
    { id: 'yard', lat: 39.5296, lng: -119.8138, geofenceRadiusM: 300 },
    { id: 'dump', lat: 39.6, lng: -119.6, geofenceRadiusM: 500 },
    { id: 'no-coords', lat: null, lng: null, geofenceRadiusM: 300 },
  ]

  it('matches the site whose geofence contains the point', () => {
    const match = matchSite({ lat: 39.5296, lng: -119.8138 }, sites)
    expect(match?.siteId).toBe('yard')
  })

  it('returns null when the point is outside every geofence', () => {
    const match = matchSite({ lat: 40.5, lng: -120.5 }, sites)
    expect(match).toBeNull()
  })

  it('picks the nearest site when radii overlap', () => {
    const overlapping: GeofenceSite[] = [
      { id: 'far', lat: 39.53, lng: -119.78, geofenceRadiusM: 5000 },
      { id: 'near', lat: 39.5301, lng: -119.7801, geofenceRadiusM: 5000 },
    ]
    const match = matchSite({ lat: 39.5301, lng: -119.7801 }, overlapping)
    expect(match?.siteId).toBe('near')
  })

  it('ignores sites with no coordinates', () => {
    const match = matchSite({ lat: 39.5296, lng: -119.8138 }, [sites[2]])
    expect(match).toBeNull()
  })
})

describe('nearestSite', () => {
  it('finds the closest site even outside its geofence, for exception review', () => {
    const sites: GeofenceSite[] = [
      { id: 'yard', lat: 39.5296, lng: -119.8138, geofenceRadiusM: 50 },
    ]
    const match = nearestSite({ lat: 39.53, lng: -119.81 }, sites)
    expect(match?.siteId).toBe('yard')
    expect(match?.distanceM).toBeGreaterThan(50)
  })
})
