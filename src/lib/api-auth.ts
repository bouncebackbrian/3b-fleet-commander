/**
 * api-auth.ts — Server-side auth helpers for API routes
 *
 * All API routes that need the current user import from here.
 * Validates against Core_Eco (rkwdryneutgyqrnbuwaz) — the auth SOR.
 *
 * Falls back to Fleet DB credentials during env var rollout.
 *
 * TODO: Remove Fleet DB auth fallback once Core_Eco auth is verified stable in
 * production (confirm login, checkout, team routes all green across all envs).
 * Fallback lines: coreEcoCreds() ?? chains on url and key.
 */

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'

function coreEcoCreds() {
  return {
    url: process.env.NEXT_PUBLIC_CORE_ECO_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key: process.env.NEXT_PUBLIC_CORE_ECO_ANON_KEY ??
         process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
         process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  }
}

/**
 * Cookie-based auth — use in API routes that receive browser cookie sessions.
 * (team/*, load-boards/*, and similar cookie-authenticated endpoints)
 */
export async function getApiUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const { url, key } = coreEcoCreds()
  const supabase = createServerClient(url, key, {
    cookies: { getAll: () => cookieStore.getAll() },
  })
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
}

/**
 * Bearer token auth — use in routes that receive Authorization: Bearer <token>.
 * (billing/checkout, billing/portal — client sends the access_token explicitly)
 */
export async function getApiBearerUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const { url, key } = coreEcoCreds()
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
}
