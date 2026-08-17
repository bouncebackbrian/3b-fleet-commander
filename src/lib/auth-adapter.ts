'use client'
/**
 * auth-adapter.ts — Auth & Identity Bridge Layer
 *
 * STANDALONE MODE (current): wraps Supabase auth + fleet_business_members lookup.
 * ECOSYSTEM MODE (future):   wraps services/auth-3boost + services/identity-sor.
 *
 * All engines, pages, and components that need the current user import from here.
 * Never import auth calls directly outside this file.
 *
 * ── Two-layer identity model ──────────────────────────────────────────────────
 *
 * Layer 1 — 3B Ecosystem (Core_Eco):
 *   auth, session, profiles, 3B Account ID, entitlements.
 *   Client: auth-client.ts → Core_Eco Supabase (rkwdryneutgyqrnbuwaz)
 *
 * Layer 2 — Fleet Commander (Fleet DB):
 *   fleet_business_members, businesses, loads, trips, etc.
 *   Client: fleet-db-client.ts → Fleet Supabase (goqzhdrmrdlkchmwfiur)
 *
 * Business types: owner_op | carrier | brokerage | fleet_management
 * Member roles:   owner | driver | dispatcher | admin | broker | fleet_manager
 */

import { createAuthClient }  from '@/lib/auth-client'       // Core_Eco — identity/session
import { createFleetClient } from '@/lib/fleet-db-client'   // Fleet DB — membership/fleet data (getUserBusinesses only; see getCurrentUser doc)

// ── Types ─────────────────────────────────────────────────────────────────────

export type BusinessType = 'owner_op' | 'carrier' | 'brokerage' | 'fleet_management'

/** Which nav surface a business operates — drives which tabs/modules show. See userMode.ts. */
export type OpsProfile = 'otr' | 'dump_truck'

export type MemberRole = 'owner' | 'driver' | 'dispatcher' | 'admin' | 'broker' | 'fleet_manager'

/**
 * Portal (2026-07-29): the real, authoritative, multi-valued authorization
 * grant — a member can hold any combination of driver/dispatch/broker/admin,
 * each at view or manage level. `role` above is kept for display only
 * (e.g. Settings team list); UI gating should use `portals` instead.
 * Mirrors Portal/PermissionLevel in src/lib/fleet-auth-guard.ts (server side).
 */
export type Portal = 'driver' | 'dispatch' | 'broker' | 'admin'
export type PermissionLevel = 'view' | 'manage'
export type PortalGrants = Partial<Record<Portal, PermissionLevel>>

/**
 * FleetUser — the resolved identity of the current user.
 * Includes their role within their primary business context.
 */
export interface FleetUser {
  id:             string          // Supabase UID today, 3B ID tomorrow
  email?:         string | null
  businessId?:    string | null   // primary business UUID
  businessSlug?:  string | null   // e.g. 'star-freight-services'
  businessType?:  BusinessType | null
  /** 'otr' | 'dump_truck' — defaults to 'otr' server-side for pre-existing businesses. */
  opsProfile?:    OpsProfile | null
  /** Per-truck resolved (2026-08-15): the caller's most-recent truck's own
   *  ops_profile if set, else falls back to opsProfile — for a business
   *  running mixed equipment. Use this (not opsProfile) for the driver-focus
   *  nav specifically; dispatch/admin/broker keep using the plain opsProfile
   *  since they manage the whole fleet, not one truck. */
  driverOpsProfile?: OpsProfile | null
  role?:          MemberRole | null
  /** Real per-portal grants — drives nav + client-side gating. See Portal note above. */
  portals:        PortalGrants
  /** Derived: true when owner on an owner_op business → sees driver + dispatcher views */
  isOwnerOp:      boolean
  /** Derived: effective display mode for UI routing */
  displayMode:    DisplayMode
}

/**
 * DisplayMode — maps identity to the UI mode shown.
 * owner_op is a merged driver+dispatcher view unique to single-seat operations.
 */
export type DisplayMode =
  | 'driver'
  | 'dispatcher'
  | 'owner_op'       // owner on owner_op business — merged view
  | 'fleet_owner'    // owner on carrier/fleet business — management view
  | 'broker'
  | 'fleet_manager'
  | 'admin'
  | 'unknown'

// ── Display mode derivation ───────────────────────────────────────────────────

