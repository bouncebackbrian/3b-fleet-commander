'use client'
/**
 * identity-registry.ts — 3B Identity & Business Registry
 *
 * Core_Eco owns person/business identity. Fleet DB owns operational records.
 * This adapter normalizes the Core_Eco business schema into Fleet Commander's
 * stable ThreeBBusiness shape so setup does not depend on Fleet-only columns.
 */

import { createClient } from '@/lib/supabase-browser'
import { createAuthClient } from '@/lib/auth-client'

export type ThreeBUserId = string
export type ThreeBBizId = string
export type EcosystemRole = 'owner' | 'partner' | 'manager' | 'employee' | 'advisor'

export const ECOSYSTEM_ROLE_LABELS: Record<EcosystemRole, string> = {
  owner: 'Owner', partner: 'Partner', manager: 'Manager', employee: 'Employee', advisor: 'Advisor',
}

export interface ThreeBProfile {
  id: string; three_b_id: ThreeBUserId; first_name: string | null; last_name: string | null; email: string
  phone: string | null; address_line1: string | null; address_line2: string | null; city: string | null; state: string | null; zip: string | null
  verification_status: 'unverified' | 'pending' | 'verified'; verified_at: string | null; avatar_url: string | null
  has_fleet: boolean; has_credit: boolean; has_funding: boolean; has_payments: boolean; has_media: boolean; has_content: boolean
  cdl_number: string | null; cdl_state: string | null; cdl_class: string | null; cdl_expires: string | null; endorsements: string | null
  tractor_number: string | null; trailer_number: string | null; stripe_customer_id: string | null; default_business_id: string | null
  created_at: string; updated_at: string
}

export type EntityType = 'LLC' | 'S-Corp' | 'C-Corp' | 'Sole Prop' | 'Partnership' | 'Non-Profit'
export type BusinessType = 'owner_op' | 'carrier' | 'brokerage' | 'fleet_management' | 'service' | 'other'
export type RevenueStatus = 'none' | 'generating' | 'documented'
export type CreditStatus = 'none' | 'building' | 'established'

export interface ThreeBBusiness {
  id: string; three_b_biz_id: ThreeBBizId; company_name: string; slug: string | null; entity_type: EntityType | null
  formation_date: string | null; ein: string | null; mc_number: string | null; dot_number: string | null; state_of_formation: string | null
  address: string | null; city: string | null; state: string | null; zip: string | null; business_phone: string | null; website: string | null; domain_email: string | null
  quick_text_phone?: string | null
  owner_id: string | null; business_type: BusinessType
  has_fleet: boolean; has_funding: boolean; has_credit: boolean; has_payments: boolean; has_media: boolean; has_content: boolean
  stripe_account_id: string | null; has_ein: boolean; has_business_address: boolean; has_business_phone: boolean; has_website: boolean; has_domain_email: boolean
  has_bank_account: boolean; revenue_status: RevenueStatus; credit_status: CreditStatus; created_at: string; updated_at: string
}

export interface BankabilityBreakdown {
  entity_formed: number; ein: number; business_address: number; business_phone: number; website: number; domain_email: number
  bank_account: number; revenue: number; business_credit: number; total: number
}

