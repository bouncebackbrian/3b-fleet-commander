'use client'
/**
 * escalationEngine.ts — Escalation Engine + Driver Stall Prevention
 *
 * Tiered escalation state machine: L0 (autonomous AI monitoring) →
 * L1 (dispatcher notification) → L2 (management) → L3 (leadership).
 *
 * Stall Prevention Doctrine:
 *   Green  (0–19 min)   → L0: AI watching, no human action needed
 *   Yellow (20–29 min)  → L1: dispatcher auto-notified
 *   Orange (30–59 min)  → L2: management notified, driver contact required
 *   Red    (60+ min)    → L3: leadership loop, load-rescue evaluation
 *
 * Notification layer:
 *   Channels are pluggable. The engine stores outbound notification records;
 *   actual delivery is via the NEXT_PUBLIC_NOTIFY_ENDPOINT env var or silent
 *   mock in dev. This keeps the engine browser-safe (no Node SDK calls).
 *
 * LS keys:
 *   3b-escalation-tiers    — EscalationTierRecord[]  (max 300)
 *   3b-stall-escalations   — StallEscalation[]       (max 200)
 *   3b-notifications       — NotificationRecord[]    (max 500)
 *   3b-escalation-contacts — EscalationContact[]     (team config)
 */

import type { StallRiskLevel } from '@/lib/loadHealthEngine'
import { logEscalationEvent, logStallEvent } from '@/lib/opsEventLog'

// ── Escalation tiers ──────────────────────────────────────────────────────────

export type EscalationTier = 'L0' | 'L1' | 'L2' | 'L3'

export interface EscalationTierMeta {
  tier:              EscalationTier
  label:             string
  description:       string
  emoji:             string
  color:             string
  bg:                string
  border:            string
  // Who gets notified
  notifyRoles:       EscalationRole[]
  // How long at this tier before auto-escalating (null = does not auto-escalate)
  autoEscalateAfterMins: number | null
  // Required action before closing
  requiresHumanAction: boolean
}

export type EscalationRole = 'ai_monitor' | 'dispatcher' | 'manager' | 'leadership' | 'driver'

export const TIER_META: Record<EscalationTier, EscalationTierMeta> = {
  L0: {
    tier: 'L0', label: 'AI Monitoring',  emoji: '🛰',
    description: 'Autonomous monitoring — no immediate human action required. AI is tracking load health and stall risk.',
    color: 'var(--primary)', bg: 'rgba(0,232,176,.06)',  border: 'rgba(0,232,176,.2)',
    notifyRoles: ['ai_monitor'],
    autoEscalateAfterMins: 20,   // escalate to L1 after 20 min without update
    requiresHumanAction: false,
  },
  L1: {
    tier: 'L1', label: 'Dispatcher Alert', emoji: '📡',
    description: 'Dispatcher notified. Driver check-in required. No response within 15 min escalates to L2.',
    color: 'var(--warn)', bg: 'rgba(245,194,0,.08)', border: 'rgba(245,194,0,.25)',
    notifyRoles: ['dispatcher', 'driver'],
    autoEscalateAfterMins: 15,
    requiresHumanAction: true,
  },
  L2: {
    tier: 'L2', label: 'Management Alert', emoji: '📞',
    description: 'Management notified. Driver contact required. Load recovery options being evaluated.',
    color: '#f97316', bg: 'rgba(249,115,22,.09)', border: 'rgba(249,115,22,.3)',
    notifyRoles: ['dispatcher', 'manager', 'driver'],
    autoEscalateAfterMins: 30,
    requiresHumanAction: true,
  },
  L3: {
    tier: 'L3', label: 'Leadership Loop', emoji: '🚨',
    description: 'Leadership engaged. Full incident response active. Load rescue / reassignment authorized.',
    color: 'var(--error)', bg: 'rgba(232,64,0,.1)', border: 'rgba(232,64,0,.4)',
    notifyRoles: ['dispatcher', 'manager', 'leadership', 'driver'],
    autoEscalateAfterMins: null,
    requiresHumanAction: true,
  },
}

// Stall risk → default starting tier
export const STALL_TO_TIER: Record<StallRiskLevel, EscalationTier> = {
  green:  'L0',
  yellow: 'L1',
  orange: 'L2',
  red:    'L3',
}

// ── Escalation tier record ────────────────────────────────────────────────────

export type EscalationTierStatus = 'active' | 'resolved' | 'escalated' | 'dismissed'

