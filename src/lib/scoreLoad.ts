// ── 3B Fleet Commander — Load Scoring Engine ────────────────────────────────
// Based on 0–12 point scoring system from knowledge files

export type ScoreVerdict = 'TAKE' | 'CAUTION' | 'AVOID'
export type MarginFlag   = 'STRONG' | 'OK' | 'MARGINAL' | 'REJECT'
export type RigType      = 'semi-solo' | 'semi-team' | 'hotshot'

export interface ScoreInput {
  loadedMiles:         number
  deadheadMiles:       number
  loadType:            string    // 'Drop & Hook', 'Live Load', 'FTL', etc.
  waitHours:           number
  reloadKnown:         boolean
  reloadAreaStrength:  1 | 2 | 3 // 1=weak, 2=avg, 3=strong
  hasOvernightParking: boolean
  grossRate:           number
  mpg:                 number
  fuelPrice:           number
  rigType:             RigType
}

export interface ScoreBreakdown {
  label:  string
  points: number
  detail: string
}

export interface ScoreResult {
  score:          number          // 0–12
  verdict:        ScoreVerdict
  verdictColor:   string
  breakdown:      ScoreBreakdown[]
  // financials
  fuelCost:       number
  netMargin:      number
  grossRpm:       number
  netRpm:         number
  deadheadRatio:  number          // %
  marginFlag:     MarginFlag
  marginColor:    string
  // flags
  highDeadhead:   boolean         // ratio > 15%
  detentionRisk:  boolean
  counterOffer:   string | null
}

