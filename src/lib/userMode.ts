'use client'
/**
 * userMode.ts — Role-based command system
 *
 * Controls which tabs appear in BottomNav and which features are prominent.
 * Stored in localStorage. Changeable from Settings or first-launch selector.
 *
 * Modes:
 *   driver         — Cab + Route + Log (lean, driving-safe)
 *   owner_operator — All tabs: Cab + Dispatch + Route + Owner + Compliance
 *   dispatcher     — Dispatch + Loads + Route + Monitor
 *   fleet_admin    — Full access: all 5 tabs
 */

export type UserMode = 'driver' | 'owner_operator' | 'dispatcher' | 'fleet_admin'

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
    label:       'Driver Only',
    emoji:       '🚛',
    tagline:     'Cab Mode — lean, driving-safe',
    description: 'Route, HOS, quick actions, incident log. Everything you need on the road — nothing extra.',
    color:       'var(--primary)',
  },
  owner_operator: {
    id:          'owner_operator',
    label:       'Owner-Operator',
    emoji:       '⚙️',
    tagline:     'Multi-role: Driver + Dispatch + Owner',
    description: 'Full access: drive, dispatch your own loads, track profit, manage compliance. Built for solo operators.',
    color:       '#60c8ff',
  },
  dispatcher: {
    id:          'dispatcher',
    label:       'Dispatcher',
    emoji:       '📋',
    tagline:     'Build + Send — load planning command',
    description: 'Build load packets, assign drivers, track active loads, manage documents and compliance requirements.',
    color:       '#c890ff',
  },
  fleet_admin: {
    id:          'fleet_admin',
    label:       'Fleet Admin',
    emoji:       '🏢',
    tagline:     'Full fleet command — all modules',
    description: 'All commands active: driver execution, dispatch, owner financials, compliance intelligence.',
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
  { href: '/dashboard', label: 'Cab',      emoji: '🚛', command: 'Mobile'     },
  { href: '/trips',     label: 'Route',    emoji: '🗺️', command: 'Dispatch'  },
  { href: '/dispatch',  label: 'Dispatch', emoji: '📋', command: 'Dispatch'   },
  { href: '/loads',     label: 'Loads',    emoji: '📦', command: 'Dispatch'   },
  { href: '/expenses',    label: 'Owner',      emoji: '💰', command: 'Owner'       },
  { href: '/compliance',  label: 'Compliance', emoji: '⚖️', command: 'Compliance'  },
  { href: '/settings',    label: 'Settings',   emoji: '⚙️', command: 'System'      },
]

// Which tabs each mode sees (ordered for display)
// Driver Only: lean — no compliance tab unless there's an active OOS/violation
// Owner-Operator, Dispatcher, Fleet Admin: Compliance always visible
const MODE_TAB_HREFS: Record<UserMode, string[]> = {
  driver:         ['/dashboard', '/trips', '/expenses'],
  owner_operator: ['/dashboard', '/dispatch', '/trips', '/compliance', '/expenses'],
  dispatcher:     ['/dispatch', '/loads', '/trips', '/compliance'],
  fleet_admin:    ['/dashboard', '/dispatch', '/trips', '/loads', '/compliance', '/expenses'],
}

export function getTabsForMode(mode: UserMode): NavTab[] {
  const hrefs = MODE_TAB_HREFS[mode]
  return hrefs.map(h => ALL_TABS.find(t => t.href === h)!).filter(Boolean)
}

// ── localStorage persistence ──────────────────────────────────────────────────

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
