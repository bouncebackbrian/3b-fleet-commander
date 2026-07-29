import { describe, it, expect } from 'vitest'
import { siteAwareActionLabel } from './actionLabels'

describe('siteAwareActionLabel', () => {
  it('names the pickup site on arrive_pickup when known', () => {
    expect(siteAwareActionLabel('arrive_pickup', 'Arrived Pickup', { pickupSiteName: '3D Dayton' }))
      .toBe('Arrived at 3D Dayton')
  })

  it('names the dump site on arrive_dump when known', () => {
    expect(siteAwareActionLabel('arrive_dump', 'Arrived Dump', { dumpSiteName: '7688 USA Pkwy' }))
      .toBe('Arrived at 7688 USA Pkwy')
  })

  it('shows where the driver is heading on depart_yard', () => {
    expect(siteAwareActionLabel('depart_yard', 'Depart Yard', { pickupSiteName: '3D Dayton' }))
      .toBe('Depart Yard — Heading to 3D Dayton')
  })

  it('shows where the driver is heading on depart_pickup', () => {
    expect(siteAwareActionLabel('depart_pickup', 'Leave Pickup', { dumpSiteName: '7688 USA Pkwy' }))
      .toBe('Leave Pickup — Heading to 7688 USA Pkwy')
  })

  it('falls back to the default label when no site is known', () => {
    expect(siteAwareActionLabel('arrive_pickup', 'Arrived Pickup', {})).toBe('Arrived Pickup')
  })

  it('falls back to the default label for events with no site mapping', () => {
    expect(siteAwareActionLabel('loading_started', 'Start Loading', { pickupSiteName: '3D Dayton' }))
      .toBe('Start Loading')
  })

  it('falls back to the default label for a null event type', () => {
    expect(siteAwareActionLabel(null, 'Complete Pre-Trip', { pickupSiteName: '3D Dayton' }))
      .toBe('Complete Pre-Trip')
  })
})
