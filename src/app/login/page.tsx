'use client'
import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

function LoginForm() {
  const router      = useRouter()
  const params      = useSearchParams()
  const next        = params.get('next') || '/dashboard'
  const supabase    = createClient()

  const [tab,       setTab]    = useState<'signin' | 'signup'>('signin')
  const [email,     setEmail]  = useState('')
  const [password,  setPass]   = useState('')
  const [loading,   setLoad]   = useState(false)
  const [error,     setError]  = useState('')
  const [success,   setSuccess]= useState('')

  // Redirect if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(next)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoad(true); setError(''); setSuccess('')
    try {
      if (tab === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.replace(next)
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setSuccess('Account created — check your email to confirm, then sign in.')
        setTab('signin')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoad(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '.75rem 1rem', borderRadius: 10,
    border: '1px solid rgba(0,232,176,.2)', background: 'rgba(0,232,176,.04)',
    color: '#cceee6', fontSize: '1rem', outline: 'none',
    boxSizing: 'border-box', transition: 'border-color .18s',
  }
  const btn: React.CSSProperties = {
    width: '100%', padding: '.85rem', borderRadius: 10, fontWeight: 800,
    fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? .65 : 1, transition: 'all .18s', border: 'none',
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 0%, #0f2a22 0%, #061210 55%, #030a08 100%)',
      padding: '1.5rem',
    }}>
      {/* Background grid */}
      <div style={{ position: 'fixed', inset: 0, opacity: .04, backgroundImage: 'linear-gradient(rgba(0,232,176,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(0,232,176,.6) 1px,transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 420, display: 'grid', gap: '1.75rem', position: 'relative' }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.75rem' }}>
          <img src="/logo.png" alt="3B Fleet Commander" style={{ width: 110, height: 110, borderRadius: 18, objectFit: 'cover', boxShadow: '0 0 40px rgba(0,232,176,.35), 0 0 80px rgba(0,232,176,.12)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 900, fontSize: '1.35rem', letterSpacing: '.04em', color: '#f5c200', textShadow: '0 0 20px rgba(245,194,0,.4)' }}>
              3B FLEET COMMANDER
            </div>
            <div style={{ fontSize: '.72rem', color: '#00e8b0', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 4, textShadow: '0 0 10px rgba(0,232,176,.5)' }}>
              Mileage Intelligence System
            </div>
          </div>
        </div>

        {/* Card */}
        <div style={{ background: 'rgba(11,27,24,.9)', border: '1px solid rgba(0,232,176,.15)', borderRadius: 20, padding: '2rem', backdropFilter: 'blur(20px)', boxShadow: '0 8px 40px rgba(0,0,0,.5)' }}>

          {/* Tab toggle */}
          <div style={{ display: 'flex', background: 'rgba(0,232,176,.05)', borderRadius: 10, padding: 3, gap: 2, marginBottom: '1.5rem' }}>
            {(['signin', 'signup'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setError(''); setSuccess('') }}
                style={{ flex: 1, padding: '.5rem', borderRadius: 8, fontSize: '.8rem', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all .18s', background: tab === t ? 'rgba(0,232,176,.15)' : 'transparent', color: tab === t ? '#00e8b0' : '#6aaa96', boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,.3)' : 'none' }}>
                {t === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#6aaa96', marginBottom: 7 }}>Email</label>
              <input style={inp} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="driver@3becosystem.com" onFocus={e => (e.target.style.borderColor = 'rgba(0,232,176,.5)')} onBlur={e => (e.target.style.borderColor = 'rgba(0,232,176,.2)')} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#6aaa96', marginBottom: 7 }}>Password</label>
              <input style={inp} type="password" required autoComplete={tab === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e => setPass(e.target.value)} placeholder="••••••••" onFocus={e => (e.target.style.borderColor = 'rgba(0,232,176,.5)')} onBlur={e => (e.target.style.borderColor = 'rgba(0,232,176,.2)')} />
            </div>

            {error   && <div style={{ padding: '.65rem .9rem', borderRadius: 8, background: 'rgba(232,64,0,.1)', border: '1px solid rgba(232,64,0,.25)', color: '#ff7a4a', fontSize: '.82rem' }}>{error}</div>}
            {success && <div style={{ padding: '.65rem .9rem', borderRadius: 8, background: 'rgba(0,232,176,.08)', border: '1px solid rgba(0,232,176,.25)', color: '#00e8b0', fontSize: '.82rem' }}>{success}</div>}

            <button type="submit" disabled={loading} style={{ ...btn, background: 'linear-gradient(135deg,#00e8b0,#00c090)', color: '#061210', marginTop: '.25rem', boxShadow: loading ? 'none' : '0 4px 20px rgba(0,232,176,.35)' }}>
              {loading ? (tab === 'signin' ? 'Signing in…' : 'Creating account…') : (tab === 'signin' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.5rem 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(0,232,176,.1)' }} />
            <span style={{ fontSize: '.72rem', color: '#2e5c50', fontWeight: 700, letterSpacing: '.06em' }}>OR</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(0,232,176,.1)' }} />
          </div>

          {/* 3B ID — placeholder for when schema is ready */}
          <button disabled title="3B ID integration coming soon" style={{ ...btn, background: 'rgba(245,194,0,.06)', border: '1px solid rgba(245,194,0,.2)', color: '#f5c200', opacity: .5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: '.88rem' }}>
            <img src="/logo.png" alt="" style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover' }} />
            Sign in with 3B ID
            <span style={{ fontSize: '.65rem', background: 'rgba(245,194,0,.15)', padding: '.15rem .45rem', borderRadius: 4, letterSpacing: '.06em' }}>COMING SOON</span>
          </button>

          <p style={{ textAlign: 'center', fontSize: '.7rem', color: '#2e5c50', marginTop: '1.25rem', lineHeight: 1.6 }}>
            3B Fleet Commander · Mileage Intelligence System<br />
            {tab === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => { setTab(tab === 'signin' ? 'signup' : 'signin'); setError(''); setSuccess('') }} style={{ color: '#00e8b0', fontWeight: 700, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit' }}>
              {tab === 'signin' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
