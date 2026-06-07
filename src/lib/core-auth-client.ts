/**
 * core-auth-client.ts — Auth identity client
 *
 * Points exclusively to Core_Eco Supabase (rkwdryneutgyqrnbuwaz).
 * Handles: session, auth.getUser(), 3B Account ID, profile.
 *
 * NEVER use this client for fleet data queries.
 * For fleet data → use fleet-db-client.ts
 */

import { createBrowserClient } from '@supabase/ssr'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const CORE_URL  = process.env.NEXT_PUBLIC_CORE_SUPABASE_URL!
const CORE_KEY  = process.env.NEXT_PUBLIC_CORE_SUPABASE_ANON_KEY!

// ── Browser client (client components) ───────────────────────────────────────

export function createCoreAuthBrowserClient() {
  return createBrowserClient(CORE_URL, CORE_KEY)
}

// ── Server client (server components, API routes) ────────────────────────────

export async function createCoreAuthServerClient() {
  const cookieStore = await cookies()
  return createServerClient(CORE_URL, CORE_KEY, {
    cookies: {
      getAll()    { return cookieStore.getAll() },
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options))
        } catch {
          // Server component — middleware handles cookie writes
        }
      },
    },
  })
}
