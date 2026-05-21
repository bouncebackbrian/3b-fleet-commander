'use client'
import { createClient } from '@/lib/supabase-browser'

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserProfile = {
  id:                  string
  created_at:          string | null
  updated_at:          string | null
  display_name:        string | null
  full_name:           string | null
  email:               string | null
  role:                string
  // 3B identity
  three_b_id:          string | null
  three_b_biz_id:      string | null
  three_b_linked:      boolean
  // Driver credentials
  cdl_number:          string | null
  cdl_state:           string | null
  phone:               string | null
  tractor_number:      string | null
  trailer_number:      string | null
  // Business link
  default_business_id: string | null
}

export type BusinessProfile = {
  id:                  string
  created_at:          string | null
  updated_at:          string | null
  owner_user_id:       string | null
  business_name:       string | null
  threeb_business_id:  string | null
  business_type:       string
  status:              string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the current user's profile row, or null if not signed in / no table.
 * Never throws — safe to call in unauthenticated alpha mode.
 */
export async function getCurrentProfile(): Promise<UserProfile | null> {
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
    return data ?? null
  } catch {
    return null
  }
}

// Backward-compat alias (settings page uses getProfile)
export const getProfile = getCurrentProfile

/**
 * Returns the user's business profile.
 * Pass a specific businessId, or omit to fetch their first owned business.
 * Returns null if not signed in, no business exists, or table is missing.
 */
export async function getCurrentBusiness(businessId?: string | null): Promise<BusinessProfile | null> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    if (businessId) {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('id', businessId)
        .single()
      if (error) return null
      return data ?? null
    }

    // Fetch owner's first business
    const { data, error } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('owner_user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (error) return null
    return data ?? null
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
    const { data: { user } } = await supabase.auth.getUser()
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
 * Cheap helper used by useMission to attach identity without a full profile fetch.
 */
export async function getAuthUserId(): Promise<string | null> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}
