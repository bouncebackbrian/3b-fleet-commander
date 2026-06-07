import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public paths — never block these regardless of auth state
  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/')

  // Auth session → Core_Eco (rkwdryneutgyqrnbuwaz)
  const coreUrl = process.env.NEXT_PUBLIC_CORE_SUPABASE_URL
  const coreKey = process.env.NEXT_PUBLIC_CORE_SUPABASE_ANON_KEY

  // Fallback: support NEXT_PUBLIC_LOGIN_URL for cross-domain redirects
  const loginUrl = process.env.NEXT_PUBLIC_LOGIN_URL

  if (!coreUrl || !coreKey) {
    // Core auth not configured — pass through (dev safety net)
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabase = createServerClient(coreUrl, coreKey, {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    })

    const { data: { user } } = await supabase.auth.getUser()

    // Not logged in → redirect to login
    if (!user && !isPublic) {
      if (loginUrl) {
        // Cross-domain login (ecosystem mode)
        const redirect = new URL(loginUrl)
        redirect.searchParams.set('returnTo', request.url)
        return NextResponse.redirect(redirect)
      }
      // Local login (standalone mode)
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }

    // Already logged in → redirect away from login
    if (user && pathname.startsWith('/login')) {
      const next = request.nextUrl.searchParams.get('next') || '/dashboard'
      const url = request.nextUrl.clone()
      url.pathname = next
      url.search = ''
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  } catch {
    if (!isPublic) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.png$).*)'],
}
