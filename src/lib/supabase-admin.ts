/**
 * supabase-admin.ts — Supabase service-role client (lazy-initialized)
 *
 * SERVER-SIDE ONLY. Bypasses RLS for webhook sync and admin operations.
 * Never import in client components or expose to the browser.
 *
 * Lazy initialization prevents build-time failures when env vars are not
 * present in preview/branch deployments (mirrors the stripe.ts pattern).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
    _supabaseAdmin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _supabaseAdmin
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabaseAdmin()[prop as keyof SupabaseClient]
  },
})
