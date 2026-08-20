/**
 * fleet-auth-guard.ts — Server-side auth + membership resolver
 *
 * Use at the top of every /api/fleet/* route handler.
 * Validates session via Core_Eco (ADR-001), resolves Fleet membership (ADR-004).
 *
 * Returns null if the user is unauthenticated or has no active Fleet membership.
 * Route handlers must check for null and return 401/403 accordingly.
 *
 * Portals (2026-07-29): authorization is granted per-portal (driver/dispatch/
 * broker/admin) at a view or manage level via fleet_member_portal_grants —
 * one member can hold any combination (an owner who also drives no longer
 * has to pick one role). `role` is still returned for display purposes
 * (Settings team list) but is NOT authoritative — no route should branch on
 * it. Use `hasPortal`/`canManage` instead of the old `canWrite`.
 */

import { createAuthServerClient } from '@/lib/auth-server-client'
import { fleetServiceClient }     from '@/lib/fleet-service-client'

export type Portal = 'driver' | 'dispatch' | 'broker' | 'admin' | 'payroll' | 'billing'
export type PermissionLevel = 'view' | 'manage'
export type PortalGrants = Partial<Record<Portal, PermissionLevel>>

export interface FleetGuardResult {
  userId:     string
  email:      string | null
  businessId: string
  /** Display-only — e.g. Settings team list. Not authoritative; see PortalGrants. */
  role:       string
  portals:    PortalGrants
}

/**
 * Validate session and resolve Fleet membership + portal grants in one call.
 * Returns null on any auth or membership failure.
 */
export async function requireFleetAuth(): Promise<FleetGuardResult | null> {
  try {
    // 1. Validate session → Core_Eco (ADR-001)
    const auth = await createAuthServerClient()
    const { data: { user }, error } = await auth.auth.getUser()
    if (error || !user) return null

    // 2. Resolve Fleet membership → Fleet DB (ADR-002)
    const { data: membership } = await fleetServiceClient
      .from('fleet_business_members')
      .select('business_id, role')
      .eq('user_id', user.id)
      .eq('active', true)
      .limit(1)
      .maybeSingle()

    if (!membership) return null

    // 3. Resolve portal grants for this business
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
      userId:     user.id,
      email:      user.email ?? null,
      businessId: membership.business_id,
      role:       membership.role,
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
 * Best-effort legacy role label from a set of portal grants — used only to
 * populate fleet_business_members.role / fleet_team_invites.role, which are
 * display-only now (see module doc). Never used for authorization.
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
