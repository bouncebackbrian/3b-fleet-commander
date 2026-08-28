import type { FleetModeStatus } from '@/lib/fleet/modes'

export type FleetCommercialPlan = 'company'
export type FleetDriverPlan = 'driver_free' | 'driver_pro'
export type FleetSubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled'
export type FleetPortal = 'driver' | 'dispatch' | 'admin' | 'broker'

export interface FleetPlanDefinition {
  id: FleetCommercialPlan | FleetDriverPlan
  name: string
  billedTo: 'business' | 'person'
  description: string
  includes: string[]
  excludes?: string[]
}

/**
 * Product model (pricing intentionally separate):
 *
 * COMPANY
 * - billed to a 3B Business ID
 * - commercial subscription includes Dispatch + Admin
 * - business pays for active trucks and enabled operating modes
 * - owner-operator is simply a one-truck company
 *
 * DRIVER FREE
 * - billed at $0 to the 3B ID
 * - receives access assigned by a company
 * - does not independently unlock employer/company data
 *
 * DRIVER PRO
 * - billed to the person's 3B ID
 * - keeps driver-owned professional records across employers
 * - company-owned data remains company-owned
 */
export const FLEET_PLANS: FleetPlanDefinition[] = [
  {
    id: 'company',
    name: 'Fleet Commander Company',
    billedTo: 'business',
    description: 'Commercial Fleet Commander for companies and owner-operators. The business pays for dispatch, admin, active trucks and enabled operating modes.',
    includes: [
      'Mode-scoped dispatch',
      'Company administration and team permissions',
      'Truck and equipment operations',
      'Driver time and mileage review',
      'Billing vs paid-time visibility',
      'Profitability and utilization reporting',
      'Company audit trail and evidence',
    ],
  },
  {
    id: 'driver_free',
    name: 'Fleet Commander Driver Free',
    billedTo: 'person',
    description: 'Free 3B ID driver access when a company grants the driver permission to an operating mode.',
    includes: [
      'Company-assigned driver modes',
      'Safe Drive movement screen',
      'Assigned jobs and workflow actions',
      'Company-required inspections and evidence capture',
      'View personal company-recorded hours permitted by the employer relationship',
    ],
    excludes: [
      'Independent personal work archive across employers',
      'Personal tax-mileage ledger',
      'Independent pay reconciliation tools',
      'Company dispatch or company-wide profitability',
    ],
  },
  {
    id: 'driver_pro',
    name: 'Fleet Commander Driver Pro',
    billedTo: 'person',
    description: 'Driver-owned professional record attached to the 3B ID and retained across employer changes.',
    includes: [
      'Personal work-hour history',
      'GPS and time evidence',
      'Business and tax mileage tracking',
      'Dead time, waiting time and deadhead tracking',
      'Personal fuel and receipt records',
      'Pay history and reconciliation',
      'Weekly and monthly driver reports',
      'CDL, medical card and document vault',
      'Expiration reminders',
      'Safe Drive + limited Spotify controls',
    ],
    excludes: [
      'Employer customer rates',
      'Other drivers records',
      'Company-wide dispatch controls',
      'Company internal management notes',
      'Company-wide profitability unless separately authorized',
    ],
  },
]

export type FleetDataOwnership = 'driver' | 'company' | 'shared_operational'

export const FLEET_DATA_OWNERSHIP_EXAMPLES: Record<FleetDataOwnership, string[]> = {
  driver: [
    'Personal mileage and tax classifications',
    'Personally-entered expenses and receipts',
    'Driver profile and personal documents',
    'Personal pay notes and reconciliation records',
  ],
  company: [
    'Customer and broker rates',
    'Dispatch instructions',
    'Contracts and company profitability',
    'Internal management notes',
    'Other employees records',
  ],
  shared_operational: [
    'Shift and time events',
    'GPS operational events',
    'Loads and job activity',
    'Tickets, inspections and post-trip records',
    'Fuel events and breakdown evidence',
    'Clock corrections and approvals',
  ],
}

export function canOpenCommercialPortal(opts: {
  companySubscriptionActive: boolean
  modeStatus: FleetModeStatus
  modeEnabledForBusiness: boolean
  modeGrantedToUser: boolean
  portalGranted: boolean
}): boolean {
  return opts.companySubscriptionActive
    && opts.modeStatus === 'live'
    && opts.modeEnabledForBusiness
    && opts.modeGrantedToUser
    && opts.portalGranted
}
