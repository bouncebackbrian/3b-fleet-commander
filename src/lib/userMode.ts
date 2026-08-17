'use client'
/**
 * userMode.ts — Portal-based nav (2026-07-29)
 *
 * Controls which tabs appear in BottomNav. Previously a free client-side
 * localStorage toggle (driver|owner_operator|dispatcher|fleet_admin) totally
 * decoupled from real permissions — a driver-role member could self-select
 * "fleet_admin" locally and see admin tabs (server-side writes still 403'd,
 * so not a security hole, just confusing/wrong). Now the mode is a "focus"
 * UI preference constrained to portals the member actually holds — see
 * fleet_member_portal_grants / src/lib/fleet-auth-guard.ts (server) and
 * FleetUser.portals / src/lib/auth-adapter.ts (client) for the real grants.
 *
 * 'all' is a pseudo-mode offered whenever a member holds 2+ portals — shows
 * the union of tabs across every portal they're granted, same idea as the
 * old owner_operator/fleet_admin "everything" modes.
 *
 * 'office' is a second pseudo-mode (2026-08-14): Dispatch and Admin's tab
 * sets overlap almost completely for a dump-truck business (both are
 * essentially "the back office," just with slightly different edges — see
 * OPS_PROFILE_HIDDEN_HREFS below). Offering them as two separate "focus"
 * choices to someone who holds both looked like a bug ("they all have the
 * same functions") rather than a real choice, so when a member holds both
 * dispatch and admin they collapse into one 'office' entry instead. The
 * underlying fleet_member_portal_grants stay completely separate — this is
 * presentation-only. A member who holds only one of the two (e.g. a
 * dispatcher-only hire with no admin grant) still sees that single portal
 * labeled normally, no merging.
 *
 * Note: src/config/navConfig.ts is an earlier, unused draft of a
 * next-gen nav system (keyed on a different DisplayMode enum). It was never
 * wired into BottomNav — this file remains the live system. Worth
 * reconciling/removing in a future pass, out of scope here.
 */

import type { Portal, PortalGrants, OpsProfile } from './auth-adapter'

export type UserMode = Portal | 'office' | 'all'

export interface ModeConfig {
  id:          UserMode
  label:       string
  emoji:       string
  tagline:     string
  description: string
  color:       string
}

export const MODE_CONFIG: Record<UserMode, ModeConfig> = {
  driver: {
    id:          'driver',
    label:       'Driver',
    emoji:       '🚛',
    tagline:     'Cab Mode — lean, driving-safe',
    description: 'Route, HOS, quick actions, incident log. Everything you need on the road — nothing extra.',
    color:       'var(--primary)',
  },
  dispatch: {
    id:          'dispatch',
    label:       'Dispatch',
    emoji:       '📡',
    tagline:     'Build + Send — load planning command',
    description: 'Build load packets, assign drivers, track active loads, manage documents and compliance requirements.',
    color:       '#c890ff',
  },
  broker: {
    id:          'broker',
    label:       'Broker',
    emoji:       '📦',
    tagline:     'Load & rate desk',
    description: 'Broker-relevant jobs, rates, and load status.',
    color:       '#60c8ff',
  },
  admin: {
    id:          'admin',
    label:       'Admin',
    emoji:       '⚙️',
    tagline:     'Full company command',
    description: 'Company setup — sites, jobs, pay policy, team, and fleet-wide reporting.',
    color:       '#ffd060',
  },
  office: {
    id:          'office',
    label:       'Office',
    emoji:       '🏢',
    tagline:     'Dispatch + Admin — full back-office command',
    description: 'Everything dispatch and admin need in one place — sites, jobs, pay policy, team, equipment, and fleet-wide reporting. Shown when you hold both portals, since they overlap almost completely.',
    color:       '#c890ff',
  },
  all: {
    id:          'all',
    label:       'All Portals',
    emoji:       '🗝️',
    tagline:     'Everything you have access to',
    description: 'Combined view across every portal you hold — nothing hidden.',
    color:       '#ffd060',
  },
}

// ── Nav tab definitions ───────────────────────────────────────────────────────

export interface NavTab {
  href:    string
  label:   string
  emoji:   string
  command: string   // command group name
}

