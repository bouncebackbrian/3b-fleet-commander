'use client'
/**
 * orderUtils.ts — Phase 5C: Order-Centered Data Attachment
 *
 * Helpers for generating order numbers, stamping records with mission context,
 * migrating legacy records without order_number, and managing per-order trailer
 * assignment.
 *
 * All helpers are pure functions — no side effects, no localStorage access.
 * Persistence is the caller's responsibility.
 */

import type {
  LoadMission, Expense, OperationalEvent, StopEvent,
  MissionStop, OrderTimestamps, MovementMode, FuelEntry, DocRecord,
} from './types'

// ── Order number generation ───────────────────────────────────────────────────
// Format: ORD-YYYYMMDD-XXXX  (e.g. ORD-20260521-A3F7)
export function generateOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `ORD-${date}-${suffix}`
}

// ── Timezone detection ────────────────────────────────────────────────────────
export function getTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' }
}

// ── Stamp any record with mission context ─────────────────────────────────────
// Adds missionId, orderNumber, loggedAt, and timezone if not already set.
// Safe to call on already-stamped records — won't overwrite existing values.
export function stampWithMission<T extends {
  missionId?: string | null
  orderNumber?: string
  loggedAt?: string
  timezone?: string
}>(record: T, mission: LoadMission | null): T {
  const now = new Date().toISOString()
  return {
    ...record,
    missionId:   record.missionId   ?? mission?.id               ?? null,
    orderNumber: record.orderNumber ?? (mission?.orderNumber ?? mission?.loadNumber) ?? undefined,
    loggedAt:    record.loggedAt    ?? now,
    timezone:    record.timezone    ?? getTimezone(),
  }
}

// ── Ensure mission has orderNumber and timestamps ─────────────────────────────
// Safe to call on any mission — only fills gaps, never overwrites.
export function normalizeMission(m: LoadMission): LoadMission {
  const now = new Date().toISOString()
  const orderNumber = m.orderNumber ?? generateOrderNumber()
  const timestamps: OrderTimestamps = {
    orderCreatedAt:  m.timestamps?.orderCreatedAt  ?? m.date ?? now,
    lastUpdatedAt:   now,
    ...m.timestamps,
  }
  return { ...m, orderNumber, timestamps }
}

// ── Create a blank order shell ────────────────────────────────────────────────
// Returns a partial LoadMission with id, orderNumber, and timestamps pre-set.
// The caller fills in origin, destination, loadNumber, etc.
export function createOrderShell(): Partial<LoadMission> {
  const now = new Date().toISOString()
  const orderNumber = generateOrderNumber()
  return {
    id:          crypto.randomUUID(),
    orderNumber,
    loadNumber:  '',
    timestamps: {
      orderCreatedAt: now,
      lastUpdatedAt:  now,
    },
  }
}

// ── Get the best display order number for a mission ───────────────────────────
export function getOrderNumber(mission: LoadMission): string {
  return mission.orderNumber ?? mission.loadNumber ?? mission.id.slice(0, 8)
}

// ── Migrate expense — backfill mission context from available missions ─────────
export function migrateExpense(e: Expense, missions: LoadMission[]): Expense {
  if (e.missionId && e.orderNumber) return e   // already migrated
  const match = missions.find(m =>
    m.loadNumber === e.loadNumber ||
    m.orderNumber === e.loadNumber ||
    m.id === e.missionId
  )
  return {
    ...e,
    missionId:   e.missionId   ?? match?.id,
    orderNumber: e.orderNumber ?? match?.orderNumber ?? match?.loadNumber ?? e.loadNumber,
    loggedAt:    e.loggedAt    ?? e.createdAt,
    timezone:    e.timezone    ?? getTimezone(),
  }
}

