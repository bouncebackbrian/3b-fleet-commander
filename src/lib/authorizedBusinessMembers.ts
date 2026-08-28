'use client'

import { createClient } from '@/lib/supabase-browser'

export type GovernanceRole = 'partner' | 'manager' | 'employee' | 'advisor'
export type FleetRole = 'driver' | 'dispatcher' | 'admin' | 'broker' | 'fleet_manager'

export interface ThreeBMemberPreview {
  userId: string
  threeBId: string
  displayName: string | null
}

export async function previewThreeBMember(threeBId: string): Promise<ThreeBMemberPreview | null> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('preview_3b_member', { p_three_b_id: threeBId.trim() })
  if (error || !data?.length) return null
  return {
    userId: data[0].user_id,
    threeBId: data[0].three_b_id,
    displayName: data[0].display_name ?? null,
  }
}

export async function addAuthorizedThreeBMember(input: {
  businessId: string
  threeBId: string
  governanceRole: GovernanceRole
  fleetRole?: FleetRole | null
}): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase.rpc('add_authorized_3b_member', {
    p_business_id: input.businessId,
    p_three_b_id: input.threeBId.trim(),
    p_governance_role: input.governanceRole,
    p_fleet_role: input.fleetRole ?? null,
  })
  return !error
}
