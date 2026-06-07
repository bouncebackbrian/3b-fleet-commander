'use client'
import { createClient } from '@/lib/supabase-browser'
import { createAuthClient } from '@/lib/auth-client'

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserProfile = {
  id:                  string
  created_at:          string | null
  updated_at:          string | null

  // 3B Identity
  three_b_id:          string | null   // 3B-U-00000001
  first_name:          string | null
  last_name:           string | null
  email:               string | null
  phone:               string | null

  // Address
  address_line1:       string | null
  address_line2:       string | null
  city:                string | null
  state:               string | null
  zip:                 string | null

  // Verification
  verification_status: 'unverified' | 'pending' | 'verified'
  verified_at:         string | null

  // Display
  avatar_url:          string | null

  // Product entitlements
  has_fleet:           boolean
  has_credit:          boolean
  has_funding:         boolean
  has_payments:        boolean
  has_media:           boolean
  has_content:         boolean

  // Driver credentials (Fleet Commander)
  cdl_number:          string | null
  cdl_state:           string | null
  cdl_class:           string | null
  cdl_expires:         string | null
  endorsements:        string | null
  tractor_number:      string | null
  trailer_number:      string | null

  // Billing
  stripe_customer_id:  string | null

  // Active business context
  default_business_id: string | null
}

export type BusinessProfile = {
  id:                   string
  created_at:           string | null
  updated_at:           string | null
  three_b_biz_id:       string | null   // 3B-B-00000001
  company_name:         string
  slug:                 string | null
  entity_type:          string | null
  formation_date:       string | null
  ein:                  string | null
  mc_number:            string | null
  dot_number:           string | null
  address:              string | null
  city:                 string | null
  state:                string | null
  zip:                  string | null
  business_phone:       string | null
  website:              string | null
  domain_email:         string | null
  owner_id:             string | null
  business_type:        string
  has_fleet:            boolean
  has_funding:          boolean
  has_credit:           boolean
  has_payments:         boolean
  has_media:            boolean
  has_content:          boolean
  stripe_account_id:    string | null
  has_ein:              boolean
  has_business_address: boolean
  has_business_phone:   boolean
  has_website:          boolean
  has_domain_email:     boolean
  has_bank_account:     boolean
  revenue_status:       'none' | 'generating' | 'documented'
  credit_status:        'none' | 'building' | 'established'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the current user's profile row, or null if not signed in.
 * Never throws — safe to call in unauthenticated / offline mode.
 */
export async function getCurrentProfile(): Promise<UserProfile | null> {
  try {
    const supabase = createClient()
    const { data: { user } } = await createAuthClient().auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) return null
    return data as UserProfile ?? null
  } catch {
    return null
  }
}

// Backward-compat alias
export const getProfile = getCurrentProfile

/**
 * Returns the user's business by ID.
 * Falls back to their first owned business when no ID provided.
 */
export async function getCurrentBusiness(businessId?: string | null): Promise<BusinessProfile | null> {
  try {
    const supabase = createClient()
    const { data: { user } } = await createAuthClient().auth.getUser()
    if (!user) return null

    if (businessId) {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', businessId)
        .single()
      if (error) return null
      return data as BusinessProfile ?? null
    }

    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (error) return null
    return data as BusinessProfile ?? null
  } catch {
    return null
  }
}

/**
 * Upsert profile fields. No-op when not signed in.
 */
export async function updateProfile(patch: Partial<UserProfile>): Promise<void> {
  try {
    const supabase = createClient()
    const { data: { user } } = await createAuthClient().auth.getUser()
    if (!user) return

    await supabase.from('profiles').upsert({
      id: user.id,
      ...patch,
      updated_at: new Date().toISOString(),
    })
  } catch {
    // silent — offline mode
  }
}

/**
 * Returns the auth user id, or null if not signed in.
 */
export async function getAuthUserId(): Promise<string | null> {
  try {
    const supabase = createClient()
    const { data: { user } } = await createAuthClient().auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}
