import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { getThreebId } from './shared'
import { getShiftById } from './shifts'
import { DumpTruckError } from './shared'
import type { RecordEventGeoInput } from './events'

export interface ShutdownCloseoutInput {
  shiftId: string
  effectiveAt: string
  deviceCapturedAt: string
  timezone?: string | null
  utcOffsetMinutes?: number | null
  geo: RecordEventGeoInput
  odometer?: number | null
  releaseNote?: string | null
}

/**
 * Exception closeout for a shift whose assigned asset was formally placed in
 * shutdown/out-of-service status during the active shift.
 *
 * This deliberately bypasses the normal post-trip sequence, but only after a
 * server-side check proves an unresolved shutdown defect exists on the truck.
 * The resulting event is still append-only evidence and the shutdown interval
 * remains separately reportable for payroll review.
 */
export async function closeShiftForAssetShutdown(
  businessId: string,
  driverId: string,
  email: string | null,
  input: ShutdownCloseoutInput,
) {
  const shift = await getShiftById(input.shiftId)
  if (!shift || shift.businessId !== businessId || shift.driverId !== driverId) {
    throw new DumpTruckError('Shift not found', 404)
  }
  if (!shift.truckId) throw new DumpTruckError('Shift has no assigned truck', 400)
  if (shift.clockOutAt) throw new DumpTruckError('Shift is already clocked out', 409)

  const { data: shutdownDefect } = await fleetServiceClient
    .from('fleet_dt_defects')
    .select('id, created_at, severity, description')
    .eq('business_id', businessId)
    .eq('truck_id', shift.truckId)
    .eq('return_to_service_required', true)
    .is('return_to_service_approved_at', null)
    .in('status', ['open', 'acknowledged'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!shutdownDefect) {
    throw new DumpTruckError('Asset is not in an active shutdown/out-of-service state', 409)
  }

  const eventId = crypto.randomUUID()
  const threebId = await getThreebId(driverId)

  const { error: eventError } = await fleetServiceClient.from('fleet_dt_events').insert({
    id: eventId,
    idempotency_key: eventId,
    business_id: businessId,
    threeb_id: threebId,
    driver_id: driverId,
    shift_id: input.shiftId,
    vehicle_id: shift.truckId,
    trailer_id: shift.trailerId,
    event_type: 'shutdown_clock_out',
    device_captured_at: input.deviceCapturedAt,
    effective_at: input.effectiveAt,
    timezone: input.timezone ?? null,
    utc_offset_minutes: input.utcOffsetMinutes ?? null,
    lat: input.geo.lat,
    lng: input.geo.lng,
    location_accuracy_m: input.geo.accuracyM,
    gps_captured_at: input.geo.capturedAt,
    location_permission: input.geo.permission,
    odometer: input.odometer ?? null,
    notes: input.releaseNote ?? 'Post-trip waived due to formal asset shutdown',
    device_metadata: {
      closeoutReason: 'asset_shutdown',
      posttripWaived: true,
      payTimeCategory: 'shutdown_breakdown',
      defectId: shutdownDefect.id,
    },
    sync_state: 'synced',
    created_by: driverId,
  })
  if (eventError) throw eventError

  const { error: closeoutError } = await fleetServiceClient.from('fleet_dt_shutdown_closeouts').insert({
    business_id: businessId,
    shift_id: input.shiftId,
    driver_id: driverId,
    truck_id: shift.truckId,
    defect_id: shutdownDefect.id,
    shutdown_started_at: shutdownDefect.created_at,
    clock_out_event_id: eventId,
    clock_out_at: input.effectiveAt,
    posttrip_waived: true,
    posttrip_waiver_reason: 'asset_shutdown',
    pay_time_category: 'shutdown_breakdown',
    release_note: input.releaseNote ?? null,
    created_by: driverId,
  })
  if (closeoutError) throw closeoutError

  await fleetServiceClient.from('fleet_dt_shifts').update({
    clock_out_at: input.effectiveAt,
    state: 'clocked_out',
  }).eq('id', input.shiftId)

  audit.log({
    userId: driverId,
    email,
    action: 'dump_truck.shift.shutdown_clock_out',
    resource: 'fleet_dt_shifts',
    resourceId: input.shiftId,
    metadata: {
      truckId: shift.truckId,
      defectId: shutdownDefect.id,
      posttripWaived: true,
      payTimeCategory: 'shutdown_breakdown',
    },
  })

  return {
    shiftId: input.shiftId,
    eventId,
    defectId: shutdownDefect.id,
    clockOutAt: input.effectiveAt,
    posttripWaived: true,
    payTimeCategory: 'shutdown_breakdown' as const,
  }
}
