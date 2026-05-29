'use client'
/**
 * hosPlanning.ts — HOS-Centric Operational Planning Engine
 *                + Driver Availability & Lifestyle Intelligence
 *
 * Two engines, one module — they share core HOS primitives.
 *
 * ── HOS Planning Engine ──────────────────────────────────────────────────────
 * True ETA modeling: takes miles remaining + HOS clock + rest requirements
 * and produces a legally feasible ETA that accounts for mandatory stops.
 *
 *   loadFeasibility(miles, driverHOS) → feasibility score + required rest
 *   simulateHOSETA(from, miles, hOS, avgMph, restAt)
 *     → arrival time, rest stops needed, total elapsed hours
 *
 * ── Driver Availability Engine ───────────────────────────────────────────────
 * Driver profiles with home location, preferred hours/days, and home-time
 * intelligence. Surfaces "home window" suggestions alongside load planning.
 *
 *   DriverProfile: home coordinates, preferred work days, home-time freq
 *   getDriverAvailability(profile, now) → AvailabilityWindow[]
 *   suggestLoadWindow(profile, loadMiles, currentLoc) → LoadWindow
 *
 * LS keys:
 *   3b-hos-plan-results  — HOSPlanResult[]    (max 50)
 *   3b-driver-profiles   — DriverProfile[]    (max 20)
 *   3b-availability-pref — AvailabilityPrefs  (single object)
 */

import { logHOSPlanEvent } from '@/lib/opsEventLog'

// ── HOS constants (FMCSA Part 395) ───────────────────────────────────────────

export const HOS = {
  MAX_DRIVE_HOURS:      11,    // 11-hour driving limit
  MAX_SHIFT_HOURS:      14,    // 14-hour on-duty window
  BREAK_REQUIRED_AFTER: 8,    // mandatory 30-min break after 8h cumulative drive
  BREAK_DURATION:       0.5,  // 30 minutes
  REST_PERIOD:          10,   // 10-hour off-duty rest
  CYCLE_70H_DAYS:       8,    // 70h / 8-day cycle
  CYCLE_60H_DAYS:       7,    // 60h / 7-day cycle (most fleets)
  SHORT_HAUL_RADIUS_MI: 150,  // short-haul exemption radius
  SB_SPLIT:             {     // split sleeper berth
    min1: 7, min2: 3,         // 7+3 (most common)
  },
}

// ── HOS input snapshot ────────────────────────────────────────────────────────

export interface HOSSnapshot {
  driveRemHrs:   number    // drive time remaining today (0-11)
  shiftRemHrs:   number    // shift window remaining (0-14)
  cycleRemHrs:   number    // cycle hours remaining (0-70)
  breakDueIn:    number | null  // hours until mandatory 30-min break (null = not due)
  lastRestAt?:   string    // ISO — when 10-hour rest started
}

// ── Load feasibility score ────────────────────────────────────────────────────

export type FeasibilityStatus =
  | 'feasible_now'       // can complete legally with current HOS, no rest needed
  | 'feasible_rest'      // can complete but requires one 10-hour rest stop
  | 'feasible_multi'     // multiple rest stops needed
  | 'infeasible_cycle'   // cycle hours exhausted — cannot legally run

export interface LoadFeasibility {
  status:            FeasibilityStatus
  milesRemaining:    number
  hoursNeeded:       number
  hoursAvailable:    number   // drive hours remaining (may be after rest)
  restStopsRequired: number
  requiredRestHours: number   // total off-duty time needed
  legalETA:          Date | null
  feasibilityScore:  number   // 0-100
  constraints:       string[] // human-readable constraint list
  canStartNow:       boolean
}

