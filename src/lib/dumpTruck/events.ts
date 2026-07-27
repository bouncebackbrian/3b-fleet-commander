/**
 * Dump Truck Mode — event construction + geolocation capture
 *
 * `buildEvent` is pure and testable: given already-resolved geo evidence and
 * identifiers, it assembles the exact row shape the API/offline queue send.
 * `captureGeolocation` is the one side-effecting piece (browser Geolocation
 * API) — spec §6: request with a short timeout, and save the event even if
 * the location request fails.
 */

import type { DumpTruckEvent, DumpTruckEventType, GeoEvidence, LocationPermissionStatus } from './types'

const GEOLOCATION_TIMEOUT_MS = 6000

export function createId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Fallback for environments without crypto.randomUUID (older WebViews).
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Best-effort geolocation capture with a short timeout. Never throws or
 * blocks the caller — always resolves, worst case with permission:'unavailable'.
 */
export async function captureGeolocation(timeoutMs = GEOLOCATION_TIMEOUT_MS): Promise<GeoEvidence> {
  const empty = (permission: LocationPermissionStatus): GeoEvidence => ({
    lat: null, lng: null, accuracyM: null, capturedAt: null, permission,
  })

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return empty('unavailable')
  }

  return new Promise<GeoEvidence>(resolve => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(empty('timeout'))
    }, timeoutMs)

    navigator.geolocation.getCurrentPosition(
      position => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: position.coords.accuracy ?? null,
          capturedAt: new Date(position.timestamp).toISOString(),
          permission: 'granted',
        })
      },
      error => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(empty(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'))
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 },
    )
  })
}

export function getDeviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
  } catch {
    return null
  }
}

export function getUtcOffsetMinutes(date: Date = new Date()): number {
  return -date.getTimezoneOffset()
}

export interface BuildEventParams {
  businessId: string
  threebId: string | null
  driverId: string
  shiftId: string
  jobId?: string | null
  loadCycleId?: string | null
  vehicleId?: string | null
  trailerId?: string | null
  eventType: DumpTruckEventType
  geo: GeoEvidence
  odometer?: number | null
  notes?: string | null
  deviceMetadata?: Record<string, unknown>
  correctsEventId?: string | null
  correctionReason?: string | null
  now?: Date
}

/** Pure: assembles a fully-formed event ready to enqueue/send. Generates its own id + idempotency key. */
export function buildEvent(params: BuildEventParams): DumpTruckEvent {
  const now = params.now ?? new Date()
  const id = createId()
  return {
    id,
    idempotencyKey: id, // the client-generated id itself is the idempotency key — stable across retries of the same action
    businessId: params.businessId,
    threebId: params.threebId,
    driverId: params.driverId,
    shiftId: params.shiftId,
    jobId: params.jobId ?? null,
    loadCycleId: params.loadCycleId ?? null,
    vehicleId: params.vehicleId ?? null,
    trailerId: params.trailerId ?? null,
    eventType: params.eventType,
    deviceCapturedAt: now.toISOString(),
    effectiveAt: now.toISOString(),
    timezone: getDeviceTimezone(),
    utcOffsetMinutes: getUtcOffsetMinutes(now),
    geo: params.geo,
    odometer: params.odometer ?? null,
    notes: params.notes ?? null,
    deviceMetadata: params.deviceMetadata ?? {},
    syncState: 'pending',
    correctsEventId: params.correctsEventId ?? null,
    correctionReason: params.correctionReason ?? null,
  }
}