export interface EscalationTierRecord {
  id:           string
  loadNumber:   string
  tier:         EscalationTier
  triggerType:  string          // e.g. 'stall_orange', 'hos_infeasible', 'manual'
  triggerDetail?: string
  startedAt:    string          // ISO
  resolvedAt?:  string
  resolution?:  string
  escalatedAt?: string          // when it was promoted to next tier
  escalatedTo?: EscalationTier
  status:       EscalationTierStatus
  ownedBy?:     string
  actions:      EscalationAction[]
  notificationsSent: string[]   // notification IDs
}

export interface EscalationAction {
  id:        string
  actor:     string
  role:      EscalationRole
  action:    string
  note:      string
  timestamp: string
}

// ── Stall escalation tracker ──────────────────────────────────────────────────

export interface StallEscalation {
  id:           string
  loadNumber:   string
  driverName?:  string
  stallStartedAt:  string    // ISO — when stall threshold crossed
  currentTier:     EscalationTier
  stallMinutes:    number
  lastCheckedAt:   string
  resolved:        boolean
  resolvedAt?:     string
  resolution?:     string
  tierHistory:     { tier: EscalationTier; at: string }[]
}

// ── Notification records ──────────────────────────────────────────────────────

export type NotificationChannel = 'in_app' | 'teams' | 'sms' | 'slack' | 'email'
export type NotificationStatus  = 'pending' | 'sent' | 'delivered' | 'failed'

export interface NotificationRecord {
  id:           string
  escalationId: string
  loadNumber:   string
  tier:         EscalationTier
  channel:      NotificationChannel
  recipient:    string      // name or phone/email
  role:         EscalationRole
  subject:      string
  body:         string
  sentAt?:      string
  status:       NotificationStatus
  error?:       string
}

// ── Contact config ────────────────────────────────────────────────────────────

export interface EscalationContact {
  id:       string
  name:     string
  role:     EscalationRole
  channels: NotificationChannel[]
  phone?:   string
  email?:   string
  teamsId?: string
}

// ── LS keys ───────────────────────────────────────────────────────────────────

const LS_TIER_RECORDS = '3b-escalation-tiers'
const LS_STALLS       = '3b-stall-escalations'
const LS_NOTIFS       = '3b-notifications'
const LS_CONTACTS     = '3b-escalation-contacts'

const MAX_TIER_RECORDS = 300
const MAX_STALLS       = 200
const MAX_NOTIFS       = 500

// ── Tier record CRUD ──────────────────────────────────────────────────────────

export function readTierRecords(loadNumber?: string): EscalationTierRecord[] {
  try {
    const all: EscalationTierRecord[] = JSON.parse(localStorage.getItem(LS_TIER_RECORDS) ?? '[]')
    return loadNumber ? all.filter(r => r.loadNumber === loadNumber) : all
  } catch { return [] }
}

export function saveTierRecord(rec: EscalationTierRecord): void {
  try {
    const all = readTierRecords()
    const idx = all.findIndex(r => r.id === rec.id)
    if (idx >= 0) all[idx] = rec
    else all.unshift(rec)
    localStorage.setItem(LS_TIER_RECORDS, JSON.stringify(all.slice(0, MAX_TIER_RECORDS)))
  } catch { /* storage full */ }
}

export function getActiveTierRecord(loadNumber: string): EscalationTierRecord | null {
  return readTierRecords(loadNumber).find(r => r.status === 'active') ?? null
}

// ── Open escalation ───────────────────────────────────────────────────────────

export function openEscalation(opts: {
  loadNumber:    string
  tier:          EscalationTier
  triggerType:   string
  triggerDetail?: string
  ownedBy?:      string
}): EscalationTierRecord {
  // Close any existing active escalation for this load
  const existing = getActiveTierRecord(opts.loadNumber)
  if (existing) {
    saveTierRecord({ ...existing, status: 'escalated', escalatedAt: new Date().toISOString(), escalatedTo: opts.tier })
  }

  const rec: EscalationTierRecord = {
    id:           crypto.randomUUID(),
    loadNumber:   opts.loadNumber,
    tier:         opts.tier,
    triggerType:  opts.triggerType,
    triggerDetail: opts.triggerDetail,
    startedAt:    new Date().toISOString(),
    status:       'active',
    ownedBy:      opts.ownedBy,
    actions:      [],
    notificationsSent: [],
  }
  saveTierRecord(rec)

  // Queue notifications for roles at this tier
  const notifications = buildNotifications(rec)
  for (const n of notifications) saveNotification(n)
  rec.notificationsSent = notifications.map(n => n.id)
  saveTierRecord(rec)

  // Send (fire-and-forget to notify endpoint)
  dispatchNotifications(notifications)

  // Log to unified ops event log
  logEscalationEvent({
    eventType:    'escalation_opened',
    loadNumber:   opts.loadNumber,
    actor:        opts.ownedBy,
    title:        `Escalation opened at ${opts.tier} — ${TIER_META[opts.tier].label}`,
    body:         opts.triggerDetail ?? opts.triggerType,
    payload:      { tier: opts.tier, triggerType: opts.triggerType, triggerDetail: opts.triggerDetail, ownedBy: opts.ownedBy },
  })

  return rec
}

