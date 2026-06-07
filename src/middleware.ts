import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const COOKIE_OPTS = {
  domain: '.bouncebackbrian.com',
  path: '/',
  sameSite: 'lax' as const,
  secure: true,
}

const PROTECTED = [
  '/dashboard', '/dispatch', '/loads', '/trips', '/fuel',
  '/expenses', '/audit', '/delays', '/mis', '/settings', '/trip',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public paths — never block
  if (
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/')
  ) {
    return NextResponse.next()
  }

  // Auth session validated against Core_Eco (rkwdryneutgyqrnbuwaz).
  // Falls back to Fleet vars during env var rollout — remove fallback once
  // NEXT_PUBLIC_CORE_ECO_* are confirmed in all Vercel envs.
  const supabaseUrl =
    process.env.NEXT_PUBLIC_CORE_ECO_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey =
    process.env.NEXT_PUBLIC_CORE_ECO_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    ''

  if (!supabaseUrl || !supabaseKey) return NextResponse.next()

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(toSet) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        toSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(
            name,
            value,
            { ...COOKIE_OPTS, ...options } as Parameters<typeof supabaseResponse.cookies.set>[2],
          )
        )
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  const isProtected = PROTECTED.some(p => pathname.startsWith(p))

  if (isProtected && !user) {
    // NEXT_PUBLIC_LOGIN_URL → external IdP (e.g. 3Boost) when ecosystem mode active.
    // Default: Fleet's own /login so auth works standalone.
    const loginBase =
      process.env.NEXT_PUBLIC_LOGIN_URL ??
      `${request.nextUrl.origin}/login`
    const returnTo = encodeURIComponent(request.nextUrl.href)
    return NextResponse.redirect(`${loginBase}?returnTo=${returnTo}`)
  }

  // Already logged in trying to hit /login → redirect to dashboard
  if (user && pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.png$).*)'],
}
