'use client'
/**
 * dispatchEngine.ts — Dispatch Command data layer
 *
 * Driver sends structured updates → AI classifies severity → dispatch feed
 * logs it → critical/warning creates escalation → human accepts ownership →
 * action logged → issue closed.
 *
 * LS keys:
 *   3b-driver-updates     — DriverUpdate[]     (max 500)
 *   3b-dispatch-alerts    — DispatchAlert[]    (max 300)
 *   3b-escalations        — Escalation[]       (max 200)
 *   3b-human-actions      — HumanAction[]      (max 300)
 */

// ── Update types ──────────────────────────────────────────────────────────────

export type UpdateType =
  | 'arrived_pickup'
  | 'loaded'
  | 'departed'
  | 'fuel_stop'
  | 'break_started'
  | 'break_ended'
  | 'delay_reported'
  | 'detention_started'
  | 'detention_ended'
  | 'issue_reported'
  | 'accident_incident'
  | 'delivered'
  | 'pod_uploaded'
  | 'hos_update'
  | 'custom'

export type Severity = 'info' | 'warning' | 'critical'

export interface DriverUpdate {
  id:          string
  type:        UpdateType
  loadNumber:  string
  driverName:  string
  location:    string
  lat?:        number
  lng?:        number
  timestamp:   string         // ISO
  notes:       string
  photoUrls?:  string[]
  hosDrive?:   number         // hours remaining
  hosShift?:   number
  hosCycle?:   number
  severity:    Severity       // AI-classified
  ackRequired: boolean        // critical/warning require ack
  acked:       boolean
  ackedBy?:    string
  ackedAt?:    string
}

// ── Dispatch alert ────────────────────────────────────────────────────────────

export type AlertType =
  | 'driver_update'
  | 'escalation'
  | 'auto_detect'    // system-generated (detention timer, idle, etc.)
  | 'hos_risk'
  | 'eta_slip'
  | 'detention_over'
  | 'no_update'
  | 'tire_alert'
  | 'inspection_expiry'
  | 'fuel_risk'

export interface DispatchAlert {
  id:          string
  type:        AlertType
  loadNumber:  string
  severity:    Severity
  title:       string
  body:        string
  timestamp:   string
  updateId?:   string    // linked DriverUpdate
  resolved:    boolean
  resolvedBy?: string
  resolvedAt?: string
}

// ── Escalation ────────────────────────────────────────────────────────────────

export type EscalationStatus = 'open' | 'owned' | 'resolved' | 'reassigned'

export interface Escalation {
  id:          string
  alertId:     string
  updateId?:   string
  loadNumber:  string
  severity:    'warning' | 'critical'
  title:       string
  body:        string
  createdAt:   string
  status:      EscalationStatus
  ownedBy?:    string
  ownedAt?:    string
  resolvedAt?: string
  actionLog:   HumanAction[]
}

// ── Human action ──────────────────────────────────────────────────────────────

export type ActionType =
  | 'acknowledged'
  | 'contacted_driver'
  | 'contacted_customer'
  | 'rerouted'
  | 'scheduled_repair'
  | 'filed_claim'
  | 'notified_broker'
  | 'extended_delivery'
  | 'load_reassigned'
  | 'resolved'
  | 'note_added'

export interface HumanAction {
  id:          string
  escalationId: string
  loadNumber:  string
  actor:       string        // dispatcher name
  action:      ActionType
  note:        string
  timestamp:   string
}

// ── Update metadata ───────────────────────────────────────────────────────────

