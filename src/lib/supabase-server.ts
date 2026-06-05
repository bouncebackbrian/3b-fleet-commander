import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const COOKIE_OPTS = { domain: '.bouncebackbrian.com', path: '/', sameSite: 'lax' as const, secure: true }

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, { ...COOKIE_OPTS, ...options })) }
          catch { /* server component — cookies set in middleware */ }
        },
      },
    }
  )
}
