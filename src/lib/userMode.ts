'use client'
/**
 * userMode.ts — Portal-based navigation.
 *
 * Portal grants remain the authorization source of truth. This file only
 * controls which navigation surfaces are presented for the currently selected
 * portal focus. Report destinations are portal-specific so Driver sees only
 * personal records, Dispatch sees operational reporting, and Admin sees the
 * company-wide reporting center.
 */

import type { Portal, PortalGrants, OpsProfile } from './auth-adapter'

export type UserMode = Portal | 'office' | 'all'

export interface ModeConfig {
  id: UserMode
  label: string
  emoji: string
  tagline: string
  description: string
  color: string
}

export const MODE_CONFIG: Record<UserMode, ModeConfig> = {
  driver: {
    id: 'driver', label: 'Driver', emoji: '🚛', tagline: 'Cab Mode — lean, driving-safe',
    description: 'Route, work actions, personal records and the information needed to do the job safely.', color: 'var(--primary)',
  },
  dispatch: {
    id: 'dispatch', label: 'Dispatch', emoji: '📡', tagline: 'Live operations command',
    description: 'Assignments, assets, jobs, exceptions and operational improvement reporting.', color: '#c890ff',
  },
  broker: {
    id: 'broker', label: 'Broker', emoji: '📦', tagline: 'Coming soon',
    description: 'Broker workflow remains reserved for a future Fleet Commander release.', color: '#60c8ff',
  },
  admin: {
    id: 'admin', label: 'Admin', emoji: '⚙️', tagline: 'Full company command',
    description: 'Company configuration, governance and company-wide data-driven reporting.', color: '#ffd060',
  },
  office: {
    id: 'office', label: 'Dispatch + Admin', emoji: '📊', tagline: 'Operations + company command',
    description: 'Combined navigation when the same user holds both Dispatch and Admin grants.', color: '#c890ff',
  },
  all: {
    id: 'all', label: 'All Portals', emoji: '🗝️', tagline: 'Everything you have access to',
    description: 'Combined view across every portal you hold — nothing hidden.', color: '#ffd060',
  },
}

export interface NavTab {
  href: string
  label: string
  emoji: string
  command: string
}

const ALL_TABS: NavTab[] = [
  { href: '/dashboard', label: 'Cab', emoji: '🚛', command: 'Mobile' },
  { href: '/trips', label: 'Route', emoji: '🗺️', command: 'Dispatch' },
  { href: '/dispatch', label: 'Dispatch', emoji: '📋', command: 'Dispatch' },
  { href: '/loads', label: 'Loads', emoji: '📦', command: 'Dispatch' },
  { href: '/broker', label: 'Broker', emoji: '📦', command: 'Broker' },
  { href: '/vault', label: 'Vault', emoji: '🗄️', command: 'Compliance' },
  { href: '/trailer', label: 'Trailer', emoji: '🚚', command: 'Inspection' },
  { href: '/expenses', label: 'Owner', emoji: '💰', command: 'Owner' },
  { href: '/compliance', label: 'Compliance', emoji: '⚖️', command: 'Compliance' },
  { href: '/maintenance', label: 'Maintenance', emoji: '🔧', command: 'Maintenance' },
  { href: '/driver/dump-truck', label: 'Today', emoji: '🏗️', command: 'Dump Truck' },
  { href: '/driver/hours', label: 'Hours', emoji: '⏱️', command: 'Dump Truck' },
  { href: '/driver/reports', label: 'Reports', emoji: '📊', command: 'Driver Reports' },
  { href: '/driver/documents', label: 'Documents', emoji: '🪪', command: 'Dump Truck' },
  { href: '/admin/dump-truck/dispatch', label: 'Send Job', emoji: '📤', command: 'Dump Truck' },
  { href: '/dispatch/dump-truck/reports', label: 'Reports', emoji: '📊', command: 'Dispatch Reports' },
  { href: '/admin/dump-truck/reports', label: 'Reports', emoji: '📈', command: 'Admin Reports' },
  { href: '/admin/dump-truck', label: 'DT Setup', emoji: '🧭', command: 'Dump Truck' },
  { href: '/admin/equipment', label: 'Equipment', emoji: '🚛', command: 'Equipment' },
  { href: '/account', label: 'Team', emoji: '👥', command: 'System' },
  { href: '/settings', label: 'Settings', emoji: '⚙️', command: 'System' },
]

