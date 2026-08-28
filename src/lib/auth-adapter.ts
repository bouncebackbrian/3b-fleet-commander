'use client'
/**
 * auth-adapter.ts — Auth & Identity Bridge Layer
 *
 * Core_Eco owns identity/session. Fleet DB owns operational business access,
 * portal grants and asset context.
 */

import { createAuthClient }  from '@/lib/auth-client'
import { createFleetClient } from '@/lib/fleet-db-client'
import type { AssetOperatingMode } from '@/lib/fleet/asset-modes'

export type BusinessType = 'owner_op' | 'carrier' | 'brokerage' | 'fleet_management'

/** Legacy compatibility only. Trucking workflow classification belongs to the asset. */
export type OpsProfile = 'otr' | 'dump_truck'

export type MemberRole = 'owner' | 'driver' | 'dispatcher' | 'admin' | 'broker' | 'fleet_manager'
export type Portal = 'driver' | 'dispatch' | 'broker' | 'admin'
export type PermissionLevel = 'view' | 'manage'
export type PortalGrants = Partial<Record<Portal, PermissionLevel>>

export interface CurrentFleetAsset {
  id: string
  unitNumber: string
  operatingMode: AssetOperatingMode | null
}

export interface FleetUser {
  id: string
  email?: string | null
  businessId?: string | null
  businessSlug?: string | null
  businessType?: BusinessType | null
  /** Legacy business fallback; do not use this as the truck/workflow classification. */
  opsProfile?: OpsProfile | null
  /** Legacy driver-nav compatibility fallback. Prefer currentAsset.operatingMode. */
  driverOpsProfile?: OpsProfile | null
  /** The driver's currently resolved/recent asset. Its operatingMode selects the Driver workflow. */
  currentAsset?: CurrentFleetAsset | null
  role?: MemberRole | null
  portals: PortalGrants
  isOwnerOp: boolean
  displayMode: DisplayMode
}

export type DisplayMode =
  | 'driver'
  | 'dispatcher'
  | 'owner_op'
  | 'fleet_owner'
  | 'broker'
  | 'fleet_manager'
  | 'admin'
  | 'unknown'

function deriveDisplayMode(role: MemberRole | null, businessType: BusinessType | null): DisplayMode {
  if (!role) return 'unknown'
  if (role === 'owner') return businessType === 'owner_op' ? 'owner_op' : 'fleet_owner'
  if (role === 'driver') return 'driver'
  if (role === 'dispatcher') return 'dispatcher'
  if (role === 'broker') return 'broker'
  if (role === 'fleet_manager') return 'fleet_manager'
  if (role === 'admin') return 'admin'
  return 'unknown'
}

export async function getCurrentUser(): Promise<FleetUser | null> {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'ecosystem') {
    throw new Error('auth-3boost not yet wired — set NEXT_PUBLIC_AUTH_MODE=standalone')
  }

  try {
    const { data: { user } } = await createAuthClient().auth.getUser()
    if (!user) return null

    const res = await fetch('/api/fleet/me', { credentials: 'include' })
    if (!res.ok) return null

    const { user: fleetUser } = await res.json() as { user: {
      id: string
      email: string | null
      businessId: string | null
      businessSlug: string | null
      businessType: BusinessType | null
      opsProfile: OpsProfile | null
      driverOpsProfile: OpsProfile | null
      currentAsset?: CurrentFleetAsset | null
      role: MemberRole | null
      portals: PortalGrants
    } | null }

    if (!fleetUser) {
      return {
        id: user.id,
        email: user.email ?? null,
        businessId: null,
        businessSlug: null,
        businessType: null,
        opsProfile: null,
        driverOpsProfile: null,
        currentAsset: null,
        role: null,
        portals: {},
        isOwnerOp: false,
        displayMode: 'unknown',
      }
    }

    const { businessId, businessSlug, businessType, opsProfile, driverOpsProfile, currentAsset, role, portals } = fleetUser

    return {
      id: user.id,
      email: user.email ?? null,
      businessId,
      businessSlug,
      businessType,
      driverOpsProfile,
      opsProfile,
      currentAsset: currentAsset ?? null,
      role,
      portals,
      isOwnerOp: role === 'owner' && businessType === 'owner_op',
      displayMode: deriveDisplayMode(role, businessType),
    }
  } catch {
    return null
  }
}

export async function getUserBusinesses(): Promise<Array<{
  businessId: string
  businessSlug: string
  businessType: BusinessType
  role: MemberRole
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
        businessId: m.business_id,
        businessSlug: biz?.slug ?? '',
        businessType: (biz?.type ?? 'carrier') as BusinessType,
        role: m.role as MemberRole,
      }
    })
  } catch {
    return []
  }
}

export async function getSession() {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'ecosystem') {
    throw new Error('auth-3boost not yet wired')
  }
  try {
    const { data: { session } } = await createAuthClient().auth.getSession()
    return session
  } catch {
    return null
  }
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getCurrentUser()) !== null
}

export async function signOut(): Promise<void> {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'ecosystem') return
  try {
    await createAuthClient().auth.signOut()
  } catch { /* ignore */ }
}

export function displayModeToUserMode(mode: DisplayMode): string {
  const map: Record<DisplayMode, string> = {
    driver: 'driver',
    dispatcher: 'dispatcher',
    owner_op: 'owner_operator',
    fleet_owner: 'owner_operator',
    broker: 'dispatcher',
    fleet_manager: 'owner_operator',
    admin: 'owner_operator',
    unknown: 'driver',
  }
  return map[mode]
}
