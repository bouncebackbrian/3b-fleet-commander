/**
 * Dump Truck Mode — AI dispatch trip planning: yard-arrival timing calc
 *
 * Pure functions only (same convention as hours.ts) — the service layer
 * (fleet/dumpTruck/dispatch.ts) fetches settings/route estimates and calls
 * these; nothing here talks to the database.
 *
 * Working-backwards formula (spec):
 *   target arrival   = required arrival - early-arrival buffer
 *   leave yard        = target arrival  - drive time
 *   yard arrival       = leave yard      - pre-trip minutes
 *
 * All timestamps in/out are ISO strings so callers never have to reason
 * about which Date object is authoritative.
 */

export interface DispatchTimingSettings {
  pretripMinutes: number
  earlyArrivalBufferMinutes: number
}

export interface ArrivalPlanInput {
  /** Customer/job-site required arrival time for the FIRST stop of the day. */
  requiredArrivalAt: string
  /** Real routed drive time, yard -> first site (minutes). */
  driveMinutes: number
  settings: DispatchTimingSettings
}

export interface ArrivalPlan {
  requiredArrivalAt: string
  targetArrivalAt: string
  leaveYardAt: string
  yardArrivalAt: string
  driveMinutes: number
  pretripMinutes: number
  earlyArrivalBufferMinutes: number
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString()
}

/** Work backwards from a required first-site arrival time to a recommended yard-arrival time. */
export function computeArrivalPlan(input: ArrivalPlanInput): ArrivalPlan {
  const { requiredArrivalAt, driveMinutes, settings } = input
  const targetArrivalAt = addMinutes(requiredArrivalAt, -settings.earlyArrivalBufferMinutes)
  const leaveYardAt = addMinutes(targetArrivalAt, -driveMinutes)
  const yardArrivalAt = addMinutes(leaveYardAt, -settings.pretripMinutes)

  return {
    requiredArrivalAt,
    targetArrivalAt,
    leaveYardAt,
    yardArrivalAt,
    driveMinutes,
    pretripMinutes: settings.pretripMinutes,
    earlyArrivalBufferMinutes: settings.earlyArrivalBufferMinutes,
  }
}

export type ArrivalRiskStatus = 'on_time' | 'at_risk' | 'late'

/**
 * Compare a current estimated arrival (e.g. required arrival re-projected
 * from a driver's live position/delay report) against the customer's
 * required arrival. Within the business's configured late window counts as
 * "at risk" (a dispatcher should be watching it) rather than an outright
 * miss; beyond it is "late".
 */
export function computeArrivalRisk(
  estimatedArrivalAt: string,
  requiredArrivalAt: string,
  maxLateMinutes: number,
): ArrivalRiskStatus {
  const deltaMinutes = (new Date(estimatedArrivalAt).getTime() - new Date(requiredArrivalAt).getTime()) / 60000
  if (deltaMinutes <= 0) return 'on_time'
  if (deltaMinutes <= maxLateMinutes) return 'at_risk'
  return 'late'
}

/**
 * Whether a location or required-arrival-time edit is material enough to
 * require re-routing rather than reusing a cached route estimate — compares
 * the age-independent inputs (not calculated_at) so an edit that reverts to
 * the same location/time doesn't force a pointless recompute.
 */
export function requiredArrivalChangedMaterially(
  previousRequiredArrivalAt: string | null,
  nextRequiredArrivalAt: string | null,
  thresholdMinutes: number,
): boolean {
  if (previousRequiredArrivalAt === nextRequiredArrivalAt) return false
  if (!previousRequiredArrivalAt || !nextRequiredArrivalAt) return true
  const deltaMinutes = Math.abs(
    (new Date(nextRequiredArrivalAt).getTime() - new Date(previousRequiredArrivalAt).getTime()) / 60000,
  )
  return deltaMinutes >= thresholdMinutes
}