export function scoreLoad(input: ScoreInput): ScoreResult {
  const {
    loadedMiles, deadheadMiles, loadType, waitHours,
    reloadKnown, reloadAreaStrength, hasOvernightParking,
    grossRate, mpg, fuelPrice, rigType,
  } = input

  const breakdown: ScoreBreakdown[] = []
  let raw = 0

  // ── Miles ────────────────────────────────────────────────────────────────────
  if      (loadedMiles >= 500) { raw += 3; breakdown.push({ label: 'Miles',        points:  3, detail: `${loadedMiles} mi — long haul` }) }
  else if (loadedMiles >= 250) { raw += 2; breakdown.push({ label: 'Miles',        points:  2, detail: `${loadedMiles} mi — mid-range` }) }
  else                         { raw -= 1; breakdown.push({ label: 'Miles',        points: -1, detail: `${loadedMiles} mi — short haul` }) }

  // ── Deadhead ─────────────────────────────────────────────────────────────────
  if      (deadheadMiles <= 50)  { raw += 2; breakdown.push({ label: 'Deadhead',   points:  2, detail: `${deadheadMiles} mi — minimal` }) }
  else if (deadheadMiles <= 100) { raw += 1; breakdown.push({ label: 'Deadhead',   points:  1, detail: `${deadheadMiles} mi — reasonable` }) }
  else                           { raw -= 2; breakdown.push({ label: 'Deadhead',   points: -2, detail: `${deadheadMiles} mi — high` }) }

  // ── Load type ────────────────────────────────────────────────────────────────
  const lt = loadType.toLowerCase()
  if (lt.includes('drop') || lt.includes('hook') || lt.includes('preload')) {
    raw += 2; breakdown.push({ label: 'Load type', points:  2, detail: 'Drop & hook / preloaded' })
  } else if (lt.includes('live')) {
    raw -= 1; breakdown.push({ label: 'Load type', points: -1, detail: 'Live load' })
  } else {
    breakdown.push({ label: 'Load type', points: 0, detail: loadType || 'Not specified' })
  }

  // ── Wait hours ───────────────────────────────────────────────────────────────
  if      (waitHours <= 2) { raw += 1; breakdown.push({ label: 'Wait time', points:  1, detail: `${waitHours}h — acceptable` }) }
  else if (waitHours >= 6) { raw -= 3; breakdown.push({ label: 'Wait time', points: -3, detail: `${waitHours}h — excessive` }) }
  else                     {           breakdown.push({ label: 'Wait time', points:  0, detail: `${waitHours}h` }) }

  // ── Reload known ─────────────────────────────────────────────────────────────
  if (reloadKnown) { raw += 3; breakdown.push({ label: 'Reload secured', points:  3, detail: 'Known reload lined up' }) }
  else             { raw -= 2; breakdown.push({ label: 'Reload secured', points: -2, detail: 'No reload secured' }) }

  // ── Reload area strength ─────────────────────────────────────────────────────
  if      (reloadAreaStrength === 3) { raw += 3; breakdown.push({ label: 'Area strength', points:  3, detail: 'Strong freight market' }) }
  else if (reloadAreaStrength === 2) { raw += 1; breakdown.push({ label: 'Area strength', points:  1, detail: 'Average freight market' }) }
  else                               { raw -= 2; breakdown.push({ label: 'Area strength', points: -2, detail: 'Weak freight market' }) }

  // ── Overnight parking ────────────────────────────────────────────────────────
  if (hasOvernightParking) { raw += 1; breakdown.push({ label: 'Parking', points: 1, detail: 'Overnight parking available' }) }

  const score = Math.max(0, Math.min(12, raw))

  let verdict: ScoreVerdict
  let verdictColor: string
  if      (score >= 7) { verdict = 'TAKE';    verdictColor = 'var(--success)' }
  else if (score <= 3) { verdict = 'AVOID';   verdictColor = 'var(--error)'   }
  else                 { verdict = 'CAUTION'; verdictColor = 'var(--warn)'    }

  // ── Financial calcs ──────────────────────────────────────────────────────────
  const safeMpg       = mpg > 0 ? mpg : 7.5
  const totalMiles    = loadedMiles + deadheadMiles
  const fuelCost      = (totalMiles / safeMpg) * fuelPrice
  const netMargin     = grossRate - fuelCost
  const grossRpm      = loadedMiles > 0 ? grossRate / loadedMiles : 0
  const netRpm        = totalMiles  > 0 ? grossRate / totalMiles  : 0
  const deadheadRatio = loadedMiles > 0 ? (deadheadMiles / loadedMiles) * 100 : 0

  // ── Margin flag by rig ───────────────────────────────────────────────────────
  let marginFlag: MarginFlag
  if (rigType === 'hotshot') {
    if      (netRpm >  2.50) marginFlag = 'STRONG'
    else if (netRpm >= 2.00) marginFlag = 'OK'
    else if (netRpm >= 1.50) marginFlag = 'MARGINAL'
    else                     marginFlag = 'REJECT'
  } else if (rigType === 'semi-team') {
    if      (netRpm >  2.50) marginFlag = 'STRONG'
    else if (netRpm >= 2.00) marginFlag = 'OK'
    else if (netRpm >= 1.75) marginFlag = 'MARGINAL'
    else                     marginFlag = 'REJECT'
  } else {
    // semi-solo (default)
    if      (netRpm >  2.00) marginFlag = 'STRONG'
    else if (netRpm >= 1.50) marginFlag = 'OK'
    else if (netRpm >= 1.20) marginFlag = 'MARGINAL'
    else                     marginFlag = 'REJECT'
  }

  const marginColor =
    marginFlag === 'STRONG'   ? 'var(--success)' :
    marginFlag === 'OK'       ? 'var(--primary)'  :
    marginFlag === 'MARGINAL' ? 'var(--warn)'     :
                                'var(--error)'

  const highDeadhead   = deadheadRatio > 15
  const detentionRisk  = waitHours > 2 || (lt.includes('live') && waitHours === 0)

  let counterOffer: string | null = null
  if (marginFlag === 'MARGINAL' && grossRate > 0) {
    const target    = Math.ceil(grossRate * 1.15)
    const targetRpm = loadedMiles > 0 ? (target / loadedMiles) : 0
    counterOffer = `Counter at $${target.toLocaleString()} ($${targetRpm.toFixed(2)}/mi) — +15% brings this into profitable territory`
  } else if (marginFlag === 'REJECT' && loadedMiles > 0) {
    const floor     = rigType === 'hotshot' ? 1.50 : 1.20
    const minRate   = Math.ceil(totalMiles * floor)
    counterOffer    = `Minimum viable: $${minRate.toLocaleString()} — current offer is below floor`
  }

  return {
    score, verdict, verdictColor, breakdown,
    fuelCost, netMargin, grossRpm, netRpm, deadheadRatio,
    marginFlag, marginColor,
    highDeadhead, detentionRisk, counterOffer,
  }
}