function deriveDisplayMode(role: MemberRole | null, businessType: BusinessType | null): DisplayMode {
  if (!role) return 'unknown'
  if (role === 'owner') {
    return businessType === 'owner_op' ? 'owner_op' : 'fleet_owner'
  }
  if (role === 'driver')        return 'driver'
  if (role === 'dispatcher')    return 'dispatcher'
  if (role === 'broker')        return 'broker'
  if (role === 'fleet_manager') return 'fleet_manager'
  if (role === 'admin')         return 'admin'
  return 'unknown'
}

// ── Core: get current user ────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<FleetUser | null> {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'ecosystem') {
    throw new Error('auth-3boost not yet wired — set NEXT_PUBLIC_AUTH_MODE=standalone')
  }

  try {
    // Auth check → Core_Eco
    const { data: { user } } = await createAuthClient().auth.getUser()
    if (!user) return null

    // Fleet membership + portal grants → via /api/fleet/me (server, service-role).
    // Querying Fleet DB directly from the browser here (as this used to) can't
    // work: RLS on fleet_business_members / fleet_member_portal_grants relies
    // on auth.uid(), but the session above is issued by the separate Core_Eco
    // Supabase project, so Fleet Postgres's own auth.uid() is always null for
    // a browser-side call — RLS silently returns zero rows regardless of real
    // grants. See src/app/api/fleet/me/route.ts doc for the full story.
    const res = await fetch('/api/fleet/me', { credentials: 'include' })
    if (!res.ok) return null
    const { user: fleetUser } = await res.json() as { user: {
      id: string; email: string | null; businessId: string | null; businessSlug: string | null
      businessType: BusinessType | null; opsProfile: OpsProfile | null; driverOpsProfile: OpsProfile | null
      role: MemberRole | null; portals: PortalGrants
    } | null }
    if (!fleetUser) {
      return {
        id: user.id, email: user.email ?? null,
        businessId: null, businessSlug: null, businessType: null, opsProfile: null, driverOpsProfile: null, role: null,
        portals: {}, isOwnerOp: false, displayMode: 'unknown',
      }
    }

    const { businessId, businessSlug, businessType, opsProfile, driverOpsProfile, role, portals } = fleetUser

    return {
      id:            user.id,
      email:         user.email ?? null,
      businessId,
      businessSlug,
      businessType,
      driverOpsProfile,
      opsProfile,
      role,
      portals,
      isOwnerOp:     role === 'owner' && businessType === 'owner_op',
      displayMode:   deriveDisplayMode(role, businessType),
    }
  } catch { return null }
}

// ── Get all businesses a user belongs to ─────────────────────────────────────

export async function getUserBusinesses(): Promise<Array<{
  businessId:   string
  businessSlug: string
  businessType: BusinessType
  role:         MemberRole
}>> {
  try {
    const { data: { user } } = await createAuthClient().auth.getUser()
    if (!user) return []

    const { data } = await createFleetClient()
      .from('fleet_business_members')
      .select(`
        role,
        business_id,
        businesses (
          slug,
          type
        )
      `)
      .eq('user_id', user.id)
      .eq('active', true)

    return (data ?? []).map(m => {
      const biz = m.businesses as unknown as { slug?: string; type?: string } | null
      return {
        businessId:   m.business_id,
        businessSlug: biz?.slug ?? '',
        businessType: (biz?.type ?? 'carrier') as BusinessType,
        role:         m.role as MemberRole,
      }
    })
  } catch { return [] }
}

// ── Session helpers ───────────────────────────────────────────────────────────

export async function getSession() {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'ecosystem') {
    throw new Error('auth-3boost not yet wired')
  }
  try {
    const { data: { session } } = await createAuthClient().auth.getSession()
    return session
  } catch { return null }
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser()
  return user !== null
}

export async function signOut(): Promise<void> {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'ecosystem') {
    return // TODO: auth-3boost sign out
  }
  try {
    await createAuthClient().auth.signOut()
  } catch { /* ignore */ }
}

// ── Display mode → userMode.ts compatibility shim ────────────────────────────
// Remove once userMode.ts is fully replaced by navConfig.ts.

export function displayModeToUserMode(mode: DisplayMode): string {
  const map: Record<DisplayMode, string> = {
    driver:        'driver',
    dispatcher:    'dispatcher',
    owner_op:      'owner_operator',
    fleet_owner:   'owner_operator',
    broker:        'dispatcher',
    fleet_manager: 'owner_operator',
    admin:         'owner_operator',
    unknown:       'driver',
  }
  return map[mode]
}
