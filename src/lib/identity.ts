'use client'
// ── Fleet Commander Identity Adapter ─────────────────────────────────────────
//
// Fleet Commander consumes identity — it does NOT own it.
// Source of truth: 3B ID project (separate Supabase instance, TBD).
//
// This adapter reads identity from the current auth session JWT.
// Works whether auth is:
//   A. Local (this Supabase project owns auth)
//   B. External (3B ID project issues the token, Fleet Commander validates it)
//
// When 3B ID finalizes JWT custom claims, extend the mapping below —
// no other files need to change.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase-browser'

export type FleetIdentity = {
  userId:     string | null  // auth.users UUID (JWT sub) — safe foreign key for fleet_missions
  email:      string | null
  threebId:   string | null  // 3B Driver ID — from JWT claim user_metadata.three_b_id
  businessId: string | null  // 3B Business ID — from JWT claim user_metadata.business_id
}

const NULL_IDENTITY: FleetIdentity = {
  userId: null, email: null, threebId: null, businessId: null,
}

/**
 * Resolves the current user's operational identity from the active auth session.
 *
 * Returns NULL_IDENTITY (all nulls) when:
 *   - Not signed in (alpha / offline mode)
 *   - Supabase is unavailable
 *   - Any error occurs
 *
 * Never throws — safe to call anywhere in the app.
 */
export async function getFleetIdentity(): Promise<FleetIdentity> {
  try {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NULL_IDENTITY

    return {
      userId:     user.id,
      email:      user.email   ?? null,
      // Custom JWT claims set by 3B ID project via auth hook — null until wired
      threebId:   (user.user_metadata?.three_b_id   as string | undefined) ?? null,
      businessId: (user.user_metadata?.business_id  as string | undefined) ?? null,
    }
  } catch {
    return NULL_IDENTITY
  }
}
