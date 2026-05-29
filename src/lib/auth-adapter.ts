'use client'
/**
 * auth-adapter.ts — Auth Bridge Layer
 *
 * STANDALONE MODE (current): wraps Supabase auth.
 * ECOSYSTEM MODE (future):   wraps services/auth-3boost.
 *
 * All engines and API routes that need the current user should import
 * from here — NEVER from supabase-browser directly.
 *
 * Migration to auth-3boost = change this one file. No engine changes needed.
 *
 * Swap trigger: when NEXT_PUBLIC_AUTH_MODE=ecosystem, use auth-3boost calls.
 */

import { createClient } from '@/lib/supabase-browser'

export interface FleetUser {
  id:          string    // user UUID (Supabase UID today, 3B ID tomorrow)
  email?:      string | null
  businessId?: string | null   // from fleet_business_members once seeded
  role?:       string | null   // 'driver' | 'dispatcher' | 'admin' | 'owner_operator'
}

// ── Get current user ──────────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<FleetUser | null> {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'ecosystem') {
    // TODO: swap to auth-3boost token validation
    // const token = await getAuthBoostToken()
    // return resolveIdentitySOR(token)
    throw new Error('auth-3boost not yet wired — set NEXT_PUBLIC_AUTH_MODE=standalone')
  }

  // STANDALONE: Supabase auth
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // Try to resolve business membership from fleet_business_members
    const { data: membership } = await supabase
      .from('fleet_business_members')
      .select('business_id, role')
      .eq('user_id', user.id)
      .eq('active', true)
      .limit(1)
      .maybeSingle()

    return {
      id:         user.id,
      email:      user.email ?? null,
      businessId: membership?.business_id ?? null,
      role:       membership?.role ?? null,
    }
  } catch { return null }
}

// ── Get session (for server-side checks) ─────────────────────────────────────

export async function getSession() {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'ecosystem') {
    // TODO: validate auth-3boost JWT
    throw new Error('auth-3boost not yet wired')
  }
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session
  } catch { return null }
}

// ── Is authenticated ──────────────────────────────────────────────────────────

export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser()
  return user !== null
}

// ── Sign out ──────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'ecosystem') {
    // TODO: auth-3boost sign out
    return
  }
  try {
    const supabase = createClient()
    await supabase.auth.signOut()
  } catch { /* ignore */ }
}
