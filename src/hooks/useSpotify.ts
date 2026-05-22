'use client'
/**
 * useSpotify — Spotify Web API hook with PKCE OAuth
 *
 * What it does:
 *   - PKCE OAuth flow (no client secret needed — public app)
 *   - Polls /v1/me/player for current track
 *   - Exposes play / pause / next / previous controls
 *   - Auto-refreshes access token before expiry
 *   - All tokens stored in localStorage
 *
 * Scopes required:
 *   user-read-playback-state
 *   user-modify-playback-state
 *   user-read-currently-playing
 *
 * NOTE: Playback control (play/pause/skip) requires Spotify Premium.
 * Reading current track works on free tier.
 */
import { useState, useEffect, useRef, useCallback } from 'react'

// ── Public types ──────────────────────────────────────────────────────────────
export interface SpotifyTrack {
  isPlaying:  boolean
  trackName:  string
  artistName: string
  albumName:  string
  albumArt:   string | null
  progressMs: number
  durationMs: number
  trackId:    string
  deviceName: string | null
}

export type SpotifyStatus =
  | 'disconnected'
  | 'connected'
  | 'no_device'     // authenticated but no active Spotify device
  | 'premium_only'  // tried to control but got 403
  | 'error'

// ── Storage keys ──────────────────────────────────────────────────────────────
const K = {
  clientId:     'spotify_client_id',
  accessToken:  'spotify_access_token',
  refreshToken: 'spotify_refresh_token',
  expiresAt:    'spotify_expires_at',
  codeVerifier: 'spotify_code_verifier',
} as const

const SCOPES =
  'user-read-playback-state user-modify-playback-state user-read-currently-playing'