// ── Regional diesel prices (May 2026) ────────────────────────────────────────
export const DIESEL_BY_STATE: Record<string, number> = {
  CA: 4.65, WA: 4.20, OR: 4.20,
  NV: 3.90, UT: 3.90, CO: 3.90,
  AZ: 3.75, NM: 3.75, FL: 3.75,
  IA: 3.70, IL: 3.70, MO: 3.70, KS: 3.70,
  TX: 3.60, OK: 3.60, AR: 3.60,
  LA: 3.55, MS: 3.55, AL: 3.55,
  NY: 4.10, NJ: 4.10, CT: 4.10,
  PA: 3.95, MD: 3.95, VA: 3.95,
}

export function getDieselPrice(stateOrLocation: string): number {
  const upper = stateOrLocation.toUpperCase()
  // Try direct state abbrev match
  if (DIESEL_BY_STATE[upper]) return DIESEL_BY_STATE[upper]
  // Scan for 2-letter state code in the string
  for (const [state, price] of Object.entries(DIESEL_BY_STATE)) {
    if (new RegExp(`\\b${state}\\b`).test(upper)) return price
  }
  return 3.85 // national average
}

export function getMpgDefault(rigType: RigType): number {
  return rigType === 'hotshot' ? 12.0 : 7.5
}

// ── Fuel Intelligence ────────────────────────────────────────────────────────

/** One suggested fuel stop along the route */
export interface FuelStop {
  name:     string   // e.g. "Love's — Amarillo, TX"
  location: string   // city, state
  network:  'Loves' | 'TA/Petro'
  corridor: string   // e.g. "I-40"
  estGal:   number   // gallons to fill at this stop
  estCost:  number   // dollars
}

export type FuelRiskLevel = 'LOW' | 'MODERATE' | 'HIGH'

export interface FuelRisk {
  level:   FuelRiskLevel
  message: string
}

export interface FuelIntelInput {
  origin:         string   // full "City, ST" string
  destination:    string
  loadedMiles:    number
  deadheadMiles:  number
  rigType:        RigType
  mpg?:           number   // override; defaults to getMpgDefault
  fuelPrice?:     number   // override; defaults to getDieselPrice(origin)
  grossRate?:     number
}

export interface FuelIntelResult {
  totalMiles:     number
  gallonsNeeded:  number   // total trip gallons
  reserveGal:     number   // safety reserve (10% of tank)
  fuelCostTotal:  number   // gallons × price
  costPerMile:    number   // fuel cost / total miles
  mpgUsed:        number
  priceUsed:      number
  priceIsDefault: boolean
  tankCapGal:     number   // nominal tank size by rig
  stops:          FuelStop[]
  risks:          FuelRisk[]
  // quick summary strings
  summaryLine:    string   // "~42 gal · $162 · 2 stops"
}

/** Returns true if fuelPrice was not in DIESEL_BY_STATE (i.e. national default was used) */
export function isPriceDefault(location: string): boolean {
  if (!location || !location.trim()) return true   // blank/missing origin → default
  const upper = location.toUpperCase()
  if (DIESEL_BY_STATE[upper]) return false
  for (const state of Object.keys(DIESEL_BY_STATE)) {
    if (new RegExp(`\\b${state}\\b`).test(upper)) return false
  }
  return true
}

// ── Love's corridor definitions ──────────────────────────────────────────────
interface CorridorStop {
  city:     string
  state:    string
  corridor: string
}

