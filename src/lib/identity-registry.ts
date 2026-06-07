'use client'
/**
 * identity-registry.ts — 3B Identity & Business Registry
 *
 * Manages the two-layer identity model:
 *
 *   3B-U-00000001 (person / 3B ID)
 *     └─ business_members (governance roles: owner | partner | manager | employee | advisor)
 *         └─ 3B-B-00000001 (business)
 *             └─ fleet_business_members (operational roles: owner | driver | dispatcher…)
 *                 └─ Fleet Commander data (loads, missions, vehicles…)
 *
 * Every 3B product connects through businesses.id — never directly to auth.users.
 */

import { createClient } from '@/lib/supabase-browser'

// ── 3B ID types ────────────────────────────────────────────────────────────────

/** Format: 3B-U-00000001 */
export type ThreeBUserId = string

/** Format: 3B-B-00000001 */
export type ThreeBBizId = string

// ── Governance roles (ecosystem layer, business_members table) ─────────────────
export type EcosystemRole = 'owner' | 'partner' | 'manager' | 'employee' | 'advisor'

export const ECOSYSTEM_ROLE_LABELS: Record<EcosystemRole, string> = {
  owner:    'Owner',
  partner:  'Partner',
  manager:  'Manager',
  employee: 'Employee',
  advisor:  'Advisor',
}

// ── Profile (3B User Identity) ─────────────────────────────────────────────────
export interface ThreeBProfile {
  id:                  string        // auth.users UUID
  three_b_id:          ThreeBUserId  // 3B-U-00000001
  first_name:          string | null
  last_name:           string | null
  email:               string
  phone:               string | null

  address_line1:       string | null
  address_line2:       string | null
  city:                string | null
  state:               string | null
  zip:                 string | null

  verification_status: 'unverified' | 'pending' | 'verified'
  verified_at:         string | null

  avatar_url:          string | null

  has_fleet:           boolean
  has_credit:          boolean
  has_funding:         boolean
  has_payments:        boolean
  has_media:           boolean
  has_content:         boolean

  cdl_number:          string | null
  cdl_state:           string | null
  cdl_class:           string | null
  cdl_expires:         string | null
  endorsements:        string | null
  tractor_number:      string | null
  trailer_number:      string | null

  stripe_customer_id:  string | null
  default_business_id: string | null

  created_at:          string
  updated_at:          string
}

// ── Business (3B Business Registry) ───────────────────────────────────────────
export type EntityType =
  | 'LLC' | 'S-Corp' | 'C-Corp' | 'Sole Prop' | 'Partnership' | 'Non-Profit'

export type BusinessType =
  | 'owner_op' | 'carrier' | 'brokerage' | 'fleet_management' | 'service' | 'other'

export type RevenueStatus = 'none' | 'generating' | 'documented'
export type CreditStatus  = 'none' | 'building'   | 'established'

export interface ThreeBBusiness {
  id:                   string        // UUID
  three_b_biz_id:       ThreeBBizId   // 3B-B-00000001
  company_name:         string
  slug:                 string | null
  entity_type:          EntityType | null
  formation_date:       string | null

  ein:                  string | null
  mc_number:            string | null
  dot_number:           string | null
  state_of_formation:   string | null

  address:              string | null
  city:                 string | null
  state:                string | null
  zip:                  string | null
  business_phone:       string | null
  website:              string | null
  domain_email:         string | null

  owner_id:             string | null
  business_type:        BusinessType

  has_fleet:            boolean
  has_funding:          boolean
  has_credit:           boolean
  has_payments:         boolean
  has_media:            boolean
  has_content:          boolean

  stripe_account_id:    string | null

  // Bankability factors
  has_ein:              boolean
  has_business_address: boolean
  has_business_phone:   boolean
  has_website:          boolean
  has_domain_email:     boolean
  has_bank_account:     boolean
  revenue_status:       RevenueStatus
  credit_status:        CreditStatus

  created_at:           string
  updated_at:           string
}

// ── Bankability Score ─────────────────────────────────────────────────────────

export interface BankabilityBreakdown {
  entity_formed:    number   // 0 or 10
  ein:              number   // 0 or 10
  business_address: number   // 0 or 10
  business_phone:   number   // 0 or 10
  website:          number   // 0 or 10
  domain_email:     number   // 0 or 10
  bank_account:     number   // 0 or 15
  revenue:          number   // 0, 7, or 15
  business_credit:  number   // 0, 5, or 10
  total:            number   // 0–100
}

