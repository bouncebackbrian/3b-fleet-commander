'use server'
/**
 * Fleet Commander — 3Boost Session Adapter
 *
 * Resolves the canonical 3Boost billing session for Fleet Commander
 * server components and API routes. Calls auth-3boost /session/current
 * using the user's Supabase JWT so billing state, plan tier, and
 * entitlements are authoritative and consistent with the rest of the
 * 3B Ecosystem.
 *
 * Usage (server component or route handler):
 *   const session = await getThreeBSession(request)
 *   if (session?.accessLevel === 'locked') redirect('/billing')
 *
 * Fleet Commander is gated on any active 3Boost membership (trialing or active).
 * Users on past_due get a limited shell; inactive/refunded/chargeback are
 * redirected to the upgrade/billing page.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ---------------------------------------------------------------------------
// Types (mirrors auth-3boost SessionPayload)
// ---------------------------------------------------------------------------

export type BillingState =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'inactive'
  | 'refunded'
  | 'chargeback_hold'

export type AccessLevel = 'full' | 'limited' | 'public' | 'locked'

export type ThreeBSession = {
  userId: string
  email: string | null
  role: string
  billingState: BillingState
  planTier: string | null
  accessLevel: AccessLevel
  entitlements: string[]
  trialEndsAt: string | null
  accessExpiresAt: string | null
  lastBillingEventId: string | null
  lastBillingEventAt: string | null
  source: 'auth-3boost'
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getAuthServiceUrl(): string {
  return process.env.AUTH_3BOOST_URL ?? 'http://localhost:3100'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the raw Supabase access token from the current request cookies.
 * Returns null if the user is not authenticated.
 */
async function getSupabaseAccessToken(): Promise<string | null> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_CORE_ECO_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey =
    process.env.NEXT_PUBLIC_CORE_ECO_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabaseKey) return null

  try {
    const cookieStore = await cookies()

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // no-op — read-only in this context
        },
      },
    })

    const {
      data: { session },
    } = await supabase.auth.getSession()

    return session?.access_token ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Resolve the full 3Boost session for the currently authenticated user.
 *
 * Returns null if:
 * - User is not authenticated
 * - auth-3boost is unreachable
 * - Token is invalid
 *
 * Never throws — safe to call in any server context.
 */
export async function getThreeBSession(): Promise<ThreeBSession | null> {
  const token = await getSupabaseAccessToken()
  if (!token) return null

  try {
    const res = await fetch(`${getAuthServiceUrl()}/session/current`, {
      headers: { Authorization: `Bearer ${token}` },
      // Don't cache — billing state must always be fresh
      cache: 'no-store',
    })

    if (!res.ok) return null

    const body = (await res.json()) as { ok: boolean; session?: ThreeBSession }
    return body.ok && body.session ? body.session : null
  } catch {
    // auth-3boost unreachable — degrade gracefully, don't block the app
    return null
  }
}

/**
 * Convenience: returns true if the current user has an active Fleet Commander
 * subscription (trialing or active billing state).
 */
export async function hasActiveFleetAccess(): Promise<boolean> {
  const session = await getThreeBSession()
  if (!session) return false
  return session.billingState === 'active' || session.billingState === 'trialing'
}

/**
 * Convenience: returns a billing state summary safe to pass as a prop
 * to client components (no sensitive auth data exposed).
 */
export async function getFleetBillingStatus(): Promise<{
  billingState: BillingState
  accessLevel: AccessLevel
  planTier: string | null
  trialEndsAt: string | null
} | null> {
  const session = await getThreeBSession()
  if (!session) return null

  return {
    billingState: session.billingState,
    accessLevel: session.accessLevel,
    planTier: session.planTier,
    trialEndsAt: session.trialEndsAt,
  }
}
