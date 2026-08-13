/**
 * navConfig.ts — Fleet Commander Navigation Config
 *
 * STANDALONE MODE (current): defines nav locally.
 * ECOSYSTEM MODE (future):   reads from hub-portal/config/hubNav.ts.
 *
 * Roles:
 *   driver        — drives, sees their loads + HOS
 *   dispatcher    — manages loads, escalations, dispatch feed
 *   owner_op      — merged driver + dispatcher (single-seat operation)
 *   fleet_owner   — owner of a carrier business, sees performance/reports
 *   broker        — books loads, sees rate confirmation, load board
 *   fleet_manager — manages multiple businesses
 *   admin         — account management only
 */

import type { DisplayMode } from '@/lib/auth-adapter'

export type FleetTier = 'starter' | 'pro' | 'enterprise'

export interface NavEntry {
  id:       string
  label:    string
  href:     string
  icon:     string
  family:   string
  enabled:  boolean
  modes:    DisplayMode[]   // which display modes see this tab
  tier:     FleetTier[]
}

// ── Nav entries ───────────────────────────────────────────────────────────────

export const FLEET_NAV: NavEntry[] = [
  // ── Dashboard — everyone ──────────────────────────────────────────────────
  {
    id: 'fleet-dashboard', label: 'Dashboard', href: '/dashboard', icon: '🏠',
    family: 'fleet', enabled: true,
    modes: ['driver', 'dispatcher', 'owner_op', 'fleet_owner', 'fleet_manager', 'admin'],
    tier:  ['starter', 'pro', 'enterprise'],
  },

  // ── Dispatch — dispatchers, owner-ops, fleet owners, fleet managers ───────
  {
    id: 'fleet-dispatch', label: 'Dispatch', href: '/dispatch', icon: '📡',
    family: 'fleet', enabled: true,
    modes: ['dispatcher', 'owner_op', 'fleet_owner', 'fleet_manager'],
    tier:  ['starter', 'pro', 'enterprise'],
  },

  // ── Driver view — drivers + owner-ops ────────────────────────────────────
  {
    id: 'fleet-driver', label: 'My Load', href: '/driver', icon: '🚛',
    family: 'fleet', enabled: true,
    modes: ['driver', 'owner_op'],
    tier:  ['starter', 'pro', 'enterprise'],
  },

  // ── Trips ─────────────────────────────────────────────────────────────────
  {
    id: 'fleet-trips', label: 'Trips', href: '/trips', icon: '🗺',
    family: 'fleet', enabled: true,
    modes: ['driver', 'dispatcher', 'owner_op', 'fleet_owner', 'fleet_manager'],
    tier:  ['starter', 'pro', 'enterprise'],
  },

  // ── HOS — drivers + owner-ops ────────────────────────────────────────────
  {
    id: 'fleet-hos', label: 'HOS', href: '/hos', icon: '⏱',
    family: 'fleet', enabled: true,
    modes: ['driver', 'owner_op'],
    tier:  ['starter', 'pro', 'enterprise'],
  },

  // ── Planning — dispatchers, owner-ops, fleet owners ───────────────────────
  {
    id: 'fleet-planning', label: 'Planning', href: '/planning', icon: '📋',
    family: 'fleet', enabled: true,
    modes: ['dispatcher', 'owner_op', 'fleet_owner', 'fleet_manager'],
    tier:  ['pro', 'enterprise'],
  },

  // ── Maintenance — dispatchers, owners ────────────────────────────────────
  {
    id: 'fleet-maintenance', label: 'Maintenance', href: '/maintenance', icon: '🔧',
    family: 'fleet', enabled: true,
    modes: ['dispatcher', 'owner_op', 'fleet_owner', 'fleet_manager'],
    tier:  ['starter', 'pro', 'enterprise'],
  },

  // ── Load board — brokers + dispatchers ───────────────────────────────────
  {
    id: 'fleet-loads', label: 'Load Board', href: '/loads', icon: '📦',
    family: 'fleet', enabled: true,
    modes: ['broker', 'dispatcher', 'owner_op'],
    tier:  ['pro', 'enterprise'],
  },

  // ── Reports — fleet owners, fleet managers ────────────────────────────────
  {
    id: 'fleet-reports', label: 'Reports', href: '/reports', icon: '📊',
    family: 'fleet', enabled: true,
    modes: ['fleet_owner', 'fleet_manager', 'owner_op'],
    tier:  ['pro', 'enterprise'],
  },

  // ── Ops log — dispatchers + owners (Phase 5) ─────────────────────────────
  {
    id: 'fleet-ops-log', label: 'Ops Log', href: '/ops', icon: '🗂',
    family: 'fleet', enabled: true,
    modes: ['dispatcher', 'owner_op', 'fleet_owner', 'fleet_manager'],
    tier:  ['pro', 'enterprise'],
  },

  // ── Dump Truck Mode — driver cockpit ─────────────────────────────────────
  {
    id: 'fleet-dump-truck-driver', label: 'Dump Truck', href: '/driver/dump-truck', icon: '🚛',
    family: 'fleet', enabled: true,
    modes: ['driver', 'owner_op'],
    tier:  ['starter', 'pro', 'enterprise'],
  },

  // ── Dump Truck Mode — driver hours portal ────────────────────────────────
  {
    id: 'fleet-dump-truck-hours', label: 'My Hours', href: '/driver/hours', icon: '⏱️',
    family: 'fleet', enabled: true,
    modes: ['driver', 'owner_op'],
    tier:  ['starter', 'pro', 'enterprise'],
  },

  // ── Dump Truck Mode — sites/jobs setup ───────────────────────────────────
  {
    id: 'fleet-dump-truck-admin', label: 'Dump Truck Setup', href: '/admin/dump-truck', icon: '🧭',
    family: 'fleet', enabled: true,
    modes: ['dispatcher', 'owner_op', 'fleet_owner', 'fleet_manager', 'admin'],
    tier:  ['starter', 'pro', 'enterprise'],
  },

  // ── Dump Truck Mode — fleet KPIs (per-truck / per-driver + team) ─────────
  {
    id: 'fleet-dump-truck-kpis', label: 'Fleet KPIs', href: '/admin/dump-truck/kpis', icon: '📈',
    family: 'fleet', enabled: true,
    modes: ['dispatcher', 'owner_op', 'fleet_owner', 'fleet_manager', 'admin'],
    tier:  ['starter', 'pro', 'enterprise'],
  },

  // ── Dump Truck Mode — operating expenses ──────────────────────────────────
  {
    id: 'fleet-dump-truck-expenses', label: 'Expenses', href: '/admin/dump-truck/expenses', icon: '🧾',
    family: 'fleet', enabled: true,
    modes: ['dispatcher', 'owner_op', 'fleet_owner', 'fleet_manager', 'admin'],
    tier:  ['starter', 'pro', 'enterprise'],
  },

  // ── Dump Truck Mode — SQCDP monthly review ────────────────────────────────
  {
    id: 'fleet-dump-truck-sqcdp', label: 'SQCDP Review', href: '/admin/dump-truck/sqcdp', icon: '📋',
    family: 'fleet', enabled: true,
    modes: ['dispatcher', 'owner_op', 'fleet_owner', 'fleet_manager', 'admin'],
    tier:  ['starter', 'pro', 'enterprise'],
  },

  // ── Dump Truck Mode — recurring issues detail (all-time defect Pareto) ───
  {
    id: 'fleet-dump-truck-recurring-issues', label: 'Recurring Issues', href: '/admin/dump-truck/recurring-issues', icon: '🔧',
    family: 'fleet', enabled: true,
    modes: ['dispatcher', 'owner_op', 'fleet_owner', 'fleet_manager', 'admin'],
    tier:  ['starter', 'pro', 'enterprise'],
  },

  // ── Account / admin ───────────────────────────────────────────────────────
  {
    id: 'fleet-account', label: 'Account', href: '/account', icon: '⚙️',
    family: 'fleet', enabled: true,
    modes: ['fleet_owner', 'owner_op', 'admin', 'fleet_manager'],
    tier:  ['starter', 'pro', 'enterprise'],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getNavForMode(mode: DisplayMode, tier: FleetTier = 'enterprise'): NavEntry[] {
  return FLEET_NAV.filter(n =>
    n.enabled &&
    n.modes.includes(mode) &&
    n.tier.includes(tier)
  )
}

export function getNavEntry(id: string): NavEntry | undefined {
  return FLEET_NAV.find(n => n.id === id)
}

// ── Mode display metadata ─────────────────────────────────────────────────────

export const MODE_META: Record<DisplayMode, { label: string; emoji: string; description: string }> = {
  driver:        { label: 'Driver',        emoji: '🚛', description: 'Driving view — loads, HOS, check-ins' },
  dispatcher:    { label: 'Dispatcher',    emoji: '📡', description: 'Dispatch ops — load health, escalations, fleet feed' },
  owner_op:      { label: 'Owner-Operator',emoji: '🔑', description: 'Combined driver + dispatch — you run the whole operation' },
  fleet_owner:   { label: 'Fleet Owner',   emoji: '🏢', description: 'Fleet management — performance, reports, team' },
  broker:        { label: 'Broker',        emoji: '📦', description: 'Load management — board, assignments, rate confirmation' },
  fleet_manager: { label: 'Fleet Manager', emoji: '🗂', description: 'Multi-fleet view — managing multiple carrier accounts' },
  admin:         { label: 'Admin',         emoji: '⚙️', description: 'Account management — users, settings, billing' },
  unknown:       { label: 'Unknown',       emoji: '❓', description: 'Role not assigned — contact your administrator' },
}

// ── hubNav.ts registration block (copy when registering in the ecosystem) ─────
// {
//   id:      'fleet-commander',
//   label:   'Fleet Commander',
//   href:    '/fleet',
//   icon:    '🚛',
//   family:  'fleet',
//   enabled: false,   // ← flip to true at rollout
//   roles:   ['driver','dispatcher','owner_op','fleet_owner','broker','fleet_manager'],
//   tier:    ['pro', 'enterprise'],
// }
