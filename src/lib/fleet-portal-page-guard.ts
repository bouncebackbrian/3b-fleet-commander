import { redirect } from 'next/navigation'
import { hasPortal, requireFleetAuth, type FleetGuardResult, type Portal } from '@/lib/fleet-auth-guard'

/**
 * Fresh portal-entry authorization for server-rendered portal layouts.
 *
 * This intentionally re-resolves the authenticated user, active Fleet
 * membership, business context, and portal grants every time a Driver,
 * Dispatch, or Admin portal tree is entered. Client-side UI state is never
 * authoritative for portal access.
 */
export async function requirePortalPageAccess(portal: Portal): Promise<FleetGuardResult> {
  const auth = await requireFleetAuth()
  if (!auth) redirect('/login')

  if (!hasPortal(auth.portals, portal)) {
    redirect('/fleet?access=denied')
  }

  return auth
}
