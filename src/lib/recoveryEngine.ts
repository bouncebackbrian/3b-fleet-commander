'use client'
/**
 * recoveryEngine.ts — Partial Recovery Credit & Adaptive Operational Cadence
 *
 * ARCHITECTURE:
 *   This is a PREFERENCE layer, not a compliance layer.
 *   Recovery credit may adjust suggested cadence — never legal HOS.
 *   DOT 30-min break, 10-hour reset, split sleeper: unchanged, untouchable.
 *
 * MODEL:
 *   Driving accumulates fatigue at 1.0 unit/minute.
 *   Each unplanned stop has a recovery coefficient (0.0 – 1.0).
 *   Effective credit = stop_duration_min × coefficient.
 *   Preferred stop suggested when net fatigue hits threshold (default 75).
 *   Suggested stop duration scales with fatigue level.
 *   Tone: "Suggested adjustment" — never "violation" or "failed cadence".
 *
 * SMART STOP CONSOLIDATION:
 *   Tracks upcoming stop opportunities (fuel, parking) and surfaces
 *   consolidated stop recommendations when practical.
 *
 * LS keys:
 *   3b-recovery-session   — RecoverySession (current driving session)
 *   3b-recovery-history   — RecoverySession[] (past sessions, max 30)
 *   3b-cadence-prefs      — CadencePreferences (driver-configured)
 */

// ── Stop type taxonomy ────────────────────────────────────────────────────────

export type StopType =
  | 'restroom'
  | 'stretch'
  | 'fuel'
  | 'fuel_walk'
  | 'meal'
  | 'inspection'
  | 'nap'
  | 'formal_break'   // 30+ min off-duty — full credit; may satisfy DOT 30
  | 'unloading'      // passive — HOS clock runs, minor fatigue benefit
  | 'traffic'        // passive — very minor benefit
  | 'other'

export type RecoveryCategory = 'passive' | 'light' | 'moderate' | 'high' | 'full'
export type FatigueLevel     = 'low' | 'moderate' | 'elevated' | 'high' | 'critical'

export interface StopTypeMeta {
  label:          string
  emoji:          string
  coefficient:    number         // 0.0 – 1.0: fraction of duration that counts as recovery
  category:       RecoveryCategory
  isDotEligible:  boolean        // can count toward DOT 30-min break if duration ≥ 30
  passive:        boolean        // HOS clock still runs during this stop
  suggestedMinDuration: number   // typical minimum useful duration
}

export const STOP_TYPE_META: Record<StopType, StopTypeMeta> = {
  restroom:      { label: 'Restroom',        emoji: '🚻', coefficient: 0.15, category: 'light',    isDotEligible: false, passive: false, suggestedMinDuration: 5  },
  stretch:       { label: 'Stretch Break',   emoji: '🤸', coefficient: 0.28, category: 'light',    isDotEligible: false, passive: false, suggestedMinDuration: 5  },
  fuel:          { label: 'Fuel Stop',       emoji: '⛽', coefficient: 0.32, category: 'moderate', isDotEligible: false, passive: false, suggestedMinDuration: 10 },
  fuel_walk:     { label: 'Fuel + Walking',  emoji: '🚶', coefficient: 0.48, category: 'moderate', isDotEligible: false, passive: false, suggestedMinDuration: 15 },
  inspection:    { label: 'Walkaround',      emoji: '🔍', coefficient: 0.22, category: 'light',    isDotEligible: false, passive: false, suggestedMinDuration: 8  },
  meal:          { label: 'Meal Stop',       emoji: '🍽️', coefficient: 0.62, category: 'high',     isDotEligible: true,  passive: false, suggestedMinDuration: 20 },
  nap:           { label: 'Nap',             emoji: '💤', coefficient: 0.90, category: 'high',     isDotEligible: true,  passive: false, suggestedMinDuration: 15 },
  formal_break:  { label: 'Full Break',      emoji: '✅', coefficient: 1.00, category: 'full',     isDotEligible: true,  passive: false, suggestedMinDuration: 30 },
  unloading:     { label: 'Unloading',       emoji: '📦', coefficient: 0.18, category: 'passive',  isDotEligible: false, passive: true,  suggestedMinDuration: 10 },
  traffic:       { label: 'Traffic Stop',    emoji: '🚦', coefficient: 0.08, category: 'passive',  isDotEligible: false, passive: true,  suggestedMinDuration: 5  },
  other:         { label: 'Other Stop',      emoji: '⏸️', coefficient: 0.22, category: 'light',    isDotEligible: false, passive: false, suggestedMinDuration: 5  },
}