/** Client-side mirror of the SQL calc_bankability_score function. */
export function calcBankabilityScore(b: Pick<ThreeBBusiness,
  | 'formation_date' | 'has_ein' | 'has_business_address'
  | 'has_business_phone' | 'has_website' | 'has_domain_email'
  | 'has_bank_account' | 'revenue_status' | 'credit_status'
>): BankabilityBreakdown {
  const entity_formed    = b.formation_date        ? 10 : 0
  const ein              = b.has_ein               ? 10 : 0
  const business_address = b.has_business_address  ? 10 : 0
  const business_phone   = b.has_business_phone    ? 10 : 0
  const website          = b.has_website           ? 10 : 0
  const domain_email     = b.has_domain_email      ? 10 : 0
  const bank_account     = b.has_bank_account      ? 15 : 0
  const revenue =
    b.revenue_status === 'documented' ? 15 :
    b.revenue_status === 'generating' ? 7  : 0
  const business_credit =
    b.credit_status === 'established' ? 10 :
    b.credit_status === 'building'    ? 5  : 0

  return {
    entity_formed, ein, business_address, business_phone,
    website, domain_email, bank_account, revenue, business_credit,
    total: entity_formed + ein + business_address + business_phone +
           website + domain_email + bank_account + revenue + business_credit,
  }
}

// ── Business Member ────────────────────────────────────────────────────────────
export interface BusinessMember {
  id:          string
  business_id: string
  user_id:     string
  role:        EcosystemRole
  invited_by:  string | null
  joined_at:   string
  created_at:  string
}

// ── Business Registry Dashboard row ───────────────────────────────────────────
export interface BusinessRegistryRow {
  business:         ThreeBBusiness
  memberRole:       EcosystemRole
  bankability:      BankabilityBreakdown
}

// ── Data fetching ──────────────────────────────────────────────────────────────

/** Returns the current user's 3B profile, or null if not signed in. */
export async function getThreeBProfile(): Promise<ThreeBProfile | null> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) return null
    return data as ThreeBProfile
  } catch {
    return null
  }
}

/**
 * Returns all businesses the current user belongs to,
 * along with their governance role and bankability score.
 */
export async function getBusinessRegistry(): Promise<BusinessRegistryRow[]> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('business_members')
      .select(`
        role,
        businesses (*)
      `)
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true })

    if (error || !data) return []

    return data
      .filter(row => row.businesses)
      .map(row => {
        const biz = row.businesses as unknown as ThreeBBusiness
        return {
          business:    biz,
          memberRole:  row.role as EcosystemRole,
          bankability: calcBankabilityScore(biz),
        }
      })
  } catch {
    return []
  }
}

/**
 * Returns a single business by ID if the current user is a member.
 */
export async function getBusiness(businessId: string): Promise<ThreeBBusiness | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .single()

    if (error) return null
    return data as ThreeBBusiness
  } catch {
    return null
  }
}

/**
 * Creates a new business and adds the current user as owner
 * in both business_members (governance) and fleet_business_members (operational).
 */
export async function createBusiness(input: {
  company_name: string
  business_type: BusinessType
  entity_type?: EntityType
  slug?: string
}): Promise<ThreeBBusiness | null> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // Create the business
    const { data: biz, error: bizErr } = await supabase
      .from('businesses')
      .insert({
        company_name:  input.company_name,
        business_type: input.business_type,
        entity_type:   input.entity_type ?? null,
        slug:          input.slug ?? null,
        owner_id:      user.id,
      })
      .select()
      .single()

    if (bizErr || !biz) return null

    // Add as owner in the ecosystem governance layer
    await supabase.from('business_members').insert({
      business_id: biz.id,
      user_id:     user.id,
      role:        'owner',
    })

    // Add as owner in the Fleet Commander operational layer
    await supabase.from('fleet_business_members').insert({
      business_id: biz.id,
      user_id:     user.id,
      role:        'owner',
      active:      true,
    })

    return biz as ThreeBBusiness
  } catch {
    return null
  }
}

/**
 * Updates bankability factors for a business.
 * Only the owner can call this.
 */
export async function updateBankabilityFactors(
  businessId: string,
  factors: Partial<Pick<ThreeBBusiness,
    | 'has_ein' | 'has_business_address' | 'has_business_phone'
    | 'has_website' | 'has_domain_email' | 'has_bank_account'
    | 'revenue_status' | 'credit_status' | 'formation_date'
    | 'entity_type' | 'ein' | 'website' | 'business_phone' | 'domain_email'
  >>
): Promise<boolean> {
  try {
    const supabase = createClient()
    const { error } = await supabase
      .from('businesses')
      .update(factors)
      .eq('id', businessId)

    return !error
  } catch {
    return false
  }
}
