'use client'
import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

function LoginForm() {
  const router   = useRouter()
  const params   = useSearchParams()
  const next     = params.get('next') || '/dashboard'
  const supabase = createClient()

  const [tab,      setTab]    = useState<'signin' | 'signup'>('signin')
  const [email,    setEmail]  = useState('')
  const [password, setPass]   = useState('')
  const [showPw,   setShowPw] = useState(false)
  const [loading,  setLoad]   = useState(false)
  const [error,    setError]  = useState('')
  const [success,  setSuccess]= useState('')

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
    width: '100%', padding: '.78rem 1rem', borderRadius: 10,
    border: '1px solid rgba(0,232,176,.18)', background: 'rgba(0,232,176,.03)',
    color: '#cceee6', fontSize: '.95rem', outline: 'none',
    boxSizing: 'border-box', transition: 'border-color .18s, box-shadow .18s',
    fontFamily: 'inherit',
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', background: '#030c0a', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>

      {/* ── LEFT PANEL (branding) ── */}
      <div style={{ flex: 1, display: 'none', position: 'relative', background: 'linear-gradient(160deg,#081a16 0%,#050f0d 100%)', borderRight: '1px solid rgba(0,232,176,.1)', padding: '3rem', flexDirection: 'column', justifyContent: 'space-between' }}
        className="login-left">

        {/* Background grid */}
        <div style={{ position: 'absolute', inset: 0, opacity: .03, backgroundImage: 'linear-gradient(rgba(0,232,176,.8) 1px,transparent 1px),linear-gradient(90deg,rgba(0,232,176,.8) 1px,transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 500, height: 400, background: 'radial-gradient(ellipse,rgba(0,232,176,.06) 0%,transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, textDecoration: 'none', marginBottom: '3rem' }}>
            <img src="/logo.png" alt="3B Fleet Commander" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', boxShadow: '0 0 16px rgba(0,232,176,.4)' }} />
            <div>
              <div style={{ fontWeight: 900, fontSize: '.85rem', color: '#f5c200', letterSpacing: '.04em' }}>3B FLEET COMMANDER</div>
              <div style={{ fontSize: '.6rem', color: '#00e8b0', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Mileage Intelligence</div>
            </div>
          </Link>

          <div style={{ marginBottom: '3rem' }}>
            <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#f0fdf8', letterSpacing: '-.03em', lineHeight: 1.1, marginBottom: '1rem' }}>
              Your loads.<br />Your numbers.<br /><span style={{ color: '#00e8b0' }}>Your command.</span>
            </h1>
            <p style={{ fontSize: '.95rem', color: '#6aaa96', lineHeight: 1.7 }}>
              AI load analysis, DOT-compliant trip planning, and settlement audits — built around how an owner-operator actually works.
            </p>
          </div>

          {/* Feature bullets */}
          {[
            ['🤖', 'AI Load Prep — ACCEPT or DENY in seconds'],
            ['🗺', 'DOT-compliant trip plans with HOS tracking'],
            ['📊', 'Settlement audits that catch underpayments'],
            ['📄', 'PDF summary sheets for every load'],
          ].map(([icon, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '.8rem' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,232,176,.08)', border: '1px solid rgba(0,232,176,.15)', display: 'grid', placeItems: 'center', fontSize: '.9rem', flexShrink: 0 }}>{icon}</div>
              <span style={{ fontSize: '.85rem', color: '#cceee6', fontWeight: 500 }}>{label}</span>
            </div>
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '.65rem 1rem', borderRadius: 10, background: 'rgba(0,232,176,.05)', border: '1px solid rgba(0,232,176,.12)', marginBottom: '1.5rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00e8b0', boxShadow: '0 0 8px #00e8b0', flexShrink: 0 }} />
            <span style={{ fontSize: '.75rem', color: '#00e8b0', fontWeight: 700, letterSpacing: '.08em' }}>MIS ACTIVE · fleet.bouncebackbrian.com</span>
          </div>
          <div style={{ fontSize: '.72rem', color: '#2e5c50' }}>© 2025 3B Ecosystem · bouncebackbrian.com</div>
        </div>
      </div>

      {/* ── RIGHT PANEL (form) ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative', minHeight: '100dvh' }}>

        {/* Background glow */}
        <div style={{ position: 'absolute', top: '20%', right: '20%', width: 400, height: 400, background: 'radial-gradient(ellipse,rgba(0,232,176,.04) 0%,transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ width: '100%', maxWidth: 420, position: 'relative' }}>

          {/* Mobile logo — only shown on small screens */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <Link href="/" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '.6rem', textDecoration: 'none' }}>
              <img src="/logo.png" alt="3B Fleet Commander" style={{ width: 72, height: 72, borderRadius: 16, objectFit: 'cover', boxShadow: '0 0 32px rgba(0,232,176,.3)' }} />
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#f5c200', letterSpacing: '.04em', textShadow: '0 0 20px rgba(245,194,0,.3)' }}>3B FLEET COMMANDER</div>
                <div style={{ fontSize: '.62rem', color: '#00e8b0', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 2 }}>Mileage Intelligence System</div>
              </div>
            </Link>
          </div>

          {/* Card */}
          <div style={{ background: 'rgba(11,27,24,.8)', border: '1px solid rgba(0,232,176,.12)', borderRadius: 22, padding: '2rem', backdropFilter: 'blur(20px)', boxShadow: '0 8px 48px rgba(0,0,0,.5), 0 0 0 1px rgba(0,232,176,.04)' }}>

            {/* Header */}
            <div style={{ marginBottom: '1.6rem' }}>
              <h2 style={{ fontWeight: 900, fontSize: '1.3rem', color: '#f0fdf8', letterSpacing: '-.02em', marginBottom: '.35rem' }}>
                {tab === 'signin' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p style={{ fontSize: '.82rem', color: '#6aaa96' }}>
                {tab === 'signin'
                  ? 'Sign in to access your Fleet Commander dashboard'
                  : 'Get started with 3B Fleet Commander'}
              </p>
            </div>

            {/* Tab toggle */}
            <div style={{ display: 'flex', background: 'rgba(0,0,0,.3)', borderRadius: 10, padding: 3, gap: 2, marginBottom: '1.5rem', border: '1px solid rgba(0,232,176,.07)' }}>
              {(['signin', 'signup'] as const).map(t => (
                <button key={t} onClick={() => { setTab(t); setError(''); setSuccess('') }}
                  style={{ flex: 1, padding: '.55rem', borderRadius: 8, fontSize: '.8rem', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all .18s', background: tab === t ? 'rgba(0,232,176,.12)' : 'transparent', color: tab === t ? '#00e8b0' : '#6aaa96', boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,.4)' : 'none' }}>
                  {t === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: '.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#6aaa96', marginBottom: 7 }}>
                  Email Address
                </label>
                <input
                  style={inp} type="email" required autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="driver@yourdomain.com"
                  onFocus={e => { e.target.style.borderColor = 'rgba(0,232,176,.45)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,232,176,.08)' }}
                  onBlur={e  => { e.target.style.borderColor = 'rgba(0,232,176,.18)'; e.target.style.boxShadow = 'none' }}
                />
              </div>

              {/* Password */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                  <label style={{ fontSize: '.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#6aaa96' }}>Password</label>
                  {tab === 'signin' && (
                    <span style={{ fontSize: '.7rem', color: '#2e5c50', cursor: 'default' }}>Forgot password? — contact admin</span>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    style={{ ...inp, paddingRight: '2.8rem' }}
                    type={showPw ? 'text' : 'password'}
                    required
                    autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                    value={password} onChange={e => setPass(e.target.value)}
                    placeholder="••••••••"
                    onFocus={e => { e.target.style.borderColor = 'rgba(0,232,176,.45)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,232,176,.08)' }}
                    onBlur={e  => { e.target.style.borderColor = 'rgba(0,232,176,.18)'; e.target.style.boxShadow = 'none' }}
                  />
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    style={{ position: 'absolute', right: '.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6aaa96', fontSize: '.85rem', padding: '.2rem', lineHeight: 1 }}>
                    {showPw ? '🙈' : '👁'}
                  </button>
                </div>
                {tab === 'signup' && (
                  <div style={{ fontSize: '.68rem', color: '#2e5c50', marginTop: 5 }}>Minimum 6 characters</div>
                )}
              </div>

              {/* Error / Success */}
              {error && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '.7rem .9rem', borderRadius: 10, background: 'rgba(232,64,0,.08)', border: '1px solid rgba(232,64,0,.2)', color: '#ff7a4a', fontSize: '.82rem', lineHeight: 1.5 }}>
                  <span style={{ flexShrink: 0 }}>⚠</span>
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '.7rem .9rem', borderRadius: 10, background: 'rgba(0,232,176,.06)', border: '1px solid rgba(0,232,176,.2)', color: '#00e8b0', fontSize: '.82rem', lineHeight: 1.5 }}>
                  <span style={{ flexShrink: 0 }}>✅</span>
                  <span>{success}</span>
                </div>
              )}

              {/* Submit */}
              <button type="submit" disabled={loading}
                style={{ width: '100%', padding: '.88rem', borderRadius: 10, fontWeight: 800, fontSize: '.95rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1, transition: 'all .18s', border: 'none', background: loading ? 'rgba(0,200,144,.5)' : 'linear-gradient(135deg,#00e8b0,#00c090)', color: '#061210', marginTop: '.2rem', boxShadow: loading ? 'none' : '0 4px 24px rgba(0,232,176,.3)', fontFamily: 'inherit' }}>
                {loading
                  ? (tab === 'signin' ? 'Signing in…' : 'Creating account…')
                  : (tab === 'signin' ? 'Sign In →' : 'Create Account →')}
              </button>
            </form>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.5rem 0' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(0,232,176,.08)' }} />
              <span style={{ fontSize: '.68rem', color: '#2e5c50', fontWeight: 700, letterSpacing: '.08em' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(0,232,176,.08)' }} />
            </div>

            {/* 3B ID SSO */}
            <button disabled title="3B ID integration coming soon"
              style={{ width: '100%', padding: '.8rem', borderRadius: 10, background: 'rgba(245,194,0,.04)', border: '1px solid rgba(245,194,0,.15)', color: '#f5c200', opacity: .45, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: '.85rem', fontWeight: 700, cursor: 'not-allowed', fontFamily: 'inherit' }}>
              <img src="/logo.png" alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }} />
              Sign in with 3B ID
              <span style={{ fontSize: '.6rem', background: 'rgba(245,194,0,.12)', padding: '.15rem .45rem', borderRadius: 4, letterSpacing: '.06em', fontWeight: 800 }}>SOON</span>
            </button>

            {/* Footer link */}
            <p style={{ textAlign: 'center', fontSize: '.75rem', color: '#2e5c50', marginTop: '1.4rem', lineHeight: 1.6 }}>
              {tab === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <button onClick={() => { setTab(tab === 'signin' ? 'signup' : 'signin'); setError(''); setSuccess('') }}
                style={{ color: '#00e8b0', fontWeight: 700, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit', fontFamily: 'inherit' }}>
                {tab === 'signin' ? 'Create one' : 'Sign in'}
              </button>
            </p>
          </div>

          {/* Back to landing */}
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <Link href="/" style={{ fontSize: '.75rem', color: '#2e5c50', textDecoration: 'none', fontWeight: 600, transition: 'color .18s' }}
              onMouseEnter={e => ((e.target as HTMLElement).style.color = '#6aaa96')}
              onMouseLeave={e => ((e.target as HTMLElement).style.color = '#2e5c50')}>
              ← Back to 3B Fleet Commander
            </Link>
          </div>
        </div>
      </div>

      {/* Responsive style for left panel */}
      <style>{`
        @media (min-width: 900px) {
          .login-left { display: flex !important; }
        }
      `}</style>
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