// ── Escalate tier ─────────────────────────────────────────────────────────────

export function escalateTier(
  escalationId: string,
  reason: string,
  actor: string = 'system',
): EscalationTierRecord | null {
  const all = readTierRecords()
  const idx = all.findIndex(r => r.id === escalationId)
  if (idx < 0) return null

  const current = all[idx]
  const tierOrder: EscalationTier[] = ['L0', 'L1', 'L2', 'L3']
  const nextIdx = tierOrder.indexOf(current.tier) + 1
  if (nextIdx >= tierOrder.length) return current   // already L3

  const nextTier = tierOrder[nextIdx]
  const action: EscalationAction = {
    id: crypto.randomUUID(), actor, role: 'ai_monitor',
    action: 'escalated', note: reason, timestamp: new Date().toISOString(),
  }
  const updated: EscalationTierRecord = {
    ...current,
    tier:         nextTier,
    escalatedAt:  new Date().toISOString(),
    escalatedTo:  nextTier,
    actions:      [...current.actions, action],
    status:       'active',
  }
  all[idx] = updated
  localStorage.setItem(LS_TIER_RECORDS, JSON.stringify(all.slice(0, MAX_TIER_RECORDS)))

  // Notify new tier roles
  const notifications = buildNotifications(updated)
  for (const n of notifications) saveNotification(n)
  dispatchNotifications(notifications)

  // Log to unified ops event log
  logEscalationEvent({
    eventType:    'escalation_escalated',
    loadNumber:   updated.loadNumber,
    actor,
    title:        `Escalation promoted to ${updated.tier} — ${TIER_META[updated.tier].label}`,
    body:         reason,
    payload:      { tier: updated.tier, triggerType: updated.triggerType, ownedBy: updated.ownedBy },
  })

  return updated
}

// ── Resolve escalation ────────────────────────────────────────────────────────

export function resolveEscalation(
  escalationId: string,
  actor:        string,
  resolution:   string,
): void {
  const all = readTierRecords()
  const idx = all.findIndex(r => r.id === escalationId)
  if (idx < 0) return
  const action: EscalationAction = {
    id: crypto.randomUUID(), actor, role: 'dispatcher',
    action: 'resolved', note: resolution, timestamp: new Date().toISOString(),
  }
  const resolved = {
    ...all[idx],
    status:     'resolved' as const,
    resolvedAt: new Date().toISOString(),
    resolution,
    actions:    [...all[idx].actions, action],
  }
  all[idx] = resolved
  localStorage.setItem(LS_TIER_RECORDS, JSON.stringify(all.slice(0, MAX_TIER_RECORDS)))

  // Log to unified ops event log
  logEscalationEvent({
    eventType:    'escalation_resolved',
    loadNumber:   resolved.loadNumber,
    actor,
    title:        `Escalation resolved at ${resolved.tier}`,
    body:         resolution,
    payload:      { tier: resolved.tier, triggerType: resolved.triggerType, ownedBy: resolved.ownedBy },
  })
}

// ── Log action on escalation ──────────────────────────────────────────────────

export function logEscalationAction(
  escalationId: string,
  actor:        string,
  role:         EscalationRole,
  action:       string,
  note:         string,
): void {
  const all = readTierRecords()
  const idx = all.findIndex(r => r.id === escalationId)
  if (idx < 0) return
  const a: EscalationAction = {
    id: crypto.randomUUID(), actor, role, action, note, timestamp: new Date().toISOString(),
  }
  all[idx] = { ...all[idx], actions: [...all[idx].actions, a] }
  localStorage.setItem(LS_TIER_RECORDS, JSON.stringify(all.slice(0, MAX_TIER_RECORDS)))
}

// ── Auto-escalation check ─────────────────────────────────────────────────────

/**
 * Called periodically (from component interval or page-level polling).
 * Checks if any active escalation has exceeded its auto-escalate window.
 */
export function runAutoEscalationCheck(): void {
  const activeRecords = readTierRecords().filter(r => r.status === 'active')
  const now = Date.now()
  for (const rec of activeRecords) {
    const meta = TIER_META[rec.tier]
    if (!meta.autoEscalateAfterMins) continue
    const elapsedMins = Math.round((now - new Date(rec.startedAt).getTime()) / 60000)
    if (elapsedMins >= meta.autoEscalateAfterMins) {
      escalateTier(rec.id, `Auto-escalated after ${elapsedMins}m at ${rec.tier} — no resolution`, 'system')
    }
  }
}

