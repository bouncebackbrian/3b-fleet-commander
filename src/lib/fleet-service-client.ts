/**
 * fleet-service-client.ts — Fleet DB service-role client
 *
 * SERVER-SIDE ONLY. Bypasses RLS. Use only inside API routes and service functions.
 * Never import in 'use client' components. Never expose SUPABASE_SERVICE_ROLE_KEY to browser.
 *
 * Points to Fleet Commander Supabase (goqzhdrmrdlkchmwfiur).
 * Lazy-initialized to prevent build-time failures when env vars are absent.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url) throw new Error('[fleet-service-client] NEXT_PUBLIC_SUPABASE_URL not configured')
    if (!key) throw new Error('[fleet-service-client] SUPABASE_SERVICE_ROLE_KEY not configured')
    _client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _client
}

// Proxy pattern — same as supabase-admin.ts so call sites look identical
export const fleetServiceClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getClient()[prop as keyof SupabaseClient]
  },
})
