'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createAuthClient } from '@/lib/auth-client'

const ALLOWED_HOSTS = ['bouncebackbrian.com']

function sanitizeReturnTo(raw: string | null): string {
  // Fleet is the authenticated launcher. It resolves Founder access before
  // requiring a customer-business membership and routes normal users into
  // their granted Driver / Dispatch / Admin experience.
  const fallback = '/fleet'
  if (!raw) return fallback
  try {
    const url = new URL(decodeURIComponent(raw))
    if (ALLOWED_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
      return url.href
    }
  } catch {
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  }
  return fallback
}

function navigateAfterAuth(destination: string) {
  // Full navigation ensures server components see the newly-written auth
  // cookies on the first authenticated request.
  window.location.replace(destination)
}

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.8rem',
  borderRadius: 8,
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
  const [loading, setLoading] = useState(false)
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
    setLoading(true)
    const supabase = createAuthClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      navigateAfterAuth(returnTo)
    }
  }

  if (checking) return null

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error && <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, color: '#f87171', fontSize: '0.8rem' }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" style={inputStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" placeholder="••••••••" style={inputStyle} />
      </div>
      <button type="submit" disabled={loading} style={{ marginTop: '0.5rem', padding: '0.7rem', borderRadius: 8, background: loading ? '#374151' : '#3b82f6', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: loading ? 'not-allowed' : 'pointer' }}>
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1117', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#111827', borderRadius: 16, border: '1px solid #1f2937', padding: '2rem', boxShadow: '0 25px 50px rgba(0,0,0,.5)' }}>
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f9fafb', marginBottom: '0.4rem' }}>Fleet Commander</div>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Sign in to continue</div>
        </div>
        <Suspense><LoginForm /></Suspense>
      </div>
    </div>
  )
}
