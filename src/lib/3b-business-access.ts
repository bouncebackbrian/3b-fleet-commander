'use client'

import { createAuthClient } from '@/lib/auth-client'
import { createClient } from '@/lib/supabase-browser'

export type RequestedBusinessRole = 'partner' | 'manager' | 'employee' | 'advisor'
export type RequestedFleetRole = 'driver' | 'dispatcher' | 'admin' | 'broker' | 'fleet_manager'

export async function requestBusinessAccess(input: {
  businessId: string
  requestedRole?: RequestedBusinessRole
  requestedFleetRole?: RequestedFleetRole | null
  requestedMode?: string | null
  note?: string | null
}): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await createAuthClient().auth.getUser()
  if (!user) return false

  const { error } = await supabase.from('business_access_requests').upsert({
    business_id: input.businessId,
    requester_user_id: user.id,
    requested_role: input.requestedRole ?? 'employee',
    requested_fleet_role: input.requestedFleetRole ?? 'driver',
    requested_mode: input.requestedMode ?? null,
    note: input.note?.trim() || null,
    status: 'pending',
    reviewed_by_user_id: null,
    reviewed_at: null,
  }, { onConflict: 'business_id,requester_user_id' })

  return !error
}

/**
 * Resolve an existing 3B user from the account email attached to their 3B ID.
 * This is for company-side authorization/invite flows; it does not create a second identity.
 */
export async function findThreeBUserByAccountEmail(email: string): Promise<{
  id: string
  threeBId: string
  name: string
  email: string
} | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, three_b_id, first_name, last_name, email')
    .ilike('email', normalized)
    .maybeSingle()

  if (error || !data) return null
  return {
    id: data.id,
    threeBId: data.three_b_id,
    name: [data.first_name, data.last_name].filter(Boolean).join(' ') || data.email,
    email: data.email,
  }
}

export async function updateBusinessOperationsContact(input: {
  businessId: string
  email?: string | null
  phone?: string | null
  smsEnabled?: boolean
}): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('businesses')
    .update({
      operations_email: input.email?.trim() || null,
      operations_phone: input.phone?.trim() || null,
      sms_enabled: input.smsEnabled ?? false,
    })
    .eq('id', input.businessId)
  return !error
}

export async function updateMemberOperationsContact(input: {
  membershipId: string
  email?: string | null
  phone?: string | null
  smsOptIn?: boolean
  emailOptIn?: boolean
}): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('fleet_business_members')
    .update({
      operations_email: input.email?.trim() || null,
      operations_phone: input.phone?.trim() || null,
      sms_opt_in: input.smsOptIn ?? false,
      email_opt_in: input.emailOptIn ?? true,
    })
    .eq('id', input.membershipId)
  return !error
}
