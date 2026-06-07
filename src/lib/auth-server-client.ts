/**
 * auth-server-client.ts — Core_Eco Supabase auth client (server only)
 *
 * Use in: Server Components, API route handlers, Server Actions.
 * Do NOT import into 'use client' files — use auth-client.ts there instead.
 *
 * Core_Eco (rkwdryneutgyqrnbuwaz) owns auth/session.
 * Falls back to Fleet vars during env var rollout.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const COOKIE_OPTS = {
  domain: '.bouncebackbrian.com',
  path: '/',
  sameSite: 'lax' as const,
  secure: true,
}

export async function createAuthServerClient() {
  const cookieStore = await cookies()
  const url =
    process.env.NEXT_PUBLIC_CORE_ECO_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key =
    process.env.NEXT_PUBLIC_CORE_ECO_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    ''

  return createServerClient(url, key, {
    cookies: {
      getAll()    { return cookieStore.getAll() },
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...COOKIE_OPTS, ...options }))
        } catch {
          // Server component — middleware handles cookie writes
        }
      },
    },
  })
}