// ── Cadence preferences ───────────────────────────────────────────────────────

export interface CadencePreferences {
  // Preferred stop cadence (preference layer only — NOT compliance)
  preferredDriveIntervalMin:  number   // default 90 — suggest a stop after this many net fatigue-equiv minutes
  preferredStopDurationMin:   number   // default 15 — base stop duration at suggestion
  fuelStackingEnabled:        boolean  // combine recovery + fuel stops when practical
  maxContinuousHoursGoal:     number   // personal goal, not legal limit (default 3h)
  // Recovery style
  style: 'aggressive'  // few long stops
       | 'balanced'    // default
       | 'high_freq'   // many short stops
}

export const DEFAULT_CADENCE_PREFS: CadencePreferences = {
  preferredDriveIntervalMin:  90,
  preferredStopDurationMin:   15,
  fuelStackingEnabled:        true,
  maxContinuousHoursGoal:     3,
  style:                      'balanced',
}

// ── Recovery events ───────────────────────────────────────────────────────────

export interface RecoveryEvent {
  id:              string
  stopType:        StopType
  startedAt:       string      // ISO — when the stop started
  durationMin:     number      // actual stop duration in minutes
  recoveryCredit:  number      // minutes of effective recovery earned (duration × coefficient)
  isDotBreak:      boolean     // true if this satisfies or contributes to DOT 30-min break
  passive:         boolean     // whether HOS clock was still running
  notes?:          string
  // Cadence context at time of stop
  fatigueAtStop:   number      // accumulated fatigue-equiv minutes when stop occurred
}

// ── Session ───────────────────────────────────────────────────────────────────

export interface RecoverySession {
  id:                   string
  sessionStart:         string       // ISO — when this driving session started
  drivingResumedAt:     string       // ISO — last time driving resumed after a stop
  events:               RecoveryEvent[]
  prefs:                CadencePreferences
  // Running totals
  totalDriveMinutes:    number       // actual driving time (not fatigue-equiv)
  totalRecoveryCredit:  number       // sum of all recovery credits earned
  dotBreakCreditMin:    number       // minutes accrued toward DOT 30 (eligible stops only)
  dotBreakSatisfied:    boolean      // whether DOT 30-min has been taken this cycle
}

// ── Status output ─────────────────────────────────────────────────────────────

export interface RecoveryStatus {
  // Current fatigue state
  netFatigueMinutes:     number        // accumulated fatigue-equiv (drive - recovery credits)
  fatigueLevel:          FatigueLevel
  continuousDriveMin:    number        // minutes since last adequate recovery stop
  continuousDriveHours:  number

  // Cadence guidance (preference layer — NOT legal)
  nextSuggestedStopIn:   number        // minutes until next preferred stop
  suggestedStopDuration: number        // recommended stop duration given current fatigue
  cadenceAdjusted:       boolean       // true if recent partial credit changed cadence
  adjustmentMinutes:     number        // how many minutes cadence shifted from last credit

  // Recovery quality
  recoveryQualityPct:    number        // 0–100 rough quality metric
  lastCreditApplied?:    {
    stopType:    StopType
    durationMin: number
    creditMin:   number
    adjustedBy:  number   // minutes cadence shifted
  }

  // DOT compliance status (read-only, never modified by recovery engine)
  dotBreakStatus:        'not_needed' | 'monitoring' | 'due_soon' | 'required' | 'satisfied'
  dotBreakCreditMin:     number
  dotBreakSatisfied:     boolean

  // Messaging
  statusMessage:         string        // primary human-readable guidance
  adjustmentMessage?:    string        // shown after credit applied
}

// ── Fatigue thresholds ────────────────────────────────────────────────────────
// All in net fatigue-equivalent minutes

const THRESHOLD = {
  low:       30,    // 0–30: low fatigue, no suggestion
  moderate:  50,    // 30–50: monitoring
  elevated:  70,    // 50–70: stop coming up
  high:      90,    // 70–90: suggest now
  critical:  120,   // 90+: strong suggestion
}

function getFatigueLevel(fatigue: number): FatigueLevel {
  if (fatigue < THRESHOLD.low)      return 'low'
  if (fatigue < THRESHOLD.moderate) return 'moderate'
  if (fatigue < THRESHOLD.elevated) return 'elevated'
  if (fatigue < THRESHOLD.high)     return 'high'
  return 'critical'
}

