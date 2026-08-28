import 'server-only'

import { redirect } from 'next/navigation'
import { createAuthServerClient } from '@/lib/auth-server-client'
import { fleetServiceClient } from '@/lib/fleet-service-client'

export interface FounderIdentity {
  userId: string
  email: string | null
  threeBId: string | null
}

function csvEnv(name: string): Set<string> {
  return new Set(
    (process.env[name] ?? '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * Founder access is intentionally independent from business membership and
 * normal Fleet portal grants. Platform-wide access must never be inherited
 * merely because somebody is an owner/admin of a customer account.
 *
 * Configure one or more of:
 *   FLEET_FOUNDER_USER_IDS=<auth UUID>[,...]
 *   FLEET_FOUNDER_EMAILS=<email>[,...]
 *   FLEET_FOUNDER_3B_IDS=3B-U-XXXXXXXX[,...]
 */
export async function getFounderIdentity(): Promise<FounderIdentity | null> {
  try {
    const auth = await createAuthServerClient()
    const { data: { user }, error } = await auth.auth.getUser()
    if (error || !user) return null

    const allowedUserIds = csvEnv('FLEET_FOUNDER_USER_IDS')
    const allowedEmails = csvEnv('FLEET_FOUNDER_EMAILS')
    const allowedThreeBIds = csvEnv('FLEET_FOUNDER_3B_IDS')

    const { data: profile } = await fleetServiceClient
      .from('profiles')
      .select('three_b_id')
      .eq('id', user.id)
      .maybeSingle()

    const email = user.email?.toLowerCase() ?? null
    const threeBId = typeof profile?.three_b_id === 'string' ? profile.three_b_id : null

    const authorized =
      allowedUserIds.has(user.id.toLowerCase()) ||
      (email != null && allowedEmails.has(email)) ||
      (threeBId != null && allowedThreeBIds.has(threeBId.toLowerCase()))

    if (!authorized) return null

    return {
      userId: user.id,
      email: user.email ?? null,
      threeBId,
    }
  } catch {
    return null
  }
}

export async function requireFounder(): Promise<FounderIdentity> {
  const founder = await getFounderIdentity()
  if (!founder) redirect('/account')
  return founder
}
