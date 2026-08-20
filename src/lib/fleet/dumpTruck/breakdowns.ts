/**
 * fleet/dumpTruck/breakdowns.ts — the "Truck Problem" operational workflow
 *
 * fleet_dt_breakdowns is purely operational (what happened, when, whether
 * the truck could move) — it never carries a pay/bill decision itself. See
 * adjustments.ts for how a breakdown's payable/billable classification is
 * derived (an explicit fleet_dt_time_adjustments row once management
 * decides, or the spec's stated default — payable PENDING, billable NO —
 * synthesized at read time when no decision has been made yet).
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { getThreebId } from './shared'
import { DumpTruckError } from './shared'

export type BreakdownCategory =
  | 'tire' | 'engine' | 'transmission' | 'air_system' | 'brake' | 'overheating' | 'electrical'
  | 'fuel' | 'hydraulic' | 'suspension' | 'accident' | 'stuck' | 'other'

export type BreakdownResolution = 'resumed' | 'returned_to_yard' | 'towed' | 'ended_day'

export interface Breakdown {
  id: string
  businessId: string
  driverId: string
  driverThreebId: string | null
  shiftId: string | null
  truckId: string
  jobId: string | null
  category: BreakdownCategory | null
  canMove: boolean | null
  safeLocation: boolean | null
  notes: string | null
  lat: number | null
  lng: number | null
  loadsCompletedBefore: number | null
  startedAt: string
  endedAt: string | null
  resolution: BreakdownResolution | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): Breakdown {
  return {
    id: r.id, businessId: r.business_id, driverId: r.driver_id, driverThreebId: r.driver_threeb_id,
    shiftId: r.shift_id, truckId: r.truck_id, jobId: r.job_id, category: r.category,
    canMove: r.can_move, safeLocation: r.safe_location, notes: r.notes,
    lat: r.lat != null ? Number(r.lat) : null, lng: r.lng != null ? Number(r.lng) : null,
    loadsCompletedBefore: r.loads_completed_before, startedAt: r.started_at, endedAt: r.ended_at, resolution: r.resolution,
  }
}

export interface ReportBreakdownInput {
  shiftId: string | null
  truckId: string
  jobId: string | null
  category: BreakdownCategory | null
  canMove: boolean | null
  safeLocation: boolean | null
  notes: string | null
  lat: number | null
  lng: number | null
}

/** Driver taps "Truck Problem" — starts downtime now, preserves whatever production (load_count) already happened this shift. */
export async function reportBreakdown(
  businessId: string, driverId: string, input: ReportBreakdownInput, email: string | null,
): Promise<Breakdown> {
  const driverThreebId = await getThreebId(driverId)

  let loadsCompletedBefore: number | null = null
  if (input.shiftId) {
    const { data: shift } = await fleetServiceClient.from('fleet_dt_shifts').select('load_count').eq('id', input.shiftId).maybeSingle()
    loadsCompletedBefore = shift?.load_count ?? null
  }

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_breakdowns')
    .insert({
      business_id: businessId, driver_id: driverId, driver_threeb_id: driverThreebId,
      shift_id: input.shiftId, truck_id: input.truckId, job_id: input.jobId,
      category: input.category, can_move: input.canMove, safe_location: input.safeLocation,
      notes: input.notes, lat: input.lat, lng: input.lng, loads_completed_before: loadsCompletedBefore,
      created_by: driverId,
    })
    .select('*')
    .single()
  if (error) throw error
  const breakdown = fromRow(data)
  audit.log({ userId: driverId, email, action: 'dump_truck.breakdown.report', resource: 'fleet_dt_breakdowns', resourceId: breakdown.id, after: breakdown })
  return breakdown
}

/** Driver resolves the breakdown — RESUME WORK / RETURN TO YARD / TOWED / END DAY. Records actual downtime; never classifies pay/bill (see adjustments.ts). */
export async function resolveBreakdown(
  businessId: string, breakdownId: string, resolution: BreakdownResolution, userId: string, email: string | null,
): Promise<Breakdown> {
  const { data: existing } = await fleetServiceClient.from('fleet_dt_breakdowns').select('id, business_id, ended_at').eq('id', breakdownId).maybeSingle()
  if (!existing || existing.business_id !== businessId) throw new DumpTruckError('Breakdown not found', 404)
  if (existing.ended_at) throw new DumpTruckError('Breakdown already resolved', 409)

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_breakdowns')
    .update({ ended_at: new Date().toISOString(), resolution })
    .eq('id', breakdownId)
    .select('*')
    .single()
  if (error) throw error
  const breakdown = fromRow(data)
  audit.log({ userId, email, action: 'dump_truck.breakdown.resolve', resource: 'fleet_dt_breakdowns', resourceId: breakdown.id, after: { resolution } })
  return breakdown
}

export async function getBreakdown(businessId: string, breakdownId: string): Promise<Breakdown | null> {
  const { data } = await fleetServiceClient.from('fleet_dt_breakdowns').select('*').eq('id', breakdownId).eq('business_id', businessId).maybeSingle()
  return data ? fromRow(data) : null
}

/** The current (unresolved, if any) breakdown for a shift — drives the driver UI's "truck is down" state. */
export async function getOpenBreakdownForShift(businessId: string, shiftId: string): Promise<Breakdown | null> {
  const { data } = await fleetServiceClient
    .from('fleet_dt_breakdowns').select('*')
    .eq('business_id', businessId).eq('shift_id', shiftId).is('ended_at', null)
    .order('started_at', { ascending: false }).limit(1).maybeSingle()
  return data ? fromRow(data) : null
}

export async function listBreakdownsForShift(businessId: string, shiftId: string): Promise<Breakdown[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_breakdowns').select('*').eq('business_id', businessId).eq('shift_id', shiftId).order('started_at')
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export interface BreakdownAnalyticsFilters {
  truckId?: string
  driverId?: string
  startDate?: string
  endDate?: string
}

/** Truck downtime analytics (spec §Truck Downtime Analytics) — counts/hours per truck over a range. */
export async function listBreakdownsForBusiness(businessId: string, filters: BreakdownAnalyticsFilters = {}): Promise<Breakdown[]> {
  let q = fleetServiceClient.from('fleet_dt_breakdowns').select('*').eq('business_id', businessId)
  if (filters.truckId) q = q.eq('truck_id', filters.truckId)
  if (filters.driverId) q = q.eq('driver_id', filters.driverId)
  if (filters.startDate) q = q.gte('started_at', filters.startDate)
  if (filters.endDate) q = q.lte('started_at', filters.endDate)
  const { data, error } = await q.order('started_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}