export function scoreLoadFeasibility(
  milesRemaining: number,
  hos:            HOSSnapshot,
  avgMph:         number = 55,
  departNow:      Date   = new Date(),
): LoadFeasibility {
  const hoursNeeded  = milesRemaining / avgMph
  const constraints: string[] = []

  // Check cycle hours
  if (hos.cycleRemHrs < 1) {
    return {
      status: 'infeasible_cycle', milesRemaining, hoursNeeded,
      hoursAvailable: 0, restStopsRequired: 0, requiredRestHours: 0,
      legalETA: null, feasibilityScore: 0, canStartNow: false,
      constraints: ['Cycle hours exhausted — 34-hour restart required before dispatch'],
    }
  }

  // Break due consideration
  let effectiveDriveHrs = hos.driveRemHrs
  if (hos.breakDueIn !== null && hos.breakDueIn <= 0) {
    effectiveDriveHrs = Math.max(0, hos.driveRemHrs - HOS.BREAK_DURATION)
    constraints.push('Mandatory 30-min break required before continuing')
  }

  // Account for shift window (can't drive past shift end even if drive hours remain)
  const shiftLimitHrs = Math.min(effectiveDriveHrs, hos.shiftRemHrs)

  // Case 1: Can complete in current drive window
  if (hoursNeeded <= shiftLimitHrs) {
    const legalETA = new Date(departNow.getTime() + hoursNeeded * 3_600_000)
    const score = hoursNeeded <= shiftLimitHrs * 0.6 ? 100 :
                  hoursNeeded <= shiftLimitHrs * 0.85 ? 82 : 60
    return {
      status: 'feasible_now', milesRemaining, hoursNeeded,
      hoursAvailable: effectiveDriveHrs, restStopsRequired: 0, requiredRestHours: 0,
      legalETA, feasibilityScore: score, canStartNow: true, constraints,
    }
  }

  // Case 2: Need one 10-hour rest
  const afterRestDriveHrs = HOS.MAX_DRIVE_HOURS  // full 11h reset
  const totalDriveAvail   = effectiveDriveHrs + afterRestDriveHrs

  if (hoursNeeded <= totalDriveAvail) {
    const firstLegHrs  = shiftLimitHrs
    const secondLegHrs = hoursNeeded - firstLegHrs
    const totalElapsed = firstLegHrs + HOS.REST_PERIOD + secondLegHrs
    const legalETA     = new Date(departNow.getTime() + totalElapsed * 3_600_000)
    const score        = secondLegHrs <= afterRestDriveHrs * 0.7 ? 65 : 40

    constraints.push(`Requires 1 × ${HOS.REST_PERIOD}-hour rest stop after ${firstLegHrs.toFixed(1)}h driving`)

    return {
      status: 'feasible_rest', milesRemaining, hoursNeeded,
      hoursAvailable: effectiveDriveHrs, restStopsRequired: 1,
      requiredRestHours: HOS.REST_PERIOD,
      legalETA, feasibilityScore: score, canStartNow: true, constraints,
    }
  }

  // Case 3: Multiple rest stops needed
  const restStops     = Math.ceil((hoursNeeded - effectiveDriveHrs) / HOS.MAX_DRIVE_HOURS)
  const totalRestHrs  = restStops * HOS.REST_PERIOD
  const totalElapsed  = hoursNeeded + totalRestHrs
  const legalETA      = new Date(departNow.getTime() + totalElapsed * 3_600_000)

  constraints.push(`Requires ${restStops} rest stops — ${totalRestHrs}h total off-duty`)
  if (hos.cycleRemHrs < hoursNeeded) constraints.push('Cycle hours may be insufficient — verify with actual cycle data')

  return {
    status: 'feasible_multi', milesRemaining, hoursNeeded,
    hoursAvailable: effectiveDriveHrs, restStopsRequired: restStops,
    requiredRestHours: totalRestHrs,
    legalETA, feasibilityScore: 25, canStartNow: true, constraints,
  }
}

// ── HOS ETA simulation ────────────────────────────────────────────────────────

export interface HOSETASimulation {
  departAt:        Date
  arrivalAt:       Date | null
  totalElapsedHrs: number
  drivingHrs:      number
  restHrs:         number
  restStops:       RestStop[]
  avgMph:          number
  feasibility:     LoadFeasibility
  timelineEvents:  TimelineEvent[]
}

