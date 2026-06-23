/**
 * trucker-helpers.ts — FMCSA Regulation Lookups & HOS Calculation Utilities
 *
 * Helper functions for:
 *   - HOS rules (11-hour, 14-hour, 60/70-hour, 30-min break, 34-hour restart)
 *   - IFTA fuel tax calculations
 *   - Regulation lookup / DOT compliance
 *   - Trip feasibility (can I make it given my clock?)
 */

// ── HOS Regulations (FMCSA 49 CFR Part 395) ──────────────────────────────────

export interface HOSRules {
  /** Maximum driving time per day (hours) */
  maxDrivingHours: number
  /** Maximum on-duty time per day (hours) */
  maxOnDutyHours: number
  /** Maximum driving time within the cycle window */
  maxCycleHours: number
  /** Cycle window (days): 7 or 8 */
  cycleDays: number
  /** Minimum off-duty time required after max on-duty (hours) */
  resetHours: number
  /** Minimum break time required after X hours of driving */
  breakAfterHours: number
  /** Minimum break duration in minutes */
  breakDurationMin: number
  /** Whether 30-minute break is required (property-carrying only) */
  breakRequired: boolean
  /** Whether sleeper berth split is allowed */
  sleeperSplitAllowed: boolean
  /** Short-haul exemption available */
  shortHaulExemption: boolean
  /** Adverse driving conditions exception */
  adverseConditions: boolean
}

export type DriverType = 'property' | 'passenger' | 'oil_field'

export const HOS_REGULATIONS: Record<DriverType, HOSRules> = {
  property: {
    maxDrivingHours: 11,
    maxOnDutyHours: 14,
    maxCycleHours: 70,
    cycleDays: 8,
    resetHours: 10,
    breakAfterHours: 8,
    breakDurationMin: 30,
    breakRequired: true,
    sleeperSplitAllowed: true,
    shortHaulExemption: true,
    adverseConditions: true,
  },
  passenger: {
    maxDrivingHours: 10,
    maxOnDutyHours: 15,
    maxCycleHours: 60,
    cycleDays: 7,
    resetHours: 8,
    breakAfterHours: 8,
    breakDurationMin: 30,
    breakRequired: false,
    sleeperSplitAllowed: false,
    shortHaulExemption: false,
    adverseConditions: false,
  },
  oil_field: {
    maxDrivingHours: 11,
    maxOnDutyHours: 14,
    maxCycleHours: 85,
    cycleDays: 8,
    resetHours: 10,
    breakAfterHours: 8,
    breakDurationMin: 30,
    breakRequired: true,
    sleeperSplitAllowed: true,
    shortHaulExemption: false,
    adverseConditions: true,
  },
}

// ── HOS Calculation ──────────────────────────────────────────────────────────

export interface HOSStatus {
  /** Hours driven today */
  hoursDriven: number
  /** Hours on duty today */
  hoursOnDuty: number
  /** Drive hours remaining today (11-hour clock) */
  drivingHoursRemaining: number
  /** On-duty hours remaining today (14-hour clock) */
  onDutyHoursRemaining: number
  /** Cycle hours used */
  cycleHoursUsed: number
  /** Cycle hours remaining (70/60-hour clock) */
  cycleHoursRemaining: number
  /** Whether the 30-min break is required */
  breakRequired: boolean
  /** Minutes remaining until 30-min break is due */
  breakDueInMinutes: number
  /** Whether driver is in violation */
  inViolation: boolean
  /** Description of any violations */
  violations: string[]
  /** Whether 34-hour restart is available */
  restartAvailable: boolean
  /** Hours until 34-hour restart is complete */
  restartHoursRemaining: number
}

/**
 * Calculate current HOS status based on inputs.
 */
