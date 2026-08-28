/**
 * fleet-auth-guard.ts — Server-side auth + membership resolver
 *
 * Use at the top of every /api/fleet/* route handler.
 * Validates session via Core_Eco, then resolves the EXACT active Fleet business.
 *
 * Business isolation rule:
 * - Core 3Boost owns business identity.
 * - Fleet operations are always scoped to one selected 3B Business ID.
 * - Never use "first membership wins" for a multi-business user.
 */

import { cookies } from 'next/headers'
import { createAuthServerClient } from '@/lib/auth-server-client'
import { fleetServiceClient } from '@/lib/fleet-service-client'

export const ACTIVE_FLEET_BUSINESS_COOKIE = '3b_fleet_business_id'

export type Portal = 'driver' | 'dispatch' | 'broker' | 'admin' | 'payroll' | 'billing'
export type PermissionLevel = 'view' | 'manage'
export type PortalGrants = Partial<Record<Portal, PermissionLevel>>

export interface FleetGuardResult {
  userId: string
  email: string | null
  businessId: string
  /** Display-only. Authorization comes from PortalGrants. */
  role: string
  portals: PortalGrants
}

/**
 * Validate the Core session and resolve one exact Fleet membership.
 *
 * If the user belongs to multiple Fleet businesses, an active-business cookie
 * is required. That cookie is set when the user selects a Core 3Boost business
 * during Fleet activation. We intentionally do not guess between companies.
 */
export async function requireFleetAuth(): Promise<FleetGuardResult | null> {
  try {
    // 1. Validate session against Core_Eco.
    const auth = await createAuthServerClient()
    const { data: { user }, error } = await auth.auth.getUser()
    if (error || !user) return null

    // 2. Read explicit Fleet business context.
    const cookieStore = await cookies()
    const selectedBusinessId = cookieStore.get(ACTIVE_FLEET_BUSINESS_COOKIE)?.value?.trim() || ''

    let membership: { business_id: string; role: string } | null = null

    if (selectedBusinessId) {
      const { data } = await fleetServiceClient
        .from('fleet_business_members')
        .select('business_id, role')
        .eq('user_id', user.id)
        .eq('business_id', selectedBusinessId)
        .eq('active', true)
        .maybeSingle()
      membership = data
    } else {
      // Single-company users can enter Fleet without an extra selection step.
      // Multi-company users must explicitly select a business in /start.
      const { data } = await fleetServiceClient
        .from('fleet_business_members')
        .select('business_id, role')
        .eq('user_id', user.id)
        .eq('active', true)
        .limit(2)

      if ((data?.length ?? 0) === 1) membership = data![0]
      else return null
    }

    if (!membership) return null

    // 3. Resolve portal grants only for that exact business.
    const { data: grantRows } = await fleetServiceClient
      .from('fleet_member_portal_grants')
      .select('portal, permission_level')
      .eq('business_id', membership.business_id)
      .eq('user_id', user.id)

    const portals: PortalGrants = {}
    for (const g of grantRows ?? []) {
      portals[g.portal as Portal] = g.permission_level as PermissionLevel
    }

    return {
      userId: user.id,
      email: user.email ?? null,
      businessId: membership.business_id,
      role: membership.role,
      portals,
    }
  } catch {
    return null
  }
}

/** True if the member holds any level (view or manage) of the given portal. */
export function hasPortal(portals: PortalGrants, portal: Portal): boolean {
  return portals[portal] != null
}

/** True if the member holds manage-level access to the given portal. */
export function canManage(portals: PortalGrants, portal: Portal): boolean {
  return portals[portal] === 'manage'
}

/**
 * Best-effort legacy role label from portal grants. This is display-only and
 * must never be used as the authorization boundary.
 */
export function derivePrimaryRoleLabel(grants: { portal: Portal; permissionLevel: PermissionLevel }[]): string {
  const has = (p: Portal, level: PermissionLevel = 'manage') =>
    grants.some(g => g.portal === p && (level === 'view' || g.permissionLevel === 'manage'))
  if (has('admin')) return 'admin'
  if (has('dispatch')) return 'dispatcher'
  if (has('broker') && !has('dispatch')) return 'broker'
  if (has('driver')) return 'driver'
  return 'driver'
}
