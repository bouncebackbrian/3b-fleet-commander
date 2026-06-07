'use client'
// ── Fleet Commander Identity Adapter ─────────────────────────────────────────
//
// Fleet Commander consumes identity — it does NOT own it.
// Source of truth: @3b/identity-sor (identity-sor service).
//
// Resolution order:
//   1. JWT user_metadata claims (set by identity-sor after first link — fast, no round trip)
//   2. Direct identity-sor API call (first-time users or stale tokens)
//   3. NULL_IDENTITY (identity-sor unreachable or user not signed in)
//
// This means once a user is linked, every subsequent call is a single JWT read.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase-browser'
import { createAuthClient } from '@/lib/auth-client'

export type FleetIdentity = {
  userId:     string | null  // auth.users UUID (JWT sub)
  email:      string | null
  threebId:   string | null  // 3B-DRV-XXXXXXXX — from identity-sor
  businessId: string | null  // business_profiles UUID — from identity-sor
}

const NULL_IDENTITY: FleetIdentity = {
  userId: null, email: null, threebId: null, businessId: null,
}

const IDENTITY_SOR_URL =
  typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_IDENTITY_SOR_URL ?? 'http://localhost:3103')
    : 'http://localhost:3103'

const IDENTITY_INTERNAL_KEY =
  typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_IDENTITY_INTERNAL_KEY ?? '')
    : ''

/**
 * Fetch the full identity from identity-sor.
 * Called only when JWT claims are missing (first visit or stale token).
 */
async function fetchFromIdentitySor(userId: string): Promise<{
  threebId: string | null
  businessId: string | null
} | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (IDENTITY_INTERNAL_KEY) {
      headers['Authorization'] = `Bearer ${IDENTITY_INTERNAL_KEY}`
    }

    const res = await fetch(`${IDENTITY_SOR_URL}/identity/${userId}`, { headers })
    if (!res.ok) return null

    const body = (await res.json()) as {
      ok: boolean
      identity?: { threebId?: string | null; defaultBusinessId?: string | null }
    }
    if (!body.ok || !body.identity) return null

    return {
      threebId:   body.identity.threebId   ?? null,
      businessId: body.identity.defaultBusinessId ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Resolves the current user's operational identity.
 *
 * Fast path: reads JWT user_metadata claims written by identity-sor.
 * Slow path: calls identity-sor directly if claims are missing.
 *
 * Returns NULL_IDENTITY (all nulls) when:
 *   - Not signed in
 *   - identity-sor is unreachable and JWT claims are absent
 *   - Any error occurs
 *
 * Never throws — safe to call anywhere in the app.
 */
export async function getFleetIdentity(): Promise<FleetIdentity> {
  try {
    const supabase = createClient()
    const { data: { user }, error } = await createAuthClient().auth.getUser()
    if (error || !user) return NULL_IDENTITY

    // Fast path — JWT claims already written by identity-sor
    const jwtThreebId   = (user.user_metadata?.three_b_id   as string | undefined) ?? null
    const jwtBusinessId = (user.user_metadata?.business_id  as string | undefined) ?? null

    if (jwtThreebId) {
      return {
        userId:     user.id,
        email:      user.email ?? null,
        threebId:   jwtThreebId,
        businessId: jwtBusinessId,
      }
    }

    // Slow path — first visit or token predates identity-sor claim writes
    const sorIdentity = await fetchFromIdentitySor(user.id)

    return {
      userId:     user.id,
      email:      user.email ?? null,
      threebId:   sorIdentity?.threebId   ?? null,
      businessId: sorIdentity?.businessId ?? null,
    }
  } catch {
    return NULL_IDENTITY
  }
}