const LOVES_CORRIDORS: CorridorStop[] = [
  // I-80
  { city: 'Elko',        state: 'NV', corridor: 'I-80' },
  { city: 'Wells',       state: 'NV', corridor: 'I-80' },
  { city: 'Winnemucca',  state: 'NV', corridor: 'I-80' },
  { city: 'Lovelock',    state: 'NV', corridor: 'I-80' },
  { city: 'Fernley',     state: 'NV', corridor: 'I-80' },
  // I-40
  { city: 'Kingman',     state: 'AZ', corridor: 'I-40' },
  { city: 'Winslow',     state: 'AZ', corridor: 'I-40' },
  { city: 'Gallup',      state: 'NM', corridor: 'I-40' },
  { city: 'Amarillo',    state: 'TX', corridor: 'I-40' },
  { city: 'Oklahoma City', state: 'OK', corridor: 'I-40' },
  // I-15
  { city: 'Las Vegas',   state: 'NV', corridor: 'I-15' },
  { city: 'St. George',  state: 'UT', corridor: 'I-15' },
  { city: 'Beaver',      state: 'UT', corridor: 'I-15' },
  { city: 'Nephi',       state: 'UT', corridor: 'I-15' },
  { city: 'Salt Lake City', state: 'UT', corridor: 'I-15' },
  // I-10
  { city: 'Phoenix',     state: 'AZ', corridor: 'I-10' },
  { city: 'Tucson',      state: 'AZ', corridor: 'I-10' },
  { city: 'El Paso',     state: 'TX', corridor: 'I-10' },
  { city: 'San Antonio', state: 'TX', corridor: 'I-10' },
  { city: 'Houston',     state: 'TX', corridor: 'I-10' },
  // I-70
  { city: 'Grand Junction', state: 'CO', corridor: 'I-70' },
  { city: 'Denver',      state: 'CO', corridor: 'I-70' },
  { city: 'Salina',      state: 'KS', corridor: 'I-70' },
  { city: 'Topeka',      state: 'KS', corridor: 'I-70' },
  // I-5
  { city: 'Red Bluff',   state: 'CA', corridor: 'I-5' },
  { city: 'Stockton',    state: 'CA', corridor: 'I-5' },
  { city: 'Buttonwillow', state: 'CA', corridor: 'I-5' },
  { city: 'Los Angeles', state: 'CA', corridor: 'I-5' },
]

/**
 * Match corridor stops whose state appears in either the origin or destination string.
 * Returns up to 3 stops for known corridors only — returns empty when states are not
 * in the database so the caller can surface a "plan manually" risk flag instead of
 * suggesting geographically wrong stops.
 */
function pickFuelStops(
  origin: string,
  destination: string,
  refuelEveryMi: number,
  totalMiles: number,
  pricePerGal: number,
  mpg: number,
): FuelStop[] {
  const combined = (origin + ' ' + destination).toUpperCase()

  // Only use stops whose state code appears in origin or destination — no fallback
  // to unrelated corridors when we can't match the route.
  const candidates = LOVES_CORRIDORS.filter(s =>
    new RegExp(`\\b${s.state}\\b`).test(combined)
  )

  if (candidates.length === 0) return []

  const stopCount  = Math.max(1, Math.min(3, Math.floor(totalMiles / refuelEveryMi)))
  const safeMpg    = mpg > 0 ? mpg : 7.5
  const galPerStop = refuelEveryMi / safeMpg

  const picked: FuelStop[] = []
  const usedCorridors = new Set<string>()

  for (const s of candidates) {
    if (picked.length >= stopCount) break
    // Spread stops across corridors on multi-leg routes
    if (usedCorridors.has(s.corridor) && picked.length < stopCount - 1) continue
    const estGal  = Math.round(galPerStop)
    const estCost = Math.round(estGal * pricePerGal * 100) / 100
    picked.push({
      name:     `Love's — ${s.city}, ${s.state}`,
      location: `${s.city}, ${s.state}`,
      network:  'Loves',
      corridor: s.corridor,
      estGal,
      estCost,
    })
    usedCorridors.add(s.corridor)
  }

  return picked
}

