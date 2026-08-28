'use client'

import { createAuthClient } from '@/lib/auth-client'
import { createClient } from '@/lib/supabase-browser'
import type { BusinessType, ThreeBBusiness } from '@/lib/identity-registry'

export interface CreateProvisionalBusinessInput {
  companyName: string
  businessType?: BusinessType
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
}

/**
 * Driver-created employer/company record.
 * The driver becomes an employee + Fleet Commander driver only.
 * owner_id stays null until the real owner completes the claim process.
 */
export async function createProvisionalBusiness(
  input: CreateProvisionalBusinessInput,
): Promise<ProvisionalBusinessResult | null> {
  const supabase = createClient()
  const { data: { user } } = await createAuthClient().auth.getUser()
  if (!user || !input.companyName.trim()) return null

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .insert({
      company_name: input.companyName.trim(),
      business_type: input.businessType ?? 'carrier',
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

  if (businessError || !business) return null

  // The creator is NOT the owner. They are simply the employee/driver who supplied the record.
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

  let equipmentId: string | undefined
  if (input.truckUnitNumber?.trim()) {
    const { data: equipment, error: equipmentError } = await supabase
      .from('fleet_equipment')
      .insert({
        business_id: business.id,
        unit_number: input.truckUnitNumber.trim(),
        equipment_type: input.truckType?.trim() || 'tractor',
        vin: input.vin?.trim() || null,
        license_plate: input.licensePlate?.trim() || null,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (!equipmentError && equipment) equipmentId = equipment.id
  }

  return { business: business as ThreeBBusiness, equipmentId }
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
