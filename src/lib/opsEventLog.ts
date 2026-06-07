'use client'
/**
 * opsEventLog.ts — Unified Ops Event Log (Black Box Recorder)
 *
 * Every significant event across all Fleet Commander engines funnels here.
 * Write-through pattern: localStorage first (instant), Supabase async (persistent).
 *
 * Engines covered:
 *   dispatchEngine    → driver_update, human_action
 *   escalationEngine  → escalation_opened, escalation_escalated, escalation_resolved
 *   loadHealthEngine  → stall_detected, stall_resolved, load_health_critical, exception_logged, exception_resolved, recovery_stop
 *   driverOpsEngine   → mode_change, detention_started, detention_ended
 *   recoveryEngine    → recovery_stop (advisor recommendation accepted)
 *   hosPlanning       → hos_plan_created
 *   notifications     → notification_sent
 *
 * LS key: 3b-ops-events (max 1000, FIFO eviction)
 * Supabase table: fleet_ops_events (Fleet project: goqzhdrmrdlkchmwfiur)
 */

import { createClient } from '@/lib/supabase-browser'
import { createAuthClient } from '@/lib/auth-client'

// ── Event types ───────────────────────────────────────────────────────────────

export type OpsEventType =
  // Dispatch engine
  | 'driver_update'
  | 'human_action'
  // Escalation engine
  | 'escalation_opened'
  | 'escalation_escalated'
  | 'escalation_resolved'
  | 'escalation_dismissed'
  // Load health & stall
  | 'stall_detected'
  | 'stall_resolved'
  | 'load_health_critical'
  | 'load_health_recovered'
  // Exception timeline
  | 'exception_logged'
  | 'exception_resolved'
  // Recovery & stops
  | 'recovery_stop'
  // Driver ops
  | 'mode_change'
  | 'detention_started'
  | 'detention_ended'
  // HOS planning
  | 'hos_plan_created'
  // PM / maintenance
  | 'pm_task_completed'
  // Notification delivery
  | 'notification_sent'
  | 'notification_failed'

export type OpsEventSeverity = 'info' | 'warning' | 'critical'

export type OpsEventSource =
  | 'dispatch_engine'
  | 'escalation_engine'
  | 'load_health_engine'
  | 'driver_ops_engine'
  | 'recovery_engine'
  | 'hos_planning'
  | 'maintenance_engine'
  | 'notification_router'
  | 'manual'

export interface OpsEvent {
  id:            string         // UUID (client-generated)
  createdAt:     string         // ISO timestamp
  eventType:     OpsEventType
  severity:      OpsEventSeverity
  loadNumber?:   string | null
  driverName?:   string | null
  actor?:        string | null  // dispatcher name, system name, etc.
  sourceEngine:  OpsEventSource
  title:         string
  body?:         string | null
  payload?:      Record<string, unknown> | null  // JSON blob for engine-specific data
  resolvedAt?:   string | null
  resolution?:   string | null
  sessionId?:    string | null
  synced?:       boolean        // true once written to Supabase
}

// ── Payload helpers (typed sub-payloads passed as `payload`) ──────────────────

export interface StallPayload {
  stallMinutes:  number
  stallRisk:     string       // 'yellow'|'orange'|'red'
  etaSlipMins?:  number
}

export interface EscalationPayload {
  tier:          string       // 'L0'|'L1'|'L2'|'L3'
  triggerType:   string
  triggerDetail?: string
  ownedBy?:      string
}

export interface ModeChangePayload {
  fromMode:      string
  toMode:        string
  location?:     string
}

export interface DetentionPayload {
  freeTimeMins:  number
  billedMins?:   number
  location?:     string
}

export interface HOSPlanPayload {
  miles:          number
  feasibility:    string    // 'feasible_now'|'rest'|'multi'|'infeasible_cycle'
  legalETA?:      string
  restStops?:     number
  drivingHrs?:    number
}

export interface NotificationPayload {
  channel:        string    // 'teams'|'sms'|'email'|'in_app'
  recipient?:     string
  escalationTier?: string
  status:         string    // 'sent'|'failed'
  error?:         string
}

