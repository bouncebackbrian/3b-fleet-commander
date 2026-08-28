'use client'

import { createAuthClient } from '@/lib/auth-client'
import { createClient } from '@/lib/supabase-browser'
import type { BusinessType, ThreeBBusiness } from '@/lib/identity-registry'

export interface CreateProvisionalBusinessInput {
  companyName: string
  businessType?: BusinessType
  state?: string
  dotNumber?: string
  mcNumber?: string
  ownerName?: string
  ownerEmail?: string
  ownerPhone?: string
  truckUnitNumber?: string
  truckType?: string
  vin?: string
  licensePlate?: string
}

export interface ProvisionalBusinessResult {
  business: ThreeBBusiness
  equipmentId?: string
  reusedExisting?: boolean
  matchBasis?: 'dot' | 'mc' | 'name_state'
}

interface BusinessMatch {
  business_id: string
  three_b_biz_id: string
  company_name: string
  state: string | null
  account_status: string
  owner_claimed: boolean
  match_basis: 'dot' | 'mc' | 'name_state'
}

export async function findExistingEmployer(input: Pick<CreateProvisionalBusinessInput, 'companyName' | 'state' | 'dotNumber' | 'mcNumber'>): Promise<BusinessMatch | null> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('find_3b_business_match', {
    p_company_name: input.companyName.trim(),
    p_state: input.state?.trim() || null,
    p_dot_number: input.dotNumber?.trim() || null,
    p_mc_number: input.mcNumber?.trim() || null,
  })
  if (error || !data?.length) return null
  return data[0] as BusinessMatch
}

async function attachDriverToExistingProvisional(businessId: string): Promise<boolean> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('join_provisional_business_as_driver', { p_business_id: businessId })
  return !error && data === true
}

async function addTruckIfProvided(
  businessId: string,
  userId: string,
  input: CreateProvisionalBusinessInput,
): Promise<string | undefined> {
  if (!input.truckUnitNumber?.trim()) return undefined
  const supabase = createClient()

  const { data: existing } = await supabase
    .from('fleet_equipment')
    .select('id')
    .eq('business_id', businessId)
    .eq('unit_number', input.truckUnitNumber.trim())
    .maybeSingle()
  if (existing?.id) return existing.id

  const { data: equipment, error } = await supabase
    .from('fleet_equipment')
    .insert({
      business_id: businessId,
      unit_number: input.truckUnitNumber.trim(),
      equipment_type: input.truckType?.trim() || 'tractor',
      vin: input.vin?.trim() || null,
      license_plate: input.licensePlate?.trim() || null,
      dot_number: input.dotNumber?.trim() || null,
      mc_number: input.mcNumber?.trim() || null,
      created_by: userId,
    })
    .select('id')
    .single()

  return !error && equipment ? equipment.id : undefined
}

/**
 * Driver-created employer/company record.
 * Existing 3B businesses are matched before creation so multiple drivers do
 * not produce multiple provisional 3B Business IDs for the same employer.
 * The driver never becomes legal owner through this flow.
 */
export async function createProvisionalBusiness(
  input: CreateProvisionalBusinessInput,
): Promise<ProvisionalBusinessResult | null> {
  const supabase = createClient()
  const { data: { user } } = await createAuthClient().auth.getUser()
  if (!user || !input.companyName.trim()) return null

  const match = await findExistingEmployer(input)
  if (match) {
    if (match.owner_claimed) {
      // Claimed companies require an owner/admin invitation; do not silently add a driver.
      return null
    }
    const joined = await attachDriverToExistingProvisional(match.business_id)
    if (!joined) return null
    const { data: existingBusiness } = await supabase.from('businesses').select('*').eq('id', match.business_id).single()
    if (!existingBusiness) return null
    const equipmentId = await addTruckIfProvided(match.business_id, user.id, input)
    return {
      business: existingBusiness as ThreeBBusiness,
      equipmentId,
      reusedExisting: true,
      matchBasis: match.match_basis,
    }
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .insert({
      company_name: input.companyName.trim(),
      business_type: input.businessType ?? 'carrier',
      state: input.state?.trim() || null,
      dot_number: input.dotNumber?.trim() || null,
      mc_number: input.mcNumber?.trim() || null,
      owner_id: null,
      created_by_user_id: user.id,
      account_status: 'provisional',
      provisional_owner_name: input.ownerName?.trim() || null,
      provisional_owner_email: input.ownerEmail?.trim() || null,
      provisional_owner_phone: input.ownerPhone?.trim() || null,
      has_fleet: true,
    })
    .select('*')
    .single()

  // A concurrent driver may have created the same employer after our lookup.
  // Database unique indexes are the final guard; retry lookup and join that record.
  if (businessError || !business) {
    const concurrentMatch = await findExistingEmployer(input)
    if (!concurrentMatch || concurrentMatch.owner_claimed) return null
    const joined = await attachDriverToExistingProvisional(concurrentMatch.business_id)
    if (!joined) return null
    const { data: existingBusiness } = await supabase.from('businesses').select('*').eq('id', concurrentMatch.business_id).single()
    if (!existingBusiness) return null
    const equipmentId = await addTruckIfProvided(concurrentMatch.business_id, user.id, input)
    return { business: existingBusiness as ThreeBBusiness, equipmentId, reusedExisting: true, matchBasis: concurrentMatch.match_basis }
  }

  const { error: governanceError } = await supabase.from('business_members').insert({
    business_id: business.id,
    user_id: user.id,
    role: 'employee',
  })
  if (governanceError) return null

  const { error: fleetMemberError } = await supabase.from('fleet_business_members').insert({
    business_id: business.id,
    user_id: user.id,
    role: 'driver',
    active: true,
  })
  if (fleetMemberError) return null

  const equipmentId = await addTruckIfProvided(business.id, user.id, input)
  return { business: business as ThreeBBusiness, equipmentId, reusedExisting: false }
}

/** Creates a visible claim request; it does not transfer ownership by itself. */
export async function requestProvisionalBusinessClaim(
  businessId: string,
  claimantEmail?: string,
  claimantPhone?: string,
): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await createAuthClient().auth.getUser()
  if (!user) return false

  const { error } = await supabase.from('business_claim_requests').upsert({
    business_id: businessId,
    claimant_user_id: user.id,
    requested_by_user_id: user.id,
    claimant_email: claimantEmail?.trim() || user.email || null,
    claimant_phone: claimantPhone?.trim() || null,
    status: 'pending',
  }, { onConflict: 'business_id,claimant_user_id' })

  if (error) return false

  await supabase
    .from('businesses')
    .update({ account_status: 'claim_pending' })
    .eq('id', businessId)
    .in('account_status', ['provisional', 'claim_pending'])

  return true
}

export function businessOwnershipLabel(business: Pick<ThreeBBusiness, 'owner_id'> & { account_status?: string | null }): string {
  if (business.account_status === 'provisional') return 'Owner account not claimed'
  if (business.account_status === 'claim_pending') return 'Owner claim pending'
  return business.owner_id ? 'Owner account active' : 'Ownership not established'
}
