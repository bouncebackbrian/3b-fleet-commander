import 'server-only'

import { createAuthServerClient } from '@/lib/auth-server-client'
import { fleetServiceClient } from '@/lib/fleet-service-client'

const CAL_NEVA_BUSINESS_ID = '34f00ed3-1759-4534-afad-34b6b000792f'

export interface DevBusinessBootstrapResult {
  applied: boolean
  businessId: string | null
}

/**
 * Development convenience for the product owner account.
 *
 * IMPORTANT: the account email is configured through FLEET_DEV_ACCOUNT_EMAIL
 * and is never committed to source. When that authenticated email signs in,
 * we make Cal-Neva the selected development business and ensure explicit
 * Driver + Dispatch + Admin portal grants.
 *
 * This is intentionally idempotent and does not create a second business.
 */
export async function ensureDevelopmentBusinessAccess(): Promise<DevBusinessBootstrapResult> {
  const configuredEmail = process.env.FLEET_DEV_ACCOUNT_EMAIL?.trim().toLowerCase()
  if (!configuredEmail) return { applied: false, businessId: null }

  const auth = await createAuthServerClient()
  const { data: { user }, error } = await auth.auth.getUser()
  if (error || !user || user.email?.toLowerCase() !== configuredEmail) {
    return { applied: false, businessId: null }
  }

  const { data: profile } = await fleetServiceClient
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) return { applied: false, businessId: null }

  const { data: business } = await fleetServiceClient
    .from('businesses')
    .select('id')
    .eq('id', CAL_NEVA_BUSINESS_ID)
    .maybeSingle()

  if (!business) return { applied: false, businessId: null }

  await fleetServiceClient
    .from('fleet_business_members')
    .upsert({
      business_id: CAL_NEVA_BUSINESS_ID,
      user_id: user.id,
      role: 'owner',
      active: true,
    }, { onConflict: 'business_id,user_id' })

  await fleetServiceClient
    .from('business_members')
    .upsert({
      business_id: CAL_NEVA_BUSINESS_ID,
      user_id: user.id,
      role: 'owner',
    }, { onConflict: 'business_id,user_id' })

  await fleetServiceClient
    .from('fleet_member_portal_grants')
    .upsert([
      { business_id: CAL_NEVA_BUSINESS_ID, user_id: user.id, portal: 'driver', permission_level: 'manage', granted_by: user.id },
      { business_id: CAL_NEVA_BUSINESS_ID, user_id: user.id, portal: 'dispatch', permission_level: 'manage', granted_by: user.id },
      { business_id: CAL_NEVA_BUSINESS_ID, user_id: user.id, portal: 'admin', permission_level: 'manage', granted_by: user.id },
    ], { onConflict: 'business_id,user_id,portal' })

  await fleetServiceClient
    .from('profiles')
    .update({ default_business_id: CAL_NEVA_BUSINESS_ID, has_fleet: true })
    .eq('id', user.id)

  await fleetServiceClient
    .from('businesses')
    .update({ has_fleet: true })
    .eq('id', CAL_NEVA_BUSINESS_ID)

  return { applied: true, businessId: CAL_NEVA_BUSINESS_ID }
}