// ── Migrate operational event ─────────────────────────────────────────────────
export function migrateOperationalEvent(ev: OperationalEvent, missions: LoadMission[]): OperationalEvent {
  if (ev.orderNumber) return ev
  const match = missions.find(m =>
    m.id === ev.missionId ||
    m.loadNumber === ev.loadNumber
  )
  return {
    ...ev,
    orderNumber: ev.orderNumber ?? match?.orderNumber ?? match?.loadNumber ?? ev.loadNumber,
    loggedAt:    ev.loggedAt    ?? ev.createdAt,
    timezone:    ev.timezone    ?? getTimezone(),
  }
}

// ── Migrate stop (backfill mission context) ───────────────────────────────────
export function migrateStop(stop: MissionStop, mission: LoadMission): MissionStop {
  return {
    ...stop,
    missionId:   stop.missionId   ?? mission.id,
    orderNumber: stop.orderNumber ?? (mission.orderNumber ?? mission.loadNumber),
    loggedAt:    stop.loggedAt    ?? mission.date ?? new Date().toISOString(),
  }
}

// ── Stamp stop event with order context ──────────────────────────────────────
export function stampStopEvent(ev: StopEvent, mission: LoadMission): StopEvent {
  return {
    ...ev,
    orderNumber: ev.orderNumber ?? (mission.orderNumber ?? mission.loadNumber),
    loggedAt:    ev.loggedAt    ?? ev.createdAt,
    timezone:    ev.timezone    ?? getTimezone(),
  }
}

// ── Migration runner — applies to an entire localStorage dataset ──────────────
// Call once on app load; returns updated collections only if changes were made.
export function runOrderMigration(data: {
  missions:  LoadMission[]
  expenses:  Expense[]
  events:    OperationalEvent[]
}): {
  missions:  LoadMission[]
  expenses:  Expense[]
  events:    OperationalEvent[]
  changed:   boolean
} {
  let changed = false

  const missions = data.missions.map(m => {
    const n = normalizeMission(m)
    if (n.orderNumber !== m.orderNumber) changed = true
    return n
  })

  const expenses = data.expenses.map(e => {
    const n = migrateExpense(e, missions)
    if (n.missionId !== e.missionId || n.orderNumber !== e.orderNumber) changed = true
    return n
  })

  const events = data.events.map(ev => {
    const n = migrateOperationalEvent(ev, missions)
    if (n.orderNumber !== ev.orderNumber) changed = true
    return n
  })

  return { missions, expenses, events, changed }
}

// ── Default movement mode based on mission state ──────────────────────────────
// Uses stop type to infer the movement state at time of expense.
export function inferMovementMode(mission: LoadMission | null, stopType?: string): MovementMode {
  if (!mission) return 'bobtail'
  if (stopType === 'pickup' || stopType === 'delivery') return 'loaded'
  if (mission.status === 'active') return 'loaded'
  return 'loaded'
}

// ── Update order timestamps ───────────────────────────────────────────────────
export function touchTimestamp(
  mission: LoadMission,
  key: keyof OrderTimestamps,
  value?: string,
): LoadMission {
  const now = value ?? new Date().toISOString()
  return {
    ...mission,
    timestamps: {
      ...mission.timestamps,
      [key]:          now,
      lastUpdatedAt:  new Date().toISOString(),
    },
  }
}

// ── Archive mission at completion ─────────────────────────────────────────────
// Marks completed, stamps completedAt, preserves all data, returns updated mission.
export function archiveMission(mission: LoadMission): LoadMission {
  return touchTimestamp(
    { ...mission, status: 'completed' },
    'completedAt'
  )
}

// ── Build a timeline entry list from a mission's records ─────────────────────
export type TimelineEntryType =
  | 'order_created' | 'order_accepted'
  | 'stop_appt' | 'stop_arrived' | 'stop_checkin' | 'stop_docked'
  | 'stop_work_start' | 'stop_work_end' | 'stop_departed' | 'stop_completed'
  | 'expense' | 'fuel' | 'doc' | 'alert' | 'note' | 'review_complete'

export type TimelineFilter = 'all' | 'stops' | 'fuel' | 'expenses' | 'docs' | 'alerts'

