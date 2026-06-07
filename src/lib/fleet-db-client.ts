/**
 * fleet-db-client.ts — Fleet product data client
 *
 * Points exclusively to Fleet Commander Supabase (goqzhdrmrdlkchmwfiur).
 * Handles: all fleet tables — loads, trips, fuel, maintenance, compliance, etc.
 *
 * NEVER use this client for auth or session checks.
 * For auth/identity → use core-auth-client.ts
 */

import { createBrowserClient } from '@supabase/ssr'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const FLEET_URL = process.env.NEXT_PUBLIC_FLEET_SUPABASE_URL!
const FLEET_KEY = process.env.NEXT_PUBLIC_FLEET_SUPABASE_ANON_KEY!

// ── Browser client (client components) ───────────────────────────────────────

export function createFleetBrowserClient() {
  return createBrowserClient(FLEET_URL, FLEET_KEY)
}

// ── Server client (server components, API routes) ────────────────────────────

export async function createFleetServerClient() {
  const cookieStore = await cookies()
  return createServerClient(FLEET_URL, FLEET_KEY, {
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