function normalizeBusiness(row: Record<string, unknown>): ThreeBBusiness {
  const companyName = String(row.company_name ?? row.name ?? row.legal_name ?? '')
  const address = (row.address ?? row.address_line1 ?? null) as string | null
  const zip = (row.zip ?? row.postal_code ?? row.zip_code ?? null) as string | null
  const website = (row.website ?? row.website_url ?? null) as string | null
  const domainEmail = (row.domain_email ?? row.business_email ?? null) as string | null
  const ein = (row.ein ?? null) as string | null
  const businessPhone = (row.business_phone ?? null) as string | null
  const businessType = String(row.business_type ?? row.type ?? 'other') as BusinessType

  return {
    id: String(row.id),
    three_b_biz_id: String(row.three_b_biz_id ?? row.business_code ?? ''),
    company_name: companyName,
    slug: (row.slug ?? null) as string | null,
    entity_type: (row.entity_type ?? null) as EntityType | null,
    formation_date: (row.formation_date ?? null) as string | null,
    ein,
    mc_number: (row.mc_number ?? null) as string | null,
    dot_number: (row.dot_number ?? null) as string | null,
    state_of_formation: (row.state_of_formation ?? row.formation_state ?? null) as string | null,
    address,
    city: (row.city ?? null) as string | null,
    state: (row.state ?? null) as string | null,
    zip,
    business_phone: businessPhone,
    website,
    domain_email: domainEmail,
    quick_text_phone: (row.quick_text_phone ?? null) as string | null,
    owner_id: (row.owner_id ?? null) as string | null,
    business_type: businessType,
    has_fleet: Boolean(row.has_fleet ?? true),
    has_funding: Boolean(row.has_funding ?? (row.funding_status && row.funding_status !== 'none')),
    has_credit: Boolean(row.has_credit ?? (row.credit_builder_status && row.credit_builder_status !== 'none')),
    has_payments: Boolean(row.has_payments ?? false),
    has_media: Boolean(row.has_media ?? (row.media_status && row.media_status !== 'none')),
    has_content: Boolean(row.has_content ?? false),
    stripe_account_id: (row.stripe_account_id ?? null) as string | null,
    has_ein: Boolean(row.has_ein ?? ein),
    has_business_address: Boolean(row.has_business_address ?? address),
    has_business_phone: Boolean(row.has_business_phone ?? businessPhone),
    has_website: Boolean(row.has_website ?? website),
    has_domain_email: Boolean(row.has_domain_email ?? domainEmail),
    has_bank_account: Boolean(row.has_bank_account ?? (row.bank_account_status && row.bank_account_status !== 'none')),
    revenue_status: (row.revenue_status ?? 'none') as RevenueStatus,
    credit_status: (row.credit_status ?? (row.credit_builder_status === 'none' ? 'none' : 'building') ?? 'none') as CreditStatus,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

export function calcBankabilityScore(b: Pick<ThreeBBusiness,
  | 'formation_date' | 'has_ein' | 'has_business_address' | 'has_business_phone' | 'has_website' | 'has_domain_email'
  | 'has_bank_account' | 'revenue_status' | 'credit_status'>): BankabilityBreakdown {
  const entity_formed = b.formation_date ? 10 : 0
  const ein = b.has_ein ? 10 : 0
  const business_address = b.has_business_address ? 10 : 0
  const business_phone = b.has_business_phone ? 10 : 0
  const website = b.has_website ? 10 : 0
  const domain_email = b.has_domain_email ? 10 : 0
  const bank_account = b.has_bank_account ? 15 : 0
  const revenue = b.revenue_status === 'documented' ? 15 : b.revenue_status === 'generating' ? 7 : 0
  const business_credit = b.credit_status === 'established' ? 10 : b.credit_status === 'building' ? 5 : 0
  return { entity_formed, ein, business_address, business_phone, website, domain_email, bank_account, revenue, business_credit,
    total: entity_formed + ein + business_address + business_phone + website + domain_email + bank_account + revenue + business_credit }
}

export interface BusinessMember { id: string; business_id: string; user_id: string; role: EcosystemRole; invited_by: string | null; joined_at: string; created_at: string }
export interface BusinessRegistryRow { business: ThreeBBusiness; memberRole: EcosystemRole; bankability: BankabilityBreakdown }

export async function getThreeBProfile(): Promise<ThreeBProfile | null> {
  try {
    const supabase = createClient()
    const { data: { user } } = await createAuthClient().auth.getUser()
    if (!user) return null
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (error || !data) return null
    const row = data as Record<string, unknown>
    const raw3b = String(row.three_b_id ?? row.user_id ?? '')
    return {
      ...(data as unknown as ThreeBProfile),
      three_b_id: raw3b.startsWith('3B-U-') ? raw3b : '',
      first_name: (row.first_name ?? null) as string | null,
      last_name: (row.last_name ?? null) as string | null,
      state: (row.state ?? row.state_code ?? null) as string | null,
      zip: (row.zip ?? null) as string | null,
      default_business_id: (row.default_business_id ?? null) as string | null,
    }
  } catch { return null }
}

export async function getBusinessRegistry(): Promise<BusinessRegistryRow[]> {
  try {
    const supabase = createClient()
    const { data: { user } } = await createAuthClient().auth.getUser()
    if (!user) return []
    const { data, error } = await supabase.from('business_members').select('role, businesses (*)').eq('user_id', user.id).order('created_at', { ascending: true })
    if (error || !data) return []
    return data.filter(row => row.businesses).map(row => {
      const biz = normalizeBusiness(row.businesses as unknown as Record<string, unknown>)
      return { business: biz, memberRole: row.role as EcosystemRole, bankability: calcBankabilityScore(biz) }
    })
  } catch { return [] }
}

export async function getBusiness(businessId: string): Promise<ThreeBBusiness | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.from('businesses').select('*').eq('id', businessId).single()
    if (error || !data) return null
    return normalizeBusiness(data as Record<string, unknown>)
  } catch { return null }
}

function isMissingCreatorRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase()
  return text.includes('pgrst202') || (text.includes('schema cache') && text.includes('create_3b_business_for_current_user'))
}

export async function createBusiness(input: {
  company_name: string; business_type: BusinessType; entity_type?: EntityType; slug?: string
}): Promise<ThreeBBusiness | null> {
  const supabase = createClient()
  const { data: { user } } = await createAuthClient().auth.getUser()
  if (!user) throw new Error('You must be signed in to create a business.')

  const { data, error } = await supabase.rpc('create_3b_business_for_current_user', {
    p_company_name: input.company_name,
    p_business_type: input.business_type,
    p_entity_type: input.entity_type ?? null,
    p_slug: input.slug ?? null,
  })

  if (!error && data) return normalizeBusiness(data as Record<string, unknown>)
  if (isMissingCreatorRpc(error)) throw new Error('Business setup is not available in the connected identity database yet. Please refresh and try again.')
  if (error) throw new Error(error.message)
  throw new Error('Business creation returned no record.')
}

export async function updateBankabilityFactors(
  businessId: string,
  factors: Partial<Pick<ThreeBBusiness,
    | 'has_ein' | 'has_business_address' | 'has_business_phone' | 'has_website' | 'has_domain_email' | 'has_bank_account'
    | 'revenue_status' | 'credit_status' | 'formation_date' | 'entity_type' | 'ein' | 'website' | 'business_phone' | 'domain_email'>>
): Promise<boolean> {
  try {
    const supabase = createClient()
    const patch: Record<string, unknown> = {}
    if ('formation_date' in factors) patch.formation_date = factors.formation_date
    if ('entity_type' in factors) patch.entity_type = factors.entity_type
    if ('ein' in factors) patch.ein = factors.ein
    if ('business_phone' in factors) patch.business_phone = factors.business_phone
    if ('website' in factors) patch.website_url = factors.website
    if ('domain_email' in factors) patch.business_email = factors.domain_email
    const { error } = await supabase.from('businesses').update(patch).eq('id', businessId)
    return !error
  } catch { return false }
}