// ── Stall escalation CRUD ─────────────────────────────────────────────────────

export function readStallEscalations(): StallEscalation[] {
  try { return JSON.parse(localStorage.getItem(LS_STALLS) ?? '[]') }
  catch { return [] }
}

export function saveStallEscalation(s: StallEscalation): void {
  try {
    const all = readStallEscalations()
    const idx = all.findIndex(e => e.id === s.id)
    if (idx >= 0) all[idx] = s
    else all.unshift(s)
    localStorage.setItem(LS_STALLS, JSON.stringify(all.slice(0, MAX_STALLS)))
  } catch { /* storage full */ }
}

export function getActiveStallEscalation(loadNumber: string): StallEscalation | null {
  return readStallEscalations().find(s => s.loadNumber === loadNumber && !s.resolved) ?? null
}

/**
 * Update stall escalation tier based on current stall minutes.
 * Called from DispatchOpsPanel every 60 s.
 */
export function updateStallEscalation(
  loadNumber:   string,
  stallMinutes: number,
  driverName?:  string,
): StallEscalation {
  const tier = stallMinutes >= 60 ? 'L3' : stallMinutes >= 30 ? 'L2' : stallMinutes >= 20 ? 'L1' : 'L0'
  const now  = new Date().toISOString()
  const existing = getActiveStallEscalation(loadNumber)

  if (!existing) {
    // First time tracking this load's stall
    const s: StallEscalation = {
      id: crypto.randomUUID(),
      loadNumber, driverName,
      stallStartedAt: now,
      currentTier: tier,
      stallMinutes,
      lastCheckedAt: now,
      resolved: false,
      tierHistory: [{ tier, at: now }],
    }
    saveStallEscalation(s)
    // Open a tier record if L1+
    if (tier !== 'L0') openEscalation({ loadNumber, tier, triggerType: 'stall_detection', triggerDetail: `${stallMinutes}m without update` })
    // Log stall detection to ops event log
    if (tier !== 'L0') {
      logStallEvent({
        eventType: 'stall_detected',
        loadNumber,
        driverName,
        title: `Stall detected at ${tier} — ${stallMinutes}m without update`,
        payload: { stallMinutes, stallRisk: tier },
      })
    }
    return s
  }

  // Tier escalated?
  const tierOrder: EscalationTier[] = ['L0', 'L1', 'L2', 'L3']
  const prevTierIdx = tierOrder.indexOf(existing.currentTier)
  const newTierIdx  = tierOrder.indexOf(tier)

  const tierHistory = existing.tierHistory
  if (newTierIdx > prevTierIdx) {
    tierHistory.push({ tier, at: now })
    // Open / escalate the tier record
    const activeRec = getActiveTierRecord(loadNumber)
    if (activeRec) escalateTier(activeRec.id, `Stall progressed to ${tier} — ${stallMinutes}m`, 'system')
    else openEscalation({ loadNumber, tier, triggerType: 'stall_detection', triggerDetail: `${stallMinutes}m without update` })
  }

  const updated: StallEscalation = {
    ...existing,
    currentTier: tier,
    stallMinutes,
    lastCheckedAt: now,
    tierHistory,
    driverName: driverName ?? existing.driverName,
  }
  saveStallEscalation(updated)
  return updated
}

export function resolveStallEscalation(loadNumber: string, resolution: string): void {
  const s = getActiveStallEscalation(loadNumber)
  if (!s) return
  saveStallEscalation({ ...s, resolved: true, resolvedAt: new Date().toISOString(), resolution })
  // Also resolve any active tier record
  const rec = getActiveTierRecord(loadNumber)
  if (rec) resolveEscalation(rec.id, 'system', resolution)
  // Log to ops event log
  logStallEvent({
    eventType: 'stall_resolved',
    loadNumber,
    driverName: s.driverName,
    title: `Stall resolved — ${s.stallMinutes}m`,
    body: resolution,
    payload: { stallMinutes: s.stallMinutes, stallRisk: s.currentTier },
  })
}

// ── Notification CRUD ─────────────────────────────────────────────────────────

export function readNotifications(loadNumber?: string): NotificationRecord[] {
  try {
    const all: NotificationRecord[] = JSON.parse(localStorage.getItem(LS_NOTIFS) ?? '[]')
    return loadNumber ? all.filter(n => n.loadNumber === loadNumber) : all
  } catch { return [] }
}