function getSuggestedStopDuration(fatigue: number, prefs: CadencePreferences): number {
  if (fatigue >= THRESHOLD.critical)  return Math.max(25, prefs.preferredStopDurationMin)
  if (fatigue >= THRESHOLD.high)      return Math.max(20, prefs.preferredStopDurationMin)
  if (fatigue >= THRESHOLD.elevated)  return Math.max(15, prefs.preferredStopDurationMin)
  return prefs.preferredStopDurationMin
}

// ── Pure calculation ──────────────────────────────────────────────────────────

/**
 * Compute net accumulated fatigue from session state + elapsed driving time.
 * Call with Date.now() for live computation.
 */
export function computeNetFatigue(session: RecoverySession, nowMs = Date.now()): number {
  const drivingResumedMs  = new Date(session.drivingResumedAt).getTime()
  const minutesSinceResume = Math.max(0, (nowMs - drivingResumedMs) / 60_000)
  return minutesSinceResume  // net fatigue from current continuous drive block
  // Note: recovery credits are factored in by tracking drivingResumedAt
  // Each time a stop is logged, drivingResumedAt resets, clearing the accumulated block
}

/**
 * Compute total continuous drive minutes (actual clock time since last adequate stop).
 */
export function computeContinuousDrive(session: RecoverySession, nowMs = Date.now()): number {
  const drivingResumedMs = new Date(session.drivingResumedAt).getTime()
  return Math.max(0, (nowMs - drivingResumedMs) / 60_000)
}

/**
 * Derive full recovery status from session. Pure function — no side effects.
 */
export function deriveRecoveryStatus(
  session: RecoverySession,
  nowMs = Date.now(),
): RecoveryStatus {
  const contDriveMin   = computeContinuousDrive(session, nowMs)
  const netFatigue     = contDriveMin  // each formal stop resets the continuous block
  const fatigueLevel   = getFatigueLevel(netFatigue)
  const prefs          = session.prefs

  // Next preferred stop: how far until fatigue hits "high" threshold
  const minutesUntilSuggestion = Math.max(0, prefs.preferredDriveIntervalMin - netFatigue)
  const suggestedDuration      = getSuggestedStopDuration(netFatigue, prefs)

  // Recovery quality: ratio of credits earned vs drive time (idealized)
  const idealCredit    = session.totalDriveMinutes * 0.25  // 25% of drive time in quality recovery = 100%
  const quality        = idealCredit > 0
    ? Math.min(100, Math.round((session.totalRecoveryCredit / idealCredit) * 100))
    : 100

  // Last credit applied
  const lastEvent      = [...session.events].reverse()[0]
  const lastCreditApplied = lastEvent
    ? {
        stopType:    lastEvent.stopType,
        durationMin: lastEvent.durationMin,
        creditMin:   lastEvent.recoveryCredit,
        adjustedBy:  Math.round(lastEvent.recoveryCredit * 10) / 10,
      }
    : undefined

  // DOT break status — informational only, recovery engine NEVER modifies DOT requirements
  const dotStatus = (): RecoveryStatus['dotBreakStatus'] => {
    if (session.dotBreakSatisfied)              return 'satisfied'
    if (session.dotBreakCreditMin >= 30)        return 'satisfied'
    if (contDriveMin >= 480)                    return 'required'    // 8h — DOT break required
    if (contDriveMin >= 420)                    return 'due_soon'    // 7h warning
    if (contDriveMin >= 300)                    return 'monitoring'
    return 'not_needed'
  }

  // Status message — supportive, operational, never punitive
  const statusMessage = (() => {
    if (fatigueLevel === 'critical') {
      return `Recovery strongly recommended — ${Math.round(contDriveMin)}m continuous. Rest when safe.`
    }
    if (fatigueLevel === 'high') {
      const inMin = Math.round(minutesUntilSuggestion)
      return inMin <= 5
        ? `Recovery stop recommended — ${suggestedDuration} min advised`
        : `Suggested stop in ${inMin} min · ${suggestedDuration} min advised`
    }
    if (fatigueLevel === 'elevated') {
      return `Next recovery stop in ${Math.round(minutesUntilSuggestion)} min`
    }
    if (fatigueLevel === 'moderate') {
      return `Operational pace good · ${Math.round(minutesUntilSuggestion)} min to next suggested stop`
    }
    return `Operational rhythm stable`
  })()

  // Adjustment message — shown briefly after a partial credit is applied
  const adjustmentMessage = lastCreditApplied
    ? `${STOP_TYPE_META[lastCreditApplied.stopType].label} credited · cadence adjusted +${lastCreditApplied.adjustedBy.toFixed(1)} min`
    : undefined

  return {
    netFatigueMinutes:     netFatigue,
    fatigueLevel,
    continuousDriveMin:    contDriveMin,
    continuousDriveHours:  contDriveMin / 60,
    nextSuggestedStopIn:   minutesUntilSuggestion,
    suggestedStopDuration: suggestedDuration,
    cadenceAdjusted:       (lastEvent?.recoveryCredit ?? 0) > 0,
    adjustmentMinutes:     lastEvent?.recoveryCredit ?? 0,
    recoveryQualityPct:    quality,
    lastCreditApplied,
    dotBreakStatus:        dotStatus(),
    dotBreakCreditMin:     session.dotBreakCreditMin,
    dotBreakSatisfied:     session.dotBreakSatisfied,
    statusMessage,
    adjustmentMessage,
  }
}