export const UPDATE_META: Record<UpdateType, {
  label: string; emoji: string; severity: Severity; ackRequired: boolean
}> = {
  arrived_pickup:    { label: 'Arrived at Pickup',     emoji: '📍', severity: 'info',     ackRequired: false },
  loaded:            { label: 'Loaded',                emoji: '📦', severity: 'info',     ackRequired: false },
  departed:          { label: 'Departed',              emoji: '🚛', severity: 'info',     ackRequired: false },
  fuel_stop:         { label: 'Fuel Stop',             emoji: '⛽', severity: 'info',     ackRequired: false },
  break_started:     { label: 'Break Started',         emoji: '⏸', severity: 'info',     ackRequired: false },
  break_ended:       { label: 'Break Ended',           emoji: '▶️', severity: 'info',     ackRequired: false },
  delay_reported:    { label: 'Delay Reported',        emoji: '⏱️', severity: 'warning',  ackRequired: true  },
  detention_started: { label: 'Detention Clock Started',emoji: '🕐', severity: 'warning', ackRequired: true  },
  detention_ended:   { label: 'Detention Ended',       emoji: '✅', severity: 'info',     ackRequired: false },
  issue_reported:    { label: 'Issue Reported',        emoji: '⚠️', severity: 'warning',  ackRequired: true  },
  accident_incident: { label: 'Accident / Incident',  emoji: '🚨', severity: 'critical', ackRequired: true  },
  delivered:         { label: 'Delivered',             emoji: '✅', severity: 'info',     ackRequired: false },
  pod_uploaded:      { label: 'POD Uploaded',          emoji: '📄', severity: 'info',     ackRequired: false },
  hos_update:        { label: 'HOS Update',            emoji: '⏱️', severity: 'info',     ackRequired: false },
  custom:            { label: 'Custom Note',           emoji: '💬', severity: 'info',     ackRequired: false },
}

// Critical update types — always escalate
const CRITICAL_TYPES: UpdateType[] = ['accident_incident']
const WARNING_TYPES:  UpdateType[] = ['delay_reported', 'detention_started', 'issue_reported']

// ── Mission progress ──────────────────────────────────────────────────────────

export type MissionStatus =
  | 'pending'
  | 'en_route_pickup'
  | 'at_pickup'
  | 'loaded'
  | 'en_route_delivery'
  | 'at_delivery'
  | 'delivered'
  | 'issue'

export interface MissionProgress {
  loadNumber:  string
  driverName:  string
  origin:      string
  destination: string
  totalMiles:  number
  estArrival:  string
  status:      MissionStatus
  pct:         number         // 0-100
  lastUpdate:  DriverUpdate | null
  updates:     DriverUpdate[]
  alerts:      DispatchAlert[]
  escalations: Escalation[]
  etaSlipMins: number         // >0 means ETA slipping
}

// ── Status progression ────────────────────────────────────────────────────────

const STATUS_AFTER: Partial<Record<UpdateType, MissionStatus>> = {
  arrived_pickup:    'at_pickup',
  loaded:            'loaded',
  departed:          'en_route_delivery',
  delivered:         'delivered',
  accident_incident: 'issue',
  issue_reported:    'issue',
}

const STATUS_PCT: Record<MissionStatus, number> = {
  pending:            0,
  en_route_pickup:   10,
  at_pickup:         25,
  loaded:            35,
  en_route_delivery: 60,
  at_delivery:       85,
  delivered:        100,
  issue:             50,
}

// ── LS keys ───────────────────────────────────────────────────────────────────

const LS_UPDATES     = '3b-driver-updates'
const LS_ALERTS      = '3b-dispatch-alerts'
const LS_ESCALATIONS = '3b-escalations'
const LS_ACTIONS     = '3b-human-actions'

const MAX_UPDATES     = 500
const MAX_ALERTS      = 300
const MAX_ESCALATIONS = 200
const MAX_ACTIONS     = 300

// ── Driver updates ────────────────────────────────────────────────────────────

export function readDriverUpdates(loadNumber?: string): DriverUpdate[] {
  try {
    const all: DriverUpdate[] = JSON.parse(localStorage.getItem(LS_UPDATES) ?? '[]')
    return loadNumber ? all.filter(u => u.loadNumber === loadNumber) : all
  } catch { return [] }
}

export function saveDriverUpdate(update: DriverUpdate): void {
  try {
    const all = readDriverUpdates()
    const idx = all.findIndex(u => u.id === update.id)
    if (idx >= 0) all[idx] = update
    else all.unshift(update)
    localStorage.setItem(LS_UPDATES, JSON.stringify(all.slice(0, MAX_UPDATES)))
  } catch { /* storage full */ }
}

