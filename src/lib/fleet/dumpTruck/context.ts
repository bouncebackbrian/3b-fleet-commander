/**
 * fleet/dumpTruck/context.ts — Driver Mode bootstrap query
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { getOpenShift } from './shifts'
import { listSites } from './sites'
import { listJobsForDriver } from './jobs'
import { getDriverBusinessMeta } from './shared'
import { evaluateMissedPunchSafeguard, getPendingNextShiftReview, type ShiftReconciliation } from './missedPunch'
import type { DumpTruckEvent, DumpTruckEventType, LocationPermissionStatus } from '@/lib/dumpTruck/types'

export interface DriverContext {
  shift: Awaited<ReturnType<typeof getOpenShift>>
  driverName: string
  businessName: string
  preferredLanguage: 'en' | 'es'
  truckUnitNumber: string | null
  truckHoldStatus: 'none' | 'on_hold'
  truckHoldReason: string | null
  events: (Pick<DumpTruckEvent, 'id' | 'eventType' | 'effectiveAt' | 'notes'> & { lat: number | null; lng: number | null })[]
  sites: Awaited<ReturnType<typeof listSites>>
  jobs: Awaited<ReturnType<typeof listJobsForDriver>>
  openDefects: { id: string; description: string; severity: string }[]
  loadCycles: { id: string; sequence: number; jobId: string; dumpDepartEventId: string | null }[]
  breakdowns: { id: string; startedAt: string; endedAt: string | null; notes: string | null; lat: number | null; lng: number | null }[]
  missedPunchPrompt: ShiftReconciliation | null
  pendingReconciliation: ShiftReconciliation | null
}

export async function getDriverContext(businessId: string, driverId: string): Promise<DriverContext> {
  let shift = await getOpenShift(driverId)
  const [sites, jobs, meta] = await Promise.all([
    listSites(businessId, { includeGateInfo: false }),
    listJobsForDriver(businessId, driverId),
    getDriverBusinessMeta(businessId, driverId),
  ])

  let missedPunchPrompt: ShiftReconciliation | null = null
  if (shift) {
    missedPunchPrompt = await evaluateMissedPunchSafeguard(businessId, driverId, shift)
    // Safeguard evaluation may have auto-closed the shift.
    if (missedPunchPrompt?.status === 'auto_closed') shift = await getOpenShift(driverId)
  }
  const pendingReconciliation = await getPendingNextShiftReview(businessId, driverId)

  let events: DriverContext['events'] = []
  let loadCycles: DriverContext['loadCycles'] = []
  let openDefects: DriverContext['openDefects'] = []
  let breakdowns: DriverContext['breakdowns'] = []
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
    const [eventsRes, loadCyclesRes, breakdownsRes] = await Promise.all([
      fleetServiceClient.from('fleet_dt_events').select('id, event_type, effective_at, notes, lat, lng').eq('shift_id', shift.id).order('effective_at', { ascending: true }),
      fleetServiceClient.from('fleet_dt_load_cycles').select('id, sequence, job_id, dump_depart_event_id').eq('shift_id', shift.id).order('sequence', { ascending: true }),
      fleetServiceClient.from('fleet_dt_breakdowns').select('id, started_at, ended_at, notes, lat, lng').eq('shift_id', shift.id).order('started_at', { ascending: true }),
    ])

    events = (eventsRes.data ?? []).map(r => ({
      id: r.id, eventType: r.event_type as DumpTruckEventType, effectiveAt: r.effective_at, notes: r.notes,
      lat: r.lat, lng: r.lng,
    }))
    loadCycles = (loadCyclesRes.data ?? []).map(r => ({
      id: r.id, sequence: r.sequence, jobId: r.job_id, dumpDepartEventId: r.dump_depart_event_id,
    }))
    breakdowns = (breakdownsRes.data ?? []).map(r => ({
      id: r.id, startedAt: r.started_at, endedAt: r.ended_at, notes: r.notes, lat: r.lat, lng: r.lng,
    }))

    if (shift.truckId) {
      const { data: defects } = await fleetServiceClient
        .from('fleet_dt_defects').select('id, description, severity').eq('truck_id', shift.truckId).in('status', ['open', 'acknowledged'])
      openDefects = defects ?? []
    }
  }

  return {
    shift, events, sites, jobs, openDefects, loadCycles, breakdowns, truckUnitNumber, truckHoldStatus, truckHoldReason,
    driverName: meta.driverName, businessName: meta.businessName, preferredLanguage: meta.preferredLanguage,
    missedPunchPrompt: missedPunchPrompt?.status === 'pending' ? missedPunchPrompt : null,
    pendingReconciliation,
  }
}

export type { LocationPermissionStatus }
