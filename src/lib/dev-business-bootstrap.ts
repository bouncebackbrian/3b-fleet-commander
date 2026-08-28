import 'server-only'

import { createAuthServerClient } from '@/lib/auth-server-client'
import { fleetServiceClient } from '@/lib/fleet-service-client'

const CAL_NEVA_BUSINESS_ID = '34f00ed3-1759-4534-afad-34b6b000792f'

const FULL_BUSINESS_PERMISSIONS = [
  'asset_portal_view',
  'asset_portal_manage',
  'authorized_users_view',
  'authorized_users_manage',
  'company_profile_view',
  'company_profile_manage',
  'billing_view',
  'billing_manage',
  'subscriptions_view',
  'subscriptions_manage',
  'compliance_view',
  'compliance_manage',
  'driver_pay_view',
  'driver_pay_manage',
  'payroll_settings_view',
  'payroll_settings_manage',
] as const

const FULL_DUMP_TRUCK_CAPABILITIES = [
  'hours_view',
  'hours_approve',
  'hours_correct',
  'reports_view',
  'reports_generate',
  'kpi_view',
  'kpi_export',
  'driver_status_view',
  'dispatch_assign',
  'dispatch_message',
  'tickets_view',
  'tickets_manage',
  'fuel_view',
  'exceptions_manage',
] as const

export interface DevBusinessBootstrapResult {
  applied: boolean
  businessId: string | null
}

/**
 * Development convenience for the product-owner 3B account.
 *
 * The authenticated account configured in FLEET_DEV_ACCOUNT_EMAIL is treated
 * as a fully authorized Cal-Neva user for product development: Business Admin
 * + Driver + Dispatch + all current Dump Truck operational capabilities.
 *
 * This does NOT make the account Cal-Neva's legal owner. Platform Founder
 * authority is also separate and comes from fleet_platform_admins.
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
      role: 'admin',
      active: true,
    }, { onConflict: 'business_id,user_id' })

  await fleetServiceClient
    .from('business_members')
    .upsert({
      business_id: CAL_NEVA_BUSINESS_ID,
      user_id: user.id,
      role: 'manager',
    }, { onConflict: 'business_id,user_id' })

  await fleetServiceClient
    .from('fleet_member_portal_grants')
    .upsert([
      { business_id: CAL_NEVA_BUSINESS_ID, user_id: user.id, portal: 'driver', permission_level: 'manage', granted_by: user.id },
      { business_id: CAL_NEVA_BUSINESS_ID, user_id: user.id, portal: 'dispatch', permission_level: 'manage', granted_by: user.id },
      { business_id: CAL_NEVA_BUSINESS_ID, user_id: user.id, portal: 'admin', permission_level: 'manage', granted_by: user.id },
    ], { onConflict: 'business_id,user_id,portal' })

  await fleetServiceClient
    .from('business_member_permissions')
    .upsert(
      FULL_BUSINESS_PERMISSIONS.map(permission => ({
        business_id: CAL_NEVA_BUSINESS_ID,
        user_id: user.id,
        permission,
        granted_by: user.id,
      })),
      { onConflict: 'business_id,user_id,permission' },
    )

  await fleetServiceClient
    .from('fleet_member_capability_grants')
    .upsert(
      FULL_DUMP_TRUCK_CAPABILITIES.map(capability => ({
        business_id: CAL_NEVA_BUSINESS_ID,
        user_id: user.id,
        capability,
        mode_id: 'dump-truck',
        granted_by: user.id,
      })),
      { onConflict: 'business_id,user_id,capability,mode_id' },
    )

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
