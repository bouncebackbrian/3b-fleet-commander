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
import { createFleetClient } from '@/lib/fleet-db-client'   // Fleet DB — membership/fleet data

// ── Types ─────────────────────────────────────────────────────────────────────

export type BusinessType = 'owner_op' | 'carrier' | 'brokerage' | 'fleet_management'

export type MemberRole = 'owner' | 'driver' | 'dispatcher' | 'admin' | 'broker' | 'fleet_manager'

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
  role?:          MemberRole | null
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

    // Fleet membership → Fleet DB
    const { data: membership } = await createFleetClient()
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
      .limit(1)
      .maybeSingle()

    const role         = (membership?.role ?? null) as MemberRole | null
    const biz          = membership?.businesses as unknown as { type?: string; slug?: string } | null
    const businessType = (biz?.type ?? null) as BusinessType | null
    const businessSlug = biz?.slug ?? null

    return {
      id:            user.id,
      email:         user.email ?? null,
      businessId:    membership?.business_id ?? null,
      businessSlug,
      businessType,
      role,
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