// ── Stop consolidation adviser ────────────────────────────────────────────────

export interface ConsolidationSuggestion {
  message:        string
  stopType:       StopType
  suggestedAt:    string    // description of when/where
  savesMinutes:   number    // estimated time savings vs separate stops
}

/**
 * Suggest merging upcoming operational stops when practical.
 * Example: fuel stop coming up in 40 min + recovery due in 45 min → merge.
 */
export function getConsolidationSuggestion(
  status:        RecoveryStatus,
  fuelMilesOut?: number,    // miles until next planned fuel stop
  mph = 55,
): ConsolidationSuggestion | null {
  if (!fuelMilesOut) return null

  const fuelMinOut   = (fuelMilesOut / mph) * 60
  const recoveryDue  = status.nextSuggestedStopIn

  // If fuel and recovery stops are within 20 min of each other — consolidate
  const gap = Math.abs(fuelMinOut - recoveryDue)
  if (gap <= 20 && recoveryDue > 0 && fuelMilesOut > 0) {
    const comesFirst     = fuelMinOut < recoveryDue ? 'fuel stop' : 'recovery stop'
    const combineAt      = Math.min(fuelMinOut, recoveryDue)
    const savesMinutes   = Math.max(5, Math.round(gap * 0.5))

    return {
      stopType:    'fuel_walk',
      savesMinutes,
      suggestedAt: `in ~${Math.round(combineAt)} min`,
      message:     `Suggested: extend ${comesFirst} to cover recovery (saves ~${savesMinutes} min vs separate stops)`,
    }
  }

  return null
}

// ── Session persistence ───────────────────────────────────────────────────────

const LS_SESSION = '3b-recovery-session'
const LS_HISTORY = '3b-recovery-history'
const LS_PREFS   = '3b-cadence-prefs'

function uid() { return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }

function lsRead<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null } catch { return null }
}
function lsWrite(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* silent */ }
}

export function getCadencePrefs(): CadencePreferences {
  return lsRead<CadencePreferences>(LS_PREFS) ?? DEFAULT_CADENCE_PREFS
}

export function saveCadencePrefs(prefs: CadencePreferences): void {
  lsWrite(LS_PREFS, prefs)
}

export function getOrCreateSession(): RecoverySession {
  const existing = lsRead<RecoverySession>(LS_SESSION)
  if (existing) return existing

  const now = new Date().toISOString()
  const prefs = getCadencePrefs()
  const session: RecoverySession = {
    id:                   uid(),
    sessionStart:         now,
    drivingResumedAt:     now,
    events:               [],
    prefs,
    totalDriveMinutes:    0,
    totalRecoveryCredit:  0,
    dotBreakCreditMin:    0,
    dotBreakSatisfied:    false,
  }
  lsWrite(LS_SESSION, session)
  return session
}

/**
 * Log an unplanned recovery stop and get the credit.
 * Returns the updated session and the recovery event logged.
 *
 * KEY RULE: recovery credit shifts preferred cadence only.
 *           DOT break is tracked separately and never modified.
 */
