'use client'
/**
 * driverOpsEngine.ts — DriverOps AI v2
 *
 * Movement-aware operational mode state machine for the driver cockpit.
 * Tracks what the driver is actually doing right now — driving, fueling,
 * on a break, at a pickup/delivery, parked, or in emergency — and surfaces
 * the right information and timers for each mode.
 *
 * Architecture:
 *   - Two-track (same principle as recoveryEngine):
 *       Compliance layer → HOSDisplay (untouched, purely read)
 *       Operational layer → mode timers, detention clock, fuel stop tracking
 *   - Auto-detection: infers mode from the last DriverUpdate type
 *   - Manual override: driver can tap a mode chip to set it explicitly
 *   - Timers: each mode has a natural duration; countdown is shown in UI
 *
 * LS keys:
 *   3b-ops-mode        — ActiveModeSession  (current mode + start time)
 *   3b-ops-mode-history — ModeSession[]     (last 100 completed sessions)
 *   3b-detention-clock  — DetentionClock    (active detention tracking)
 */

import { readDriverUpdates, type UpdateType } from '@/lib/dispatchEngine'

// ── Operational modes ─────────────────────────────────────────────────────────

export type OperationalMode =
  | 'driving'
  | 'fuel_stop'
  | 'break_30'         // mandatory 30-min break
  | 'break_10h'        // 10-hour overnight rest
  | 'pickup'           // at shipper / loading
  | 'delivery'         // at receiver / unloading
  | 'scale'            // at weigh station
  | 'parking'          // parked / planned rest
  | 'breakdown'        // mechanical / emergency stop
  | 'severe_weather'   // sheltered from weather

export type ModeCategory = 'moving' | 'planned_stop' | 'facility' | 'emergency'

export interface OperationalModeMeta {
  label:          string
  emoji:          string
  color:          string
  bg:             string
  border:         string
  category:       ModeCategory
  // Suggested duration in minutes (null = indefinite)
  suggestedMins:  number | null
  // Auto-detected from these update types
  triggeredBy:    UpdateType[]
  // Show which timers in the UI
  showTimer:      boolean
  showDetention:  boolean
  showBreakTimer: boolean
}

export const MODE_META: Record<OperationalMode, OperationalModeMeta> = {
  driving: {
    label: 'Driving',           emoji: '🚛',
    color: 'var(--primary)',    bg: 'rgba(0,232,176,.07)',  border: 'rgba(0,232,176,.25)',
    category: 'moving',
    suggestedMins: null,
    triggeredBy: ['departed', 'break_ended'],
    showTimer: true, showDetention: false, showBreakTimer: false,
  },
  fuel_stop: {
    label: 'Fuel Stop',         emoji: '⛽',
    color: '#38bdf8',           bg: 'rgba(56,189,248,.07)', border: 'rgba(56,189,248,.25)',
    category: 'planned_stop',
    suggestedMins: 30,
    triggeredBy: ['fuel_stop'],
    showTimer: true, showDetention: false, showBreakTimer: false,
  },
  break_30: {
    label: '30-Min Break',      emoji: '⏸',
    color: 'var(--warn)',       bg: 'rgba(245,194,0,.07)',  border: 'rgba(245,194,0,.25)',
    category: 'planned_stop',
    suggestedMins: 30,
    triggeredBy: ['break_started'],
    showTimer: true, showDetention: false, showBreakTimer: true,
  },
  break_10h: {
    label: '10-Hour Rest',      emoji: '😴',
    color: '#a78bfa',           bg: 'rgba(167,139,250,.07)', border: 'rgba(167,139,250,.25)',
    category: 'planned_stop',
    suggestedMins: 600,
    triggeredBy: ['break_started', 'hos_update'],
    showTimer: true, showDetention: false, showBreakTimer: true,
  },
  pickup: {
    label: 'At Pickup',         emoji: '📦',
    color: '#fb923c',           bg: 'rgba(251,146,60,.07)', border: 'rgba(251,146,60,.25)',
    category: 'facility',
    suggestedMins: 120,         // 2-hour free time window
    triggeredBy: ['arrived_pickup', 'loaded'],
    showTimer: true, showDetention: true, showBreakTimer: false,
  },
  delivery: {
    label: 'At Delivery',       emoji: '🏁',
    color: '#34d399',           bg: 'rgba(52,211,153,.07)', border: 'rgba(52,211,153,.25)',
    category: 'facility',
    suggestedMins: 120,
    triggeredBy: ['delivered'],
    showTimer: true, showDetention: true, showBreakTimer: false,
  },
  scale: {
    label: 'Weigh Station',     emoji: '⚖️',
    color: '#94a3b8',           bg: 'rgba(148,163,184,.07)', border: 'rgba(148,163,184,.25)',
    category: 'planned_stop',
    suggestedMins: 15,
    triggeredBy: [],
    showTimer: true, showDetention: false, showBreakTimer: false,
  },
  parking: {
    label: 'Parked',            emoji: '🅿️',
    color: '#94a3b8',           bg: 'rgba(148,163,184,.07)', border: 'rgba(148,163,184,.25)',
    category: 'planned_stop',
    suggestedMins: null,
    triggeredBy: ['break_started'],
    showTimer: true, showDetention: false, showBreakTimer: false,
  },
  breakdown: {
    label: 'Breakdown',         emoji: '🚨',
    color: 'var(--error)',      bg: 'rgba(232,64,0,.1)',    border: 'rgba(232,64,0,.4)',
    category: 'emergency',
    suggestedMins: null,
    triggeredBy: ['accident_incident', 'issue_reported'],
    showTimer: true, showDetention: false, showBreakTimer: false,
  },
  severe_weather: {
    label: 'Weather Hold',      emoji: '⛈',
    color: 'var(--warn)',       bg: 'rgba(245,194,0,.1)',   border: 'rgba(245,194,0,.35)',
    category: 'emergency',
    suggestedMins: null,
    triggeredBy: [],
    showTimer: true, showDetention: false, showBreakTimer: false,
  },
}

