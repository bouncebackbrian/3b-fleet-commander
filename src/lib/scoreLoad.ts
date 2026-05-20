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
