'use client'
import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { opLog } from '@/lib/logger'
import type {
  StopEvent,
  StopLifecycleStatus,
  StopDetentionSummary,
  MissionStop,
} from '@/lib/dashboard/types'
import { useMission } from './useMission'

// ── localStorage cache ────────────────────────────────────────────────────────
// stop_events are append-only — never mutated after write.
// Cap at 500 entries; old missions age out naturally.
const LS_KEY = '3b-stop-events'

function readLocalEvents(): StopEvent[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as StopEvent[]
  } catch { /* ignore */ }
  return []
}

function writeLocalEvents(events: StopEvent[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(events.slice(-500))) } catch { /* ignore */ }
}

// ── Pure detention calculator (exported for use in UI) ────────────────────────
export function computeDetentionSummary(
  arrivedAt:   string,
  departedAt:  string,
  freeMinutes  = 120,
  ratePerHour  = 50,
): StopDetentionSummary {
  const startMs       = new Date(arrivedAt).getTime()
  const endMs         = new Date(departedAt).getTime()
  const dwellMinutes  = Math.max(0, (endMs - startMs) / 60000)
  const detMinutes    = Math.max(0, dwellMinutes - freeMinutes)

  return {
    arrivedAt,
    departedAt,
    dwellMinutes:     Math.round(dwellMinutes),
    freeMinutes,
    detentionMinutes: Math.round(detMinutes),
    detentionAmount:  parseFloat(((detMinutes / 60) * ratePerHour).toFixed(2)),
    ratePerHour,
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useStopEvents() {
  const { mission, updateStop } = useMission()

  // ── Write one event row ───────────────────────────────────────────────────
  // localStorage-first, then Supabase async.
  // Returns the fully-hydrated StopEvent (with id + createdAt).
  const logEvent = useCallback(async (
    event: Omit<StopEvent, 'id' | 'createdAt'>,
  ): Promise<StopEvent> => {
    const full: StopEvent = {
      ...event,
      id:        crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }

    // 1. localStorage — instant, offline-safe
    const events = readLocalEvents()
    events.push(full)
    writeLocalEvents(events)

    // 2. Supabase — async append (append-only, no update/delete policies)
    if (supabase) {
      try {
        const { error } = await supabase.from('stop_events').insert({
          id:            full.id,
          mission_id:    full.missionId,
          stop_id:       full.stopId,
          stop_sequence: full.stopSequence,
          event_type:    full.eventType,
          occurred_at:   full.occurredAt,
          payload:       full.payload  ?? null,
          notes:         full.notes    ?? null,
          user_id:       null,           // populated once auth is wired
        })
        if (error) {
          opLog.syncErr('stop_events insert failed', { error: error.message })
        } else {
          opLog.sync('stop_events insert OK', { eventType: full.eventType, stopId: full.stopId })
        }
      } catch (err) {
        opLog.error('sync', 'stop_events insert threw', err)
      }
    }

    return full
  }, [])

  // ── Advance a stop through the lifecycle ─────────────────────────────────
  // 1. Computes detention summary if this is the 'departed' event.
  // 2. Appends to stop_events (localStorage + Supabase).
  // 3. Merges updated timestamps + status back into the mission stop.
  const advanceLifecycle = useCallback(async (
    stop:      MissionStop,
    newStatus: StopLifecycleStatus,
    notes?:    string,
  ): Promise<void> => {
    if (!mission) return

    const now = new Date().toISOString()

    // Detention summary — only calculable when departing
    let detentionSummary: StopDetentionSummary | undefined
    if (newStatus === 'departed') {
      const arrivedAt = stop.lifecycleTimestamps?.arrived
      if (arrivedAt) {
        detentionSummary = computeDetentionSummary(arrivedAt, now)
      }
    }

    // Build event payload
    const payload: Record<string, unknown> = {}
    if (detentionSummary) payload.detentionSummary = detentionSummary

    // Log to stop_events
    await logEvent({
      missionId:    mission.id,
      stopId:       stop.id,
      stopSequence: stop.sequence,
      eventType:    newStatus,
      occurredAt:   now,
      payload:      Object.keys(payload).length ? payload : undefined,
      notes,
    })

    // Merge lifecycle state into the mission stop
    const updatedTimestamps: Partial<Record<StopLifecycleStatus, string>> = {
      ...(stop.lifecycleTimestamps ?? {}),
      [newStatus]: now,
    }

    // 'departed' = stop is complete
    const completedFields = newStatus === 'departed'
      ? { completed: true, completedAt: now }
      : {}

    await updateStop(stop.id, {
      lifecycleStatus:     newStatus,
      lifecycleTimestamps: updatedTimestamps,
      ...(detentionSummary ? { detentionSummary } : {}),
      ...completedFields,
    })

    opLog.mission('Stop lifecycle advanced', {
      stopId: stop.id, newStatus, detentionMinutes: detentionSummary?.detentionMinutes,
    })
  }, [mission, logEvent, updateStop])

  return { logEvent, advanceLifecycle, computeDetentionSummary }
}
