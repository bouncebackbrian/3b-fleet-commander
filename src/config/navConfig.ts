/**
 * navConfig.ts — Fleet Commander Navigation Config
 *
 * STANDALONE MODE (current): defines nav locally.
 * ECOSYSTEM MODE (future):   reads from hub-portal/config/hubNav.ts.
 *
 * Replace userMode.ts route constants with entries from this file.
 * When the ecosystem nav is ready, swap the source — no UI changes needed.
 *
 * Mirrors the hubNav.ts shape exactly so the swap is mechanical.
 */

export type FleetRole = 'driver' | 'dispatcher' | 'owner_operator'
export type FleetTier = 'starter' | 'pro' | 'enterprise'

export interface NavEntry {
  id:       string
  label:    string
  href:     string
  icon:     string
  family:   string
  enabled:  boolean    // false = hidden (set to false until rollout in ecosystem)
  roles:    FleetRole[]
  tier:     FleetTier[]
}

// ── Fleet Commander nav entries ───────────────────────────────────────────────
// This is the source of truth for standalone mode.
// In ecosystem mode, this would come from hubNav.ts.

export const FLEET_NAV: NavEntry[] = [
  {
    id:      'fleet-dashboard',
    label:   'Dashboard',
    href:    '/dashboard',
    icon:    '🏠',
    family:  'fleet',
    enabled: true,
    roles:   ['driver', 'dispatcher', 'owner_operator'],
    tier:    ['starter', 'pro', 'enterprise'],
  },
  {
    id:      'fleet-dispatch',
    label:   'Dispatch',
    href:    '/dispatch',
    icon:    '📡',
    family:  'fleet',
    enabled: true,
    roles:   ['dispatcher', 'owner_operator'],
    tier:    ['starter', 'pro', 'enterprise'],
  },
  {
    id:      'fleet-trips',
    label:   'Trips',
    href:    '/trips',
    icon:    '🗺',
    family:  'fleet',
    enabled: true,
    roles:   ['driver', 'dispatcher', 'owner_operator'],
    tier:    ['starter', 'pro', 'enterprise'],
  },
  {
    id:      'fleet-hos',
    label:   'HOS',
    href:    '/hos',
    icon:    '⏱',
    family:  'fleet',
    enabled: true,
    roles:   ['driver'],
    tier:    ['starter', 'pro', 'enterprise'],
  },
  {
    id:      'fleet-maintenance',
    label:   'Maintenance',
    href:    '/maintenance',
    icon:    '🔧',
    family:  'fleet',
    enabled: true,
    roles:   ['dispatcher', 'owner_operator'],
    tier:    ['starter', 'pro', 'enterprise'],
  },
  {
    id:      'fleet-planning',
    label:   'Planning',
    href:    '/planning',
    icon:    '📋',
    family:  'fleet',
    enabled: true,
    roles:   ['dispatcher', 'owner_operator'],
    tier:    ['pro', 'enterprise'],
  },
  {
    id:      'fleet-reports',
    label:   'Reports',
    href:    '/reports',
    icon:    '📊',
    family:  'fleet',
    enabled: true,
    roles:   ['owner_operator'],
    tier:    ['pro', 'enterprise'],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getNavForRole(role: FleetRole, tier: FleetTier = 'enterprise'): NavEntry[] {
  return FLEET_NAV.filter(n =>
    n.enabled &&
    n.roles.includes(role) &&
    n.tier.includes(tier)
  )
}

export function getNavEntry(id: string): NavEntry | undefined {
  return FLEET_NAV.find(n => n.id === id)
}

// ── hubNav.ts registration block (copy this when registering in the ecosystem)
// ─────────────────────────────────────────────────────────────────────────────
// {
//   id:      'fleet-commander',
//   label:   'Fleet Commander',
//   href:    '/fleet',
//   icon:    '🚛',
//   family:  'fleet',
//   enabled: false,    ← flip to true at rollout
//   roles:   ['driver', 'dispatcher', 'owner_operator'],
//   tier:    ['pro', 'enterprise'],
// }
