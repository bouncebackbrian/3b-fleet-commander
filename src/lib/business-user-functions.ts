'use client'

import { createAuthClient } from '@/lib/auth-client'
import { createClient } from '@/lib/supabase-browser'
import type { BusinessPermission } from '@/lib/business-access'
import type { FleetCapability } from '@/lib/fleet/capabilities'

export type UserFunctionPortal = 'driver' | 'dispatch' | 'broker' | 'admin'
export type UserFunctionPermissionLevel = 'view' | 'manage'

export interface UserFunctionPortalGrant {
  portal: UserFunctionPortal
  permissionLevel: UserFunctionPermissionLevel
}

export interface BusinessUserFunction {
  id: string
  businessId: string
  name: string
  description: string | null
  businessPermissions: BusinessPermission[]
  fleetPortalGrants: UserFunctionPortalGrant[]
  fleetCapabilities: FleetCapability[]
  modeIds: string[]
  active: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(row: any): BusinessUserFunction {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    description: row.description,
    businessPermissions: row.business_permissions ?? [],
    fleetPortalGrants: row.fleet_portal_grants ?? [],
    fleetCapabilities: row.fleet_capabilities ?? [],
    modeIds: row.mode_ids ?? [],
    active: row.active,
  }
}

export async function listBusinessUserFunctions(businessId: string): Promise<BusinessUserFunction[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('business_user_functions')
    .select('*')
    .eq('business_id', businessId)
    .eq('active', true)
    .order('name')
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function createBusinessUserFunction(input: {
  businessId: string
  name: string
  description?: string
  businessPermissions?: BusinessPermission[]
  fleetPortalGrants?: UserFunctionPortalGrant[]
  fleetCapabilities?: FleetCapability[]
  modeIds?: string[]
}): Promise<BusinessUserFunction | null> {
  const supabase = createClient()
  const { data: { user } } = await createAuthClient().auth.getUser()
  if (!user || !input.name.trim()) return null

  const { data, error } = await supabase
    .from('business_user_functions')
    .insert({
      business_id: input.businessId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      business_permissions: input.businessPermissions ?? [],
      fleet_portal_grants: input.fleetPortalGrants ?? [],
      fleet_capabilities: input.fleetCapabilities ?? [],
      mode_ids: input.modeIds ?? [],
      created_by: user.id,
    })
    .select('*')
    .single()
  if (error || !data) return null
  return fromRow(data)
}

/** Assigns a reusable function to an already-authorized 3B ID. */
export async function assignBusinessUserFunction(input: {
  businessId: string
  functionId: string
  userId: string
}): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await createAuthClient().auth.getUser()
  if (!user) return false

  const { error } = await supabase
    .from('business_user_function_assignments')
    .upsert({
      business_id: input.businessId,
      function_id: input.functionId,
      user_id: input.userId,
      assigned_by: user.id,
      active: true,
    }, { onConflict: 'business_id,function_id,user_id' })

  return !error
}