export function calculateHOSStatus(params: {
  hoursDriven: number
  hoursOnDuty: number
  cycleHoursUsed: number
  driverType?: DriverType
  lastBreakTime?: Date
  currentTime?: Date
}): HOSStatus {
  const driverType = params.driverType ?? 'property'
  const rules = HOS_REGULATIONS[driverType]
  const now = params.currentTime ?? new Date()

  const hoursDriven = Math.max(0, params.hoursDriven)
  const hoursOnDuty = Math.max(0, params.hoursOnDuty)
  const cycleHoursUsed = Math.max(0, params.cycleHoursUsed)

  // 11-hour driving clock
  const drivingRemaining = Math.max(0, rules.maxDrivingHours - hoursDriven)

  // 14-hour on-duty clock (includes driving + on-duty, not off-duty/sleeper)
  const onDutyRemaining = Math.max(0, rules.maxOnDutyHours - hoursOnDuty)

  // 70/60-hour cycle clock
  const cycleRemaining = Math.max(0, rules.maxCycleHours - cycleHoursUsed)

  // 30-minute break check
  let breakDueInMinutes = Infinity
  let breakRequired = false
  if (rules.breakRequired && hoursDriven >= rules.breakAfterHours) {
    breakRequired = true
    if (params.lastBreakTime) {
      const minsSinceBreak = (now.getTime() - params.lastBreakTime.getTime()) / 60000
      breakDueInMinutes = Math.max(0, rules.breakDurationMin - minsSinceBreak)
    } else {
      breakDueInMinutes = 0 // break is overdue
    }
  }

  // Violation check
  const violations: string[] = []
  if (hoursDriven > rules.maxDrivingHours) violations.push(`Exceeded ${rules.maxDrivingHours}-hour driving limit (${hoursDriven.toFixed(1)}h)`)
  if (hoursOnDuty > rules.maxOnDutyHours) violations.push(`Exceeded ${rules.maxOnDutyHours}-hour on-duty limit (${hoursOnDuty.toFixed(1)}h)`)
  if (cycleHoursUsed > rules.maxCycleHours) violations.push(`Exceeded ${rules.maxCycleHours}-hour cycle limit (${cycleHoursUsed.toFixed(1)}h)`)
  if (breakRequired && breakDueInMinutes <= 0) violations.push(`30-minute break is overdue`)

  // 34-hour restart check (only for 70/8 cycle)
  const resetHoursNeeded = 34
  const restartHoursRemaining = Math.max(0, resetHoursNeeded - (cycleHoursUsed > 0 ? 0 : 0))
  const restartAvailable = cycleHoursUsed >= rules.maxCycleHours - 1

  return {
    hoursDriven,
    hoursOnDuty,
    drivingHoursRemaining: Math.min(drivingRemaining, onDutyRemaining),
    onDutyHoursRemaining: onDutyRemaining,
    cycleHoursUsed,
    cycleHoursRemaining,
    breakRequired,
    breakDueInMinutes: Math.round(breakDueInMinutes),
    inViolation: violations.length > 0,
    violations,
    restartAvailable,
    restartHoursRemaining,
  }
}

/**
 * Determine if a trip is feasible given current HOS.
 */
export function canCompleteTrip(params: {
  currentHOS: HOSStatus
  estimatedDrivingHours: number
  estimatedOnDutyHours: number
  hasHadBreak: boolean
}): { feasible: boolean; reason: string } {
  const { currentHOS, estimatedDrivingHours, estimatedOnDutyHours, hasHadBreak } = params

  // Check driving clock
  if (estimatedDrivingHours > currentHOS.drivingHoursRemaining) {
    return {
      feasible: false,
      reason: `Need ${estimatedDrivingHours.toFixed(1)}h drive time but only ${currentHOS.drivingHoursRemaining.toFixed(1)}h remaining on 11-hour clock.`,
    }
  }

  // Check on-duty clock
  if (estimatedOnDutyHours > currentHOS.onDutyHoursRemaining) {
    return {
      feasible: false,
      reason: `Need ${estimatedOnDutyHours.toFixed(1)}h on-duty but only ${currentHOS.onDutyHoursRemaining.toFixed(1)}h remaining on 14-hour clock.`,
    }
  }

  // Check cycle
  if (estimatedDrivingHours > currentHOS.cycleHoursRemaining) {
    return {
      feasible: false,
      reason: `Need ${estimatedDrivingHours.toFixed(1)}h but only ${currentHOS.cycleHoursRemaining.toFixed(1)}h left in cycle. Need 34-hour restart.`,
    }
  }

  return { feasible: true, reason: 'You can complete this trip within your HOS limits.' }
}

// ── FMCSA Regulation Lookups ─────────────────────────────────────────────────

export interface FMCSARegulation {
  /** Regulation number (e.g., 49 CFR §395.3) */
  citation: string
  /** Short title */
  title: string
  /** Concise explanation */
  summary: string
  /** Category: 'hos' | 'inspection' | 'cargo' | 'equipment' | 'licensing' */
  category: 'hos' | 'inspection' | 'cargo' | 'equipment' | 'licensing'
  /** Keywords for search */
  keywords: string[]
}

