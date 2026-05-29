/**
 * entitlements.ts — Feature Entitlement Stubs
 *
 * STANDALONE MODE (current): all features enabled (dev/demo mode).
 * ECOSYSTEM MODE (future):   reads from 3Boost entitlement matrix per business.
 *
 * Set NEXT_PUBLIC_ENTITLEMENT_MODE=enforced to activate tier gating.
 * Until then, every feature returns true so the standalone build works fully.
 *
 * When 3Boost entitlement contract is defined, swap hasFeature() to call
 * the entitlement API — no component changes needed.
 */

export type FleetTier = 'starter' | 'pro' | 'enterprise'

export type FleetFeature =
  | 'dispatch_ops_ai'          // Load health, stall detection, recovery windows
  | 'driver_ops_cockpit'       // Mode tracking, detention clock, break timers
  | 'hos_planning'             // HOS simulation, legal ETA, rest stop modeling
  | 'escalation_engine'        // L0–L3 tiered auto-escalation
  | 'ops_event_log'            // Unified black box recorder + Supabase persistence
  | 'notification_router'      // Teams/SMS/email delivery
  | 'role_ops_view'            // Driver/Dispatcher/Owner role-gated views
  | 'multi_driver'             // Multiple drivers per business
  | 'customer_packs'           // Customer-specific SOPs + onboarding
  | 'maintenance_engine'       // PM scheduling, violation vault
  | 'exception_timeline'       // Exception log + inline resolution
  | 'recovery_engine'          // Recovery advisor, Love's/Speedco locator

// ── Tier → feature matrix ─────────────────────────────────────────────────────
// Defines minimum tier required for each feature.
// A business on 'pro' gets all 'starter' + 'pro' features.

export const FEATURE_TIERS: Record<FleetFeature, FleetTier> = {
  dispatch_ops_ai:     'starter',
  driver_ops_cockpit:  'starter',
  exception_timeline:  'starter',
  recovery_engine:     'starter',
  hos_planning:        'pro',
  escalation_engine:   'pro',
  ops_event_log:       'pro',
  role_ops_view:       'pro',
  multi_driver:        'pro',
  maintenance_engine:  'pro',
  notification_router: 'enterprise',
  customer_packs:      'enterprise',
}

const TIER_ORDER: FleetTier[] = ['starter', 'pro', 'enterprise']

// ── Core check ────────────────────────────────────────────────────────────────

/**
 * hasFeature — check if a business tier includes a feature.
 *
 * STANDALONE: always returns true (no tier gating in dev mode).
 * ECOSYSTEM:  checks against 3Boost entitlement matrix.
 */
export function hasFeature(feature: FleetFeature, businessTier: FleetTier = 'enterprise'): boolean {
  // Standalone / dev mode — everything on
  if (process.env.NEXT_PUBLIC_ENTITLEMENT_MODE !== 'enforced') return true

  const requiredTier = FEATURE_TIERS[feature]
  const businessIdx  = TIER_ORDER.indexOf(businessTier)
  const requiredIdx  = TIER_ORDER.indexOf(requiredTier)
  return businessIdx >= requiredIdx
}

/**
 * getFeaturesForTier — list all features available at a given tier.
 */
export function getFeaturesForTier(tier: FleetTier): FleetFeature[] {
  const tierIdx = TIER_ORDER.indexOf(tier)
  return (Object.entries(FEATURE_TIERS) as [FleetFeature, FleetTier][])
    .filter(([, req]) => TIER_ORDER.indexOf(req) <= tierIdx)
    .map(([feature]) => feature)
}

// ── Tier display metadata ─────────────────────────────────────────────────────

export const TIER_META: Record<FleetTier, { label: string; price: string; description: string }> = {
  starter: {
    label:       'Starter',
    price:       'TBD',
    description: 'Core dispatch + driver ops for single-operator fleets',
  },
  pro: {
    label:       'Pro',
    price:       'TBD',
    description: 'Full AI ops stack: HOS planning, escalation engine, ops log',
  },
  enterprise: {
    label:       'Enterprise',
    price:       'TBD',
    description: 'All features + notifications, customer packs, multi-driver',
  },
}
