'use client'
/**
 * useSpotify — Spotify Web API hook
 *
 * What it does:
 *   - Authorization Code flow — token exchange happens server-side
 *     via /api/spotify/callback (SPOTIFY_CLIENT_SECRET never reaches browser)
 *   - Client ID pre-populated from NEXT_PUBLIC_SPOTIFY_CLIENT_ID env var
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

// ── Client ID — from env var (baked at build time) ────────────────────────────
const ENV_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? ''

// ── Storage keys ──────────────────────────────────────────────────────────────
const K = {
  clientId:     'spotify_client_id',
  accessToken:  'spotify_access_token',
  refreshToken: 'spotify_refresh_token',
  expiresAt:    'spotify_expires_at',
} as const

const SCOPES =
  'user-read-playback-state user-modify-playback-state user-read-currently-playing user-library-read user-library-modify'

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
  const [trackSaved,  setTrackSaved]  = useState(false)
  const [clientId,    setClientIdState] = useState('')
  const [accessToken, setAccessToken] = useState('')

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Mount: restore persisted state ────────────────────────────────────────
  useEffect(() => {
    // Seed client ID from env var if not already stored
    const storedId = localStorage.getItem(K.clientId) ?? ''
    const id = storedId || ENV_CLIENT_ID
    if (id && !storedId) localStorage.setItem(K.clientId, id)
    setClientIdState(id)

    const tok = localStorage.getItem(K.accessToken) ?? ''
    if (tok) {
      setAccessToken(tok)
      setStatus('connected')
    }
  }, [])

  // ── Token refresh — hits our server route so secret stays server-side ──────
  const refreshToken = useCallback(async (): Promise<string | null> => {
    const rt = localStorage.getItem(K.refreshToken) ?? ''
    if (!rt) return null
    try {
      const res = await fetch('/api/spotify/refresh', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh_token: rt }),
      })
      if (!res.ok) return null
      const data  = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string }
      if (data.error || !data.access_token) return null
      localStorage.setItem(K.accessToken, data.access_token)
      localStorage.setItem(K.expiresAt,   String(Date.now() + (data.expires_in ?? 3600) * 1000))
      if (data.refresh_token) localStorage.setItem(K.refreshToken, data.refresh_token)
      setAccessToken(data.access_token)
      return data.access_token
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
      const newTrackId = data.item.id ?? ''
      setTrack(prev => {
        // Only update if something changed (avoids needless re-renders on same track)
        if (
          prev?.trackId    === newTrackId &&
          prev?.isPlaying  === !!data.is_playing &&
          prev?.progressMs === (data.progress_ms ?? 0)
        ) return prev
        return {
          isPlaying:  !!data.is_playing,
          trackName:  data.item.name ?? 'Unknown',
          artistName: (data.item.artists as { name: string }[])
                        ?.map(a => a.name).join(', ') ?? '',
          albumName:  data.item.album?.name ?? '',
          albumArt:   data.item.album?.images?.[0]?.url ?? null,
          progressMs: data.progress_ms ?? 0,
          durationMs: data.item.duration_ms ?? 1,
          trackId:    newTrackId,
          deviceName: data.device?.name ?? null,
        }
      })
      // Check saved state when track id changes (cheap — one call)
      if (newTrackId) checkSaved(token, newTrackId)
    } catch { /* network blip — keep last track state */ }
  }, [refreshToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Check if current track is saved to user's library ────────────────────
  const checkSaved = useCallback(async (token: string, id: string) => {
    try {
      const res = await spotifyFetch(`/me/tracks/contains?ids=${id}`, token)
      if (!res.ok) return
      const arr = await res.json() as boolean[]
      setTrackSaved(!!arr[0])
    } catch { /* ignore */ }
  }, [])

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

  // ── OAuth connect — Authorization Code flow, server handles token exchange ──
  const connect = useCallback((id?: string) => {
    // Use provided id, stored id, or env var (in that order)
    const cid = (id ?? localStorage.getItem(K.clientId) ?? ENV_CLIENT_ID).trim()
    if (!cid) return
    localStorage.setItem(K.clientId, cid)
    setClientIdState(cid)

    const redirectUri = `${window.location.origin}/api/spotify/callback`
    const params = new URLSearchParams({
      client_id:     cid,
      response_type: 'code',
      redirect_uri:  redirectUri,
      scope:         SCOPES,
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

  // ── Like / unlike current track ──────────────────────────────────────────
  const toggleLike = useCallback(async () => {
    const tok = await getToken()
    if (!tok || !track?.trackId) return
    const saving = !trackSaved
    // Optimistic UI
    setTrackSaved(saving)
    const res = await spotifyFetch(
      `/me/tracks?ids=${track.trackId}`,
      tok,
      { method: saving ? 'PUT' : 'DELETE' },
    )
    // Roll back if API rejected
    if (!res.ok && res.status !== 200 && res.status !== 201) {
      setTrackSaved(!saving)
    }
  }, [getToken, track?.trackId, trackSaved])

  return {
    // State
    status,
    track,
    trackSaved,
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
    play:       () => control('play'),
    pause:      () => control('pause'),
    next:       () => control('next'),
    previous:   () => control('previous'),
    toggle:     () => (track?.isPlaying ? control('pause') : control('play')),
    toggleLike,
    refresh:    async () => { const tok = await getToken(); if (tok) fetchPlayback(tok) },
  }
}
