/**
 * /api/spotify/refresh
 *
 * Server-side token refresh. Client sends refresh_token, we exchange it
 * using SPOTIFY_CLIENT_SECRET (server-only) and return the new access_token.
 */
import { NextRequest, NextResponse } from 'next/server'

const CLIENT_ID     = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET ?? ''

export async function POST(req: NextRequest) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 })
  }

  let refreshToken: string
  try {
    const body = await req.json() as { refresh_token?: string }
    refreshToken = body.refresh_token ?? ''
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  if (!refreshToken) {
    return NextResponse.json({ error: 'missing_refresh_token' }, { status: 400 })
  }

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:  `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    const data = await res.json() as {
      access_token?:  string
      refresh_token?: string
      expires_in?:    number
      error?:         string
    }

    if (data.error || !data.access_token) {
      return NextResponse.json({ error: data.error ?? 'refresh_failed' }, { status: 401 })
    }

    return NextResponse.json({
      access_token:  data.access_token,
      refresh_token: data.refresh_token ?? refreshToken,
      expires_in:    data.expires_in ?? 3600,
    })
  } catch {
    return NextResponse.json({ error: 'network_error' }, { status: 502 })
  }
}
