import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { getThreebId, DumpTruckError } from './shared'
import { getShiftById } from './shifts'
import type { RecordEventGeoInput } from './events'

export interface AssetTransferCloseoutInput {
  shiftId: string
  effectiveAt: string
  deviceCapturedAt: string
  timezone?: string | null
  utcOffsetMinutes?: number | null
  geo: RecordEventGeoInput
  odometer: number
  transferReason: string
  transferCondition?: string | null
  transferConditionNote?: string | null
  receivingUserId?: string | null
  receivingName?: string | null
}

export async function closeShiftForAssetTransfer(
  businessId: string,
  driverId: string,
  email: string | null,
  input: AssetTransferCloseoutInput,
) {
  const shift = await getShiftById(input.shiftId)
  if (!shift || shift.businessId !== businessId || shift.driverId !== driverId) {
    throw new DumpTruckError('Shift not found', 404)
  }
  if (!shift.truckId) throw new DumpTruckError('Shift has no assigned truck', 400)
  if (shift.clockOutAt) throw new DumpTruckError('Shift is already clocked out', 409)
  if (!input.transferReason.trim()) throw new DumpTruckError('Transfer reason is required', 400)
  if (!Number.isFinite(input.odometer) || input.odometer < 0) throw new DumpTruckError('Valid transfer odometer is required', 400)
  if (!input.transferCondition || !['pass', 'monitor', 'fail'].includes(input.transferCondition)) {
    throw new DumpTruckError('Transfer condition must be Pass, Monitor or Fail', 400)
  }

  let receivingThreeBId: string | null = null
  if (input.receivingUserId) {
    const { data: member } = await fleetServiceClient
      .from('fleet_business_members')
      .select('user_id')
      .eq('business_id', businessId)
      .eq('user_id', input.receivingUserId)
      .eq('active', true)
      .maybeSingle()
    if (!member) throw new DumpTruckError('Receiving user is not an active member of this business', 400)
    receivingThreeBId = await getThreebId(input.receivingUserId)
  }

  const eventId = crypto.randomUUID()
  const outgoingThreeBId = await getThreebId(driverId)
  const transferConditionText = input.transferConditionNote?.trim()
    ? `${input.transferCondition}: ${input.transferConditionNote.trim()}`
    : input.transferCondition

  const { error: eventError } = await fleetServiceClient.from('fleet_dt_events').insert({
    id: eventId,
    idempotency_key: eventId,
    business_id: businessId,
    threeb_id: outgoingThreeBId,
    driver_id: driverId,
    shift_id: input.shiftId,
    vehicle_id: shift.truckId,
    trailer_id: shift.trailerId,
    event_type: 'asset_transfer_clock_out',
    device_captured_at: input.deviceCapturedAt,
    effective_at: input.effectiveAt,
    timezone: input.timezone ?? null,
    utc_offset_minutes: input.utcOffsetMinutes ?? null,
    lat: input.geo.lat,
    lng: input.geo.lng,
    location_accuracy_m: input.geo.accuracyM,
    gps_captured_at: input.geo.capturedAt,
    location_permission: input.geo.permission,
    odometer: input.odometer,
    notes: input.transferReason,
    device_metadata: {
      closeoutReason: 'asset_transfer',
      normalPosttripWaived: true,
      posttripLiteCompleted: true,
      receivingUserId: input.receivingUserId ?? null,
      receivingThreeBId,
      receivingName: input.receivingName ?? null,
      transferCondition: input.transferCondition,
      transferConditionNote: input.transferConditionNote ?? null,
    },
    sync_state: 'synced',
    created_by: driverId,
  })
  if (eventError) throw eventError

  const { data: openCustody } = await fleetServiceClient
    .from('fleet_dt_vehicle_custody')
    .select('id')
    .eq('shift_id', input.shiftId)
    .is('ended_at', null)
    .maybeSingle()

  if (openCustody) {
    const { error } = await fleetServiceClient.from('fleet_dt_vehicle_custody').update({
      end_event_id: eventId,
      end_odometer: input.odometer,
      end_condition: transferConditionText,
      ended_at: input.effectiveAt,
    }).eq('id', openCustody.id)
    if (error) throw error
  }

  const { error: transferError } = await fleetServiceClient.from('fleet_dt_asset_transfer_closeouts').insert({
    business_id: businessId,
    shift_id: input.shiftId,
    outgoing_driver_id: driverId,
    truck_id: shift.truckId,
    trailer_id: shift.trailerId,
    receiving_user_id: input.receivingUserId ?? null,
    receiving_three_b_id: receivingThreeBId,
    receiving_name: input.receivingName ?? null,
    transfer_reason: input.transferReason.trim(),
    transfer_condition: transferConditionText,
    transfer_odometer: input.odometer,
    transfer_at: input.effectiveAt,
    transfer_lat: input.geo.lat,
    transfer_lng: input.geo.lng,
    transfer_accuracy_m: input.geo.accuracyM,
    custody_end_event_id: eventId,
    clock_out_event_id: eventId,
    clock_out_at: input.effectiveAt,
    posttrip_waived: true,
    posttrip_waiver_reason: 'asset_transfer_posttrip_lite_completed',
    created_by: driverId,
  })
  if (transferError) throw transferError

  await fleetServiceClient.from('fleet_dt_shifts').update({
    clock_out_at: input.effectiveAt,
    state: 'clocked_out',
  }).eq('id', input.shiftId)

  // Keep the consolidated shift report synchronized with the exception closeout.
  await fleetServiceClient.from('fleet_dt_shift_reports').update({
    clock_out_at: input.effectiveAt,
    end_odometer: input.odometer,
    end_lat: input.geo.lat,
    end_lng: input.geo.lng,
    posttrip_waived: true,
    posttrip_waiver_reason: 'asset_transfer_posttrip_lite_completed',
    report_status: 'end_submitted',
    end_summary: {
      closeoutType: 'asset_transfer',
      posttripLiteCompleted: true,
      transferReason: input.transferReason.trim(),
      transferCondition: input.transferCondition,
      transferConditionNote: input.transferConditionNote ?? null,
      receivingUserId: input.receivingUserId ?? null,
      receivingThreeBId,
      receivingName: input.receivingName ?? null,
      submittedAt: input.effectiveAt,
    },
  }).eq('business_id', businessId).eq('shift_id', input.shiftId)

  audit.log({
    userId: driverId,
    email,
    action: 'dump_truck.shift.asset_transfer_clock_out',
    resource: 'fleet_dt_shifts',
    resourceId: input.shiftId,
    metadata: {
      truckId: shift.truckId,
      receivingUserId: input.receivingUserId ?? null,
      receivingThreeBId,
      transferOdometer: input.odometer,
      transferCondition: input.transferCondition,
      normalPosttripWaived: true,
      posttripLiteCompleted: true,
    },
  })

  return {
    shiftId: input.shiftId,
    eventId,
    clockOutAt: input.effectiveAt,
    normalPosttripWaived: true,
    posttripLiteCompleted: true,
    transferOdometer: input.odometer,
    receivingThreeBId,
  }
}
