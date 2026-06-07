/**
 * fleet-auth-guard.ts — Server-side auth + membership resolver
 *
 * Use at the top of every /api/fleet/* route handler.
 * Validates session via Core_Eco (ADR-001), resolves Fleet membership (ADR-004).
 *
 * Returns null if the user is unauthenticated or has no active Fleet membership.
 * Route handlers must check for null and return 401/403 accordingly.
 */

import { createAuthServerClient } from '@/lib/auth-server-client'
import { fleetServiceClient }     from '@/lib/fleet-service-client'

export interface FleetGuardResult {
  userId:     string
  email:      string | null
  businessId: string
  role:       string
}

/**
 * Validate session and resolve Fleet membership in one call.
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

    return {
      userId:     user.id,
      email:      user.email ?? null,
      businessId: membership.business_id,
      role:       membership.role,
    }
  } catch {
    return null
  }
}

/**
 * Check if a role has write access.
 * owners, admins, dispatchers can mutate. drivers are read-only.
 */
export function canWrite(role: string): boolean {
  return ['owner', 'admin', 'dispatcher'].includes(role)
}