export function saveNotification(n: NotificationRecord): void {
  try {
    const all = readNotifications()
    const idx = all.findIndex(r => r.id === n.id)
    if (idx >= 0) all[idx] = n
    else all.unshift(n)
    localStorage.setItem(LS_NOTIFS, JSON.stringify(all.slice(0, MAX_NOTIFS)))
  } catch { /* storage full */ }
}

// ── Build notifications from tier record ──────────────────────────────────────

function buildNotifications(rec: EscalationTierRecord): NotificationRecord[] {
  const contacts  = readContacts()
  const meta      = TIER_META[rec.tier]
  const subject   = `[${rec.tier}] ${meta.emoji} ${meta.label} — Load #${rec.loadNumber}`
  const body      = `${meta.description}\n\nLoad: #${rec.loadNumber}\nTrigger: ${rec.triggerDetail ?? rec.triggerType}\nTime: ${new Date(rec.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

  const notifs: NotificationRecord[] = []
  for (const role of meta.notifyRoles) {
    if (role === 'ai_monitor') continue  // L0 internal only
    const roleContacts = contacts.filter(c => c.role === role)
    for (const contact of roleContacts) {
      for (const channel of contact.channels) {
        notifs.push({
          id:           crypto.randomUUID(),
          escalationId: rec.id,
          loadNumber:   rec.loadNumber,
          tier:         rec.tier,
          channel,
          recipient:    contact.name,
          role,
          subject,
          body,
          status:       'pending',
        })
      }
    }
  }
  return notifs
}

// ── Contacts CRUD ─────────────────────────────────────────────────────────────

export function readContacts(): EscalationContact[] {
  try { return JSON.parse(localStorage.getItem(LS_CONTACTS) ?? '[]') }
  catch { return [] }
}

export function saveContacts(contacts: EscalationContact[]): void {
  try { localStorage.setItem(LS_CONTACTS, JSON.stringify(contacts)) }
  catch { /* ignore */ }
}

export function upsertContact(c: EscalationContact): void {
  const all = readContacts()
  const idx = all.findIndex(r => r.id === c.id)
  if (idx >= 0) all[idx] = c
  else all.push(c)
  saveContacts(all)
}

export function removeContact(id: string): void {
  saveContacts(readContacts().filter(c => c.id !== id))
}

// ── Notification dispatch (fire-and-forget) ───────────────────────────────────

/**
 * Attempts to deliver notifications via NEXT_PUBLIC_NOTIFY_ENDPOINT.
 * Silently fails in dev (no endpoint configured).
 * Never throws — localStorage remains the source of truth.
 */
async function dispatchNotifications(notifications: NotificationRecord[]): Promise<void> {
  const endpoint = typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_NOTIFY_ENDPOINT ?? '')
    : ''

  if (!endpoint) {
    // Dev/offline: mark as sent (mock delivery)
    for (const n of notifications) {
      saveNotification({ ...n, status: 'sent', sentAt: new Date().toISOString() })
    }
    return
  }

  for (const n of notifications) {
    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(n),
      })
      saveNotification({
        ...n,
        status: res.ok ? 'delivered' : 'failed',
        sentAt: new Date().toISOString(),
        error:  res.ok ? undefined : `HTTP ${res.status}`,
      })
    } catch (err) {
      saveNotification({
        ...n,
        status: 'failed',
        error:  err instanceof Error ? err.message : 'Network error',
      })
    }
  }
}

// ── Summary helpers ───────────────────────────────────────────────────────────

export interface EscalationSummary {
  openCount:    number
  l1Count:      number
  l2Count:      number
  l3Count:      number
  activeStalls: number
  topTier:      EscalationTier | null
}

export function buildEscalationSummary(): EscalationSummary {
  const open  = readTierRecords().filter(r => r.status === 'active')
  const stalls = readStallEscalations().filter(s => !s.resolved)
  const l1 = open.filter(r => r.tier === 'L1').length
  const l2 = open.filter(r => r.tier === 'L2').length
  const l3 = open.filter(r => r.tier === 'L3').length
  const topTier = l3 > 0 ? 'L3' : l2 > 0 ? 'L2' : l1 > 0 ? 'L1' : open.length > 0 ? 'L0' : null
  return { openCount: open.length, l1Count: l1, l2Count: l2, l3Count: l3, activeStalls: stalls.length, topTier }
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function tierLabel(tier: EscalationTier): string {
  return TIER_META[tier].label
}

export function tierColor(tier: EscalationTier): string {
  return TIER_META[tier].color
}

export function elapsedLabel(startedAt: string): string {
  const diff = Date.now() - new Date(startedAt).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60), m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
