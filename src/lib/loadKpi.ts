'use client'
/**
 * loadKpi.ts — Load financial targets, break log, and fuel MPG engine
 *
 * Per-load: set fuel/tolls/shop targets at plan time, compare actuals at
 * delivery and closure. Track break schedule with mark-taken history.
 * Fuel fill-ups feed gallons → miles/gallons MPG KPI.
 *
 * All localStorage-first, no Supabase dependency (pure client KPI).
 *
 * LS keys:
 *   3b-load-targets   — LoadTarget[]  (max 100)
 *   3b-break-log      — BreakEntry[]  (max 500)
 *   3b-fuel-fillups   — FuelFillup[]  (max 300)
 */

// ── Break log ─────────────────────────────────────────────────────────────────

export type BreakType   = 'stretch' | 'mandatory' | 'rest10' | 'fuel' | 'custom'
export type BreakStatus = 'planned' | 'taken' | 'skipped'

export interface BreakEntry {
  id:            string
  loadNumber?:   string
  type:          BreakType
  label:         string
  // Hours from departure (base = what the plan calculated)
  baseHour:      number
  // User-adjusted hour (base ± adjustment, clamped to ±1 from base)
  adjustedHour:  number
  adjustment:    number     // -1 | 0 | +1 (in hours)
  durationMins:  number     // planned duration
  status:        BreakStatus
  takenAt?:      string     // ISO — when "Mark Taken" was tapped
  takenDuration?: number    // actual minutes (if user records it)
  notes?:        string
  createdAt:     string
}

const LS_BREAKS = '3b-break-log'
const MAX_BREAKS = 500

export function readBreakLog(loadNumber?: string): BreakEntry[] {
  try {
    const all: BreakEntry[] = JSON.parse(localStorage.getItem(LS_BREAKS) ?? '[]')
    return loadNumber ? all.filter(b => b.loadNumber === loadNumber) : all
  } catch { return [] }
}

export function saveBreakEntry(entry: BreakEntry): void {
  try {
    const all: BreakEntry[] = JSON.parse(localStorage.getItem(LS_BREAKS) ?? '[]')
    const idx = all.findIndex(b => b.id === entry.id)
    if (idx >= 0) all[idx] = entry
    else all.unshift(entry)
    localStorage.setItem(LS_BREAKS, JSON.stringify(all.slice(0, MAX_BREAKS)))
  } catch { /* storage full */ }
}

export function deleteBreakEntry(id: string): void {
  try {
    const all: BreakEntry[] = JSON.parse(localStorage.getItem(LS_BREAKS) ?? '[]')
    localStorage.setItem(LS_BREAKS, JSON.stringify(all.filter(b => b.id !== id)))
  } catch { /* ignore */ }
}

/** Generate a break schedule from a trip plan's stop list. */
export function planBreaksFromStops(
  stops: { type: string; label: string; mi: number; dur: string; eta: string }[],
  departMin: number,
  loadNumber?: string,
): BreakEntry[] {
  const entries: BreakEntry[] = []
  const etaToHours = (eta: string): number => {
    // eta is like "2:30 PM" — compute hours from departure
    // We just use mi/58 as a proxy since we don't store exact minutes
    return 0
  }

  let hourCursor = 0
  for (const s of stops) {
    if (s.type === 'stretch') {
      hourCursor += 3
      entries.push({
        id:           crypto.randomUUID(),
        loadNumber,
        type:         'stretch',
        label:        '🚶 Stretch Break',
        baseHour:     hourCursor,
        adjustedHour: hourCursor,
        adjustment:   0,
        durationMins: 12,
        status:       'planned',
        createdAt:    new Date().toISOString(),
      })
    } else if (s.type === 'break30') {
      hourCursor = Math.ceil(hourCursor)
      entries.push({
        id:           crypto.randomUUID(),
        loadNumber,
        type:         'mandatory',
        label:        '⏸ Mandatory 30-min Break',
        baseHour:     hourCursor,
        adjustedHour: hourCursor,
        adjustment:   0,
        durationMins: 30,
        status:       'planned',
        createdAt:    new Date().toISOString(),
      })
    } else if (s.type === 'rest10') {
      entries.push({
        id:           crypto.randomUUID(),
        loadNumber,
        type:         'rest10',
        label:        '🛑 10-Hour Rest',
        baseHour:     hourCursor,
        adjustedHour: hourCursor,
        adjustment:   0,
        durationMins: 600,
        status:       'planned',
        createdAt:    new Date().toISOString(),
      })
      hourCursor += 10
    } else if (s.type === 'fuel') {
      entries.push({
        id:           crypto.randomUUID(),
        loadNumber,
        type:         'fuel',
        label:        '⛽ Fuel Stop',
        baseHour:     hourCursor,
        adjustedHour: hourCursor,
        adjustment:   0,
        durationMins: 18,
        status:       'planned',
        createdAt:    new Date().toISOString(),
      })
    }
  }
  return entries
}

