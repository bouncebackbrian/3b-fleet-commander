'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createAuthClient } from '@/lib/auth-client'

const ALLOWED_HOSTS = ['bouncebackbrian.com']

function sanitizeReturnTo(raw: string | null): string {
  const fallback = '/fleet'
  if (!raw) return fallback
  try {
    const url = new URL(decodeURIComponent(raw))
    if (ALLOWED_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) return url.href
  } catch {
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  }
  return fallback
}

function navigateAfterAuth(destination: string) {
  window.location.replace(destination)
}

const inputStyle: React.CSSProperties = {
  padding: '0.7rem 0.8rem',
  borderRadius: 10,
  background: '#1f2937',
  border: '1px solid #374151',
  color: '#f9fafb',
  fontSize: '0.9rem',
  width: '100%',
  boxSizing: 'border-box',
}

function LoginForm() {
  const params = useSearchParams()
  const returnTo = sanitizeReturnTo(params.get('returnTo'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const supabase = createAuthClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) navigateAfterAuth(returnTo)
      else setChecking(false)
    })
  }, [returnTo])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)
    const { error: authError } = await createAuthClient().auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }
    navigateAfterAuth(returnTo)
  }

  async function handlePasswordReset() {
    setError(null)
    setMessage(null)
    const normalized = email.trim()
    if (!normalized) {
      setError('Enter your email address first, then choose Forgot password.')
      return
    }

    setResetting(true)
    const redirectTo = `${window.location.origin}/reset-password`
    const { error: resetError } = await createAuthClient().auth.resetPasswordForEmail(normalized, { redirectTo })
    setResetting(false)

    if (resetError) {
      setError(resetError.message)
      return
    }

    setMessage('Password reset email sent. Check your inbox and follow the secure link to choose a new password.')
  }

  if (checking) return null

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error && <div style={{ padding: '0.7rem .85rem', background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, color: '#f87171', fontSize: '0.8rem', lineHeight: 1.5 }}>{error}</div>}
      {message && <div style={{ padding: '0.7rem .85rem', background: 'rgba(16,185,129,.10)', border: '1px solid rgba(16,185,129,.28)', borderRadius: 10, color: '#6ee7b7', fontSize: '0.8rem', lineHeight: 1.5 }}>{message}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" style={inputStyle} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Password</label>
          <button type="button" onClick={handlePasswordReset} disabled={resetting} style={{ border: 0, padding: 0, background: 'transparent', color: '#34d399', fontSize: '0.76rem', fontWeight: 700, cursor: resetting ? 'wait' : 'pointer' }}>
            {resetting ? 'Sending…' : 'Forgot password?'}
          </button>
        </div>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" placeholder="••••••••" style={inputStyle} />
      </div>

      <button type="submit" disabled={loading || resetting} style={{ marginTop: '0.35rem', padding: '0.78rem', borderRadius: 10, background: loading ? '#374151' : '#34d399', border: 'none', color: '#06110d', fontWeight: 900, fontSize: '0.9rem', cursor: loading ? 'not-allowed' : 'pointer' }}>
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080f0d', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#101816', borderRadius: 18, border: '1px solid rgba(255,255,255,.08)', padding: '2rem', boxShadow: '0 25px 50px rgba(0,0,0,.45)' }}>
        <div style={{ marginBottom: '1.8rem', textAlign: 'center' }}>
          <div style={{ color: '#34d399', fontSize: '.68rem', fontWeight: 900, letterSpacing: '.14em', textTransform: 'uppercase' }}>3B EcoSystem</div>
          <div style={{ marginTop: 7, fontSize: '1.55rem', fontWeight: 900, color: '#f9fafb' }}>Fleet Commander</div>
          <div style={{ marginTop: 5, fontSize: '0.85rem', color: '#6b7280' }}>Sign in to continue</div>
        </div>
        <Suspense><LoginForm /></Suspense>
      </div>
    </div>
  )
}