export function postDriverUpdate(
  partial: Omit<DriverUpdate, 'id' | 'severity' | 'ackRequired' | 'acked' | 'timestamp'>
): DriverUpdate {
  const meta    = UPDATE_META[partial.type]
  // Override severity for critical types regardless of meta default
  const severity: Severity =
    CRITICAL_TYPES.includes(partial.type) ? 'critical' :
    WARNING_TYPES.includes(partial.type)  ? 'warning'  : meta.severity

  const update: DriverUpdate = {
    ...partial,
    id:          crypto.randomUUID(),
    timestamp:   new Date().toISOString(),
    severity,
    ackRequired: meta.ackRequired,
    acked:       false,
  }
  saveDriverUpdate(update)

  // Auto-create dispatch alert
  const alert = createAlertFromUpdate(update)
  saveDispatchAlert(alert)

  // Auto-escalate if critical/warning
  if (severity === 'critical' || severity === 'warning') {
    const escalation = createEscalation(update, alert)
    saveEscalation(escalation)
  }

  // ── Supabase persistence (fire-and-forget) ────────────────────────────────
  // Import dynamically to avoid circular deps / SSR issues
  if (typeof window !== 'undefined') {
    import('@/lib/supabaseFleetStore').then(({ persistDriverUpdate, persistAlert }) => {
      persistDriverUpdate(update).catch(() => { /* silent fail — localStorage is source of truth */ })
      persistAlert(alert).catch(() => { /* silent fail */ })
    }).catch(() => { /* module load failed */ })
  }

  return update
}

// ── Dispatch alerts ───────────────────────────────────────────────────────────

export function readDispatchAlerts(loadNumber?: string): DispatchAlert[] {
  try {
    const all: DispatchAlert[] = JSON.parse(localStorage.getItem(LS_ALERTS) ?? '[]')
    return loadNumber ? all.filter(a => a.loadNumber === loadNumber) : all
  } catch { return [] }
}

export function saveDispatchAlert(alert: DispatchAlert): void {
  try {
    const all = readDispatchAlerts()
    const idx = all.findIndex(a => a.id === alert.id)
    if (idx >= 0) all[idx] = alert
    else all.unshift(alert)
    localStorage.setItem(LS_ALERTS, JSON.stringify(all.slice(0, MAX_ALERTS)))
  } catch { /* storage full */ }
}

function createAlertFromUpdate(u: DriverUpdate): DispatchAlert {
  const meta = UPDATE_META[u.type]
  return {
    id:         crypto.randomUUID(),
    type:       'driver_update',
    loadNumber: u.loadNumber,
    severity:   u.severity,
    title:      `${meta.emoji} ${meta.label} — Load #${u.loadNumber}`,
    body:       [
      u.location ? `📍 ${u.location}` : '',
      u.notes || '',
      u.hosDrive != null ? `HOS Drive: ${u.hosDrive.toFixed(1)}h remaining` : '',
    ].filter(Boolean).join(' · '),
    timestamp:  u.timestamp,
    updateId:   u.id,
    resolved:   u.severity === 'info',   // info alerts auto-resolve
  }
}

export function resolveAlert(id: string, resolvedBy: string): void {
  try {
    const all = readDispatchAlerts()
    const idx = all.findIndex(a => a.id === id)
    if (idx >= 0) {
      all[idx] = { ...all[idx], resolved: true, resolvedBy, resolvedAt: new Date().toISOString() }
      localStorage.setItem(LS_ALERTS, JSON.stringify(all.slice(0, MAX_ALERTS)))
    }
  } catch { /* ignore */ }
}

// ── Escalations ───────────────────────────────────────────────────────────────

export function readEscalations(loadNumber?: string): Escalation[] {
  try {
    const all: Escalation[] = JSON.parse(localStorage.getItem(LS_ESCALATIONS) ?? '[]')
    return loadNumber ? all.filter(e => e.loadNumber === loadNumber) : all
  } catch { return [] }
}

export function saveEscalation(esc: Escalation): void {
  try {
    const all = readEscalations()
    const idx = all.findIndex(e => e.id === esc.id)
    if (idx >= 0) all[idx] = esc
    else all.unshift(esc)
    localStorage.setItem(LS_ESCALATIONS, JSON.stringify(all.slice(0, MAX_ESCALATIONS)))
  } catch { /* storage full */ }
}

