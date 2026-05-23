'use client'
/**
 * timeline.ts — Unified operational event engine
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
  // Driving mode lifecycle
  | 'driving_mode_started'
  | 'driving_mode_ended'
  // Mission / load lifecycle
  | 'mission_saved'
  | 'mission_restored'
  | 'mission_completed'
  // Navigation
  | 'nav_opened'
  | 'nav_opened_truckers_path_share_link'
  | 'nav_snapshot_updated'
  // Stops
  | 'stop_arrived'
  | 'stop_departed'
  // HOS / breaks
  | 'break_started'
  | 'break_ended'
  | 'hos_scanned'
  | 'hos_reset_started'
  | 'hos_reset_ended'
  // Alerts
  | 'alert_shown'
  | 'alert_dismissed'
  // Fuel / expenses
  | 'fuel_stop_logged'
  | 'expense_scanned'
  // Documents
  | 'document_uploaded'
  // Weather
  | 'weather_alert_shown'
  // Incidents / compliance
  | 'incident_logged'
  // Generic
  | 'note'

export type TimelineSource =
  | 'driving_overlay'
  | 'alert_layer'
  | 'mission_loader'
  | 'nav_snapshot'
  | 'stop_lifecycle'
  | 'break_timer'
  | 'hos_scanner'
  | 'fuel_log'
  | 'expense_scanner'
  | 'compliance_scanner'
  | 'dashboard'
  | 'settings'

export interface TimelineEvent {
  id:        string
  eventType: TimelineEventType
  source:    TimelineSource
  payload:   Record<string, unknown>
  loadId?:   string
  createdAt: string
}

// ── Human-readable labels (used by TimelineFeed) ──────────────────────────────
export const EVENT_META: Record<TimelineEventType, { emoji: string; label: string }> = {
  driving_mode_started:                { emoji: '🚛', label: 'Driving mode started'     },
  driving_mode_ended:                  { emoji: '🏁', label: 'Driving mode ended'       },
  mission_saved:                       { emoji: '📋', label: 'Load saved'               },
  mission_restored:                    { emoji: '🔄', label: 'Load restored'            },
  mission_completed:                   { emoji: '✅', label: 'Load completed'           },
  nav_opened:                          { emoji: '🗺', label: 'Navigation opened'        },
  nav_opened_truckers_path_share_link: { emoji: '🛣', label: 'Truckers Path route'      },
  nav_snapshot_updated:                { emoji: '📍', label: 'Miles updated'            },
  stop_arrived:                        { emoji: '📍', label: 'Arrived at stop'          },
  stop_departed:                       { emoji: '🚀', label: 'Departed stop'            },
  break_started:                       { emoji: '⏸', label: 'Break started'            },
  break_ended:                         { emoji: '▶', label: 'Break ended'              },
  hos_scanned:                         { emoji: '📷', label: 'HOS log scanned'         },
  hos_reset_started:                   { emoji: '🔁', label: 'HOS reset started'       },
  hos_reset_ended:                     { emoji: '✅', label: 'HOS reset complete'      },
  alert_shown:                         { emoji: '⚠', label: 'Alert triggered'         },
  alert_dismissed:                     { emoji: '✕', label: 'Alert dismissed'          },
  fuel_stop_logged:                    { emoji: '⛽', label: 'Fuel stop logged'        },
  expense_scanned:                     { emoji: '🧾', label: 'Expense scanned'         },
  document_uploaded:                   { emoji: '📄', label: 'Document uploaded'       },
  weather_alert_shown:                 { emoji: '🌩', label: 'Weather alert'           },
  incident_logged:                     { emoji: '🚨', label: 'Incident logged'        },
  note:                                { emoji: '📝', label: 'Note'                    },
}

// ── localStorage helpers ──────────────────────────────────────────────────────
const LS_KEY    = '3b-timeline-events'
const MAX_LOCAL = 200

function readLocal(): TimelineEvent[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as TimelineEvent[] }
  catch { return [] }
}

function appendLocal(event: TimelineEvent) {
  try {
    const events = readLocal()
    events.unshift(event)
    localStorage.setItem(LS_KEY, JSON.stringify(events.slice(0, MAX_LOCAL)))
  } catch { /* storage full or SSR */ }
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Log one operational event.
 * localStorage write is synchronous and immediate.
 * Supabase write is async and non-blocking — failures are silently absorbed.
 *
 * @param eventType  What happened
 * @param source     Which UI surface fired the event
 * @param payload    Flat key/value bag — no PII
 * @param loadId     Active load number or mission id (omit between loads)
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

  // 1. localStorage — always instant, works offline
  appendLocal(event)

  // 2. Supabase — async, non-blocking
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let businessId: string | null = null
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('business_id')
        .eq('id', user.id)
        .single()
      businessId = (prof as Record<string, string> | null)?.business_id ?? null
    } catch { /* profiles miss or network hiccup */ }

    await supabase.from('fleet_timeline_events').insert({
      id:          event.id,
      user_id:     user.id,
      business_id: businessId,
      load_id:     loadId ?? null,
      event_type:  eventType,
      source,
      payload,
      created_at:  event.createdAt,
    })
  } catch { /* offline, unauthenticated, or table not yet created — silently absorbed */ }
}

/**
 * Read the local timeline (newest-first).
 * Pass limit to cap the result for display components.
 */
export function readLocalTimeline(limit = MAX_LOCAL): TimelineEvent[] {
  return readLocal().slice(0, limit)
}

/** Wipe the local cache — useful in testing or Settings "Clear data" flow. */
export function clearLocalTimeline(): void {
  try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
}