// Tab pool — all possible tabs
const ALL_TABS: NavTab[] = [
  { href: '/dashboard',   label: 'Cab',         emoji: '🚛', command: 'Mobile'      },
  { href: '/trips',       label: 'Route',       emoji: '🗺️', command: 'Dispatch'   },
  { href: '/dispatch',    label: 'Dispatch',    emoji: '📋', command: 'Dispatch'    },
  { href: '/loads',       label: 'Loads',       emoji: '📦', command: 'Dispatch'    },
  { href: '/broker',      label: 'Broker',      emoji: '📦', command: 'Broker'      },
  { href: '/vault',       label: 'Vault',       emoji: '🗄️', command: 'Compliance'  },
  { href: '/trailer',     label: 'Trailer',     emoji: '🚚', command: 'Inspection'  },
  { href: '/expenses',    label: 'Owner',       emoji: '💰', command: 'Owner'       },
  { href: '/compliance',  label: 'Compliance',  emoji: '⚖️', command: 'Compliance'  },
  { href: '/maintenance', label: 'Maintenance', emoji: '🔧', command: 'Maintenance' },
  { href: '/driver/dump-truck', label: 'Dump Truck', emoji: '🏗️', command: 'Dump Truck' },
  { href: '/driver/hours',      label: 'My Hours',   emoji: '⏱️', command: 'Dump Truck' },
  { href: '/driver/documents',  label: 'My Docs',    emoji: '🪪', command: 'Dump Truck' },
  { href: '/admin/dump-truck',  label: 'DT Setup',   emoji: '🧭', command: 'Dump Truck' },
  { href: '/admin/equipment',   label: 'Equipment',  emoji: '🚛', command: 'Equipment'   },
  { href: '/account',     label: 'Team',        emoji: '👥', command: 'System'      },
  { href: '/settings',    label: 'Settings',    emoji: '⚙️', command: 'System'      },
]

// Which tabs each portal grants (ordered for display).
const PORTAL_TAB_HREFS: Record<Portal, string[]> = {
  driver:   ['/dashboard', '/trips', '/driver/dump-truck', '/driver/hours', '/driver/documents', '/trailer', '/maintenance', '/compliance', '/vault'],
  dispatch: ['/dispatch', '/loads', '/trips', '/admin/dump-truck', '/admin/equipment', '/maintenance', '/compliance', '/vault'],
  broker:   ['/broker', '/loads', '/vault'],
  admin:    ['/dashboard', '/admin/dump-truck', '/admin/equipment', '/account', '/maintenance', '/compliance', '/settings'],
}

function tabsForHrefs(hrefs: string[]): NavTab[] {
  return hrefs.map(h => ALL_TABS.find(t => t.href === h)).filter((t): t is NavTab => !!t)
}

/** Tabs that don't apply to a given ops profile — hidden regardless of portal grants.
 *  Anything not listed here (vault, compliance, maintenance, equipment, account,
 *  settings) is universal and shows for every ops profile.
 *
 *  /mis, /audit, /delays, /fuel are Sidebar-only routes (not in PORTAL_TAB_HREFS/
 *  ALL_TABS above, since BottomNav never linked to them) — all four are legacy
 *  OTR pages built on the old SAMPLE_LOADS/Load model, not fleet_dt_*. Missed
 *  in the original pass because this list was derived from ALL_TABS instead of
 *  cross-checking Sidebar.tsx's separate static MODULES list. */
const OPS_PROFILE_HIDDEN_HREFS: Record<OpsProfile, string[]> = {
  dump_truck: ['/dashboard', '/trips', '/dispatch', '/loads', '/trailer', '/expenses', '/mis', '/audit', '/delays', '/fuel'],
  /** /broker is Dump Truck Mode's own broker-rate desk (see /broker/page.tsx) — not OTR-relevant. */
  otr:        ['/driver/dump-truck', '/driver/hours', '/admin/dump-truck', '/broker'],
}

/** Exported so other nav surfaces (e.g. the desktop Sidebar, which keeps its
 *  own static module list rather than ALL_TABS) can apply the same filter. */
export function isHrefVisibleForOpsProfile(href: string, opsProfile?: OpsProfile | null): boolean {
  if (!opsProfile) return true
  return !(OPS_PROFILE_HIDDEN_HREFS[opsProfile] ?? []).includes(href)
}

function filterForOpsProfile(tabs: NavTab[], opsProfile?: OpsProfile | null): NavTab[] {
  return tabs.filter(t => isHrefVisibleForOpsProfile(t.href, opsProfile))
}

/** Union of tabs across every portal in the list, de-duplicated, in portal order,
 *  filtered to the business's ops profile (omit to skip that filter). */
export function getTabsForPortals(portals: Portal[], opsProfile?: OpsProfile | null): NavTab[] {
  const seen = new Set<string>()
  const ordered: NavTab[] = []
  for (const p of portals) {
    for (const tab of tabsForHrefs(PORTAL_TAB_HREFS[p] ?? [])) {
      if (!seen.has(tab.href)) { seen.add(tab.href); ordered.push(tab) }
    }
  }
  return filterForOpsProfile(ordered, opsProfile)
}