export type TimelineEntry = {
  id:        string
  type:      TimelineEntryType
  filter:    TimelineFilter
  ts:        string           // ISO — used for sort
  emoji:     string
  label:     string           // short category
  detail:    string           // main display line
  subDetail?: string          // secondary line (amount, notes, etc.)
  stopId?:   string
  severity?: 'info' | 'warn' | 'critical'
}

const LIFECYCLE_EMOJI: Record<string, string> = {
  arrived: '🚛', checked_in: '📋', waiting: '⏳', docked: '⚓',
  work_started: '🔧', work_ended: '✅', departed: '🚪',
}

const LIFECYCLE_LABEL: Record<string, string> = {
  arrived: 'Arrived', checked_in: 'Checked In', waiting: 'Waiting',
  docked: 'Docked', work_started: 'Work Started', work_ended: 'Work Ended', departed: 'Departed',
}

const SEVERITY_EMOJI: Record<string, string> = { info: 'ℹ️', warn: '⚠️', critical: '🚨' }

export function buildTimeline(params: {
  mission:    LoadMission
  expenses?:  Expense[]
  fuel?:      FuelEntry[]
  events?:    OperationalEvent[]
  stopEvents?: StopEvent[]
  docs?:      DocRecord[]
  filter?:    TimelineFilter
}): TimelineEntry[] {
  const { mission, expenses = [], fuel = [], events = [], stopEvents = [], docs = [], filter = 'all' } = params
  const entries: TimelineEntry[] = []

  // ── Order creation ──────────────────────────────────────────────────────────
  const createdAt = mission.timestamps?.orderCreatedAt ?? mission.date
  if (createdAt) entries.push({
    id: 'order-created', type: 'order_created', filter: 'all',
    ts: createdAt, emoji: '📋', label: 'Order Created',
    detail: `Load #${mission.loadNumber || getOrderNumber(mission)}`,
    subDetail: mission.broker ? `via ${mission.broker}` : undefined,
  })

  if (mission.timestamps?.orderAcceptedAt) entries.push({
    id: 'order-accepted', type: 'order_accepted', filter: 'all',
    ts: mission.timestamps.orderAcceptedAt, emoji: '✅', label: 'Accepted',
    detail: `Order ${getOrderNumber(mission)} accepted`,
  })

  // ── Stops ───────────────────────────────────────────────────────────────────
  for (const stop of (mission.stops ?? [])) {
    const stopLoc = [stop.name, stop.city && stop.state ? `${stop.city}, ${stop.state}` : (stop.city || stop.state)].filter(Boolean).join(' — ')
    const stopEmoji = { pickup:'📦', delivery:'🏪', relay:'🔄', fuel:'⛽', yard:'🏠', rest:'🛏️', scale:'⚖️', repair:'🔧', washout:'🚿', other:'📍' }[stop.type] ?? '📍'
    const stopLabel = stop.type.charAt(0).toUpperCase() + stop.type.slice(1)

    if (stop.appointmentStart) entries.push({
      id: `${stop.id}-appt`, type: 'stop_appt', filter: 'stops',
      ts: stop.appointmentStart, emoji: '📅', label: `${stopLabel} Appt`,
      detail: stopLoc || `Stop #${stop.sequence}`,
      stopId: stop.id,
    })

    // Lifecycle timestamps
    for (const [key, ts] of Object.entries(stop.lifecycleTimestamps ?? {})) {
      if (!ts) continue
      entries.push({
        id: `${stop.id}-${key}`,
        type: `stop_${key.replace('_', '')}` as TimelineEntryType,
        filter: 'stops',
        ts, emoji: LIFECYCLE_EMOJI[key] ?? stopEmoji,
        label: `${stopLabel} — ${LIFECYCLE_LABEL[key] ?? key}`,
        detail: stopLoc || `Stop #${stop.sequence}`,
        stopId: stop.id,
      })
    }

    if (stop.completedAt) entries.push({
      id: `${stop.id}-completed`, type: 'stop_completed', filter: 'stops',
      ts: stop.completedAt, emoji: '✅', label: `${stopLabel} Complete`,
      detail: stopLoc || `Stop #${stop.sequence}`,
      stopId: stop.id,
    })
  }

  // ── Stop events (from useStopEvents hook audit log) ─────────────────────────
  for (const ev of stopEvents) {
    if (entries.some(e => e.id === `${ev.stopId}-${ev.eventType}`)) continue
    entries.push({
      id: `se-${ev.id}`, type: `stop_${ev.eventType}` as TimelineEntryType, filter: 'stops',
      ts: ev.occurredAt, emoji: LIFECYCLE_EMOJI[ev.eventType] ?? '📍',
      label: LIFECYCLE_LABEL[ev.eventType] ?? ev.eventType,
      detail: ev.notes ?? `Stop #${ev.stopSequence}`,
      stopId: ev.stopId,
    })
  }

  // ── Expenses ────────────────────────────────────────────────────────────────
  for (const ex of expenses) {
    entries.push({
      id: `exp-${ex.id}`, type: 'expense', filter: 'expenses',
      ts: ex.occurredAt ?? ex.date,
      emoji: '💰', label: ex.category,
      detail: ex.description || ex.location,
      subDetail: `$${ex.amount.toFixed(2)}${ex.movementMode ? ` · ${ex.movementMode}` : ''}`,
    })
  }

  // ── Fuel entries ────────────────────────────────────────────────────────────
  for (const f of fuel) {
    entries.push({
      id: `fuel-${f.id}`, type: 'fuel', filter: 'fuel',
      ts: f.occurredAt, emoji: '⛽', label: 'Diesel',
      detail: f.location,
      subDetail: `${f.gallons.toFixed(1)} gal @ $${f.pricePerGal.toFixed(3)} = $${f.totalCost.toFixed(2)}${f.movementMode !== 'loaded' ? ` · ${f.movementMode}` : ''}`,
    })
  }

  // ── Operational events ──────────────────────────────────────────────────────
  for (const ev of events) {
    entries.push({
      id: `ev-${ev.id}`, type: 'alert', filter: 'alerts',
      ts: ev.occurredAt ?? ev.createdAt,
      emoji: SEVERITY_EMOJI[ev.severity] ?? '🔔',
      label: ev.eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      detail: ev.notes ?? ev.location ?? ev.eventType,
      subDetail: ev.location ?? undefined,
      severity: ev.severity,
    })
  }

  // ── Docs ────────────────────────────────────────────────────────────────────
  for (const doc of docs) {
    const docEmoji = { bol:'📄', rate_con:'📑', pod:'✅', lumper_receipt:'💵', scale_ticket:'⚖️', fuel_receipt:'⛽', inspection:'🔍', incident:'🚨', other:'📎' }[doc.docType] ?? '📎'
    entries.push({
      id: `doc-${doc.id}`, type: 'doc', filter: 'docs',
      ts: doc.occurredAt ?? doc.loggedAt,
      emoji: docEmoji, label: doc.docType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      detail: doc.fileName ?? doc.notes ?? doc.docType,
      stopId: doc.stopId,
    })
  }

  // ── Trip review ─────────────────────────────────────────────────────────────
  if (mission.tripReview?.reviewedAt) entries.push({
    id: 'trip-review', type: 'review_complete', filter: 'all',
    ts: mission.tripReview.reviewedAt, emoji: '🏁', label: 'Review Complete',
    detail: `${mission.tripReview.driverRating}★ — ${mission.tripReview.wouldRunAgain ? 'Would run again' : 'Would not run again'}`,
    subDetail: mission.tripReview.notes || undefined,
  })

  // ── Filter and sort ─────────────────────────────────────────────────────────
  const filtered = filter === 'all' ? entries : entries.filter(e => e.filter === filter || e.filter === 'all')
  return filtered.sort((a, b) => a.ts.localeCompare(b.ts))
}