/** Primary fuel intelligence function */
export function fuelIntel(input: FuelIntelInput): FuelIntelResult {
  const {
    origin     = '',
    destination = '',
    rigType,
  } = input

  // Clamp inputs — never let bad data reach division
  const loadedMiles  = Math.max(0, input.loadedMiles  || 0)
  const deadheadMiles = Math.max(0, input.deadheadMiles || 0)
  const totalMiles   = loadedMiles + deadheadMiles

  // Safe rig type with explicit fallback
  const safeRig: RigType = (rigType === 'hotshot' || rigType === 'semi-team' || rigType === 'semi-solo')
    ? rigType : 'semi-solo'

  const mpgUsed    = input.mpg && input.mpg > 0 ? input.mpg : getMpgDefault(safeRig)
  const safeMpg    = Math.max(1, mpgUsed)  // never divide by zero

  // Tank capacity by rig (conservative usable estimate)
  const tankCapGal    = safeRig === 'hotshot' ? 40 : 120   // dual 60-gal saddle tanks for semi
  // Refuel trigger distance
  const refuelEveryMi = safeRig === 'hotshot' ? 150 : 200

  // Price: prefer explicit input → regional lookup → national default
  const hasExplicitPrice = input.fuelPrice != null && input.fuelPrice > 0
  const priceIsDefault   = !hasExplicitPrice && isPriceDefault(origin)
  const priceUsed        = hasExplicitPrice
    ? input.fuelPrice!
    : getDieselPrice(origin)   // getDieselPrice returns 3.85 when origin is blank

  // Zero-miles early exit — return skeleton result with informative summary
  if (totalMiles === 0) {
    return {
      totalMiles: 0, gallonsNeeded: 0, reserveGal: Math.round(tankCapGal * 0.10),
      fuelCostTotal: 0, costPerMile: 0, mpgUsed: safeMpg, priceUsed, priceIsDefault,
      tankCapGal, stops: [], risks: [], summaryLine: 'Enter miles to calculate',
    }
  }

  // Core calcs
  const gallonsNeeded = totalMiles / safeMpg
  const reserveGal    = tankCapGal * 0.10
  const fuelCostTotal = gallonsNeeded * priceUsed
  const costPerMile   = fuelCostTotal / totalMiles

  // Fuel stops — only when total miles exceed one refuel interval
  const stops = totalMiles >= refuelEveryMi
    ? pickFuelStops(origin, destination, refuelEveryMi, totalMiles, priceUsed, safeMpg)
    : []

  // ── Risk assessment ──────────────────────────────────────────────────────────
  const risks: FuelRisk[] = []

  // Missing origin
  if (!origin.trim()) {
    risks.push({ level: 'LOW', message: 'Origin not entered — fuel price defaulting to national avg $3.85/gal' })
  } else if (priceIsDefault) {
    risks.push({ level: 'LOW', message: `Origin state not in price database — using national avg $3.85/gal (verify at pump)` })
  }

  // High fuel-to-gross ratio (only when rate is provided)
  if (input.grossRate && input.grossRate > 0) {
    const fuelRatio = fuelCostTotal / input.grossRate
    if (fuelRatio > 0.40) {
      risks.push({ level: 'HIGH', message: `Fuel is ${Math.round(fuelRatio * 100)}% of gross rate — margin is critically tight; counter or reject` })
    } else if (fuelRatio > 0.25) {
      risks.push({ level: 'MODERATE', message: `Fuel is ${Math.round(fuelRatio * 100)}% of gross rate — watch pump price; any spike eats margin` })
    }
  }

  // Long haul planning note
  if (totalMiles > 500) {
    risks.push({ level: 'LOW', message: `Long haul (${totalMiles} mi) — keep tank above 10% reserve (${Math.round(reserveGal)} gal minimum)` })
  }

  // High deadhead fuel cost
  if (deadheadMiles > 0 && deadheadMiles / (loadedMiles || 1) > 0.15) {
    const dhFuelCost = Math.round((deadheadMiles / safeMpg) * priceUsed)
    risks.push({ level: 'MODERATE', message: `High deadhead (${deadheadMiles} mi) — ~$${dhFuelCost} in uncompensated fuel before first loaded mile` })
  }

  // No corridor stops found for the route
  if (totalMiles > 200 && stops.length === 0) {
    risks.push({ level: 'LOW', message: "Route states not in Love's corridor database — plan fuel stops manually before departure" })
  }

  // ── Summary line ─────────────────────────────────────────────────────────────
  const stopLabel   = stops.length === 1 ? '1 corridor stop' : `${stops.length} corridor stops`
  const summaryLine = `~${Math.ceil(gallonsNeeded)} gal · $${Math.round(fuelCostTotal)} est.${stops.length > 0 ? ` · ${stopLabel}` : ''}`

  return {
    totalMiles,
    gallonsNeeded: Math.ceil(gallonsNeeded * 10) / 10,
    reserveGal:    Math.round(reserveGal),
    fuelCostTotal: Math.round(fuelCostTotal * 100) / 100,
    costPerMile:   Math.round(costPerMile * 1000) / 1000,
    mpgUsed:       safeMpg,
    priceUsed,
    priceIsDefault,
    tankCapGal,
    stops,
    risks,
    summaryLine,
  }
}