export const FMCSA_REGULATIONS: FMCSARegulation[] = [
  {
    citation: '49 CFR §395.3',
    title: 'Maximum Driving Time',
    summary: 'Drivers may drive a maximum of 11 hours after 10 consecutive hours off duty. No driving after 14 hours on duty following 10 hours off.',
    category: 'hos',
    keywords: ['11-hour', '14-hour', 'driving limit', 'on duty', 'max drive'],
  },
  {
    citation: '49 CFR §395.5',
    title: '60/70 Hour Limit',
    summary: 'Drivers may not drive after 60 hours on duty in 7 days or 70 hours in 8 days. A 34-hour restart resets the cycle.',
    category: 'hos',
    keywords: ['60-hour', '70-hour', 'cycle', '7-day', '8-day', 'restart', '34-hour'],
  },
  {
    citation: '49 CFR §395.3(a)(2)',
    title: '30-Minute Break Rule',
    summary: 'Drivers must take a 30-minute break after 8 hours of driving time. The break can be off-duty or sleeper berth. It can be split into two 15-minute periods.',
    category: 'hos',
    keywords: ['30-minute', 'break', 'rest break', '8-hour'],
  },
  {
    citation: '49 CFR §395.1(g)',
    title: '16-Hour Short-Haul Exception',
    summary: 'Drivers operating within 150 air-miles of their reporting location may extend the 14-hour on-duty window to 16 hours, once per 34-hour restart.',
    category: 'hos',
    keywords: ['short haul', '150 air-mile', '16-hour', 'exception'],
  },
  {
    citation: '49 CFR §395.1(h)',
    title: 'Adverse Driving Conditions Exception',
    summary: 'The 11-hour driving limit may be extended by 2 hours if adverse weather, traffic, or road conditions prevented the driver from making it to a safe parking location.',
    category: 'hos',
    keywords: ['adverse', 'weather', 'exception', 'snow', 'traffic', 'construction'],
  },
  {
    citation: '49 CFR §395.1(g)(2)',
    title: 'Sleeper Berth Split',
    summary: 'Drivers may split the 10-hour off-duty period into two periods: at least 7 hours in the sleeper and at least 2 hours off-duty or in the sleeper (8/2 split), totaling 10 hours. Neither period starts the 14-hour clock until after both periods are complete.',
    category: 'hos',
    keywords: ['sleeper', 'split', '8/2', '7/3', 'berth'],
  },
  {
    citation: '49 CFR §396.11',
    title: 'Pre-Trip & Post-Trip Inspections',
    summary: 'Drivers must prepare a written DVIR (Driver Vehicle Inspection Report) at the end of each day. The report lists any defects found. Before driving, the driver must review the last report.',
    category: 'inspection',
    keywords: ['DVIR', 'pre-trip', 'post-trip', 'inspection', 'defect'],
  },
  {
    citation: '49 CFR §392.9',
    title: 'Cargo Securement',
    summary: 'Drivers must inspect cargo and securement devices within the first 50 miles and ensure the cargo is properly secured. Over time, drivers must re-check at every change of duty status.',
    category: 'cargo',
    keywords: ['cargo', 'secure', 'straps', 'chains', 'tarps', 'load securement'],
  },
  {
    citation: '49 CFR §397.5',
    title: 'Hazmat Routing',
    summary: 'Drivers transporting hazardous materials (placardable quantities) must follow designated hazmat routes. No hazmat in tunnels marked "No Hazmat." Routes must be pre-approved by the carrier.',
    category: 'cargo',
    keywords: ['hazmat', 'hazardous', 'placard', 'routing', 'tunnel'],
  },
  {
    citation: '49 CFR §383.5',
    title: 'CDL Classes & Endorsements',
    summary: 'Class A: combination vehicles 26,001+ lbs. Class B: single vehicles 26,001+ lbs. Class C: 16+ passengers or hazmat. Endorsements: H (hazmat), N (tank), T (double/triple), P (passenger), S (school bus), X (H+N combined).',
    category: 'licensing',
    keywords: ['CDL', 'class A', 'class B', 'endorsement', 'hazmat', 'tank', 'doubles'],
  },
  {
    citation: '49 CFR §382.301',
    title: 'DOT Drug & Alcohol Testing',
    summary: 'Drivers are subject to random drug and alcohol testing. A BAC of 0.04% or higher while on duty is a violation. Refusal to test counts as a positive result. Clearinghouse checks required for new hires.',
    category: 'equipment',
    keywords: ['drug test', 'alcohol', 'BAC', 'clearinghouse', 'DOT', 'random'],
  },
  {
    citation: '49 CFR §393.95',
    title: 'Required Emergency Equipment',
    summary: 'All commercial motor vehicles must carry: fire extinguisher (B:C rated), reflective triangles (3), and spare fuses (if vehicle uses fuses). Additional requirements for hazmat carriers.',
    category: 'equipment',
    keywords: ['fire extinguisher', 'triangles', 'reflectors', 'emergency', 'safety equipment'],
  },
]

