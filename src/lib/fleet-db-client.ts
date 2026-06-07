/**
 * fleet-db-client.ts — Fleet Commander product data client (browser only)
 *
 * Connects to Fleet Commander Supabase (goqzhdrmrdlkchmwfiur) for fleet data only.
 *
 * Fleet owns:     loads, trips, fuel, maintenance, compliance, fleet_business_members, etc.
 * Core_Eco owns:  auth/session → use auth-client.ts instead.
 *
 * For server-side queries (Server Components, API routes):
 *   → import { createFleetServerClient } from '@/lib/fleet-db-server-client'
 *
 * NEVER use this client for auth.getUser() or session checks.
 */

import { createBrowserClient } from '@supabase/ssr'

const COOKIE_OPTS = {
  domain: '.bouncebackbrian.com',
  path: '/',
  sameSite: 'lax' as const,
  secure: true,
}

export function createFleetClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    '',
    { cookieOptions: COOKIE_OPTS },
  )
}
