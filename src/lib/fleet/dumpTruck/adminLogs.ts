/**
 * fleet/dumpTruck/adminLogs.ts — dispatch/admin full activity log across drivers
 *
 * Driver-requested follow-up: dispatch should be able to see every driver's
 * event log (clock-in, arrivals, loads, delays, location pings, etc), not
 * just their own hours summary. Read-only, business-scoped, most-recent-first.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import type { DumpTruckEventType } from '@/lib/dumpTruck/types'

export interface BusinessLogEntry {
  id: string
  shiftId: string
  driverId: string
  driverName: string
  truckUnit: string | null
  eventType: DumpTruckEventType
  effectiveAt: string
  notes: string | null
  lat: number | null
  lng: number | null
}

export interface ListBusinessEventLogOpts {
  driverId?: string | null
  from?: string | null // YYYY-MM-DD
  to?: string | null   // YYYY-MM-DD
  limit?: number
}

const DEFAULT_LIMIT = 300
const MAX_LIMIT = 1000

export async function listBusinessEventLog(
  businessId: string, opts: ListBusinessEventLogOpts = {},
): Promise<BusinessLogEntry[]> {
  const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT)

  let shiftQuery = fleetServiceClient
    .from('fleet_dt_shifts')
    .select('id, driver_id, truck_id')
    .eq('business_id', businessId)
  if (opts.driverId) shiftQuery = shiftQuery.eq('driver_id', opts.driverId)
  const { data: shifts, error: shiftsError } = await shiftQuery
  if (shiftsError) throw shiftsError
  if (!shifts || shifts.length === 0) return []

  const shiftIds = shifts.map(s => s.id)
  const shiftById = new Map(shifts.map(s => [s.id, s]))

  let eventsQuery = fleetServiceClient
    .from('fleet_dt_events')
    .select('id, shift_id, event_type, effective_at, notes, lat, lng')
    .in('shift_id', shiftIds)
    .order('effective_at', { ascending: false })
    .limit(limit)
  if (opts.from) eventsQuery = eventsQuery.gte('effective_at', `${opts.from}T00:00:00Z`)
  if (opts.to) eventsQuery = eventsQuery.lte('effective_at', `${opts.to}T23:59:59.999Z`)
  const { data: events, error: eventsError } = await eventsQuery
  if (eventsError) throw eventsError

  const driverIds = [...new Set(shifts.map(s => s.driver_id).filter(Boolean))] as string[]
  const { data: profiles } = driverIds.length
    ? await fleetServiceClient.from('profiles').select('id, full_name').in('id', driverIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const nameByDriverId = new Map((profiles ?? []).map(p => [p.id, p.full_name || 'Unnamed driver']))

  const truckIds = [...new Set(shifts.map(s => s.truck_id).filter(Boolean))] as string[]
  const { data: equipment } = truckIds.length
    ? await fleetServiceClient.from('fleet_equipment').select('id, unit_number').in('id', truckIds)
    : { data: [] as { id: string; unit_number: string }[] }
  const unitByTruckId = new Map((equipment ?? []).map(e => [e.id, e.unit_number]))

  return (events ?? []).map(e => {
    const shift = shiftById.get(e.shift_id)
    const driverId = shift?.driver_id ?? ''
    return {
      id: e.id,
      shiftId: e.shift_id,
      driverId,
      driverName: driverId ? (nameByDriverId.get(driverId) ?? 'Unnamed driver') : 'Unknown driver',
      truckUnit: shift?.truck_id ? (unitByTruckId.get(shift.truck_id) ?? null) : null,
      eventType: e.event_type as DumpTruckEventType,
      effectiveAt: e.effective_at,
      notes: e.notes,
      lat: e.lat,
      lng: e.lng,
    }
  })
}
