/**
 * Dump Truck Mode — fuel/mileage calculations (spec §9)
 *
 * Pure functions only — no I/O. The service layer looks up the prior
 * odometer reading for a vehicle and passes it in here.
 */

export interface FuelEfficiency {
  milesSincePrior: number | null
  gallonsUsed: number | null
  mpg: number | null
  costPerMile: number | null
}

/**
 * Compute derived fuel-efficiency figures for one fuel entry given the
 * vehicle's previous odometer reading. Any missing input yields a null
 * result for the figures that depend on it — never a fabricated number.
 */
export function computeFuelEfficiency(input: {
  odometer: number | null
  priorOdometer: number | null
  gallons: number | null
  totalCost: number | null
}): FuelEfficiency {
  const milesSincePrior =
    input.odometer != null && input.priorOdometer != null && input.odometer >= input.priorOdometer
      ? input.odometer - input.priorOdometer
      : null

  const gallonsUsed = input.gallons ?? null

  const mpg =
    milesSincePrior != null && gallonsUsed != null && gallonsUsed > 0
      ? Math.round((milesSincePrior / gallonsUsed) * 100) / 100
      : null

  const costPerMile =
    milesSincePrior != null && milesSincePrior > 0 && input.totalCost != null
      ? Math.round((input.totalCost / milesSincePrior) * 1000) / 1000
      : null

  return { milesSincePrior, gallonsUsed, mpg, costPerMile }
}

export const DEFAULT_UNREALISTIC_JUMP_MILES = 800

export interface FuelValidationFlags {
  decreasingOdometer: boolean
  unrealisticJump: boolean
  missingTotal: boolean
}

/**
 * Validation flags per spec §9: "Flag decreasing odometer entries,
 * unrealistic mileage jumps, and missing fuel totals." Informational only —
 * never blocks the save (spec: don't block legitimate work).
 */
export function validateFuelEntry(input: {
  odometer: number | null
  priorOdometer: number | null
  totalCost: number | null
  maxReasonableJumpMiles?: number
}): FuelValidationFlags {
  const decreasingOdometer =
    input.odometer != null && input.priorOdometer != null && input.odometer < input.priorOdometer

  const jumpThreshold = input.maxReasonableJumpMiles ?? DEFAULT_UNREALISTIC_JUMP_MILES
  const miles =
    input.odometer != null && input.priorOdometer != null && input.odometer >= input.priorOdometer
      ? input.odometer - input.priorOdometer
      : null
  const unrealisticJump = miles != null && miles > jumpThreshold

  const missingTotal = input.totalCost == null || input.totalCost <= 0

  return { decreasingOdometer, unrealisticJump, missingTotal }
}

/** Fuel cost allocated to one load — total shift fuel cost / loads completed that shift. */
export function computeFuelCostPerLoad(totalShiftFuelCost: number, loadCount: number): number | null {
  if (loadCount <= 0) return null
  return Math.round((totalShiftFuelCost / loadCount) * 100) / 100
}