/** Re-generate break schedule based on total drive hours (standalone, no plan needed). */
export function generateBreakSchedule(
  driveHours: number,
  intervalHours: number = 3,
  loadNumber?: string,
): BreakEntry[] {
  const entries: BreakEntry[] = []
  let cursor = intervalHours

  while (cursor < driveHours) {
    const isMandatory = cursor >= 8 && entries.every(e => e.type !== 'mandatory')
    entries.push({
      id:           crypto.randomUUID(),
      loadNumber,
      type:         isMandatory ? 'mandatory' : 'stretch',
      label:        isMandatory ? '⏸ Mandatory 30-min Break' : '🚶 Stretch Break',
      baseHour:     cursor,
      adjustedHour: cursor,
      adjustment:   0,
      durationMins: isMandatory ? 30 : 15,
      status:       'planned',
      createdAt:    new Date().toISOString(),
    })
    cursor += intervalHours
  }
  return entries
}

// Break summary stats
export interface BreakSummary {
  planned:       number
  taken:         number
  skipped:       number
  totalPlanned:  number  // minutes
  totalTaken:    number  // minutes
}

export function summarizeBreaks(breaks: BreakEntry[]): BreakSummary {
  return {
    planned:      breaks.filter(b => b.status === 'planned').length,
    taken:        breaks.filter(b => b.status === 'taken').length,
    skipped:      breaks.filter(b => b.status === 'skipped').length,
    totalPlanned: breaks.reduce((s, b) => s + b.durationMins, 0),
    totalTaken:   breaks.filter(b => b.status === 'taken').reduce((s, b) => s + (b.takenDuration ?? b.durationMins), 0),
  }
}

// ── Load financial targets ────────────────────────────────────────────────────

export interface LoadTarget {
  id:            string
  loadNumber:    string
  loadId?:       string
  plannedMiles:  number
  ratePerMile?:  number    // CPM
  grossPay?:     number    // $
  // Targets
  fuelTarget:    number    // $
  tollsTarget:   number    // $
  shopTarget:    number    // $ (repairs/misc/supplies)
  mealsTarget?:  number    // $
  // Fuel planning
  mpgTarget?:    number    // expected MPG
  gallonsTarget?: number   // planned gallons (miles / mpgTarget)
  // Meta
  setAt:         string
  updatedAt:     string
}

const LS_TARGETS = '3b-load-targets'
const MAX_TARGETS = 100

export function readLoadTargets(): LoadTarget[] {
  try { return JSON.parse(localStorage.getItem(LS_TARGETS) ?? '[]') as LoadTarget[] }
  catch { return [] }
}

export function readLoadTarget(loadNumber: string): LoadTarget | null {
  return readLoadTargets().find(t => t.loadNumber === loadNumber) ?? null
}

export function saveLoadTarget(target: LoadTarget): void {
  try {
    const all = readLoadTargets()
    const idx = all.findIndex(t => t.id === target.id)
    target.updatedAt = new Date().toISOString()
    if (idx >= 0) all[idx] = target
    else all.unshift(target)
    localStorage.setItem(LS_TARGETS, JSON.stringify(all.slice(0, MAX_TARGETS)))
  } catch { /* storage full */ }
}

export function newLoadTarget(ctx?: Partial<LoadTarget>): LoadTarget {
  return {
    id:           crypto.randomUUID(),
    loadNumber:   ctx?.loadNumber ?? '',
    loadId:       ctx?.loadId,
    plannedMiles: ctx?.plannedMiles ?? 0,
    ratePerMile:  ctx?.ratePerMile,
    grossPay:     ctx?.grossPay,
    fuelTarget:   ctx?.fuelTarget ?? 0,
    tollsTarget:  ctx?.tollsTarget ?? 0,
    shopTarget:   ctx?.shopTarget ?? 0,
    mealsTarget:  ctx?.mealsTarget,
    mpgTarget:    ctx?.mpgTarget ?? 6.5,
    gallonsTarget: ctx?.gallonsTarget,
    setAt:        new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
  }
}

