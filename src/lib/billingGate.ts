'use client'
/**
 * billingGate.ts — Subscription access gate
 *
 * Reads subscription state from Supabase (webhook-synced, authoritative).
 * Never gate off the Stripe success redirect — always use DB state.
 *
 * Active statuses: trialing, active
 * Grace period:    past_due (warn but keep access)
 * Blocked:         canceled, unpaid, incomplete_expired, none
 */

import { createClient } from '@/lib/supabase-browser'

export type AccessStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'cancelled'
  | 'none'
  | 'loading'

export interface AccessResult {
  hasAccess:  boolean
  status:     AccessStatus
  periodEnd:  string | null
  cancelAt:   boolean
  trialEnd:   string | null
}

const ACTIVE_STATUSES = ['trialing', 'active', 'past_due']

/**
 * checkAccess — read subscription state for the current user.
 * Call on page load for any gated feature.
 */
export async function checkAccess(): Promise<AccessResult> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { hasAccess: false, status: 'none', periodEnd: null, cancelAt: false, trialEnd: null }

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status, current_period_end, cancel_at_period_end, trial_end')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!sub) return { hasAccess: false, status: 'none', periodEnd: null, cancelAt: false, trialEnd: null }

    const status = sub.status as AccessStatus
    return {
      hasAccess: ACTIVE_STATUSES.includes(sub.status),
      status,
      periodEnd: sub.current_period_end ?? null,
      cancelAt:  sub.cancel_at_period_end ?? false,
      trialEnd:  sub.trial_end ?? null,
    }
  } catch {
    return { hasAccess: false, status: 'none', periodEnd: null, cancelAt: false, trialEnd: null }
  }
}

/**
 * requireAccess — server-side version using service role.
 * Use in API routes that need to verify subscription before executing.
 */
export async function requireAccess(userId: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return ACTIVE_STATUSES.includes(sub?.status ?? '')
  } catch { return false }
}
