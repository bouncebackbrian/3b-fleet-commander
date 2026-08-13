/**
 * fleet/dumpTruck/hours.ts — driver hours portal data assembly (spec §10)
 *
 * Fetches everything one date range needs (shifts, events, drive segments,
 * custody, load cycles, jobs, equipment) and folds it through the pure
 * builders in src/lib/dumpTruck/hours.ts.
 *
 * Date-range filtering uses UTC day boundaries (clock_in_at's calendar date
 * in UTC) — there is no per-business timezone setting elsewhere in this repo
 * to localize against. Documented simplification, not a bug.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import {
  buildDailyHoursRow, buildRangeSummary, applyRevenueShareFloor, type DailyHoursRow, type RangeSummary,
  type DateRange, type PayPolicy,
} from '@/lib/dumpTruck/hours'
import type { DriveSegmentCategory, DumpTruckEventType } from '@/lib/dumpTruck/types'
import { getPayPolicyForDriver } from './payPolicy'
import { computeRevenueForRange } from './revenue'

function utcDateString(iso: string): string {
  return iso.slice(0, 10)
}

const EMPTY_CATEGORY_SECONDS: Record<DriveSegmentCategory, number> = {
  empty: 0, loaded: 0, yard_transfer: 0, fuel: 0, maintenance: 0, other: 0,
}

export interface RevenueShareApplied {
  usedRevenueShare: boolean
  revenueShareAmount: number
  truckRevenue: number
}

export async function buildDriverHoursForRange(
  businessId: string, driverId: string, range: DateRange,
): Promise<{
  rows: DailyHoursRow[]; summary: RangeSummary; payPolicy: PayPolicy; isDefaultPayPolicy: boolean
  revenueShareApplied: RevenueShareApplied | null
}> {
  const payPolicy = await getPayPolicyForDriver(businessId, driverId)

  const { data: shifts, error: shiftsError } = await fleetServiceClient
    .from('fleet_dt_shifts')
    .select('id, state, clock_in_at, clock_out_at, truck_id, trailer_id, manual_start_travel_minutes, manual_end_travel_minutes')
    .eq('business_id', businessId)
    .eq('driver_id', driverId)
    .gte('clock_in_at', `${range.start}T00:00:00Z`)
    .lte('clock_in_at', `${range.end}T23:59:59.999Z`)
    .order('clock_in_at', { ascending: true })
  if (shiftsError) throw shiftsError
  if (!shifts || shifts.length === 0) {
    return { rows: [], summary: buildRangeSummary([]), payPolicy, isDefaultPayPolicy: payPolicy.isDefault, revenueShareApplied: null }
  }

  const shiftIds = shifts.map(s => s.id)
  const equipmentIds = [...new Set(shifts.flatMap(s => [s.truck_id, s.trailer_id]).filter(Boolean))] as string[]

  const [eventsRes, segmentsRes, custodyRes, loadCyclesRes, equipmentRes] = await Promise.all([
    fleetServiceClient.from('fleet_dt_events').select('shift_id, event_type, effective_at, notes').in('shift_id', shiftIds),
    fleetServiceClient.from('fleet_dt_drive_segments').select('shift_id, category, duration_seconds').in('shift_id', shiftIds),
    fleetServiceClient.from('fleet_dt_vehicle_custody').select('shift_id, started_at, ended_at, start_odometer, end_odometer').in('shift_id', shiftIds),
    fleetServiceClient.from('fleet_dt_load_cycles').select('shift_id, job_id, quantity, weight_tons, dump_depart_event_id').in('shift_id', shiftIds),
    equipmentIds.length
      ? fleetServiceClient.from('fleet_equipment').select('id, unit_number').in('id', equipmentIds)
      : Promise.resolve({ data: [] as { id: string; unit_number: string }[] }),
  ])

  const jobIds = [...new Set((loadCyclesRes.data ?? []).map(lc => lc.job_id).filter(Boolean))]
  const { data: jobs } = jobIds.length
    ? await fleetServiceClient.from('fleet_dt_jobs').select('id, job_number, customer_name, broker_name').in('id', jobIds)
    : { data: [] as { id: string; job_number: string; customer_name: string | null; broker_name: string | null }[] }

  const jobById = new Map((jobs ?? []).map(j => [j.id, j]))
  const equipmentById = new Map((equipmentRes.data ?? []).map(e => [e.id, e.unit_number]))

  const rows: DailyHoursRow[] = shifts.map(shift => {
    const events = (eventsRes.data ?? [])
      .filter(e => e.shift_id === shift.id)
      .map(e => ({ eventType: e.event_type as DumpTruckEventType, effectiveAt: e.effective_at, notes: e.notes as string | null }))

    const segments = (segmentsRes.data ?? []).filter(s => s.shift_id === shift.id)
    const driveSecondsByCategory = { ...EMPTY_CATEGORY_SECONDS }
    for (const s of segments) {
      const cat = s.category as DriveSegmentCategory
      driveSecondsByCategory[cat] = (driveSecondsByCategory[cat] ?? 0) + (s.duration_seconds ?? 0)
    }

    const custodyRows = (custodyRes.data ?? []).filter(c => c.shift_id === shift.id)
    const custodySeconds = custodyRows.reduce((sum, c) => {
      const end = c.ended_at ? new Date(c.ended_at).getTime() : Date.now()
      return sum + Math.max(0, (end - new Date(c.started_at).getTime()) / 1000)
    }, 0)
    const startOdometer = custodyRows.length ? custodyRows[0].start_odometer : null
    const endOdometer = custodyRows.length ? custodyRows[custodyRows.length - 1].end_odometer : null

    const loadCyclesForShift = (loadCyclesRes.data ?? []).filter(lc => lc.shift_id === shift.id)
    const completedLoadCycles = loadCyclesForShift.filter(lc => lc.dump_depart_event_id != null)
    const jobNumbers: string[] = []
    const customerNames: string[] = []
    const brokerNames: string[] = []
    for (const lc of loadCyclesForShift) {
      const job = jobById.get(lc.job_id)
      if (job) {
        jobNumbers.push(job.job_number)
        if (job.customer_name) customerNames.push(job.customer_name)
        if (job.broker_name) brokerNames.push(job.broker_name)
      }
    }
    const quantityHauled = completedLoadCycles.reduce((sum, lc) => sum + Number(lc.weight_tons ?? lc.quantity ?? 0), 0)

    return buildDailyHoursRow({
      workDate: shift.clock_in_at ? utcDateString(shift.clock_in_at) : range.start,
      shiftId: shift.id,
      shiftState: shift.state,
      clockInAt: shift.clock_in_at,
      clockOutAt: shift.clock_out_at,
      events,
      driveSecondsByCategory,
      custodySeconds,
      truckUnit: shift.truck_id ? (equipmentById.get(shift.truck_id) ?? null) : null,
      trailerUnit: shift.trailer_id ? (equipmentById.get(shift.trailer_id) ?? null) : null,
      jobNumbers,
      customerNames,
      brokerNames,
      loadsCompleted: completedLoadCycles.length,
      quantityHauled,
      startOdometer,
      endOdometer,
      hasOpenCorrectionRequest: events.some(e => e.eventType === 'correction_requested'),
      payPolicy,
      manualStartTravelMinutes: shift.manual_start_travel_minutes,
      manualEndTravelMinutes: shift.manual_end_travel_minutes,
    })
  })

  const summary = buildRangeSummary(rows)
  let revenueShareApplied: RevenueShareApplied | null = null

  if (payPolicy.payType === 'greater_of_hourly_or_revenue_share' && payPolicy.revenueSharePct) {
    const driverTruckIds = new Set(shifts.map(s => s.truck_id).filter(Boolean) as string[])
    if (driverTruckIds.size > 0) {
      const revenueRows = await computeRevenueForRange(businessId, range)
      const truckRevenue = revenueRows.filter(r => r.truckId && driverTruckIds.has(r.truckId)).reduce((sum, r) => sum + r.revenue, 0)
      const result = applyRevenueShareFloor(summary.estimatedGrossEarnings, truckRevenue, payPolicy.revenueSharePct)
      summary.estimatedGrossEarnings = result.finalPay
      revenueShareApplied = { usedRevenueShare: result.usedRevenueShare, revenueShareAmount: result.revenueShareAmount, truckRevenue }
    }
  }

  return { rows, summary, payPolicy, isDefaultPayPolicy: payPolicy.isDefault, revenueShareApplied }
}