// ── Mode session ──────────────────────────────────────────────────────────────

export interface ActiveModeSession {
  mode:         OperationalMode
  startedAt:    string       // ISO
  loadNumber?:  string
  location?:    string
  notes?:       string
  // Manually set or auto-detected
  source:       'auto' | 'manual'
}

export interface ModeSession extends ActiveModeSession {
  endedAt:      string
  durationMins: number
}

// ── Detention clock ───────────────────────────────────────────────────────────

export interface DetentionClock {
  loadNumber:   string
  startedAt:    string     // ISO — when 2-hour free time expired
  freeTimeMins: number     // standard: 120
  endedAt?:     string
  totalMins?:   number
}

// ── Derived ops status ────────────────────────────────────────────────────────

export interface OpsStatus {
  mode:              OperationalMode
  meta:              OperationalModeMeta
  elapsedMins:       number
  remainingMins:     number | null   // null if indefinite mode
  progressPct:       number | null   // null if no suggestedMins
  timerLabel:        string          // "18:34" or "2h 12m elapsed" etc.
  isOverdue:         boolean         // elapsed > suggestedMins
  detention:         DetentionStatus | null
  breakCountdown:    BreakCountdown | null
}

export interface DetentionStatus {
  active:       boolean
  elapsedMins:  number
  freeTimeUsed: boolean   // true once the 2-hour window expired
  detentionMins: number   // only counts after free time
  hourlyRate?:  number    // detention rate if configured
}

export interface BreakCountdown {
  targetMins:  number    // required break duration
  elapsedMins: number
  remainingMins: number
  complete:    boolean
  pct:         number
}

// ── LS keys ───────────────────────────────────────────────────────────────────

const LS_MODE         = '3b-ops-mode'
const LS_MODE_HISTORY = '3b-ops-mode-history'
const LS_DETENTION    = '3b-detention-clock'

// ── Mode persistence ──────────────────────────────────────────────────────────

export function readActiveMode(): ActiveModeSession | null {
  try { return JSON.parse(localStorage.getItem(LS_MODE) ?? 'null') }
  catch { return null }
}

export function saveActiveMode(session: ActiveModeSession): void {
  try { localStorage.setItem(LS_MODE, JSON.stringify(session)) }
  catch { /* ignore */ }
}

export function clearActiveMode(): void {
  try { localStorage.removeItem(LS_MODE) } catch { /* ignore */ }
}

