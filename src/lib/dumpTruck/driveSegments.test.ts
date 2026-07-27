import { describe, it, expect } from 'vitest'
import { buildDriveSegments, totalDriveSeconds, driveSecondsByCategory, type RawSegmentEvent } from './driveSegments'

function ev(id: string, eventType: RawSegmentEvent['eventType'], minute: number, odometer: number | null, siteId: string | null = null): RawSegmentEvent {
  return { id, eventType, effectiveAt: new Date(2026, 6, 1, 8, minute).toISOString(), odometer, matchedSiteId: siteId }
}

describe('buildDriveSegments', () => {
  it('pairs a depart/arrive event into a closed segment with duration and miles', () => {
    const events: RawSegmentEvent[] = [
      ev('e1', 'depart_yard', 0, 1000, 'yard'),
      ev('e2', 'arrive_pickup', 15, 1008, 'pickup'),
    ]
    const [seg] = buildDriveSegments(events)
    expect(seg.departEventId).toBe('e1')
    expect(seg.arriveEventId).toBe('e2')
    expect(seg.category).toBe('empty')
    expect(seg.durationSeconds).toBe(15 * 60)
    expect(seg.segmentMiles).toBe(8)
    expect(seg.isException).toBe(false)
  })

  it('categorizes depart_pickup as loaded travel', () => {
    const events: RawSegmentEvent[] = [
      ev('e1', 'depart_pickup', 0, 1008, 'pickup'),
      ev('e2', 'arrive_dump', 20, 1020, 'dump'),
    ]
    const [seg] = buildDriveSegments(events)
    expect(seg.category).toBe('loaded')
    expect(seg.segmentMiles).toBe(12)
  })

  it('builds multiple sequential segments across a full load cycle loop', () => {
    const events: RawSegmentEvent[] = [
      ev('e1', 'depart_yard', 0, 1000),
      ev('e2', 'arrive_pickup', 10, 1005),
      ev('e3', 'depart_pickup', 20, 1005),
      ev('e4', 'arrive_dump', 35, 1018),
      ev('e5', 'depart_dump', 45, 1018),
      ev('e6', 'arrive_pickup', 55, 1023),
    ]
    const segments = buildDriveSegments(events)
    expect(segments).toHaveLength(3)
    expect(segments.map(s => s.category)).toEqual(['empty', 'loaded', 'empty'])
    expect(segments.every(s => !s.isException)).toBe(true)
  })

  it('flags a missing arrival as an exception and leaves the segment open-ended', () => {
    const events: RawSegmentEvent[] = [ev('e1', 'depart_yard', 0, 1000)]
    const [seg] = buildDriveSegments(events)
    expect(seg.isException).toBe(true)
    expect(seg.exceptionReason).toBe('missing_arrival')
    expect(seg.endedAt).toBeNull()
  })

  it('flags an arrival with no matching departure as an exception, never inventing a start time', () => {
    const events: RawSegmentEvent[] = [ev('e1', 'arrive_pickup', 10, 1005)]
    const [seg] = buildDriveSegments(events)
    expect(seg.isException).toBe(true)
    expect(seg.exceptionReason).toBe('arrival_without_departure')
    expect(seg.departEventId).toBeNull()
  })

  it('flags a decreasing odometer as an exception instead of a negative mile value', () => {
    const events: RawSegmentEvent[] = [
      ev('e1', 'depart_yard', 0, 1000),
      ev('e2', 'arrive_pickup', 10, 990),
    ]
    const [seg] = buildDriveSegments(events)
    expect(seg.isException).toBe(true)
    expect(seg.exceptionReason).toBe('decreasing_odometer')
    expect(seg.segmentMiles).toBeNull()
  })

  it('closes a stale open segment as an exception when a second departure fires before an arrival', () => {
    const events: RawSegmentEvent[] = [
      ev('e1', 'depart_yard', 0, 1000),
      ev('e2', 'depart_pickup', 10, 1005), // no arrive_pickup in between
    ]
    const segments = buildDriveSegments(events)
    expect(segments).toHaveLength(2)
    expect(segments[0].isException).toBe(true)
    expect(segments[0].exceptionReason).toBe('missing_arrival')
  })

  it('is order-independent — sorts by effectiveAt before pairing', () => {
    const arrive = ev('e2', 'arrive_pickup', 15, 1008)
    const depart = ev('e1', 'depart_yard', 0, 1000)
    const segments = buildDriveSegments([arrive, depart])
    expect(segments).toHaveLength(1)
    expect(segments[0].isException).toBe(false)
  })
})

describe('totalDriveSeconds / driveSecondsByCategory', () => {
  it('sums durations and buckets them by category', () => {
    const events: RawSegmentEvent[] = [
      ev('e1', 'depart_yard', 0, 1000),
      ev('e2', 'arrive_pickup', 10, 1005),
      ev('e3', 'depart_pickup', 20, 1005),
      ev('e4', 'arrive_dump', 35, 1018),
    ]
    const segments = buildDriveSegments(events)
    expect(totalDriveSeconds(segments)).toBe(10 * 60 + 15 * 60)
    const byCategory = driveSecondsByCategory(segments)
    expect(byCategory.empty).toBe(10 * 60)
    expect(byCategory.loaded).toBe(15 * 60)
  })
})
