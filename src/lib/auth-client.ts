/**
 * auth-client.ts — Core_Eco Supabase auth client (browser only)
 *
 * Connects to Core_Eco (rkwdryneutgyqrnbuwaz) for identity/session.
 *
 * Core_Eco owns:  auth, sessions, profiles, 3B Account ID, entitlements.
 * Fleet owns:     fleet data only → fleet-db-client.ts / supabase-browser.ts
 *
 * Falls back to NEXT_PUBLIC_SUPABASE_URL / ANON_KEY if Core_Eco vars are not
 * yet set — ensures existing deployments keep working during env var rollout.
 * Remove the fallback once NEXT_PUBLIC_CORE_ECO_* are confirmed in all Vercel envs.
 *
 * For server-side auth (Server Components, API routes, middleware):
 *   → import { createAuthServerClient } from '@/lib/auth-server-client'
 *
 * Requires in Vercel (all envs):
 *   NEXT_PUBLIC_CORE_ECO_SUPABASE_URL = https://rkwdryneutgyqrnbuwaz.supabase.co
 *   NEXT_PUBLIC_CORE_ECO_ANON_KEY     = <core-eco-anon-key>
 */

import { createBrowserClient } from '@supabase/ssr'

const COOKIE_OPTS = {
  domain: '.bouncebackbrian.com',
  path: '/',
  sameSite: 'lax' as const,
  secure: true,
}

export function createAuthClient() {
  const url =
    process.env.NEXT_PUBLIC_CORE_ECO_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL!

  const key =
    process.env.NEXT_PUBLIC_CORE_ECO_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    ''

  return createBrowserClient(url, key, { cookieOptions: COOKIE_OPTS })
}