// ── localStorage helpers ───────────────────────────────────────────────────────

const LS_KEY  = '3b-ops-events'
const MAX_LEN = 1000

function uuid(): string {
  return `oe-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function readAll(): OpsEvent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as OpsEvent[]) : []
  } catch { return [] }
}

function writeAll(events: OpsEvent[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(events))
  } catch { /* quota exceeded — ignore */ }
}

// ── Supabase async push ────────────────────────────────────────────────────────

async function pushToSupabase(event: OpsEvent): Promise<void> {
  try {
    const supabase = createClient()
    const { data: { user } } = await createAuthClient().auth.getUser()

    const row = {
      id:            event.id,
      created_at:    event.createdAt,
      event_type:    event.eventType,
      severity:      event.severity,
      load_number:   event.loadNumber  ?? null,
      driver_name:   event.driverName  ?? null,
      actor:         event.actor        ?? null,
      source_engine: event.sourceEngine,
      title:         event.title,
      body:          event.body         ?? null,
      payload:       event.payload      ?? null,
      resolved_at:   event.resolvedAt   ?? null,
      resolution:    event.resolution   ?? null,
      session_id:    event.sessionId    ?? null,
      user_id:       user?.id           ?? null,
    }

    await supabase.from('fleet_ops_events').upsert(row, { onConflict: 'id' })

    // Mark synced in LS
    const all = readAll()
    const idx = all.findIndex(e => e.id === event.id)
    if (idx !== -1) {
      all[idx] = { ...all[idx], synced: true }
      writeAll(all)
    }
  } catch { /* fire-and-forget — ignore errors */ }
}

// ── Core write function ───────────────────────────────────────────────────────

/**
 * logOpsEvent — write an event to the unified ops log.
 *
 * @param opts  Partial OpsEvent — id, createdAt, synced auto-filled
 * @returns     The complete OpsEvent written
 */
export function logOpsEvent(opts: Omit<OpsEvent, 'id' | 'createdAt' | 'synced'>): OpsEvent {
  const event: OpsEvent = {
    ...opts,
    id:        uuid(),
    createdAt: new Date().toISOString(),
    synced:    false,
  }

  // 1. Write to localStorage (synchronous, instant)
  const all = readAll()
  all.unshift(event)
  if (all.length > MAX_LEN) all.splice(MAX_LEN)
  writeAll(all)

  // 2. Push to Supabase (async, fire-and-forget)
  if (typeof window !== 'undefined') {
    pushToSupabase(event).catch(() => {})
  }

  return event
}

// ── Read & filter ─────────────────────────────────────────────────────────────

export interface OpsEventFilter {
  severity?:     OpsEventSeverity | OpsEventSeverity[]
  eventType?:    OpsEventType     | OpsEventType[]
  sourceEngine?: OpsEventSource   | OpsEventSource[]
  loadNumber?:   string
  driverName?:   string
  resolvedOnly?: boolean
  openOnly?:     boolean
  since?:        string           // ISO — filter createdAt >= since
  limit?:        number
}

export function readOpsEvents(filter?: OpsEventFilter): OpsEvent[] {
  let events = readAll()

  if (!filter) return events

  if (filter.severity) {
    const arr = Array.isArray(filter.severity) ? filter.severity : [filter.severity]
    events = events.filter(e => arr.includes(e.severity))
  }
  if (filter.eventType) {
    const arr = Array.isArray(filter.eventType) ? filter.eventType : [filter.eventType]
    events = events.filter(e => arr.includes(e.eventType))
  }
  if (filter.sourceEngine) {
    const arr = Array.isArray(filter.sourceEngine) ? filter.sourceEngine : [filter.sourceEngine]
    events = events.filter(e => arr.includes(e.sourceEngine))
  }
  if (filter.loadNumber) {
    events = events.filter(e => e.loadNumber === filter.loadNumber)
  }
  if (filter.driverName) {
    events = events.filter(e => e.driverName === filter.driverName)
  }
  if (filter.resolvedOnly) {
    events = events.filter(e => !!e.resolvedAt)
  }
  if (filter.openOnly) {
    events = events.filter(e => !e.resolvedAt)
  }
  if (filter.since) {
    events = events.filter(e => e.createdAt >= filter.since!)
  }
  if (filter.limit) {
    events = events.slice(0, filter.limit)
  }

  return events
}

// ── Resolve an event ─────────────────────────────────────────────────────────

export function resolveOpsEvent(id: string, resolution: string): void {
  const all = readAll()
  const idx = all.findIndex(e => e.id === id)
  if (idx === -1) return

  const now = new Date().toISOString()
  all[idx] = { ...all[idx], resolvedAt: now, resolution, synced: false }
  writeAll(all)

  // Sync resolved event to Supabase
  pushToSupabase(all[idx]).catch(() => {})
}

// ── Batch sync unsynced events ────────────────────────────────────────────────

/**
 * syncOpsEventsToSupabase — re-push any events that weren't synced yet.
 * Call on page load or when reconnection is detected.
 * Limits to last 50 unsynced to avoid flooding.
 */
export async function syncOpsEventsToSupabase(): Promise<{ synced: number; failed: number }> {
  const all     = readAll()
  const pending = all.filter(e => !e.synced).slice(0, 50)
  let synced = 0
  let failed = 0

  for (const event of pending) {
    try {
      await pushToSupabase(event)
      synced++
    } catch {
      failed++
    }
  }

  return { synced, failed }
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface OpsEventSummary {
  total:          number
  critical:       number
  warning:        number
  info:           number
  open:           number
  resolved:       number
  unsynced:       number
  byType:         Partial<Record<OpsEventType, number>>
  byEngine:       Partial<Record<OpsEventSource, number>>
  lastEventAt:    string | null
  lastCriticalAt: string | null
}

export function buildOpsEventSummary(filter?: OpsEventFilter): OpsEventSummary {
  const events = readOpsEvents(filter)

  const summary: OpsEventSummary = {
    total:          events.length,
    critical:       0,
    warning:        0,
    info:           0,
    open:           0,
    resolved:       0,
    unsynced:       0,
    byType:         {},
    byEngine:       {},
    lastEventAt:    events[0]?.createdAt ?? null,
    lastCriticalAt: null,
  }

  for (const e of events) {
    if (e.severity === 'critical') summary.critical++
    else if (e.severity === 'warning') summary.warning++
    else summary.info++

    if (e.resolvedAt) summary.resolved++
    else summary.open++

    if (!e.synced) summary.unsynced++

    summary.byType[e.eventType] = (summary.byType[e.eventType] ?? 0) + 1
    summary.byEngine[e.sourceEngine] = (summary.byEngine[e.sourceEngine] ?? 0) + 1

    if (e.severity === 'critical' && !summary.lastCriticalAt) {
      summary.lastCriticalAt = e.createdAt
    }
  }

  return summary
}

// ── Convenience loggers (called from other engines) ───────────────────────────

/** Log an escalation state change */
export function logEscalationEvent(opts: {
  eventType: Extract<OpsEventType, 'escalation_opened' | 'escalation_escalated' | 'escalation_resolved' | 'escalation_dismissed'>
  loadNumber?:  string
  driverName?:  string
  actor?:       string
  title:        string
  body?:        string
  payload?:     EscalationPayload
}): OpsEvent {
  const sev: OpsEventSeverity =
    opts.eventType === 'escalation_opened'    ? 'warning' :
    opts.eventType === 'escalation_escalated' ? 'critical' :
    'info'

  return logOpsEvent({
    eventType:    opts.eventType,
    severity:     sev,
    loadNumber:   opts.loadNumber,
    driverName:   opts.driverName,
    actor:        opts.actor,
    sourceEngine: 'escalation_engine',
    title:        opts.title,
    body:         opts.body,
    payload:      opts.payload as Record<string, unknown> | undefined,
  })
}

/** Log a stall detection or resolution */
export function logStallEvent(opts: {
  eventType: Extract<OpsEventType, 'stall_detected' | 'stall_resolved'>
  loadNumber?:  string
  driverName?:  string
  title:        string
  body?:        string
  payload?:     StallPayload
}): OpsEvent {
  return logOpsEvent({
    eventType:    opts.eventType,
    severity:     opts.eventType === 'stall_detected' ? 'warning' : 'info',
    loadNumber:   opts.loadNumber,
    driverName:   opts.driverName,
    sourceEngine: 'load_health_engine',
    title:        opts.title,
    body:         opts.body,
    payload:      opts.payload as Record<string, unknown> | undefined,
  })
}

/** Log a load health critical or recovery */
export function logLoadHealthEvent(opts: {
  eventType: Extract<OpsEventType, 'load_health_critical' | 'load_health_recovered'>
  loadNumber?:  string
  driverName?:  string
  title:        string
  body?:        string
  score?:       number
}): OpsEvent {
  return logOpsEvent({
    eventType:    opts.eventType,
    severity:     opts.eventType === 'load_health_critical' ? 'critical' : 'info',
    loadNumber:   opts.loadNumber,
    driverName:   opts.driverName,
    sourceEngine: 'load_health_engine',
    title:        opts.title,
    body:         opts.body,
    payload:      opts.score !== undefined ? { score: opts.score } : null,
  })
}

/** Log a driver operational mode change */
export function logModeChangeEvent(opts: {
  loadNumber?:  string
  driverName?:  string
  actor?:       string
  title:        string
  payload:      ModeChangePayload
}): OpsEvent {
  return logOpsEvent({
    eventType:    'mode_change',
    severity:     'info',
    loadNumber:   opts.loadNumber,
    driverName:   opts.driverName,
    actor:        opts.actor,
    sourceEngine: 'driver_ops_engine',
    title:        opts.title,
    payload:      opts.payload as unknown as Record<string, unknown>,
  })
}

/** Log detention start or end */
export function logDetentionEvent(opts: {
  eventType: Extract<OpsEventType, 'detention_started' | 'detention_ended'>
  loadNumber?:  string
  driverName?:  string
  actor?:       string
  title:        string
  payload?:     DetentionPayload
}): OpsEvent {
  return logOpsEvent({
    eventType:    opts.eventType,
    severity:     'warning',
    loadNumber:   opts.loadNumber,
    driverName:   opts.driverName,
    actor:        opts.actor,
    sourceEngine: 'driver_ops_engine',
    title:        opts.title,
    payload:      opts.payload as Record<string, unknown> | undefined,
  })
}

/** Log a HOS planning result */
export function logHOSPlanEvent(opts: {
  loadNumber?:  string
  driverName?:  string
  actor?:       string
  title:        string
  payload:      HOSPlanPayload
}): OpsEvent {
  const sev: OpsEventSeverity =
    opts.payload.feasibility === 'infeasible_cycle' ? 'critical' :
    opts.payload.feasibility === 'multi'            ? 'warning'  : 'info'

  return logOpsEvent({
    eventType:    'hos_plan_created',
    severity:     sev,
    loadNumber:   opts.loadNumber,
    driverName:   opts.driverName,
    actor:        opts.actor,
    sourceEngine: 'hos_planning',
    title:        opts.title,
    payload:      opts.payload as unknown as Record<string, unknown>,
  })
}

/** Log notification delivery attempt */
export function logNotificationEvent(opts: {
  loadNumber?:   string
  actor?:        string
  title:         string
  payload:       NotificationPayload
}): OpsEvent {
  return logOpsEvent({
    eventType:    opts.payload.status === 'sent' ? 'notification_sent' : 'notification_failed',
    severity:     opts.payload.status === 'sent' ? 'info' : 'warning',
    loadNumber:   opts.loadNumber,
    actor:        opts.actor,
    sourceEngine: 'notification_router',
    title:        opts.title,
    payload:      opts.payload as unknown as Record<string, unknown>,
  })
}
