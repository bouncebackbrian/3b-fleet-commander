// ── Runtime Guards ────────────────────────────────────────────────────────────
// Pure validation functions — return string[] of problems.
// Empty array = valid. These are informational (logged, not thrown).
// Callers decide whether to block the operation or just warn.

import type { LoadMission, HOSData } from '@/lib/dashboard/types'

// ── Mission fields ─────────────────────────────────────────────────────────────
export function validateMission(m: unknown): string[] {
  const errors: string[] = []
  if (!m || typeof m !== 'object') {
    errors.push('Mission is not an object')
    return errors
  }
  const obj = m as Partial<LoadMission>

  if (!obj.id?.trim())           errors.push('Missing mission id')
  if (!obj.origin?.trim())       errors.push('Missing origin')
  if (!obj.destination?.trim())  errors.push('Missing destination')

  if (obj.dispatchMiles != null && (isNaN(obj.dispatchMiles) || obj.dispatchMiles < 0))
    errors.push(`Invalid dispatchMiles: ${obj.dispatchMiles}`)
  if (obj.deadheadMiles != null && (isNaN(obj.deadheadMiles) || obj.deadheadMiles < 0))
    errors.push(`Invalid deadheadMiles: ${obj.deadheadMiles}`)
  if (obj.grossRate != null && (isNaN(obj.grossRate) || obj.grossRate < 0))
    errors.push(`Invalid grossRate: ${obj.grossRate}`)
  if (obj.fuelPrice != null && (isNaN(obj.fuelPrice) || obj.fuelPrice <= 0))
    errors.push(`Invalid fuelPrice: ${obj.fuelPrice}`)

  return errors
}

// ── HOS values ────────────────────────────────────────────────────────────────
export function validateHOS(h: unknown): string[] {
  const errors: string[] = []
  if (!h || typeof h !== 'object') {
    errors.push('HOS data is not an object')
    return errors
  }
  const obj = h as Partial<HOSData>

  if (obj.driveRemainingHrs != null) {
    if (isNaN(obj.driveRemainingHrs))
      errors.push('driveRemainingHrs is NaN')
    else if (obj.driveRemainingHrs < 0 || obj.driveRemainingHrs > 11)
      errors.push(`driveRemainingHrs out of range: ${obj.driveRemainingHrs}`)
  }
  if (obj.shiftRemainingHrs != null) {
    if (isNaN(obj.shiftRemainingHrs))
      errors.push('shiftRemainingHrs is NaN')
    else if (obj.shiftRemainingHrs < 0 || obj.shiftRemainingHrs > 14)
      errors.push(`shiftRemainingHrs out of range: ${obj.shiftRemainingHrs}`)
  }
  if (obj.cycleRemainingHrs != null) {
    if (isNaN(obj.cycleRemainingHrs))
      errors.push('cycleRemainingHrs is NaN')
    else if (obj.cycleRemainingHrs < 0 || obj.cycleRemainingHrs > 70)
      errors.push(`cycleRemainingHrs out of range: ${obj.cycleRemainingHrs}`)
  }
  if (obj.breakInHrs != null && isNaN(obj.breakInHrs))
    errors.push('breakInHrs is NaN')

  return errors
}

// ── NaN sweep — checks all number fields of any flat object ───────────────────
export function hasNaNValues(obj: Record<string, unknown>): boolean {
  return Object.values(obj).some(v => typeof v === 'number' && isNaN(v))
}

// ── Fuel result sanity ────────────────────────────────────────────────────────
// Returns true if the result looks sane (no NaN in key numeric fields).
export function isFuelResultSafe(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const r = result as Record<string, unknown>
  const keys = ['gallonsNeeded', 'fuelCostTotal', 'priceUsed', 'totalMiles']
  return keys.every(k => !(k in r) || (typeof r[k] === 'number' && !isNaN(r[k] as number)))
}

// ── Score result sanity ───────────────────────────────────────────────────────
export function isScoreResultSafe(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const r = result as Record<string, unknown>
  const keys = ['score', 'netRpm', 'netMargin', 'fuelCost']
  return keys.every(k => !(k in r) || (typeof r[k] === 'number' && !isNaN(r[k] as number)))
}
