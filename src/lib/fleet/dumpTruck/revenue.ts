/**
 * fleet/dumpTruck/revenue.ts — revenue computation from existing job pricing
 *
 * No new rate-card table: fleet_dt_jobs already carries price_per_ton and
 * price_per_hour (set per job, not effective-dated — a real limitation vs.
 * spec §9.2's effective-dated rate cards, noted rather than silently
 * papered over). A job with price_per_ton set is billed per ton hauled
 * (sum of load_cycles.weight_tons for that job); a job with price_per_hour
 * and no price_per_ton is billed per hour worked on shifts assigned to
 * that job. A job with neither contributes $0 tracked revenue — not
 * "unknown", genuinely $0 tracked, because there is nothing to compute
 * from until someone fills in a price on the job.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import type { MonthRange } from '@/lib/dumpTruck/sqcdp'

export interface JobRevenueRow {
  jobId: string
  jobNumber: string
  truckId: string | null
  tons: number
  hours: number
  revenue: number
  priced: boolean // false when the job has neither price_per_ton nor price_per_hour set
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function computeRevenueForRange(businessId: string, range: MonthRange): Promise<JobRevenueRow[]> {
  const { data: loadCycles } = await fleetServiceClient
    .from('fleet_dt_load_cycles')
    .select('job_id, weight_tons, quantity, quantity_unit')
    .eq('business_id', businessId)
    .gte('created_at', `${range.start}T00:00:00Z`).lte('created_at', `${range.end}T23:59:59.999Z`)
    .not('dump_depart_event_id', 'is', null) // only completed loads count as delivered/billable

  const { data: shifts } = await fleetServiceClient
    .from('fleet_dt_shifts')
    .select('id, truck_id, clock_in_at, clock_out_at')
    .eq('business_id', businessId)
    .gte('clock_in_at', `${range.start}T00:00:00Z`).lte('clock_in_at', `${range.end}T23:59:59.999Z`)

  const jobIds = new Set<string>()
  for (const lc of loadCycles ?? []) if (lc.job_id) jobIds.add(lc.job_id)

  if (jobIds.size === 0) return []

  const { data: jobs } = await fleetServiceClient
    .from('fleet_dt_jobs')
    .select('id, job_number, truck_id, price_per_ton, price_per_hour')
    .in('id', [...jobIds])

  const tonsByJob = new Map<string, number>()
  for (const lc of loadCycles ?? []) {
    if (!lc.job_id) continue
    const tons = lc.weight_tons != null ? Number(lc.weight_tons) : (lc.quantity_unit === 'tons' ? Number(lc.quantity ?? 0) : 0)
    tonsByJob.set(lc.job_id, (tonsByJob.get(lc.job_id) ?? 0) + tons)
  }

  // Hours per truck this range — used only for jobs billed per-hour (approximated
  // at the truck's total clocked hours in range, since a shift isn't exclusively
  // tied to one job in this data model). Flagged in the KPI display, not hidden.
  const hoursByTruck = new Map<string, number>()
  for (const s of shifts ?? []) {
    if (!s.truck_id || !s.clock_in_at) continue
    const hours = (new Date(s.clock_out_at ?? new Date().toISOString()).getTime() - new Date(s.clock_in_at).getTime()) / 3600000
    hoursByTruck.set(s.truck_id, (hoursByTruck.get(s.truck_id) ?? 0) + Math.max(0, hours))
  }

  return (jobs ?? []).map(job => {
    const tons = tonsByJob.get(job.id) ?? 0
    const hours = job.truck_id ? (hoursByTruck.get(job.truck_id) ?? 0) : 0
    const priced = job.price_per_ton != null || job.price_per_hour != null
    let revenue = 0
    if (job.price_per_ton != null) revenue = tons * Number(job.price_per_ton)
    else if (job.price_per_hour != null) revenue = hours * Number(job.price_per_hour)
    return {
      jobId: job.id, jobNumber: job.job_number, truckId: job.truck_id,
      tons: round2(tons), hours: round2(hours), revenue: round2(revenue), priced,
    }
  })
}