export interface RestStop {
  afterMiles:   number
  durationHrs:  number
  type:         '30min_break' | '10h_rest'
  reason:       string
}

export interface TimelineEvent {
  type:      'depart' | 'drive' | 'break' | 'rest' | 'arrive'
  timeLabel: string
  label:     string
  miles?:    number
}

export function simulateHOSETA(
  miles:      number,
  hos:        HOSSnapshot,
  avgMph:     number = 55,
  departAt:   Date   = new Date(),
): HOSETASimulation {
  const feasibility = scoreLoadFeasibility(miles, hos, avgMph, departAt)
  const events: TimelineEvent[] = []
  const restStops: RestStop[] = []

  if (feasibility.status === 'infeasible_cycle') {
    return {
      departAt, arrivalAt: null, totalElapsedHrs: 0,
      drivingHrs: 0, restHrs: 0, restStops: [], avgMph,
      feasibility, timelineEvents: [{
        type: 'depart', timeLabel: fmtTime(departAt),
        label: '⚠️ Cannot dispatch — cycle hours exhausted',
      }],
    }
  }

  let currentTime  = departAt.getTime()
  let milesLeft    = miles
  let driveHrsLeft = Math.min(hos.driveRemHrs, hos.shiftRemHrs)
  let breakDue     = hos.breakDueIn    // hours until 30-min break
  let totalDriving = 0, totalRest = 0

  events.push({ type: 'depart', timeLabel: fmtTime(new Date(currentTime)), label: `🚛 Depart — ${miles} mi to go` })

  let iteration = 0
  while (milesLeft > 0.5 && iteration < 10) {
    iteration++

    // Check if 30-min break is due
    if (breakDue !== null && breakDue <= 0 && driveHrsLeft > 0) {
      events.push({ type: 'break', timeLabel: fmtTime(new Date(currentTime)), label: '⏸ Mandatory 30-min break' })
      restStops.push({ afterMiles: miles - milesLeft, durationHrs: HOS.BREAK_DURATION, type: '30min_break', reason: '8-hour drive limit' })
      currentTime += HOS.BREAK_DURATION * 3_600_000
      totalRest   += HOS.BREAK_DURATION
      breakDue     = null  // break taken, reset
      driveHrsLeft = Math.min(driveHrsLeft, HOS.MAX_DRIVE_HOURS - totalDriving)
    }

    if (driveHrsLeft <= 0) {
      // Need a full 10-hour rest
      events.push({ type: 'rest', timeLabel: fmtTime(new Date(currentTime)), label: `😴 10-hour rest — ${milesLeft.toFixed(0)} mi remaining` })
      restStops.push({ afterMiles: miles - milesLeft, durationHrs: HOS.REST_PERIOD, type: '10h_rest', reason: 'Drive hours exhausted' })
      currentTime  += HOS.REST_PERIOD * 3_600_000
      totalRest    += HOS.REST_PERIOD
      driveHrsLeft  = HOS.MAX_DRIVE_HOURS     // full reset
      breakDue      = HOS.BREAK_REQUIRED_AFTER  // 8h until next break
    }

    // Drive segment
    const segmentMph      = avgMph
    const segmentHrs      = Math.min(driveHrsLeft, milesLeft / segmentMph)
    const segmentMiles    = Math.min(milesLeft, segmentHrs * segmentMph)
    const segmentEndTime  = currentTime + segmentHrs * 3_600_000

    milesLeft    -= segmentMiles
    driveHrsLeft -= segmentHrs
    totalDriving += segmentHrs
    if (breakDue !== null) breakDue -= segmentHrs
    currentTime   = segmentEndTime

    if (milesLeft <= 0.5) {
      events.push({ type: 'arrive', timeLabel: fmtTime(new Date(currentTime)), label: `🏁 Arrive — ${miles} mi completed` })
    } else {
      events.push({ type: 'drive', timeLabel: fmtTime(new Date(currentTime)), label: `🛣 ${segmentMiles.toFixed(0)} mi driven · ${milesLeft.toFixed(0)} mi remaining`, miles: segmentMiles })
    }
  }

  const arrivalAt      = new Date(currentTime)
  const totalElapsedHrs = (currentTime - departAt.getTime()) / 3_600_000

  return { departAt, arrivalAt, totalElapsedHrs, drivingHrs: totalDriving, restHrs: totalRest, restStops, avgMph, feasibility, timelineEvents: events }
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

// ── HOS plan result persistence ───────────────────────────────────────────────

export interface HOSPlanResult {
  id:          string
  loadNumber?: string
  miles:       number
  createdAt:   string
  simulation:  HOSETASimulation
  notes?:      string
}

const LS_PLAN_RESULTS = '3b-hos-plan-results'

export function saveHOSPlanResult(result: Omit<HOSPlanResult, 'id' | 'createdAt'>): HOSPlanResult {
  const full: HOSPlanResult = { ...result, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
  try {
    const all: HOSPlanResult[] = JSON.parse(localStorage.getItem(LS_PLAN_RESULTS) ?? '[]')
    all.unshift(full)
    localStorage.setItem(LS_PLAN_RESULTS, JSON.stringify(all.slice(0, 50)))
  } catch { /* storage full */ }
  // Log to unified ops event log
  const sim = result.simulation
  logHOSPlanEvent({
    loadNumber: result.loadNumber,
    title:      `HOS plan created — ${sim.feasibility.status} — ${result.miles}mi`,
    payload: {
      miles:       result.miles,
      feasibility: sim.feasibility.status,
      legalETA:    sim.arrivalAt?.toISOString(),
      restStops:   sim.restStops.length,
      drivingHrs:  sim.drivingHrs,
    },
  })
  return full
}

export function readHOSPlanResults(): HOSPlanResult[] {
  try { return JSON.parse(localStorage.getItem(LS_PLAN_RESULTS) ?? '[]') }
  catch { return [] }
}

// ── Driver profile ────────────────────────────────────────────────────────────

export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
export type HomeTimeFrequency = 'weekly' | 'biweekly' | 'monthly' | 'regional' | 'otr_only'

export interface DriverProfile {
  id:                string
  driverName:        string
  // Home location
  homeCity:          string
  homeState:         string
  homeLat?:          number
  homeLng?:          number
  // Preferred schedule
  preferredDays:     DayOfWeek[]   // preferred work days
  preferredStartHr:  number        // 0-23 (preferred shift start)
  preferredEndHr:    number        // 0-23
  homeTimeFreq:      HomeTimeFrequency
  homeDaysMin:       number        // min days home per cycle
  // Fleet info
  truckNumber?:      string
  cycleType:         '70h8d' | '60h7d'
  teamsDriver:       boolean       // team driver (2 drivers 1 truck)
  // Metadata
  active:            boolean
  hireDate?:         string
  notes?:            string
}

// ── Availability window ───────────────────────────────────────────────────────

export type AvailabilityType =
  | 'available'         // available for dispatch
  | 'home_window'       // approaching home time
  | 'home_time'         // should be at home
  | 'preferred_off'     // preferred day off (not compliant restriction)
  | 'rest_required'     // cycle hours near max — rest window coming

export interface AvailabilityWindow {
  type:        AvailabilityType
  startAt:     Date
  endAt:       Date | null
  label:       string
  description: string
  priority:    number    // lower = more important to show
}

export function getDriverAvailabilityWindows(
  profile:  DriverProfile,
  from:     Date = new Date(),
  daysAhead: number = 7,
): AvailabilityWindow[] {
  const windows: AvailabilityWindow[] = []
  const until = new Date(from.getTime() + daysAhead * 86_400_000)

  // Home-time window based on frequency
  const homeFreqDays: Record<HomeTimeFrequency, number> = {
    weekly:    7,
    biweekly:  14,
    monthly:   30,
    regional:  3,    // regional: every ~3 days
    otr_only:  0,    // no home time expectation
  }

  const freqDays = homeFreqDays[profile.homeTimeFreq]
  if (freqDays > 0) {
    // Surface home-time windows starting from now through next cycle
    let cursor = new Date(from)
    while (cursor < until) {
      const windowStart = new Date(cursor.getTime() + freqDays * 86_400_000)
      const windowEnd   = new Date(windowStart.getTime() + profile.homeDaysMin * 86_400_000)
      windows.push({
        type: windowStart <= from ? 'home_time' : 'home_window',
        startAt: windowStart, endAt: windowEnd,
        priority: 1,
        label: `🏠 ${profile.homeTimeFreq === 'weekly' ? 'Weekly' : 'Home'} Home Time`,
        description: `${profile.driverName} is due for home time — ${profile.homeDaysMin}d min · ${profile.homeCity}, ${profile.homeState}`,
      })
      cursor = windowEnd
    }
  }

  // Preferred days off
  const dayMap: Record<DayOfWeek, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 }
  const workDayNums = profile.preferredDays.map(d => dayMap[d])
  let cursor2 = new Date(from)
  while (cursor2 < until) {
    const dayNum = cursor2.getDay()
    if (!workDayNums.includes(dayNum)) {
      windows.push({
        type: 'preferred_off',
        startAt: new Date(cursor2), endAt: new Date(cursor2.getTime() + 86_400_000),
        priority: 3,
        label: `😴 Preferred Off — ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayNum]}`,
        description: `${profile.driverName} prefers not to drive on this day (preference only — not a legal restriction)`,
      })
    }
    cursor2 = new Date(cursor2.getTime() + 86_400_000)
  }

  return windows.sort((a, b) => a.priority - b.priority || a.startAt.getTime() - b.startAt.getTime())
}

// ── Dispatch suitability for a load ──────────────────────────────────────────

export interface DriverDispatchSuitability {
  driverName:        string
  suitable:          boolean
  score:             number     // 0-100
  homeConflict:      boolean    // load would miss upcoming home time
  preferenceConflict: boolean   // load overlaps preferred off days
  homeDistanceAtEnd: number | null  // miles from delivery to home
  reasons:           string[]
  recommendation:    string
}

export function scoreDriverDispatchSuitability(
  profile:         DriverProfile,
  loadMiles:       number,
  deliveryCity?:   string,
  deliveryLat?:    number,
  deliveryLng?:    number,
  hos?:            HOSSnapshot,
  departNow:       Date = new Date(),
): DriverDispatchSuitability {
  const reasons: string[] = []
  let score = 100
  let homeConflict = false
  let preferenceConflict = false

  // Check home-time conflict (is driver overdue for home time?)
  const windows = getDriverAvailabilityWindows(profile, departNow, 14)
  const nextHomeWindow = windows.find(w => w.type === 'home_time' || w.type === 'home_window')
  if (nextHomeWindow) {
    const hoursUntilHome = (nextHomeWindow.startAt.getTime() - departNow.getTime()) / 3_600_000
    const loadHours      = loadMiles / 55 + (hos ? Math.max(0, loadMiles / 55 - hos.driveRemHrs) > 0 ? 10 : 0 : 0)
    if (loadHours > hoursUntilHome && hoursUntilHome < 48) {
      homeConflict = true
      score -= 30
      reasons.push(`Load would conflict with home time window starting in ${Math.round(hoursUntilHome)}h`)
    }
  }

  // Preferred day conflicts
  const dayMap: Record<DayOfWeek, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 }
  const workDayNums = profile.preferredDays.map(d => dayMap[d])
  const departDay = departNow.getDay()
  if (!workDayNums.includes(departDay)) {
    preferenceConflict = true
    score -= 10
    reasons.push(`Dispatch falls on preferred off day (preference layer — not a restriction)`)
  }

  // HOS suitability
  if (hos) {
    const feasibility = scoreLoadFeasibility(loadMiles, hos, 55, departNow)
    if (feasibility.status === 'infeasible_cycle') { score -= 50; reasons.push('Cycle hours exhausted') }
    else if (feasibility.status === 'feasible_multi') { score -= 20; reasons.push('Multiple rest stops required') }
    else if (feasibility.status === 'feasible_rest')  { score -= 10; reasons.push('One rest stop required') }
  }

  // Home return proximity
  let homeDistanceAtEnd: number | null = null
  if (profile.homeLat && profile.homeLng && deliveryLat && deliveryLng) {
    homeDistanceAtEnd = haversineMiles(deliveryLat, deliveryLng, profile.homeLat, profile.homeLng)
    if (homeDistanceAtEnd < 150) {
      score += 10   // bonus — load ends near home
      reasons.push(`Delivery ends ${Math.round(homeDistanceAtEnd)} mi from home — good home-run opportunity`)
    }
  }

  const suitable = score >= 50 && !homeConflict
  const recommendation =
    score >= 80 ? '✅ Well-suited for this load' :
    score >= 60 ? '⚠️ Suitable with minor considerations' :
    score >= 40 ? '🟠 Consider another driver or adjust timing' :
    '🚫 Not recommended — see constraints above'

  return {
    driverName: profile.driverName, suitable, score: Math.max(0, Math.min(100, score)),
    homeConflict, preferenceConflict, homeDistanceAtEnd, reasons, recommendation,
  }
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Driver profile CRUD ───────────────────────────────────────────────────────

const LS_PROFILES = '3b-driver-profiles'

export function readDriverProfiles(): DriverProfile[] {
  try { return JSON.parse(localStorage.getItem(LS_PROFILES) ?? '[]') }
  catch { return [] }
}

export function saveDriverProfile(p: DriverProfile): void {
  try {
    const all = readDriverProfiles()
    const idx = all.findIndex(r => r.id === p.id)
    if (idx >= 0) all[idx] = p
    else all.push(p)
    localStorage.setItem(LS_PROFILES, JSON.stringify(all))
  } catch { /* ignore */ }
}

export function getOwnProfile(): DriverProfile | null {
  const all = readDriverProfiles()
  return all.find(p => p.active) ?? null
}

// ── Availability preferences (driver-set) ─────────────────────────────────────

export interface AvailabilityPrefs {
  homeCity:       string
  homeState:      string
  homeLat?:       number
  homeLng?:       number
  homeTimeFreq:   HomeTimeFrequency
  homeDaysMin:    number
  preferredDays:  DayOfWeek[]
  preferredStart: number
  preferredEnd:   number
}

const LS_AVAIL_PREFS = '3b-availability-pref'

export function readAvailabilityPrefs(): AvailabilityPrefs | null {
  try { return JSON.parse(localStorage.getItem(LS_AVAIL_PREFS) ?? 'null') }
  catch { return null }
}

export function saveAvailabilityPrefs(p: AvailabilityPrefs): void {
  try { localStorage.setItem(LS_AVAIL_PREFS, JSON.stringify(p)) }
  catch { /* ignore */ }
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function feasibilityStatusLabel(s: FeasibilityStatus): string {
  return {
    feasible_now:    'Feasible — No rest stop',
    feasible_rest:   'Feasible — 1 rest stop',
    feasible_multi:  'Feasible — Multiple stops',
    infeasible_cycle: 'Infeasible — Cycle exhausted',
  }[s]
}

export function feasibilityColor(s: FeasibilityStatus): string {
  return {
    feasible_now:    'var(--primary)',
    feasible_rest:   'var(--warn)',
    feasible_multi:  '#f97316',
    infeasible_cycle: 'var(--error)',
  }[s]
}

export function homeTimeFreqLabel(f: HomeTimeFrequency): string {
  return { weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', regional: 'Regional (every 3d)', otr_only: 'OTR Only' }[f]
}