/**
 * Search FMCSA regulations by keyword or question.
 */
export function searchRegulations(query: string): FMCSARegulation[] {
  const q = query.toLowerCase()
  return FMCSA_REGULATIONS.filter(
    r =>
      r.title.toLowerCase().includes(q) ||
      r.summary.toLowerCase().includes(q) ||
      r.citation.toLowerCase().includes(q) ||
      r.keywords.some(k => k.toLowerCase().includes(q)),
  )
}

// ── IFTA Fuel Tax ────────────────────────────────────────────────────────────

export interface IFTAFuelEntry {
  state: string
  gallons: number
  milesInState: number
}

export interface IFTAReport {
  entries: IFTAFuelEntry[]
  totalMiles: number
  totalGallons: number
  averageMpg: number
  fuelTaxDue: number
}

const STATE_FUEL_TAX_RATES: Record<string, number> = {
  AL: 0.28, AR: 0.315, AZ: 0.26, CA: 0.44, CO: 0.325,
  CT: 0.39, DC: 0.32, DE: 0.29, FL: 0.37, GA: 0.33,
  HI: 0.51, IA: 0.325, ID: 0.33, IL: 0.405, IN: 0.33,
  KS: 0.33, KY: 0.30, LA: 0.30, MA: 0.36, MD: 0.335,
  ME: 0.34, MI: 0.35, MN: 0.35, MO: 0.27, MS: 0.28,
  MT: 0.33, NC: 0.345, ND: 0.30, NE: 0.32, NH: 0.32,
  NJ: 0.415, NM: 0.27, NV: 0.34, NY: 0.425, OH: 0.33,
  OK: 0.26, OR: 0.34, PA: 0.41, RI: 0.38, SC: 0.30,
  SD: 0.30, TN: 0.26, TX: 0.28, UT: 0.32, VA: 0.33,
  VT: 0.34, WA: 0.49, WI: 0.37, WV: 0.36, WY: 0.25,
}

/**
 * Get fuel tax rate for a given state (cents per gallon).
 */
export function getStateFuelTax(stateCode: string): number {
  return STATE_FUEL_TAX_RATES[stateCode.toUpperCase()] ?? 0
}

/**
 * Calculate IFTA fuel tax liability.
 * Determines tax due/credit by comparing actual fuel purchased vs miles driven per state.
 */
export function calculateIFTA(params: {
  entries: IFTAFuelEntry[]
  totalMiles: number
  totalGallons: number
}): IFTAReport {
  const { entries, totalMiles, totalGallons } = params
  const averageMpg = totalGallons > 0 ? Math.round((totalMiles / totalGallons) * 100) / 100 : 0

  // Calculate estimated gallons per state based on miles driven
  let fuelTaxDue = 0
  for (const entry of entries) {
    const stateRate = getStateFuelTax(entry.state)
    const estGallons = averageMpg > 0 ? entry.milesInState / averageMpg : 0
    const diff = entry.gallons - estGallons
    fuelTaxDue += diff * stateRate
  }

  return {
    entries,
    totalMiles,
    totalGallons,
    averageMpg,
    fuelTaxDue: Math.round(fuelTaxDue * 100) / 100,
  }
}

// ── Trip Feasibility ─────────────────────────────────────────────────────────

/**
 * Calculate estimated drive time for a trip distance.
 * Accounts for average truck speed (typically 55-65 mph).
 */
export function estimateDriveTime(
  miles: number,
  averageSpeedMph = 55,
): number {
  return Math.ceil((miles / averageSpeedMph) * 10) / 10
}

/**
 * Estimate total on-duty time for a trip (driving + pickup/delivery + breaks).
 */
export function estimateOnDutyTime(
  driveHours: number,
  loadingHours = 1,
  deliveryWaitHours = 1,
): number {
  return driveHours + loadingHours + deliveryWaitHours
}