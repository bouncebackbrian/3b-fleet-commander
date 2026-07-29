'use client'
/**
 * useDumpTruckDriver — Driver Mode orchestration hook
 *
 * Owns: bootstrap context, the local flow-state derivation (server context +
 * still-unsynced queued events merged), the offline durable queue flush loop,
 * and the action dispatchers the /driver/dump-truck screen calls.
 *
 * Scope note: the offline queue durably covers in-shift operational events
 * (the primary sequence + delay/note/break/fuel-stop quick actions) — the
 * actions most likely to happen at a dump site with poor signal. Clock-in,
 * inspections, document uploads, and submit-day require connectivity in this
 * build (documented limitation — see docs/DUMP_TRUCK_MODE.md).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useOnlineStatus } from './useOnlineStatus'
import { toast } from './useToast'
import {
  computeFlowState, getPrimaryAction, canFireEvent, type FlowStateId,
} from '@/lib/dumpTruck/stateMachine'
import { buildEvent, captureGeolocation } from '@/lib/dumpTruck/events'
import { haversineMeters } from '@/lib/dumpTruck/geofence'
import {
  enqueueEvent, getRetryableNow, markSyncing, markSynced, markFailed,
  summarizeQueue, getOrCreateDeviceId, readQueue, type QueueSummary,
} from '@/lib/dumpTruck/offlineQueue'
import {
  enqueueFuelEntry, getRetryableFuelEntriesNow, markFuelSyncing, markFuelSynced, markFuelFailed,
  summarizeFuelQueue, type FuelQueueSummary,
} from '@/lib/dumpTruck/offlineFuelQueue'
import type { DumpTruckEvent, DumpTruckEventType, DumpTruckSite, DumpTruckJob } from '@/lib/dumpTruck/types'

export interface TimelineEntry {
  id: string
  eventType: DumpTruckEventType
  effectiveAt: string
  notes: string | null
  pending: boolean
  lat: number | null
  lng: number | null
}

interface DriverContextResponse {
  shift: { id: string; businessId: string; driverId: string; truckId: string | null; trailerId: string | null; state: string; loadCount: number } | null
  driverName: string
  businessName: string
  events: { id: string; eventType: DumpTruckEventType; effectiveAt: string; notes: string | null; lat: number | null; lng: number | null }[]
  sites: DumpTruckSite[]
  jobs: DumpTruckJob[]
  openDefects: { id: string; description: string; severity: string }[]
  loadCycles: { id: string; sequence: number; jobId: string; dumpDepartEventId: string | null }[]
}

const SYNC_INTERVAL_MS = 12000

export function useDumpTruckDriver() {
  const isOnline = useOnlineStatus()
  const [context, setContext] = useState<DriverContextResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [queueSummary, setQueueSummary] = useState<QueueSummary>({ pending: 0, syncing: 0, failed: 0, total: 0 })
  const [fuelQueueSummary, setFuelQueueSummary] = useState<FuelQueueSummary>({ pending: 0, syncing: 0, failed: 0, total: 0 })
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refreshQueueSummary = useCallback(() => setQueueSummary(summarizeQueue()), [])
  const refreshFuelQueueSummary = useCallback(() => { summarizeFuelQueue().then(setFuelQueueSummary) }, [])

  const fetchContext = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/dump-truck/context')
      if (!res.ok) throw new Error('Failed to load driver context')
      const body = await res.json()
      setContext(body.context)
      if (!activeJobId && body.context.jobs?.length) setActiveJobId(body.context.jobs[0].id)
    } catch {
      toast.error('Could not load shift data — check connection')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { fetchContext() }, [fetchContext])

  // ── Offline queue flush loop ────────────────────────────────────────────
  const flushQueue = useCallback(async () => {
    if (!navigator.onLine) return
    const retryable = getRetryableNow()
    if (!retryable.length) return

    let anySynced = false
    for (const item of retryable) {
      markSyncing(item.event.idempotencyKey)
      refreshQueueSummary()
      try {
        const res = await fetch('/api/fleet/dump-truck/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toEventPayload(item.event)),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        markSynced(item.event.idempotencyKey)
        anySynced = true
      } catch (err) {
        markFailed(item.event.idempotencyKey, err instanceof Error ? err.message : 'sync failed')
      }
      refreshQueueSummary()
    }
    if (anySynced) fetchContext()
  }, [fetchContext, refreshQueueSummary])

  // ── Offline fuel-entry queue flush loop (photo receipts — IndexedDB, see offlineFuelQueue.ts) ──
  const flushFuelQueue = useCallback(async () => {
    if (!navigator.onLine) return
    const retryable = await getRetryableFuelEntriesNow()
    if (!retryable.length) return

    let anySynced = false
    for (const item of retryable) {
      await markFuelSyncing(item.id)
      refreshFuelQueueSummary()
      try {
        const form = new FormData()
        for (const [key, value] of Object.entries(item.fields)) form.append(key, value)
        if (item.fileBlob) form.append('file', item.fileBlob, item.fileName ?? 'receipt.jpg')
        const res = await fetch('/api/fleet/dump-truck/fuel', { method: 'POST', body: form })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        await markFuelSynced(item.id)
        anySynced = true
      } catch (err) {
        await markFuelFailed(item.id, err instanceof Error ? err.message : 'sync failed')
      }
      refreshFuelQueueSummary()
    }
    if (anySynced) fetchContext()
  }, [fetchContext, refreshFuelQueueSummary])

  useEffect(() => {
    refreshQueueSummary()
    refreshFuelQueueSummary()
    syncTimerRef.current = setInterval(() => { flushQueue(); flushFuelQueue() }, SYNC_INTERVAL_MS)
    const onOnline = () => { flushQueue(); flushFuelQueue() }
    window.addEventListener('online', onOnline)
    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current)
      window.removeEventListener('online', onOnline)
    }
  }, [flushQueue, flushFuelQueue, refreshQueueSummary, refreshFuelQueueSummary])

  // ── Derived state ────────────────────────────────────────────────────────
  const queuedForShift = context?.shift
    ? readQueue().filter(q => q.event.shiftId === context.shift!.id)
    : []

  const timeline: TimelineEntry[] = [
    ...(context?.events ?? []).map(e => ({ ...e, pending: false })),
    ...queuedForShift
      .filter(q => !(context?.events ?? []).some(e => e.id === q.event.id))
      .map(q => ({
        id: q.event.id, eventType: q.event.eventType, effectiveAt: q.event.effectiveAt, notes: q.event.notes,
        pending: true, lat: q.event.geo.lat, lng: q.event.geo.lng,
      })),
  ].sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))

  const flowState: FlowStateId = computeFlowState(timeline.map(t => t.eventType))
  const primaryAction = getPrimaryAction(flowState)

  // ── Actions ──────────────────────────────────────────────────────────────

  const fireEvent = useCallback(async (
    eventType: DumpTruckEventType,
    opts: { odometer?: number | null; notes?: string | null; deviceMetadata?: Record<string, unknown> } = {},
  ): Promise<{ ok: boolean; siteLabel?: string }> => {
    if (!context?.shift) return { ok: false }
    if (!canFireEvent(flowState, eventType)) {
      toast.error(`"${eventType.replace(/_/g, ' ')}" is not valid right now`)
      return { ok: false }
    }

    const geo = await captureGeolocation()
    const event: DumpTruckEvent = buildEvent({
      businessId: context.shift.businessId,
      threebId: null,
      driverId: context.shift.driverId,
      shiftId: context.shift.id,
      jobId: activeJobId,
      vehicleId: context.shift.truckId,
      trailerId: context.shift.trailerId,
      eventType,
      geo,
      odometer: opts.odometer ?? null,
      notes: opts.notes ?? null,
      deviceMetadata: opts.deviceMetadata ?? {},
    })

    enqueueEvent(event)
    refreshQueueSummary()

    const matchedSite = geo.lat != null
      ? context.sites.find(s => s.lat != null && s.lng != null &&
          haversineMeters(geo.lat!, geo.lng!, s.lat!, s.lng!) <= s.geofenceRadiusM)
      : undefined

    // Best-effort immediate sync — falls back to the background loop if it fails.
    flushQueue()

    return { ok: true, siteLabel: matchedSite?.name }
  }, [context, flowState, activeJobId, flushQueue, refreshQueueSummary])

  const clockIn = useCallback(async (input: {
    truckId: string; trailerId?: string | null; startYardSiteId?: string | null
    manualStartTravelMinutes?: number | null
  }): Promise<boolean> => {
    if (!isOnline) { toast.error('Clock-in requires a connection'); return false }
    try {
      const geo = await captureGeolocation()
      const deviceId = getOrCreateDeviceId()
      const now = new Date()
      const clockInEvent = {
        id: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(),
        deviceCapturedAt: now.toISOString(), effectiveAt: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, utcOffsetMinutes: -now.getTimezoneOffset(),
        geo,
      }
      const res = await fetch('/api/fleet/dump-truck/shifts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, deviceId, deviceTimezone: clockInEvent.timezone, clockInEvent }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Clock-in failed')
      }
      toast.success('Clocked in')
      await fetchContext()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Clock-in failed')
      return false
    }
  }, [isOnline, fetchContext])

  const submitDay = useCallback(async (manualEndTravelMinutes?: number | null): Promise<boolean> => {
    if (!context?.shift) return false
    if (!isOnline) { toast.error('Submitting requires a connection'); return false }
    try {
      const geo = await captureGeolocation()
      const now = new Date()
      const res = await fetch(`/api/fleet/dump-truck/shifts/${context.shift.id}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            id: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(),
            deviceCapturedAt: now.toISOString(), effectiveAt: now.toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, utcOffsetMinutes: -now.getTimezoneOffset(),
            geo,
          },
          manualEndTravelMinutes: manualEndTravelMinutes ?? null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Submit failed')
      }
      toast.success('Day submitted')
      await fetchContext()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed')
      return false
    }
  }, [context, isOnline, fetchContext])

  /**
   * Queue a fuel entry (with its optional receipt photo) durably, then try an
   * immediate sync. Used instead of a direct fetch so a fuel stop at a
   * no-signal site still saves the timestamp/odometer/photo locally and
   * uploads automatically once connectivity returns.
   */
  const queueFuelEntry = useCallback(async (fields: Record<string, string>, file: File | null): Promise<void> => {
    await enqueueFuelEntry(fields, file)
    refreshFuelQueueSummary()
    flushFuelQueue()
  }, [refreshFuelQueueSummary, flushFuelQueue])

  return {
    loading, context, flowState, primaryAction, timeline,
    activeJobId, setActiveJobId,
    isOnline, queueSummary, fuelQueueSummary,
    driverName: context?.driverName ?? null, businessName: context?.businessName ?? null,
    fireEvent, clockIn, submitDay, queueFuelEntry, refetch: fetchContext,
  }
}

function toEventPayload(event: DumpTruckEvent) {
  return {
    id: event.id, idempotencyKey: event.idempotencyKey, shiftId: event.shiftId,
    eventType: event.eventType, jobId: event.jobId, loadCycleId: event.loadCycleId,
    deviceCapturedAt: event.deviceCapturedAt, effectiveAt: event.effectiveAt,
    timezone: event.timezone, utcOffsetMinutes: event.utcOffsetMinutes,
    geo: event.geo, odometer: event.odometer, notes: event.notes,
    deviceMetadata: event.deviceMetadata,
    correctsEventId: event.correctsEventId, correctionReason: event.correctionReason,
  }
}