/** Tabs for the current focus mode, given the portals the member actually holds. */
export function getTabsForMode(mode: UserMode, grantedPortals: Portal[], opsProfile?: OpsProfile | null): NavTab[] {
  if (mode === 'all') return getTabsForPortals(grantedPortals, opsProfile)
  if (mode === 'office') {
    const officePortals = (['dispatch', 'admin'] as const).filter(p => grantedPortals.includes(p))
    return getTabsForPortals(officePortals, opsProfile)
  }
  return getTabsForPortals(grantedPortals.includes(mode) ? [mode] : [], opsProfile)
}

// ── Primary vs overflow ("More") tabs ─────────────────────────────────────────
// The Driver portal collects 8 tabs (Cab, Route, Dump Truck, Hours, Trailer,
// Maintenance, Compliance, Vault) — too many for a bottom-nav bar. Only the
// 3 a driver taps constantly stay in the bar; the rest move behind a "More"
// sheet (still one tap away). Only defined for portals that actually need
// it — everything else (and the combined 'all' focus) shows its full set.

const PRIMARY_TAB_HREFS_BY_PORTAL: Partial<Record<Portal, string[]>> = {
  driver: ['/dashboard', '/driver/dump-truck', '/driver/hours'],
}

export function getPrimaryTabsForMode(mode: UserMode, grantedPortals: Portal[], opsProfile?: OpsProfile | null): NavTab[] {
  const full = getTabsForMode(mode, grantedPortals, opsProfile)
  const primaryHrefs = mode === 'all' || mode === 'office' ? undefined : PRIMARY_TAB_HREFS_BY_PORTAL[mode]
  if (!primaryHrefs) return full
  return full.filter(t => primaryHrefs.includes(t.href))
}

export function getOverflowTabsForMode(mode: UserMode, grantedPortals: Portal[], opsProfile?: OpsProfile | null): NavTab[] {
  const full = getTabsForMode(mode, grantedPortals, opsProfile)
  const primaryHrefs = mode === 'all' || mode === 'office' ? undefined : PRIMARY_TAB_HREFS_BY_PORTAL[mode]
  if (!primaryHrefs) return []
  return full.filter(t => !primaryHrefs.includes(t.href))
}

/** Which modes a member may select, given their real portal grants. Dispatch
 *  and admin collapse into a single 'office' choice when both are held —
 *  see the file-level doc comment for why. Fixed, sensible order rather
 *  than raw grant-insertion order. */
export function getAvailableModes(portals: PortalGrants): UserMode[] {
  const granted = Object.keys(portals) as Portal[]
  const hasDispatch = granted.includes('dispatch')
  const hasAdmin = granted.includes('admin')

  const modes: UserMode[] = []
  if (granted.includes('driver')) modes.push('driver')
  if (hasDispatch && hasAdmin) {
    modes.push('office')
  } else {
    if (hasDispatch) modes.push('dispatch')
    if (hasAdmin) modes.push('admin')
  }
  if (granted.includes('broker')) modes.push('broker')

  if (modes.length > 1) modes.push('all')
  return modes
}

/** Best default mode: 'all' if 2+ portals, else the single portal, else null (no access yet). */
export function getDefaultMode(portals: PortalGrants): UserMode | null {
  const available = getAvailableModes(portals)
  if (available.includes('all')) return 'all'
  return available[0] ?? null
}

// ── localStorage persistence ──────────────────────────────────────────────────
// Purely a "which focus am I in right now" UI preference — never the source
// of truth for what a member is allowed to do. Server-side authorization is
// always fleet_member_portal_grants, checked independently of this value.

const LS_KEY = '3b-user-mode'

export function readUserMode(): UserMode | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem(LS_KEY) as UserMode | null
    if (v && v in MODE_CONFIG) return v
  } catch { /* ignore */ }
  return null
}

export function writeUserMode(mode: UserMode): void {
  try {
    localStorage.setItem(LS_KEY, mode)
    // Signal other components to re-read
    window.dispatchEvent(new CustomEvent('3b-mode-changed', { detail: mode }))
  } catch { /* ignore */ }
}

// ── Command labels for TopBar ─────────────────────────────────────────────────

export function getCommandLabel(href: string): string {
  const tab = ALL_TABS.find(t => t.href === href)
  return tab ? `${tab.command} Command` : 'Fleet Command'
}
