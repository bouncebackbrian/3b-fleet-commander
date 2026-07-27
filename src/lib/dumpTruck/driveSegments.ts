/**
 * Dump Truck Mode — drive segment derivation
 *
 * Drive segments are never stored independently of events — they are built
 * by pairing depart_* events with the next arrive_* event (spec §5, "Truck
 * Custody and Drive-Time Rules"). This module is the pure pairing/duration/
 * mileage logic; callers persist the result to fleet_dt_drive_segments.
 *
 * Category assumption: depart_yard and depart_dump are empty travel (no
 * load aboard); depart_pickup is loaded travel. A business running mixed
 * yard-transfer moves can relabel a segment's category by hand later
 * (dispatcher correction) — this default covers the common case.
 */

import type { DumpTruckEventType, DriveSegmentCategory } from './types'

export interface RawSegmentEvent {
  id: string
  eventType: DumpTruckEventType
  effectiveAt: string // ISO
  odometer: number | null
  matchedSiteId: string | null
}

export interface BuiltSegment {
  departEventId: string | null
  arriveEventId: string | null
  originSiteId: string | null
  destinationSiteId: string | null
  category: DriveSegmentCategory
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  startOdometer: number | null
  endOdometer: number | null
  segmentMiles: number | null
  isException: boolean
  exceptionReason: string | null
}

const DEPART_CATEGORY: Partial<Record<DumpTruckEventType, DriveSegmentCategory>> = {
  depart_yard: 'empty',
  depart_pickup: 'loaded',
  depart_dump: 'empty',
}

const ARRIVE_TYPES = new Set<DumpTruckEventType>(['arrive_pickup', 'arrive_dump', 'arrive_yard'])

/**
 * Build drive segments from a shift's chronologically-relevant events.
 * Never throws on out-of-order/missing data — flags an exception instead
 * (spec §5: "If a departure or arrival is missing, create an exception.
 * Never invent a timestamp.").
 */
export function buildDriveSegments(events: RawSegmentEvent[]): BuiltSegment[] {
  const sorted = [...events].sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))
  const segments: BuiltSegment[] = []
  let open: BuiltSegment | null = null

  for (const e of sorted) {
    const departCategory = DEPART_CATEGORY[e.eventType]

    if (departCategory) {
      if (open) {
        // A new departure fired while one was still open — close the stale one as an exception.
        open.isException = true
        open.exceptionReason = 'missing_arrival'
        segments.push(open)
      }
      open = {
        departEventId: e.id,
        arriveEventId: null,
        originSiteId: e.matchedSiteId,
        destinationSiteId: null,
        category: departCategory,
        startedAt: e.effectiveAt,
        endedAt: null,
        durationSeconds: null,
        startOdometer: e.odometer,
        endOdometer: null,
        segmentMiles: null,
        isException: false,
        exceptionReason: null,
      }
      continue
    }

    if (ARRIVE_TYPES.has(e.eventType)) {
      if (!open) {
        segments.push({
          departEventId: null,
          arriveEventId: e.id,
          originSiteId: null,
          destinationSiteId: e.matchedSiteId,
          category: 'other',
          startedAt: e.effectiveAt,
          endedAt: e.effectiveAt,
          durationSeconds: 0,
          startOdometer: null,
          endOdometer: e.odometer,
          segmentMiles: null,
          isException: true,
          exceptionReason: 'arrival_without_departure',
        })
        continue
      }

      open.arriveEventId = e.id
      open.destinationSiteId = e.matchedSiteId
      open.endedAt = e.effectiveAt
      open.durationSeconds = Math.max(
        0,
        Math.round((new Date(e.effectiveAt).getTime() - new Date(open.startedAt).getTime()) / 1000),
      )
      open.endOdometer = e.odometer

      if (open.startOdometer != null && e.odometer != null) {
        const miles = e.odometer - open.startOdometer
        if (miles < 0) {
          open.isException = true
          open.exceptionReason = 'decreasing_odometer'
        } else {
          open.segmentMiles = miles
        }
      }

      segments.push(open)
      open = null
    }
  }

  if (open) {
    open.isException = true
    open.exceptionReason = 'missing_arrival'
    segments.push(open)
  }

  return segments
}

export function totalDriveSeconds(segments: BuiltSegment[]): number {
  return segments.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0)
}

export function driveSecondsByCategory(segments: BuiltSegment[]): Record<DriveSegmentCategory, number> {
  const totals: Record<DriveSegmentCategory, number> = {
    empty: 0, loaded: 0, yard_transfer: 0, fuel: 0, maintenance: 0, other: 0,
  }
  for (const s of segments) {
    totals[s.category] += s.durationSeconds ?? 0
  }
  return totals
}
