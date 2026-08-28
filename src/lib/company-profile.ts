'use client'

import { createClient } from '@/lib/supabase-browser'

export type CompanyProfileInput = {
  addressLine1: string
  city: string
  state: string
  postalCode: string
  mcNumber: string
  dotNumber: string
  businessPhone: string
  domainEmail: string
  website: string
}

export async function updateCompanyProfile(businessId: string, input: CompanyProfileInput): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('update_3b_business_profile', {
    p_business_id: businessId,
    p_address_line1: input.addressLine1 || null,
    p_city: input.city || null,
    p_state: input.state || null,
    p_postal_code: input.postalCode || null,
    p_mc_number: input.mcNumber || null,
    p_dot_number: input.dotNumber || null,
    p_business_phone: input.businessPhone || null,
    p_domain_email: input.domainEmail || null,
    p_website: input.website || null,
  })
  if (error) throw new Error(error.message)
}