const PORTAL_TAB_HREFS: Record<Portal, string[]> = {
  driver: ['/dashboard', '/trips', '/driver/dump-truck', '/driver/hours', '/driver/reports', '/driver/documents', '/trailer', '/maintenance', '/compliance', '/vault'],
  dispatch: ['/dispatch', '/loads', '/trips', '/admin/dump-truck/dispatch', '/dispatch/dump-truck/reports', '/admin/dump-truck', '/admin/equipment', '/maintenance', '/compliance', '/vault'],
  broker: ['/broker', '/loads', '/vault'],
  admin: ['/dashboard', '/admin/dump-truck/dispatch', '/admin/dump-truck/reports', '/admin/dump-truck', '/admin/equipment', '/account', '/maintenance', '/compliance', '/settings'],
}

function tabsForHrefs(hrefs: string[]): NavTab[] {
  return hrefs.map(h => ALL_TABS.find(t => t.href === h)).filter((t): t is NavTab => !!t)
}

const OPS_PROFILE_HIDDEN_HREFS: Record<OpsProfile, string[]> = {
  dump_truck: ['/dashboard', '/trips', '/dispatch', '/loads', '/trailer', '/expenses', '/mis', '/audit', '/delays', '/fuel'],
  otr: ['/driver/dump-truck', '/driver/hours', '/driver/reports', '/dispatch/dump-truck/reports', '/admin/dump-truck/reports', '/admin/dump-truck', '/admin/dump-truck/safety', '/admin/dump-truck/dispatch', '/broker'],
}

export function isHrefVisibleForOpsProfile(href: string, opsProfile?: OpsProfile | null): boolean {
  if (!opsProfile) return true
  return !(OPS_PROFILE_HIDDEN_HREFS[opsProfile] ?? []).includes(href)
}

function filterForOpsProfile(tabs: NavTab[], opsProfile?: OpsProfile | null): NavTab[] {
  return tabs.filter(t => isHrefVisibleForOpsProfile(t.href, opsProfile))
}

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

export function getTabsForMode(mode: UserMode, grantedPortals: Portal[], opsProfile?: OpsProfile | null): NavTab[] {
  if (mode === 'all') return getTabsForPortals(grantedPortals, opsProfile)
  if (mode === 'office') {
    const officePortals = (['dispatch', 'admin'] as const).filter(p => grantedPortals.includes(p))
    return getTabsForPortals(officePortals, opsProfile)
  }
  return getTabsForPortals(grantedPortals.includes(mode) ? [mode] : [], opsProfile)
}

const PRIMARY_TAB_HREFS_BY_PORTAL: Partial<Record<Portal, string[]>> = {
  driver: ['/dashboard', '/driver/dump-truck', '/driver/hours', '/driver/documents'],
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

export function getAvailableModes(portals: PortalGrants): UserMode[] {
  const granted = Object.keys(portals) as Portal[]
  const hasDispatch = granted.includes('dispatch')
  const hasAdmin = granted.includes('admin')
  const modes: UserMode[] = []
  if (granted.includes('driver')) modes.push('driver')
  if (hasDispatch && hasAdmin) modes.push('office')
  else {
    if (hasDispatch) modes.push('dispatch')
    if (hasAdmin) modes.push('admin')
  }
  if (granted.includes('broker')) modes.push('broker')
  if (modes.length > 1) modes.push('all')
  return modes
}

export function getDefaultMode(portals: PortalGrants): UserMode | null {
  const available = getAvailableModes(portals)
  if (available.includes('all')) return 'all'
  return available[0] ?? null
}

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
    window.dispatchEvent(new CustomEvent('3b-mode-changed', { detail: mode }))
  } catch { /* ignore */ }
}

export function getCommandLabel(href: string): string {
  const tab = ALL_TABS.find(t => t.href === href)
  return tab ? `${tab.command} Command` : 'Fleet Command'
}
