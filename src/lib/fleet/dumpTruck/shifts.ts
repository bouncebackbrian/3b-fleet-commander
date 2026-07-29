/**
 * fleet/dumpTruck/shifts.ts — shift lifecycle service functions
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { getThreebId, syncShiftState, DumpTruckError } from './shared'
import { recordEvent, type RecordEventInput } from './events'
import type { DumpTruckShift } from '@/lib/dumpTruck/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): DumpTruckShift {
  return {
    id: r.id,
    businessId: r.business_id,
    driverId: r.driver_id,
    truckId: r.truck_id,
    trailerId: r.trailer_id,
    state: r.state,
    clockInAt: r.clock_in_at,
    clockOutAt: r.clock_out_at,
    startYardSiteId: r.start_yard_site_id,
    endSiteId: r.end_site_id,
    deviceId: r.device_id,
    loadCount: r.load_count ?? 0,
  }
}

/** The driver's current non-terminal shift, if any (spec: one open shift per driver). */
export async function getOpenShift(driverId: string): Promise<DumpTruckShift | null> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_shifts')
    .select('*')
    .eq('driver_id', driverId)
    .not('state', 'in', '(submitted,payroll_approved,billing_approved,locked,void)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

export interface ClockInInput {
  truckId: string
  trailerId?: string | null
  startYardSiteId?: string | null
  deviceId: string
  deviceTimezone?: string | null
  /** Manual driver-entered yard-to-first-stop travel time (minutes) — added
   *  to total hours; see docs/DUMP_TRUCK_MODE.md manual yard-travel entry. */
  manualStartTravelMinutes?: number | null
  clockInEvent: Omit<RecordEventInput, 'shiftId' | 'eventType'>
}

/**
 * Clock in: creates the shift row, then immediately records the clock_in event
 * against it. Not a single DB transaction (supabase-js service client does
 * multi-statement writes sequentially) — if the event insert fails after the
 * shift is created, the shift is left in 'draft' and the client should retry
 * recordEvent with the same shift id (idempotency key makes the retry safe).
 */
export async function clockIn(
  businessId: string,
  driverId: string,
  email: string | null,
  input: ClockInInput,
): Promise<{ shift: DumpTruckShift; eventId: string }> {
  const existing = await getOpenShift(driverId)
  if (existing) {
    throw new DumpTruckError('Driver already has an open shift', 409)
  }

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_shifts')
    .insert({
      business_id: businessId,
      driver_id: driverId,
      truck_id: input.truckId,
      trailer_id: input.trailerId ?? null,
      start_yard_site_id: input.startYardSiteId ?? null,
      device_id: input.deviceId,
      device_timezone: input.deviceTimezone ?? null,
      manual_start_travel_minutes: input.manualStartTravelMinutes ?? null,
      state: 'draft',
    })
    .select('*')
    .single()
  if (error) throw error
  const shift = fromRow(data)

  const event = await recordEvent(businessId, driverId, email, {
    ...input.clockInEvent,
    shiftId: shift.id,
    eventType: 'clock_in',
  })

  audit.log({ userId: driverId, email, action: 'dump_truck.shift.clock_in', resource: 'fleet_dt_shifts', resourceId: shift.id, after: shift })

  const refreshed = await getShiftById(shift.id)
  return { shift: refreshed ?? shift, eventId: event.id }
}

export async function getShiftById(id: string): Promise<DumpTruckShift | null> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_shifts')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

/** Submit the day — fires shift_submitted and locks further driver edits. */
export async function submitShift(
  shiftId: string,
  businessId: string,
  driverId: string,
  email: string | null,
  eventInput: Omit<RecordEventInput, 'shiftId' | 'eventType'>,
  /** Manual driver-entered last-stop-to-yard travel time (minutes) — added
   *  to total hours; see docs/DUMP_TRUCK_MODE.md manual yard-travel entry. */
  manualEndTravelMinutes?: number | null,
): Promise<DumpTruckShift> {
  const shift = await getShiftById(shiftId)
  if (!shift || shift.driverId !== driverId) throw new DumpTruckError('Shift not found', 404)
  if (shift.state !== 'clocked_out') {
    throw new DumpTruckError(`Cannot submit a shift in state "${shift.state}" — clock out first`, 409)
  }

  await recordEvent(businessId, driverId, email, { ...eventInput, shiftId, eventType: 'shift_submitted' })

  const { error } = await fleetServiceClient
    .from('fleet_dt_shifts')
    .update({
      submitted_at: new Date().toISOString(),
      submitted_by: driverId,
      manual_end_travel_minutes: manualEndTravelMinutes ?? null,
    })
    .eq('id', shiftId)
  if (error) throw error
  await syncShiftState(shiftId)

  const updated = await getShiftById(shiftId)
  audit.log({ userId: driverId, email, action: 'dump_truck.shift.submit', resource: 'fleet_dt_shifts', resourceId: shiftId, after: updated })
  return updated!
}

export { getThreebId }
