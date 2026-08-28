import { fleetServiceClient } from '@/lib/fleet-service-client'

export type BusinessCoreModuleKey = 'asset_portal' | 'authorized_users'

export interface BusinessCoreModule {
  id: string
  businessId: string
  moduleKey: BusinessCoreModuleKey
  enabled: boolean
  provisionedAt: string
}

export async function listBusinessCoreModules(businessId: string): Promise<BusinessCoreModule[]> {
  const { data, error } = await fleetServiceClient
    .from('business_core_modules')
    .select('id,business_id,module_key,enabled,provisioned_at')
    .eq('business_id', businessId)
    .order('module_key', { ascending: true })

  if (error) throw error
  return (data ?? []).map(row => ({
    id: row.id,
    businessId: row.business_id,
    moduleKey: row.module_key as BusinessCoreModuleKey,
    enabled: row.enabled,
    provisionedAt: row.provisioned_at,
  }))
}

export const BUSINESS_CORE_MODULE_LABELS: Record<BusinessCoreModuleKey, string> = {
  asset_portal: 'Asset Portal',
  authorized_users: 'Authorized Users',
}