/** Auto-estimate targets from miles + CPM + fuel price */
export function estimateTargets(miles: number, mpg = 6.5, fuelPrice = 3.85, cpm?: number): Partial<LoadTarget> {
  const gallons = miles / mpg
  return {
    plannedMiles:  miles,
    fuelTarget:    Math.round(gallons * fuelPrice),
    tollsTarget:   Math.round(miles * 0.04),   // ~$0.04/mi rough estimate
    shopTarget:    Math.round(miles * 0.02),   // ~$0.02/mi rough estimate
    mpgTarget:     mpg,
    gallonsTarget: Math.round(gallons * 10) / 10,
    grossPay:      cpm ? Math.round(miles * cpm) : undefined,
  }
}

// ── Expense actuals (reads from expenses localStorage) ────────────────────────

export interface ExpenseRecord {
  id:         string
  category:   string
  amount:     number
  gallons?:   number
  loadNumber: string
  date:       string
}

export interface LoadActuals {
  fuel:       number
  tolls:      number
  shop:       number    // repairs + supplies + other
  meals:      number
  total:      number
  gallons:    number    // from fuel entries with gallons field
  entries:    ExpenseRecord[]
}

export function readExpenses(): ExpenseRecord[] {
  try { return JSON.parse(localStorage.getItem('3b-expenses') ?? '[]') as ExpenseRecord[] }
  catch { return [] }
}

export function getLoadActuals(loadNumber: string): LoadActuals {
  const all = readExpenses()
  const entries = all.filter(e => e.loadNumber === loadNumber)

  const sum = (cat: string[]) =>
    entries.filter(e => cat.includes(e.category)).reduce((s, e) => s + e.amount, 0)

  const gallons = entries
    .filter(e => e.category === 'fuel' && e.gallons)
    .reduce((s, e) => s + (e.gallons ?? 0), 0)

  return {
    fuel:    sum(['fuel']),
    tolls:   sum(['tolls', 'parking']),
    shop:    sum(['repairs', 'supplies', 'def', 'other']),
    meals:   sum(['meals', 'lodging']),
    total:   entries.reduce((s, e) => s + e.amount, 0),
    gallons,
    entries,
  }
}

// ── Variance ─────────────────────────────────────────────────────────────────

export interface Variance {
  field:   string
  target:  number
  actual:  number
  delta:   number     // actual - target (positive = over budget)
  pct:     number     // delta / target * 100
  status:  'under' | 'on' | 'over'
}

export function computeVariances(target: LoadTarget, actuals: LoadActuals): Variance[] {
  const rows: [string, number, number][] = [
    ['Fuel',      target.fuelTarget,   actuals.fuel  ],
    ['Tolls',     target.tollsTarget,  actuals.tolls ],
    ['Shop/Misc', target.shopTarget,   actuals.shop  ],
  ]
  if (target.mealsTarget) rows.push(['Meals', target.mealsTarget, actuals.meals])

  return rows.map(([field, tgt, act]) => {
    const delta = act - tgt
    const pct   = tgt > 0 ? (delta / tgt) * 100 : 0
    return {
      field, target: tgt, actual: act, delta, pct,
      status: Math.abs(pct) < 5 ? 'on' : delta > 0 ? 'over' : 'under',
    }
  })
}

// ── Fuel MPG ─────────────────────────────────────────────────────────────────

export interface MpgStats {
  loadMpg:      number | null   // miles / total gallons for this load
  rollingMpg:   number | null   // all-time miles / all-time gallons
  totalGallons: number
  totalCost:    number
  costPerMile:  number | null
  fillupCount:  number
}

export function computeMpg(loadNumber: string, plannedMiles: number): MpgStats {
  const all     = readExpenses()
  const loadExp = all.filter(e => e.category === 'fuel' && e.loadNumber === loadNumber)
  const allFuel = all.filter(e => e.category === 'fuel')

  const loadGallons = loadExp.reduce((s, e) => s + (e.gallons ?? 0), 0)
  const allGallons  = allFuel.reduce((s, e)  => s + (e.gallons ?? 0), 0)
  const loadCost    = loadExp.reduce((s, e) => s + e.amount, 0)

  // All-time MPG: need total miles across all loads (rough: from load targets)
  const allTargets   = readLoadTargets()
  const allMiles     = allTargets.reduce((s, t) => s + t.plannedMiles, 0)

  return {
    loadMpg:      loadGallons > 0 && plannedMiles > 0 ? Math.round((plannedMiles / loadGallons) * 10) / 10 : null,
    rollingMpg:   allGallons  > 0 && allMiles > 0     ? Math.round((allMiles / allGallons) * 10) / 10      : null,
    totalGallons: loadGallons,
    totalCost:    loadCost,
    costPerMile:  plannedMiles > 0 && loadCost > 0 ? Math.round((loadCost / plannedMiles) * 1000) / 1000 : null,
    fillupCount:  loadExp.filter(e => e.gallons).length,
  }
}
