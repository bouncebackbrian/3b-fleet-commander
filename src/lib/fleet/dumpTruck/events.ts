/**
 * fleet/dumpTruck/events.ts — operational event recording + derived side effects
 *
 * This is the single write path for the append-only fleet_dt_events log
 * (spec §5). Recording an event may also:
 *   - open/close a fleet_dt_vehicle_custody period (truck_picked_up / truck_dropped_off)
 *   - open/close a fleet_dt_drive_segments row (depart_* / arrive_*)
 *   - create/advance a fleet_dt_load_cycles row (arrive_pickup .. depart_dump)
 *   - re-sync fleet_dt_shifts.state from the replayed event history
 *
 * Idempotency: the row's primary key IS the client-generated idempotency key
 * (spec §3.4/§16 — "Enforce a unique tenant/device idempotency constraint so
 * retries cannot duplicate events"). A retried insert hits the unique
 * constraint on (business_id, idempotency_key); we detect that and return
 * the original row instead of erroring or duplicating side effects.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { canFireEvent } from '@/lib/dumpTruck/stateMachine'
import { matchSite } from '@/lib/dumpTruck/geofence'
import { getGeofenceSites } from './sites'
import { getThreebId, getShiftFlowState, syncShiftState, DumpTruckError } from './shared'
import { getShiftById } from './shifts'
import type { DumpTruckEventType, LocationPermissionStatus } from '@/lib/dumpTruck/types'

export interface RecordEventGeoInput {
  lat: number | null
  lng: number | null
  accuracyM: number | null
  capturedAt: string | null
  permission: LocationPermissionStatus
}

export interface RecordEventInput {
  id: string // client-generated UUID
  idempotencyKey: string
  shiftId: string
  eventType: DumpTruckEventType
  jobId?: string | null
  loadCycleId?: string | null
  deviceCapturedAt: string
  effectiveAt: string
  timezone?: string | null
  utcOffsetMinutes?: number | null
  geo: RecordEventGeoInput
  odometer?: number | null
  notes?: string | null
  deviceMetadata?: Record<string, unknown>
  correctsEventId?: string | null
  correctionReason?: string | null
}

export interface RecordedEvent {
  id: string
  eventType: DumpTruckEventType
  matchedSiteId: string | null
  duplicate: boolean
}

const CUSTODY_REQUIRED_ODOMETER: DumpTruckEventType[] = ['truck_picked_up', 'truck_dropped_off']

export async function recordEvent(
  businessId: string,
  driverId: string,
  email: string | null,
  input: RecordEventInput,
): Promise<RecordedEvent> {
  const shift = await getShiftById(input.shiftId)
  if (!shift || shift.businessId !== businessId || shift.driverId !== driverId) {
    throw new DumpTruckError('Shift not found', 404)
  }

  const flowState = await getShiftFlowState(input.shiftId)
  if (!canFireEvent(flowState, input.eventType)) {
    throw new DumpTruckError(
      `"${input.eventType}" is not valid from the current shift state ("${flowState}")`,
      409,
    )
  }

  if (CUSTODY_REQUIRED_ODOMETER.includes(input.eventType) && input.odometer == null) {
    throw new DumpTruckError(`Odometer is required for "${input.eventType}"`, 400)
  }

  // Geofence match — best-effort, never blocks the write.
  let matchedSiteId: string | null = null
  let distanceFromSiteM: number | null = null
  if (input.geo.lat != null && input.geo.lng != null) {
    try {
      const sites = await getGeofenceSites(businessId)
      const match = matchSite({ lat: input.geo.lat, lng: input.geo.lng }, sites)
      matchedSiteId = match?.siteId ?? null
      distanceFromSiteM = match?.distanceM ?? null
    } catch {
      // geofence lookup failure must never block saving the event
    }
  }

  const threebId = await getThreebId(driverId)

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_events')
    .insert({
      id: input.id,
      idempotency_key: input.idempotencyKey,
      business_id: businessId,
      threeb_id: threebId,
      driver_id: driverId,
      shift_id: input.shiftId,
      job_id: input.jobId ?? null,
      load_cycle_id: input.loadCycleId ?? null,
      vehicle_id: shift.truckId,
      trailer_id: shift.trailerId,
      event_type: input.eventType,
      device_captured_at: input.deviceCapturedAt,
      effective_at: input.effectiveAt,
      timezone: input.timezone ?? null,
      utc_offset_minutes: input.utcOffsetMinutes ?? null,
      lat: input.geo.lat,
      lng: input.geo.lng,
      location_accuracy_m: input.geo.accuracyM,
      gps_captured_at: input.geo.capturedAt,
      location_permission: input.geo.permission,
      matched_site_id: matchedSiteId,
      distance_from_site_m: distanceFromSiteM,
      odometer: input.odometer ?? null,
      notes: input.notes ?? null,
      device_metadata: input.deviceMetadata ?? {},
      sync_state: 'synced',
      corrects_event_id: input.correctsEventId ?? null,
      correction_reason: input.correctionReason ?? null,
      created_by: driverId,
    })
    .select('id')
    .single()

  if (error) {
    // Unique violation on (business_id, idempotency_key) — an offline retry. Not an error.
    if (error.code === '23505') {
      const { data: existing } = await fleetServiceClient
        .from('fleet_dt_events')
        .select('id, event_type, matched_site_id')
        .eq('business_id', businessId)
        .eq('idempotency_key', input.idempotencyKey)
        .single()
      if (existing) {
        return { id: existing.id, eventType: existing.event_type, matchedSiteId: existing.matched_site_id, duplicate: true }
      }
    }
    throw error
  }

  await applySideEffects(businessId, driverId, shift, input, matchedSiteId)
  await syncShiftState(input.shiftId)

  audit.log({
    userId: driverId, email, action: `dump_truck.event.${input.eventType}`,
    resource: 'fleet_dt_events', resourceId: data.id, metadata: { shiftId: input.shiftId },
  })

  return { id: data.id, eventType: input.eventType, matchedSiteId, duplicate: false }
}

// ── Side effects ────────────────────────────────────────────────────────────

const DEPART_CATEGORY: Partial<Record<DumpTruckEventType, 'empty' | 'loaded'>> = {
  depart_yard: 'empty',
  depart_pickup: 'loaded',
  depart_dump: 'empty',
}
const ARRIVE_TYPES: DumpTruckEventType[] = ['arrive_pickup', 'arrive_dump', 'arrive_yard']

async function applySideEffects(
  businessId: string,
  driverId: string,
  shift: NonNullable<Awaited<ReturnType<typeof getShiftById>>>,
  input: RecordEventInput,
  matchedSiteId: string | null,
): Promise<void> {
  switch (input.eventType) {
    case 'truck_picked_up': {
      await fleetServiceClient.from('fleet_dt_vehicle_custody').insert({
        business_id: businessId,
        shift_id: input.shiftId,
        driver_id: driverId,
        truck_id: shift.truckId,
        trailer_id: shift.trailerId,
        start_event_id: input.id,
        start_odometer: input.odometer,
        start_yard_site_id: matchedSiteId ?? shift.startYardSiteId,
        started_at: input.effectiveAt,
      })
      break
    }

    case 'truck_dropped_off': {
      const { data: open } = await fleetServiceClient
        .from('fleet_dt_vehicle_custody')
        .select('id')
        .eq('shift_id', input.shiftId)
        .is('ended_at', null)
        .maybeSingle()
      if (open) {
        await fleetServiceClient.from('fleet_dt_vehicle_custody').update({
          end_event_id: input.id,
          end_odometer: input.odometer,
          end_site_id: matchedSiteId,
          end_condition: input.deviceMetadata?.vehicleCondition ?? null,
          end_fuel_level: input.deviceMetadata?.fuelLevel ?? null,
          end_key_status: input.deviceMetadata?.keyStatus ?? null,
          ended_at: input.effectiveAt,
        }).eq('id', open.id)
      }
      break
    }

    case 'depart_yard':
    case 'depart_pickup':
    case 'depart_dump': {
      const category = DEPART_CATEGORY[input.eventType]!
      let loadCycleId: string | null = null
      if (input.eventType === 'depart_pickup') {
        loadCycleId = await getOpenLoadCycleId(input.shiftId)
        if (loadCycleId) {
          await fleetServiceClient.from('fleet_dt_load_cycles')
            .update({ pickup_depart_event_id: input.id })
            .eq('id', loadCycleId)
        }
      }
      if (input.eventType === 'depart_dump') {
        loadCycleId = await getOpenLoadCycleId(input.shiftId)
        if (loadCycleId) {
          await fleetServiceClient.from('fleet_dt_load_cycles')
            .update({ dump_depart_event_id: input.id })
            .eq('id', loadCycleId)
          await fleetServiceClient.from('fleet_dt_shifts')
            .update({ load_count: shift.loadCount + 1 })
            .eq('id', input.shiftId)
        }
      }
      await fleetServiceClient.from('fleet_dt_drive_segments').insert({
        business_id: businessId,
        shift_id: input.shiftId,
        load_cycle_id: loadCycleId,
        driver_id: driverId,
        truck_id: shift.truckId,
        trailer_id: shift.trailerId,
        origin_site_id: matchedSiteId,
        depart_event_id: input.id,
        category,
        started_at: input.effectiveAt,
        start_odometer: input.odometer,
      })
      break
    }

    case 'arrive_pickup':
    case 'arrive_dump':
    case 'arrive_yard': {
      if (ARRIVE_TYPES.includes(input.eventType)) {
        await closeOpenDriveSegment(input.shiftId, input.id, matchedSiteId, input.odometer ?? null, input.effectiveAt)
      }
      if (input.eventType === 'arrive_pickup') {
        await createLoadCycle(businessId, driverId, shift, input, matchedSiteId)
      }
      if (input.eventType === 'arrive_dump') {
        const loadCycleId = await getOpenLoadCycleId(input.shiftId)
        if (loadCycleId) {
          await fleetServiceClient.from('fleet_dt_load_cycles').update({
            dump_arrive_event_id: input.id,
            dump_site_id: matchedSiteId,
          }).eq('id', loadCycleId)
          // Tag the just-closed loaded segment with this load cycle.
          await fleetServiceClient.from('fleet_dt_drive_segments')
            .update({ load_cycle_id: loadCycleId })
            .eq('arrive_event_id', input.id)
        }
      }
      break
    }

    case 'loading_started':
    case 'loading_completed':
    case 'unloading_started':
    case 'unloading_completed': {
      const loadCycleId = await getOpenLoadCycleId(input.shiftId)
      if (loadCycleId) {
        const COLUMN_BY_EVENT_TYPE: Record<'loading_started' | 'loading_completed' | 'unloading_started' | 'unloading_completed', string> = {
          loading_started: 'loading_started_event_id',
          loading_completed: 'loading_completed_event_id',
          unloading_started: 'unloading_started_event_id',
          unloading_completed: 'unloading_completed_event_id',
        }
        const column = COLUMN_BY_EVENT_TYPE[input.eventType]
        await fleetServiceClient.from('fleet_dt_load_cycles').update({ [column]: input.id }).eq('id', loadCycleId)
      }
      break
    }

    default:
      break
  }
}

async function getOpenLoadCycleId(shiftId: string): Promise<string | null> {
  const { data } = await fleetServiceClient
    .from('fleet_dt_load_cycles')
    .select('id')
    .eq('shift_id', shiftId)
    .is('dump_depart_event_id', null)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function closeOpenDriveSegment(
  shiftId: string, arriveEventId: string, matchedSiteId: string | null, odometer: number | null, effectiveAt: string,
): Promise<void> {
  const { data: open } = await fleetServiceClient
    .from('fleet_dt_drive_segments')
    .select('id, started_at, start_odometer')
    .eq('shift_id', shiftId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!open) return

  const durationSeconds = Math.max(0, Math.round(
    (new Date(effectiveAt).getTime() - new Date(open.started_at).getTime()) / 1000,
  ))
  let segmentMiles: number | null = null
  let isException = false
  let exceptionReason: string | null = null
  if (open.start_odometer != null && odometer != null) {
    const miles = odometer - open.start_odometer
    if (miles < 0) { isException = true; exceptionReason = 'decreasing_odometer' } else { segmentMiles = miles }
  }

  await fleetServiceClient.from('fleet_dt_drive_segments').update({
    arrive_event_id: arriveEventId,
    destination_site_id: matchedSiteId,
    ended_at: effectiveAt,
    duration_seconds: durationSeconds,
    end_odometer: odometer,
    segment_miles: segmentMiles,
    is_exception: isException,
    exception_reason: exceptionReason,
  }).eq('id', open.id)
}

async function createLoadCycle(
  businessId: string,
  driverId: string,
  shift: NonNullable<Awaited<ReturnType<typeof getShiftById>>>,
  input: RecordEventInput,
  matchedSiteId: string | null,
): Promise<void> {
  const { count } = await fleetServiceClient
    .from('fleet_dt_load_cycles')
    .select('id', { count: 'exact', head: true })
    .eq('shift_id', input.shiftId)

  if (!input.jobId) return // no active job context — caller must select a job before dispatch-critical actions

  await fleetServiceClient.from('fleet_dt_load_cycles').insert({
    business_id: businessId,
    shift_id: input.shiftId,
    job_id: input.jobId,
    driver_id: driverId,
    sequence: (count ?? 0) + 1,
    pickup_site_id: matchedSiteId,
    pickup_arrive_event_id: input.id,
  })
}
