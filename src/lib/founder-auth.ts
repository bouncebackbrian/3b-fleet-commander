import 'server-only'

import { redirect } from 'next/navigation'
import { createAuthServerClient } from '@/lib/auth-server-client'
import { fleetServiceClient } from '@/lib/fleet-service-client'

export interface FounderIdentity {
  userId: string
  email: string | null
  threeBId: string | null
  adminLevel: 'founder' | 'platform_admin' | 'support'
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
 * Primary source of truth: fleet_platform_admins.
 * Environment allow-lists remain as a temporary rollout/recovery fallback.
 */
export async function getFounderIdentity(): Promise<FounderIdentity | null> {
  try {
    const auth = await createAuthServerClient()
    const { data: { user }, error } = await auth.auth.getUser()
    if (error || !user) return null

    const [{ data: profile }, { data: platformAdmin }] = await Promise.all([
      fleetServiceClient
        .from('profiles')
        .select('three_b_id')
        .eq('id', user.id)
        .maybeSingle(),
      fleetServiceClient
        .from('fleet_platform_admins')
        .select('admin_level, active')
        .eq('user_id', user.id)
        .eq('active', true)
        .maybeSingle(),
    ])

    const email = user.email?.toLowerCase() ?? null
    const threeBId = typeof profile?.three_b_id === 'string' ? profile.three_b_id : null

    if (platformAdmin?.active) {
      return {
        userId: user.id,
        email: user.email ?? null,
        threeBId,
        adminLevel: platformAdmin.admin_level as FounderIdentity['adminLevel'],
      }
    }

    // Rollout/recovery fallback while the new migration reaches every env.
    const allowedUserIds = csvEnv('FLEET_FOUNDER_USER_IDS')
    const allowedEmails = csvEnv('FLEET_FOUNDER_EMAILS')
    const allowedThreeBIds = csvEnv('FLEET_FOUNDER_3B_IDS')

    const authorizedByFallback =
      allowedUserIds.has(user.id.toLowerCase()) ||
      (email != null && allowedEmails.has(email)) ||
      (threeBId != null && allowedThreeBIds.has(threeBId.toLowerCase()))

    if (!authorizedByFallback) return null

    return {
      userId: user.id,
      email: user.email ?? null,
      threeBId,
      adminLevel: 'founder',
    }
  } catch {
    return null
  }
}

export async function requireFounder(): Promise<FounderIdentity> {
  const founder = await getFounderIdentity()
  if (!founder) redirect('/fleet')
  return founder
}