export function readModeHistory(): ModeSession[] {
  try { return JSON.parse(localStorage.getItem(LS_MODE_HISTORY) ?? '[]') }
  catch { return [] }
}

function archiveModeSession(ending: ActiveModeSession): void {
  try {
    const endedAt     = new Date().toISOString()
    const durationMins = Math.round((Date.now() - new Date(ending.startedAt).getTime()) / 60000)
    const completed: ModeSession = { ...ending, endedAt, durationMins }
    const history = readModeHistory()
    history.unshift(completed)
    localStorage.setItem(LS_MODE_HISTORY, JSON.stringify(history.slice(0, 100)))
  } catch { /* ignore */ }
}

// ── Mode transition ───────────────────────────────────────────────────────────

export function setOperationalMode(
  mode: OperationalMode,
  opts: { loadNumber?: string; location?: string; notes?: string; source?: 'auto' | 'manual' } = {}
): ActiveModeSession {
  // Archive the current session before switching
  const current = readActiveMode()
  if (current && current.mode !== mode) archiveModeSession(current)

  const session: ActiveModeSession = {
    mode,
    startedAt:  new Date().toISOString(),
    loadNumber: opts.loadNumber,
    location:   opts.location,
    notes:      opts.notes,
    source:     opts.source ?? 'manual',
  }
  saveActiveMode(session)
  return session
}

// ── Auto-detection from driver updates ───────────────────────────────────────

/**
 * Infer operational mode from the most recent driver update type.
 * Returns null if the current mode is still appropriate.
 */
export function autoDetectMode(loadNumber?: string): OperationalMode | null {
  try {
    const updates = readDriverUpdates(loadNumber)
    if (updates.length === 0) return null
    const latest = updates[0]

    for (const [mode, meta] of Object.entries(MODE_META) as [OperationalMode, OperationalModeMeta][]) {
      if (meta.triggeredBy.includes(latest.type)) {
        return mode
      }
    }
    return null
  } catch { return null }
}

/**
 * Get or initialise the current mode session.
 * Attempts auto-detection first, falls back to 'driving'.
 */
export function getOrInitMode(loadNumber?: string): ActiveModeSession {
  const existing = readActiveMode()
  if (existing) return existing

  const detected = autoDetectMode(loadNumber)
  return setOperationalMode(detected ?? 'driving', { loadNumber, source: 'auto' })
}

// ── Detention clock ───────────────────────────────────────────────────────────

export function readDetentionClock(): DetentionClock | null {
  try { return JSON.parse(localStorage.getItem(LS_DETENTION) ?? 'null') }
  catch { return null }
}

export function startDetentionClock(loadNumber: string, freeTimeMins = 120): DetentionClock {
  const clock: DetentionClock = {
    loadNumber,
    startedAt:    new Date().toISOString(),
    freeTimeMins,
  }
  try { localStorage.setItem(LS_DETENTION, JSON.stringify(clock)) }
  catch { /* ignore */ }
  return clock
}

export function endDetentionClock(): DetentionClock | null {
  try {
    const clock = readDetentionClock()
    if (!clock) return null
    const endedAt  = new Date().toISOString()
    const totalMins = Math.round((Date.now() - new Date(clock.startedAt).getTime()) / 60000)
    const updated: DetentionClock = { ...clock, endedAt, totalMins }
    localStorage.setItem(LS_DETENTION, JSON.stringify(updated))
    return updated
  } catch { return null }
}

// ── Detention status derivation ───────────────────────────────────────────────

function deriveDetentionStatus(clock: DetentionClock): DetentionStatus {
  const elapsedMins   = Math.round((Date.now() - new Date(clock.startedAt).getTime()) / 60000)
  const freeTimeUsed  = elapsedMins > clock.freeTimeMins
  const detentionMins = Math.max(0, elapsedMins - clock.freeTimeMins)
  return { active: !clock.endedAt, elapsedMins, freeTimeUsed, detentionMins }
}

// ── Break countdown derivation ────────────────────────────────────────────────

