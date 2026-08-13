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
import { getDriverBusinessMeta } from './shared'
import type { DumpTruckEvent, DumpTruckEventType, LocationPermissionStatus } from '@/lib/dumpTruck/types'

export interface DriverContext {
  shift: Awaited<ReturnType<typeof getOpenShift>>
  driverName: string
  businessName: string
  /** Spec §6 EN/ES foundation — storage + toggle only, no translation pipeline yet. */
  preferredLanguage: 'en' | 'es'
  /** Human-readable unit number (e.g. "06") for shift.truckId — resolved
   *  server-side so the driver cockpit never has to display the raw
   *  fleet_equipment UUID (it did before this field existed). */
  truckUnitNumber: string | null
  /** Dispatch-authorized hold (spec §5.1) — 'on_hold' hard-blocks truck_picked_up/
   *  depart_yard both here (client, before the event is even enqueued — this app's
   *  offline event queue is optimistic/fire-and-forget, so a server-only check
   *  would fail silently in the background) and again server-side in events.ts. */
  truckHoldStatus: 'none' | 'on_hold'
  truckHoldReason: string | null
  events: (Pick<DumpTruckEvent, 'id' | 'eventType' | 'effectiveAt' | 'notes'> & { lat: number | null; lng: number | null })[]
  sites: Awaited<ReturnType<typeof listSites>>
  jobs: Awaited<ReturnType<typeof listJobsForDriver>>
  openDefects: { id: string; description: string; severity: string }[]
  loadCycles: { id: string; sequence: number; jobId: string; dumpDepartEventId: string | null }[]
}

export async function getDriverContext(businessId: string, driverId: string): Promise<DriverContext> {
  const shift = await getOpenShift(driverId)
  const [sites, jobs, meta] = await Promise.all([
    listSites(businessId, { includeGateInfo: false }),
    listJobsForDriver(businessId, driverId),
    getDriverBusinessMeta(businessId, driverId),
  ])

  let events: DriverContext['events'] = []
  let loadCycles: DriverContext['loadCycles'] = []
  let openDefects: DriverContext['openDefects'] = []
  let truckUnitNumber: string | null = null
  let truckHoldStatus: DriverContext['truckHoldStatus'] = 'none'
  let truckHoldReason: string | null = null

  if (shift?.truckId) {
    const { data: equipment } = await fleetServiceClient
      .from('fleet_equipment')
      .select('unit_number, hold_status, hold_reason')
      .eq('id', shift.truckId)
      .maybeSingle()
    truckUnitNumber = equipment?.unit_number ?? null
    truckHoldStatus = equipment?.hold_status ?? 'none'
    truckHoldReason = equipment?.hold_reason ?? null
  }

  if (shift) {
    const [eventsRes, loadCyclesRes] = await Promise.all([
      fleetServiceClient
        .from('fleet_dt_events')
        .select('id, event_type, effective_at, notes, lat, lng')
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
      lat: r.lat, lng: r.lng,
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

  return {
    shift, events, sites, jobs, openDefects, loadCycles, truckUnitNumber, truckHoldStatus, truckHoldReason,
    driverName: meta.driverName, businessName: meta.businessName, preferredLanguage: meta.preferredLanguage,
  }
}

// Re-exported so route handlers only import from this module for the bootstrap call.
export type { LocationPermissionStatus }
