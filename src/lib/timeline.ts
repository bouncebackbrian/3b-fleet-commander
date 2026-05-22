'use client'
/**
 * timeline.ts — Unified operational event logger
 *
 * Pattern: localStorage-first (instant, offline-safe) → Supabase async (non-blocking).
 * Callers fire-and-forget; failures are silently absorbed — the local record is
 * always written even when unauthenticated or offline.
 *
 * Table: fleet_timeline_events (Fleet Supabase project goqzhdrmrdlkchmwfiur)
 * Local: localStorage '3b-timeline-events' (newest-first, capped at 200)
 */
import { createClient } from '@/lib/supabase-browser'

// ── Event catalogue ───────────────────────────────────────────────────────────
export type TimelineEventType =
  // Navigation
  | 'nav_opened'                            // driver launched Google Maps / Waze / app
  | 'nav_opened_truckers_path_share_link'   // driver opened the Truckers Path shared route link
  | 'nav_snapshot_updated'                  // remaining miles updated in NavigationSnapshotCard
  // Driving mode
  | 'driving_mode_started'
  | 'driving_mode_ended'
  // Stops (mirrors stop_events lifecycle but at the timeline layer)
  | 'stop_arrived'
  | 'stop_departed'
  // Fuel / expenses
  | 'fuel_stop_logged'
  | 'expense_scanned'
  // Break / reset
  | 'break_started'
  | 'break_ended'
  | 'hos_reset_started'
  | 'hos_reset_ended'
  // Generic
  | 'note'

export type TimelineSource =
  | 'driving_overlay'
  | 'nav_snapshot'
  | 'stop_lifecycle'
  | 'fuel_log'
  | 'expense_scanner'
  | 'break_timer'
  | 'dashboard'

export interface TimelineEvent {
  id:          string
  eventType:   TimelineEventType
  source:      TimelineSource
  payload:     Record<string, unknown>
  loadId?:     string
  createdAt:   string
}

// ── localStorage helpers ──────────────────────────────────────────────────────
const LS_KEY = '3b-timeline-events'
const MAX_LOCAL = 200

function readLocal(): TimelineEvent[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as TimelineEvent[] }
  catch { return [] }
}

function appendLocal(event: TimelineEvent) {
  try {
    const events = readLocal()
    events.unshift(event)                          // newest first
    localStorage.setItem(LS_KEY, JSON.stringify(events.slice(0, MAX_LOCAL)))
  } catch { /* storage full or SSR */ }
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Log one operational event.
 *
 * @param eventType  What happened (from TimelineEventType catalogue)
 * @param source     Which UI surface fired the event
 * @param payload    Flexible key/value bag — keep flat, no PII
 * @param loadId     Active load number or mission id (omit between loads)
 *
 * @example
 *   await logTimelineEvent('nav_opened', 'driving_overlay', {
 *     app: 'Truckers Path', destination: 'Dallas, TX',
 *   }, mission?.loadNumber)
 */
export async function logTimelineEvent(
  eventType: TimelineEventType,
  source:    TimelineSource,
  payload:   Record<string, unknown> = {},
  loadId?:   string,
): Promise<void> {
  const event: TimelineEvent = {
    id:        crypto.randomUUID(),
    eventType,
    source,
    payload,
    loadId,
    createdAt: new Date().toISOString(),
  }

  // 1. localStorage — always, instant, works offline
  appendLocal(event)

  // 2. Supabase — async, non-blocking, silently skipped if unauthenticated
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return   // not signed in — local record is sufficient

    // Fetch business_id once; don't block on failure
    let businessId: string | null = null
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('three_b_biz_id')
        .eq('id', user.id)
        .single()
      businessId = prof?.three_b_biz_id ?? null
    } catch { /* profiles table missing or network hiccup */ }

    const { error } = await supabase.from('fleet_timeline_events').insert({
      id:          event.id,
      user_id:     user.id,
      business_id: businessId,
      load_id:     loadId ?? null,
      event_type:  eventType,
      source,
      payload,
      created_at:  event.createdAt,
    })

    if (error) {
      // Don't throw — local record already written, sync failure is non-fatal
      console.warn('[timeline] Supabase insert failed:', error.message)
    }
  } catch {
    // Network error, offline, or unauthenticated — silently absorbed
  }
}

/**
 * Read the local timeline cache (newest-first).
 * Useful for displaying recent events without a Supabase round-trip.
 */
export function readLocalTimeline(): TimelineEvent[] {
  return readLocal()
}