function deriveBreakCountdown(mode: OperationalMode, startedAt: string): BreakCountdown | null {
  const meta = MODE_META[mode]
  if (!meta.showBreakTimer || !meta.suggestedMins) return null
  const elapsedMins   = Math.round((Date.now() - new Date(startedAt).getTime()) / 60000)
  const remainingMins = Math.max(0, meta.suggestedMins - elapsedMins)
  const complete      = elapsedMins >= meta.suggestedMins
  const pct           = Math.min(100, Math.round((elapsedMins / meta.suggestedMins) * 100))
  return { targetMins: meta.suggestedMins, elapsedMins, remainingMins, complete, pct }
}

// ── Timer label ───────────────────────────────────────────────────────────────

function buildTimerLabel(mode: OperationalMode, elapsedMins: number, remainingMins: number | null): string {
  const fmtMins = (m: number) => {
    const h = Math.floor(m / 60), min = m % 60
    return h > 0 ? `${h}h ${min > 0 ? min + 'm' : ''}`.trim() : `${min}m`
  }

  if (mode === 'driving') {
    return `${fmtMins(elapsedMins)} driving`
  }
  if (remainingMins !== null && remainingMins > 0) {
    return `${fmtMins(remainingMins)} remaining`
  }
  if (remainingMins === 0) {
    return `Complete (${fmtMins(elapsedMins)} elapsed)`
  }
  return `${fmtMins(elapsedMins)} elapsed`
}

// ── Main derivation ───────────────────────────────────────────────────────────

export function deriveOpsStatus(session: ActiveModeSession): OpsStatus {
  const meta       = MODE_META[session.mode]
  const elapsedMins = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60000)

  const remainingMins = meta.suggestedMins !== null
    ? Math.max(0, meta.suggestedMins - elapsedMins)
    : null

  const progressPct = meta.suggestedMins !== null
    ? Math.min(100, Math.round((elapsedMins / meta.suggestedMins) * 100))
    : null

  const isOverdue = meta.suggestedMins !== null && elapsedMins > meta.suggestedMins

  const timerLabel = buildTimerLabel(session.mode, elapsedMins, remainingMins)

  // Detention — active if we're at a facility and clock is running
  let detention: DetentionStatus | null = null
  if (meta.showDetention) {
    const clock = readDetentionClock()
    if (clock && !clock.endedAt && clock.loadNumber === session.loadNumber) {
      detention = deriveDetentionStatus(clock)
    }
  }

  // Break countdown
  const breakCountdown = deriveBreakCountdown(session.mode, session.startedAt)

  return {
    mode: session.mode,
    meta,
    elapsedMins,
    remainingMins,
    progressPct,
    timerLabel,
    isOverdue,
    detention,
    breakCountdown,
  }
}

// ── Mode history analytics ────────────────────────────────────────────────────

export interface ModeTimeSummary {
  totalDrivingMins:  number
  totalBreakMins:    number
  totalFuelMins:     number
  totalFacilityMins: number
  avgDriveSegmentMins: number
  driveSegmentCount: number
}

export function buildModeTimeSummary(history: ModeSession[]): ModeTimeSummary {
  let totalDrivingMins  = 0
  let totalBreakMins    = 0
  let totalFuelMins     = 0
  let totalFacilityMins = 0
  let driveSegmentCount = 0

  for (const s of history) {
    const m = s.durationMins
    if (s.mode === 'driving') { totalDrivingMins += m; driveSegmentCount++ }
    else if (s.mode === 'break_30' || s.mode === 'break_10h' || s.mode === 'parking') totalBreakMins += m
    else if (s.mode === 'fuel_stop') totalFuelMins += m
    else if (s.mode === 'pickup' || s.mode === 'delivery') totalFacilityMins += m
  }

  return {
    totalDrivingMins,
    totalBreakMins,
    totalFuelMins,
    totalFacilityMins,
    avgDriveSegmentMins: driveSegmentCount > 0 ? Math.round(totalDrivingMins / driveSegmentCount) : 0,
    driveSegmentCount,
  }
}

// ── Quick-switch mode list (shown in cockpit buttons) ─────────────────────────

export const QUICK_SWITCH_MODES: OperationalMode[] = [
  'driving', 'fuel_stop', 'break_30', 'pickup', 'delivery', 'parking', 'breakdown', 'severe_weather',
]
