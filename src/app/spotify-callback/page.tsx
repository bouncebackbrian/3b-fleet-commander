'use client'
/**
 * /spotify-callback
 *
 * Receives tokens from /api/spotify/callback (server-side exchange).
 * Stores them in localStorage and redirects to /settings.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const K = {
  accessToken:  'spotify_access_token',
  refreshToken: 'spotify_refresh_token',
  expiresAt:    'spotify_expires_at',
} as const

export default function SpotifyCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    const params       = new URLSearchParams(window.location.search)
    const accessToken  = params.get('access_token')
    const refreshToken = params.get('refresh_token') ?? ''
    const expiresIn    = parseInt(params.get('expires_in') ?? '3600', 10)
    const error        = params.get('error')

    if (error) {
      setErrMsg(decodeURIComponent(error))
      setStatus('error')
      return
    }
    if (!accessToken) {
      setErrMsg('No access token received. Try connecting again.')
      setStatus('error')
      return
    }

    // Store tokens in localStorage
    localStorage.setItem(K.accessToken,  accessToken)
    localStorage.setItem(K.refreshToken, refreshToken)
    localStorage.setItem(K.expiresAt,    String(Date.now() + expiresIn * 1000))

    setStatus('success')
    setTimeout(() => router.push('/settings'), 1500)
  }, [router])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh', gap: '1rem',
      padding: '2rem', background: 'var(--bg)',
    }}>
      {status === 'loading' && (
        <>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid #1ed760', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
          <div style={{ fontWeight: 700, color: 'var(--text)' }}>Connecting Spotify…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </>
      )}
      {status === 'success' && (
        <>
          <div style={{ fontSize: '3.5rem' }}>✅</div>
          <div style={{ fontWeight: 900, fontSize: '1.2rem', color: '#1ed760' }}>Spotify Connected!</div>
          <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Returning to settings…</div>
        </>
      )}
      {status === 'error' && (
        <>
          <div style={{ fontSize: '3rem' }}>❌</div>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--error)' }}>Connection Failed</div>
          <div style={{ fontSize: '.85rem', color: 'var(--muted)', maxWidth: 320, textAlign: 'center', lineHeight: 1.5 }}>{errMsg}</div>
          <a href="/settings" style={{ marginTop: '.5rem', padding: '.65rem 1.5rem', borderRadius: 12, background: '#1ed760', color: '#000', fontWeight: 800, fontSize: '.9rem', textDecoration: 'none' }}>
            ← Back to Settings
          </a>
        </>
      )}
    </div>
  )
}