export function logRecoveryStop(
  stopType:     StopType,
  durationMin:  number,
  notes?:       string,
): { session: RecoverySession; event: RecoveryEvent; status: RecoveryStatus } {
  const session    = getOrCreateSession()
  const nowMs      = Date.now()
  const meta       = STOP_TYPE_META[stopType]
  const credit     = Math.round(durationMin * meta.coefficient * 10) / 10
  const fatigueNow = computeNetFatigue(session, nowMs)

  const event: RecoveryEvent = {
    id:             uid(),
    stopType,
    startedAt:      new Date().toISOString(),
    durationMin,
    recoveryCredit: credit,
    isDotBreak:     meta.isDotEligible && durationMin >= 30,
    passive:        meta.passive,
    notes,
    fatigueAtStop:  fatigueNow,
  }

  // Add drive minutes accrued before this stop
  const driveMinBeforeStop = Math.round(fatigueNow * 10) / 10

  const updated: RecoverySession = {
    ...session,
    events:               [...session.events, event],
    totalDriveMinutes:    session.totalDriveMinutes    + driveMinBeforeStop,
    totalRecoveryCredit:  session.totalRecoveryCredit  + credit,
    dotBreakCreditMin:    session.dotBreakCreditMin    + (meta.isDotEligible ? durationMin : 0),
    dotBreakSatisfied:    session.dotBreakSatisfied    || (meta.isDotEligible && durationMin >= 30),
    // After a formal break or high-credit stop: reset the continuous drive clock
    drivingResumedAt: (credit >= 10 || stopType === 'formal_break' || stopType === 'nap' || stopType === 'meal')
      ? new Date(nowMs + durationMin * 60_000).toISOString()   // reset clock after stop ends
      : session.drivingResumedAt,                               // minor stop: clock keeps running
  }

  lsWrite(LS_SESSION, updated)

  const statusAfter = deriveRecoveryStatus(updated, nowMs + durationMin * 60_000)
  return { session: updated, event, status: statusAfter }
}

/**
 * Reset session (e.g., after 10-hour reset, new shift, or manual reset).
 * Archives old session to history first.
 */
export function resetSession(reason?: string): RecoverySession {
  const old = lsRead<RecoverySession>(LS_SESSION)
  if (old) {
    const history = lsRead<RecoverySession[]>(LS_HISTORY) ?? []
    history.unshift({ ...old, id: `${old.id}-${reason ?? 'reset'}` })
    lsWrite(LS_HISTORY, history.slice(0, 30))
  }
  localStorage.removeItem(LS_SESSION)
  return getOrCreateSession()
}

/**
 * Mark a formal 10-hour reset as complete — resets everything.
 */
export function markHOSReset(): RecoverySession {
  return resetSession('hos_reset')
}

// ── Smart cadence summary ─────────────────────────────────────────────────────

export type CadenceTrend = 'stable' | 'drifting' | 'degraded'

export interface OperationalRhythm {
  trend:               CadenceTrend
  stopVarianceMin:     number          // avg deviation from preferred cadence
  recommendedStyle:    string          // descriptive advice
  fatigueTrendPct:     number          // 0-100, higher = more fatigue accumulated
}

/**
 * Analyze session history for operational rhythm trends.
 * Used for driver performance modeling (long-term).
 */
export function analyzeOperationalRhythm(session: RecoverySession): OperationalRhythm {
  const events      = session.events.filter(e => !e.passive)
  const prefs       = session.prefs
  const avgCredit   = events.length > 0
    ? events.reduce((s, e) => s + e.recoveryCredit, 0) / events.length
    : 0

  const fatiguePct  = Math.min(100, Math.round(
    (session.totalDriveMinutes / (prefs.preferredDriveIntervalMin * 3)) * 100,
  ))

  const variance    = events.reduce((sum, e) => {
    const idealStop = prefs.preferredDriveIntervalMin
    return sum + Math.abs(e.fatigueAtStop - idealStop)
  }, 0) / Math.max(1, events.length)

  const trend: CadenceTrend =
    variance < 10 ? 'stable' :
    variance < 25 ? 'drifting' :
    'degraded'

  const style = avgCredit >= 12
    ? 'High-quality recovery stops — sustained performance'
    : avgCredit >= 6
    ? 'Moderate recovery cadence — on track'
    : 'Light recovery stops — consider extending breaks'

  return {
    trend,
    stopVarianceMin:  Math.round(variance),
    recommendedStyle: style,
    fatigueTrendPct:  fatiguePct,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getFatigueLevelColor(level: FatigueLevel): string {
  switch (level) {
    case 'low':      return 'var(--success)'
    case 'moderate': return 'var(--primary)'
    case 'elevated': return '#60c8ff'
    case 'high':     return 'var(--warn)'
    case 'critical': return 'var(--error)'
  }
}

export function getFatigueLevelLabel(level: FatigueLevel): string {
  switch (level) {
    case 'low':      return 'Low Fatigue'
    case 'moderate': return 'Moderate'
    case 'elevated': return 'Elevated'
    case 'high':     return 'High Fatigue'
    case 'critical': return 'Recovery Needed'
  }
}

export function formatDriveTime(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
