/**
 * /api/spotify/callback
 *
 * Server-side OAuth token exchange for Spotify Authorization Code flow.
 * SPOTIFY_CLIENT_SECRET stays entirely server-side — never reaches the browser.
 *
 * Flow:
 *  1. Client redirects user to Spotify with redirect_uri = this route
 *  2. Spotify redirects here with ?code=... &state=...
 *  3. We POST to Spotify token endpoint with client_id + client_secret
 *  4. We redirect to /spotify-callback with tokens in query params
 *     (page stores them in localStorage and redirects to /settings)
 */
import { NextRequest, NextResponse } from 'next/server'

const CLIENT_ID     = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET ?? ''

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  const redirectBase = `${origin}/spotify-callback`

  if (error) {
    return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent(error)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${redirectBase}?error=missing_code`)
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.redirect(`${redirectBase}?error=server_not_configured`)
  }

  const redirectUri = `${origin}/api/spotify/callback`

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        // Basic auth: base64(client_id:client_secret)
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })

    const data = await res.json() as {
      access_token?:  string
      refresh_token?: string
      expires_in?:    number
      error?:         string
      error_description?: string
    }

    if (data.error || !data.access_token) {
      const msg = data.error_description ?? data.error ?? 'token_exchange_failed'
      return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent(msg)}`)
    }

    // Pass tokens to client page via query params — page stores in localStorage
    const params = new URLSearchParams({
      access_token:  data.access_token,
      refresh_token: data.refresh_token ?? '',
      expires_in:    String(data.expires_in ?? 3600),
    })
    return NextResponse.redirect(`${redirectBase}?${params}`)
  } catch {
    return NextResponse.redirect(`${redirectBase}?error=network_error`)
  }
}
