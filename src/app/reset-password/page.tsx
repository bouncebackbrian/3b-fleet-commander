'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createAuthClient } from '@/lib/auth-client'

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '.75rem .85rem',
  borderRadius: 10,
  border: '1px solid #374151',
  background: '#1f2937',
  color: '#f9fafb',
  fontSize: '.9rem',
}

function ResetPasswordContent() {
  const params = useSearchParams()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    async function prepare() {
      const supabase = createAuthClient()
      const code = params.get('code')

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          if (active) setError(exchangeError.message)
          return
        }
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (active) setError('This reset link is invalid or has expired. Request a new password reset email.')
        return
      }

      if (active) setReady(true)
    }

    void prepare()
    return () => { active = false }
  }, [params])

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }

    setSaving(true)
    const supabase = createAuthClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setMessage('Password updated. Redirecting you back to Fleet Commander…')
    window.setTimeout(() => window.location.replace('/fleet'), 900)
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#080f0d', color: '#f9fafb', padding: '1rem' }}>
      <section style={{ width: '100%', maxWidth: 420, borderRadius: 18, border: '1px solid rgba(255,255,255,.08)', background: '#101816', padding: '2rem', boxShadow: '0 25px 50px rgba(0,0,0,.45)' }}>
        <div style={{ color: '#34d399', fontSize: '.68rem', fontWeight: 900, letterSpacing: '.14em', textTransform: 'uppercase' }}>3B EcoSystem</div>
        <h1 style={{ margin: '.45rem 0 .4rem', fontSize: '1.6rem' }}>Set a new password</h1>
        <p style={{ margin: 0, color: '#8b949e', lineHeight: 1.55, fontSize: '.85rem' }}>Choose a new password for your Core 3Boost identity. The same account is used to authorize your 3B products.</p>

        {error && <div style={{ marginTop: '1rem', padding: '.75rem .85rem', borderRadius: 10, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.1)', color: '#f87171', fontSize: '.8rem', lineHeight: 1.5 }}>{error}</div>}
        {message && <div style={{ marginTop: '1rem', padding: '.75rem .85rem', borderRadius: 10, border: '1px solid rgba(16,185,129,.3)', background: 'rgba(16,185,129,.08)', color: '#6ee7b7', fontSize: '.8rem' }}>{message}</div>}

        {ready ? (
          <form onSubmit={savePassword} style={{ display: 'grid', gap: '1rem', marginTop: '1.25rem' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#9ca3af', fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>New password</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" style={inputStyle} required />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#9ca3af', fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>Confirm password</span>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" style={inputStyle} required />
            </label>
            <button type="submit" disabled={saving} style={{ padding: '.8rem', borderRadius: 10, border: 0, background: '#34d399', color: '#06110d', fontWeight: 900, cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Updating…' : 'Update Password'}</button>
          </form>
        ) : !error ? (
          <div style={{ marginTop: '1.25rem', color: '#8b949e', fontSize: '.84rem' }}>Verifying reset link…</div>
        ) : (
          <Link href="/login" style={{ display: 'inline-block', marginTop: '1rem', color: '#34d399', fontWeight: 800, textDecoration: 'none' }}>Back to login →</Link>
        )}
      </section>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#080f0d', color: '#8b949e' }}>Loading…</main>}>
      <ResetPasswordContent />
    </Suspense>
  )
}
