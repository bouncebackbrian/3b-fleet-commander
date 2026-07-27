/**
 * fleet/dumpTruck/context.ts — Driver Mode bootstrap query
 *
 * One aggregate read the /driver/dump-truck screen calls on load (and after
 * reconnecting) to hydrate: current open shift + its events/timeline, sites,
 * assigned jobs, open defects for the truck, and today's inspection status.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { getOpenShift } from './shifts'
import { listSites } from './sites'
import { listJobsForDriver } from './jobs'
import type { DumpTruckEvent, DumpTruckEventType, LocationPermissionStatus } from '@/lib/dumpTruck/types'

export interface DriverContext {
  shift: Awaited<ReturnType<typeof getOpenShift>>
  events: Pick<DumpTruckEvent, 'id' | 'eventType' | 'effectiveAt' | 'notes'>[]
  sites: Awaited<ReturnType<typeof listSites>>
  jobs: Awaited<ReturnType<typeof listJobsForDriver>>
  openDefects: { id: string; description: string; severity: string }[]
  loadCycles: { id: string; sequence: number; jobId: string; dumpDepartEventId: string | null }[]
}

export async function getDriverContext(businessId: string, driverId: string): Promise<DriverContext> {
  const shift = await getOpenShift(driverId)
  const [sites, jobs] = await Promise.all([
    listSites(businessId, { includeGateInfo: false }),
    listJobsForDriver(businessId, driverId),
  ])

  let events: DriverContext['events'] = []
  let loadCycles: DriverContext['loadCycles'] = []
  let openDefects: DriverContext['openDefects'] = []

  if (shift) {
    const [eventsRes, loadCyclesRes] = await Promise.all([
      fleetServiceClient
        .from('fleet_dt_events')
        .select('id, event_type, effective_at, notes')
        .eq('shift_id', shift.id)
        .order('effective_at', { ascending: true }),
      fleetServiceClient
        .from('fleet_dt_load_cycles')
        .select('id, sequence, job_id, dump_depart_event_id')
        .eq('shift_id', shift.id)
        .order('sequence', { ascending: true }),
    ])

    events = (eventsRes.data ?? []).map(r => ({
      id: r.id, eventType: r.event_type as DumpTruckEventType, effectiveAt: r.effective_at, notes: r.notes,
    }))
    loadCycles = (loadCyclesRes.data ?? []).map(r => ({
      id: r.id, sequence: r.sequence, jobId: r.job_id, dumpDepartEventId: r.dump_depart_event_id,
    }))

    if (shift.truckId) {
      const { data: defects } = await fleetServiceClient
        .from('fleet_dt_defects')
        .select('id, description, severity')
        .eq('truck_id', shift.truckId)
        .in('status', ['open', 'acknowledged'])
      openDefects = defects ?? []
    }
  }

  return { shift, events, sites, jobs, openDefects, loadCycles }
}

// Re-exported so route handlers only import from this module for the bootstrap call.
export type { LocationPermissionStatus }