function createEscalation(u: DriverUpdate, alert: DispatchAlert): Escalation {
  const meta = UPDATE_META[u.type]
  return {
    id:         crypto.randomUUID(),
    alertId:    alert.id,
    updateId:   u.id,
    loadNumber: u.loadNumber,
    severity:   u.severity as 'warning' | 'critical',
    title:      `${meta.emoji} ${meta.label}`,
    body:       alert.body,
    createdAt:  u.timestamp,
    status:     'open',
    actionLog:  [],
  }
}

export function ownEscalation(id: string, actor: string): void {
  try {
    const all = readEscalations()
    const idx = all.findIndex(e => e.id === id)
    if (idx >= 0) {
      all[idx] = { ...all[idx], status: 'owned', ownedBy: actor, ownedAt: new Date().toISOString() }
      localStorage.setItem(LS_ESCALATIONS, JSON.stringify(all.slice(0, MAX_ESCALATIONS)))
    }
  } catch { /* ignore */ }
}

export function resolveEscalation(id: string, actor: string, note: string): void {
  try {
    const all = readEscalations()
    const idx = all.findIndex(e => e.id === id)
    if (idx >= 0) {
      const action = logHumanAction({
        escalationId: id,
        loadNumber:   all[idx].loadNumber,
        actor,
        action:       'resolved',
        note,
      })
      all[idx] = {
        ...all[idx],
        status:      'resolved',
        resolvedAt:  new Date().toISOString(),
        actionLog:   [...all[idx].actionLog, action],
      }
      localStorage.setItem(LS_ESCALATIONS, JSON.stringify(all.slice(0, MAX_ESCALATIONS)))
    }
  } catch { /* ignore */ }
}

// ── Human actions ─────────────────────────────────────────────────────────────

export function readHumanActions(escalationId?: string): HumanAction[] {
  try {
    const all: HumanAction[] = JSON.parse(localStorage.getItem(LS_ACTIONS) ?? '[]')
    return escalationId ? all.filter(a => a.escalationId === escalationId) : all
  } catch { return [] }
}

export function logHumanAction(
  partial: Omit<HumanAction, 'id' | 'timestamp'>
): HumanAction {
  const action: HumanAction = {
    ...partial,
    id:        crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  }
  try {
    const all = readHumanActions()
    all.unshift(action)
    localStorage.setItem(LS_ACTIONS, JSON.stringify(all.slice(0, MAX_ACTIONS)))
  } catch { /* ignore */ }
  return action
}

// ── Mission progress calculator ───────────────────────────────────────────────

export function buildMissionProgress(
  loadNumber: string,
  meta: { driverName: string; origin: string; destination: string; totalMiles: number; estArrival: string }
): MissionProgress {
  const updates     = readDriverUpdates(loadNumber)
  const alerts      = readDispatchAlerts(loadNumber)
  const escalations = readEscalations(loadNumber)

  // Derive current status from last update type that maps to a status
  let status: MissionStatus = 'en_route_pickup'
  for (const u of updates) {
    const mapped = STATUS_AFTER[u.type]
    if (mapped) { status = mapped; break }
  }

  const pct       = STATUS_PCT[status]
  const lastUpdate = updates.length > 0 ? updates[0] : null

  // ETA slip: compare estArrival vs now + remaining drive time
  let etaSlipMins = 0
  if (meta.estArrival) {
    const estMs   = new Date(meta.estArrival).getTime()
    const nowMs   = Date.now()
    const remaining = estMs - nowMs
    if (remaining < 0 && status !== 'delivered') {
      etaSlipMins = Math.round(Math.abs(remaining) / 60000)
    }
  }

  return {
    loadNumber,
    ...meta,
    status,
    pct,
    lastUpdate,
    updates,
    alerts:      alerts.filter(a => !a.resolved),
    escalations: escalations.filter(e => e.status === 'open' || e.status === 'owned'),
    etaSlipMins,
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function severityColor(s: Severity): string {
  return s === 'critical' ? 'var(--error)' : s === 'warning' ? 'var(--warn)' : 'var(--primary)'
}

export function severityBg(s: Severity): string {
  return s === 'critical' ? 'rgba(232,64,0,.08)' : s === 'warning' ? 'rgba(245,194,0,.07)' : 'rgba(0,232,176,.05)'
}
