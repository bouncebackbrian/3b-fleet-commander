'use client'
/**
 * /spotify-callback
 *
 * OAuth redirect target for Spotify PKCE flow.
 * Exchanges the auth code for access + refresh tokens,
 * stores them in localStorage, then redirects to /settings.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const K = {
  clientId:     'spotify_client_id',
  accessToken:  'spotify_access_token',
  refreshToken: 'spotify_refresh_token',
  expiresAt:    'spotify_expires_at',
  codeVerifier: 'spotify_code_verifier',
} as const

export default function SpotifyCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    const params      = new URLSearchParams(window.location.search)
    const code        = params.get('code')
    const oauthError  = params.get('error')
    const clientId    = localStorage.getItem(K.clientId)     ?? ''
    const verifier    = localStorage.getItem(K.codeVerifier) ?? ''

    if (oauthError) {
      setErrMsg(`Spotify denied access: ${oauthError}`)
      setStatus('error')
      return
    }
    if (!code || !clientId || !verifier) {
      setErrMsg('Missing required parameters. Try connecting again.')
      setStatus('error')
      return
    }

    const redirectUri = `${window.location.origin}/spotify-callback`

    fetch('https://accounts.spotify.com/api/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri,
        client_id:     clientId,
        code_verifier: verifier,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setErrMsg(data.error_description ?? data.error)
          setStatus('error')
          return
        }
        localStorage.setItem(K.accessToken,  data.access_token)
        localStorage.setItem(K.refreshToken, data.refresh_token ?? '')
        localStorage.setItem(K.expiresAt,    String(Date.now() + data.expires_in * 1000))
        localStorage.removeItem(K.codeVerifier)
        setStatus('success')
        setTimeout(() => router.push('/settings'), 1500)
      })
      .catch(e => {
        setErrMsg(e instanceof Error ? e.message : 'Token exchange failed')
        setStatus('error')
      })
  }, [router])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh', gap: '1rem',
      padding: '2rem', background: 'var(--background)',
      fontFamily: 'system-ui, sans-serif',
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