// ── PKCE helpers ──────────────────────────────────────────────────────────────
function randomBase64url(byteLength: number): string {
  const arr = new Uint8Array(byteLength)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function sha256Base64url(plain: string): Promise<string> {
  const data   = new TextEncoder().encode(plain)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ── Spotify fetch wrapper ─────────────────────────────────────────────────────
async function spotifyFetch(
  path: string,
  token: string,
  opts: RequestInit = {}
): Promise<Response> {
  return fetch(`https://api.spotify.com/v1${path}`, {
    ...opts,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  })
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useSpotify(activePolling = false) {
  const [status,      setStatus]      = useState<SpotifyStatus>('disconnected')
  const [track,       setTrack]       = useState<SpotifyTrack | null>(null)
  const [clientId,    setClientIdState] = useState('')
  const [accessToken, setAccessToken] = useState('')

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Mount: restore persisted state ────────────────────────────────────────
  useEffect(() => {
    const id  = localStorage.getItem(K.clientId)    ?? ''
    const tok = localStorage.getItem(K.accessToken) ?? ''
    setClientIdState(id)
    if (tok) {
      setAccessToken(tok)
      setStatus('connected')
    }
  }, [])

  // ── Token refresh ─────────────────────────────────────────────────────────
  const refreshToken = useCallback(async (): Promise<string | null> => {
    const rt  = localStorage.getItem(K.refreshToken) ?? ''
    const cid = localStorage.getItem(K.clientId)     ?? ''
    if (!rt || !cid) return null
    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({
          grant_type:    'refresh_token',
          refresh_token: rt,
          client_id:     cid,
        }),
      })
      if (!res.ok) return null
      const data  = await res.json()
      const token = data.access_token as string
      localStorage.setItem(K.accessToken, token)
      localStorage.setItem(K.expiresAt,   String(Date.now() + data.expires_in * 1000))
      if (data.refresh_token) localStorage.setItem(K.refreshToken, data.refresh_token)
      setAccessToken(token)
      return token
    } catch { return null }
  }, [])

  // ── Get valid token (auto-refresh if near expiry) ────────────────────────
  const getToken = useCallback(async (): Promise<string | null> => {
    let tok     = localStorage.getItem(K.accessToken) ?? ''
    const expAt = parseInt(localStorage.getItem(K.expiresAt) ?? '0', 10)
    if (!tok) return null
    // Refresh 60s before expiry
    if (expAt && Date.now() > expAt - 60_000) {
      tok = (await refreshToken()) ?? ''
    }
    return tok || null
  }, [refreshToken])

  // ── Fetch current playback state ─────────────────────────────────────────
  const fetchPlayback = useCallback(async (token: string) => {
    try {
      const res = await spotifyFetch('/me/player', token)
      if (res.status === 204) { setTrack(null); setStatus('no_device'); return }
      if (res.status === 401) {
        // Token dead — try refresh once
        const fresh = await refreshToken()
        if (fresh) { await fetchPlayback(fresh); return }
        setAccessToken(''); setStatus('disconnected'); return
      }
      if (!res.ok) return
      const data = await res.json()
      if (!data?.item) { setTrack(null); return }
      setStatus('connected')
      setTrack({
        isPlaying:  !!data.is_playing,
        trackName:  data.item.name ?? 'Unknown',
        artistName: (data.item.artists as { name: string }[])
                      ?.map(a => a.name).join(', ') ?? '',
        albumName:  data.item.album?.name ?? '',
        albumArt:   data.item.album?.images?.[0]?.url ?? null,
        progressMs: data.progress_ms ?? 0,
        durationMs: data.item.duration_ms ?? 1,
        trackId:    data.item.id ?? '',
        deviceName: data.device?.name ?? null,
      })
    } catch { /* network blip — keep last track state */ }
  }, [refreshToken])

  // ── Polling ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!accessToken) {
      if (pollTimer.current) clearInterval(pollTimer.current)
      return
    }
    // Active polling when driving (5s); background (30s) otherwise
    const interval = activePolling ? 5_000 : 30_000

    const run = async () => {
      const tok = await getToken()
      if (tok) fetchPlayback(tok)
    }

    run()
    pollTimer.current = setInterval(run, interval)
    return () => { if (pollTimer.current) clearInterval(pollTimer.current) }
  }, [accessToken, activePolling, fetchPlayback, getToken])

  // ── PKCE OAuth — initiates redirect ──────────────────────────────────────
  const connect = useCallback(async (id: string) => {
    if (!id.trim()) return
    const trimmed = id.trim()
    localStorage.setItem(K.clientId, trimmed)
    setClientIdState(trimmed)

    const verifier  = randomBase64url(32)
    const challenge = await sha256Base64url(verifier)
    localStorage.setItem(K.codeVerifier, verifier)

    const redirectUri = `${window.location.origin}/spotify-callback`
    const params = new URLSearchParams({
      client_id:             trimmed,
      response_type:         'code',
      redirect_uri:          redirectUri,
      code_challenge_method: 'S256',
      code_challenge:        challenge,
      scope:                 SCOPES,
    })
    window.location.href = `https://accounts.spotify.com/authorize?${params}`
  }, [])

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    ;[K.accessToken, K.refreshToken, K.expiresAt].forEach(k => localStorage.removeItem(k))
    setAccessToken('')
    setTrack(null)
    setStatus('disconnected')
    if (pollTimer.current) clearInterval(pollTimer.current)
  }, [])

  // ── Playback control ──────────────────────────────────────────────────────
  type Action = 'play' | 'pause' | 'next' | 'previous'

  const control = useCallback(async (action: Action) => {
    const tok = await getToken()
    if (!tok) return

    const [method, path]: [string, string] =
      action === 'next'     ? ['POST', '/me/player/next']
      : action === 'previous' ? ['POST', '/me/player/previous']
      : action === 'play'     ? ['PUT',  '/me/player/play']
      :                         ['PUT',  '/me/player/pause']

    const res = await spotifyFetch(path, tok, { method })

    if (res.status === 403) { setStatus('premium_only'); return }

    if (res.ok || res.status === 204) {
      // Optimistic UI
      if (action === 'play')  setTrack(t => t ? { ...t, isPlaying: true  } : t)
      if (action === 'pause') setTrack(t => t ? { ...t, isPlaying: false } : t)
      // Refetch after skip so track name updates
      if (action === 'next' || action === 'previous') {
        setTimeout(async () => {
          const t2 = await getToken()
          if (t2) fetchPlayback(t2)
        }, 500)
      }
    }
  }, [getToken, fetchPlayback])

  return {
    // State
    status,
    track,
    clientId,
    isConnected: status === 'connected' || status === 'no_device',
    // Setter (for settings page input)
    setClientId: (id: string) => {
      setClientIdState(id)
      localStorage.setItem(K.clientId, id)
    },
    // Actions
    connect,
    disconnect,
    play:     () => control('play'),
    pause:    () => control('pause'),
    next:     () => control('next'),
    previous: () => control('previous'),
    toggle:   () => (track?.isPlaying ? control('pause') : control('play')),
    refresh:  async () => { const tok = await getToken(); if (tok) fetchPlayback(tok) },
  }
}
