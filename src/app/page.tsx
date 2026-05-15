'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

const FEATURES = [
  {
    icon: '🤖',
    title: 'AI Load Prep',
    desc: 'Paste any load offer. Claude reads it, calculates net pay, checks your HOS hours, flags red flags, and gives you a plain ACCEPT or DENY — in seconds.',
    color: '#00e8b0',
  },
  {
    icon: '🗺',
    title: 'DOT-Compliant Trip Planner',
    desc: 'Enter origin, destination, and miles. Get a full FMCSA-compliant timeline with mandatory breaks, fuel stops, 14-hour window tracking, and a GPS copy for Trucker\'s Path.',
    color: '#4ac4ff',
  },
  {
    icon: '📊',
    title: 'Settlement Audit',
    desc: 'Log every load. Compare dispatched miles vs. paid miles. Flag underpayments and generate dispute-ready summaries automatically.',
    color: '#f5c200',
  },
  {
    icon: '📄',
    title: 'Summary Sheets & PDF',
    desc: 'One click generates a print-ready trip summary with financials, timeline, and legal checks. Email it to dispatch or save it as a PDF.',
    color: '#a78bfa',
  },
  {
    icon: '💬',
    title: 'Dispatch Messages',
    desc: 'Pre-built professional messages for load accept/deny, detention notices, breakdown reports, and HOS updates. Copy and send in one tap.',
    color: '#fb923c',
  },
  {
    icon: '⛽',
    title: 'Fuel & Delay Tracking',
    desc: 'Log fuel stops, detention time, and delays. Every entry feeds your profitability dashboard so you know your real cost per mile.',
    color: '#34d399',
  },
]

const STEPS = [
  { n: '01', title: 'Paste the load offer', desc: 'Copy any rate confirmation, broker email, or load board listing and paste it into the AI tab.' },
  { n: '02', title: 'AI analyzes instantly', desc: 'Claude checks HOS legality, calculates net pay after fuel, flags bad rates, and gives you a clear verdict.' },
  { n: '03', title: 'Build the trip plan', desc: 'One click builds a full DOT-compliant timeline with fuel stops, mandatory breaks, and Trucker\'s Path GPS output.' },
]

export default function LandingPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
    })
  }, [])

  const ctaHref  = authed ? '/dashboard' : '/login'
  const ctaLabel = authed ? 'Go to Dashboard →' : 'Sign In to Fleet Commander →'

  return (
    <div style={{ minHeight: '100dvh', background: '#030c0a', color: '#cceee6', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', overflowX: 'hidden' }}>

      {/* Background grid */}
      <div style={{ position: 'fixed', inset: 0, opacity: .025, backgroundImage: 'linear-gradient(rgba(0,232,176,.8) 1px,transparent 1px),linear-gradient(90deg,rgba(0,232,176,.8) 1px,transparent 1px)', backgroundSize: '56px 56px', pointerEvents: 'none', zIndex: 0 }} />

      {/* Glow orbs */}
      <div style={{ position: 'fixed', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: 900, height: 600, background: 'radial-gradient(ellipse,rgba(0,232,176,.07) 0%,transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-10%', right: '-10%', width: 600, height: 600, background: 'radial-gradient(ellipse,rgba(74,196,255,.05) 0%,transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* ── NAV ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid rgba(0,232,176,.08)', background: 'rgba(3,12,10,.85)', backdropFilter: 'blur(16px)', padding: '0 2rem' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo.png" alt="3B Fleet Commander" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', boxShadow: '0 0 12px rgba(0,232,176,.35)' }} />
            <div>
              <div style={{ fontWeight: 900, fontSize: '.88rem', color: '#f5c200', letterSpacing: '.04em', lineHeight: 1.1 }}>3B FLEET COMMANDER</div>
              <div style={{ fontSize: '.58rem', color: '#00e8b0', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Mileage Intelligence</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {authed && (
              <Link href="/dashboard" style={{ fontSize: '.82rem', color: '#6aaa96', fontWeight: 600, textDecoration: 'none' }}>Dashboard</Link>
            )}
            <Link href={ctaHref} style={{ padding: '.5rem 1.25rem', borderRadius: 8, background: 'linear-gradient(135deg,#00e8b0,#00c090)', color: '#061210', fontWeight: 800, fontSize: '.82rem', textDecoration: 'none', boxShadow: '0 2px 12px rgba(0,232,176,.3)' }}>
              {authed ? 'Dashboard' : 'Sign In'}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '6rem 2rem 5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>

          {/* Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '.35rem 1rem', borderRadius: 999, border: '1px solid rgba(0,232,176,.25)', background: 'rgba(0,232,176,.06)', marginBottom: '2rem' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#00e8b0', boxShadow: '0 0 8px #00e8b0' }} />
            <span style={{ fontSize: '.72rem', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#00e8b0' }}>For Owner-Operators</span>
          </div>

          <h1 style={{ fontSize: 'clamp(2.4rem,6vw,4.2rem)', fontWeight: 900, lineHeight: 1.08, letterSpacing: '-.03em', margin: '0 0 1.5rem', color: '#f0fdf8' }}>
            The Intelligence System<br />
            <span style={{ color: '#f5c200', textShadow: '0 0 40px rgba(245,194,0,.35)' }}>Built for Your Truck.</span>
          </h1>

          <p style={{ fontSize: 'clamp(1rem,2.5vw,1.25rem)', color: '#6aaa96', lineHeight: 1.7, maxWidth: 620, margin: '0 auto 2.5rem', fontWeight: 400 }}>
            AI load analysis, DOT-compliant trip planning, settlement audits, and dispatch tools — all in one system designed around how an owner-operator actually works.
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href={ctaHref} style={{ padding: '.9rem 2.2rem', borderRadius: 12, background: 'linear-gradient(135deg,#00e8b0,#00c090)', color: '#061210', fontWeight: 900, fontSize: '1rem', textDecoration: 'none', boxShadow: '0 4px 24px rgba(0,232,176,.4)', letterSpacing: '.01em' }}>
              {ctaLabel}
            </Link>
            <a href="#features" style={{ padding: '.9rem 2rem', borderRadius: 12, border: '1px solid rgba(0,232,176,.2)', background: 'rgba(0,232,176,.04)', color: '#cceee6', fontWeight: 700, fontSize: '1rem', textDecoration: 'none', letterSpacing: '.01em' }}>
              See what it does ↓
            </a>
          </div>
        </div>

        {/* Hero dashboard mockup card */}
        <div style={{ maxWidth: 900, margin: '4rem auto 0', position: 'relative' }}>
          <div style={{ borderRadius: 20, border: '1px solid rgba(0,232,176,.15)', background: 'linear-gradient(160deg,rgba(11,27,24,.9),rgba(5,15,13,.95))', padding: '1.5rem 2rem', boxShadow: '0 24px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(0,232,176,.06)', backdropFilter: 'blur(20px)' }}>
            {/* Fake top bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid rgba(0,232,176,.1)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />)}
              </div>
              <div style={{ flex: 1, height: 22, borderRadius: 5, background: 'rgba(0,232,176,.06)', border: '1px solid rgba(0,232,176,.1)', display: 'flex', alignItems: 'center', padding: '0 10px' }}>
                <span style={{ fontSize: '.65rem', color: '#2e5c50', fontWeight: 600 }}>fleet.bouncebackbrian.com/trips</span>
              </div>
            </div>
            {/* Fake UI content */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '.75rem', marginBottom: '1rem' }}>
              {[['Est. Pay','$1,842.50','#00e8b0'],['Fuel Cost','$414.30','#f5c200'],['Net Pay','$1,428.20','#00e8b0'],['Profit','77%','#28c048']].map(([l,v,c]) => (
                <div key={l} style={{ background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.1)', borderRadius: 10, padding: '.75rem' }}>
                  <div style={{ fontSize: '.6rem', color: '#6aaa96', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }}>{l}</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 900, color: c, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '.75rem' }}>
              <div style={{ background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.1)', borderRadius: 10, padding: '1rem' }}>
                <div style={{ fontSize: '.6rem', color: '#6aaa96', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.6rem' }}>AI Verdict</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '.35rem .75rem', borderRadius: 6, background: 'rgba(40,192,72,.12)', border: '1px solid rgba(40,192,72,.25)' }}>
                  <span style={{ fontSize: '1rem' }}>✅</span>
                  <span style={{ fontWeight: 900, fontSize: '.88rem', color: '#28c048' }}>ACCEPT</span>
                  <span style={{ fontSize: '.6rem', color: '#6aaa96', fontWeight: 700 }}>HIGH</span>
                </div>
                <div style={{ fontSize: '.68rem', color: '#6aaa96', marginTop: '.6rem', lineHeight: 1.55 }}>Strong CPM · HOS legal · No red flags</div>
              </div>
              <div style={{ background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.1)', borderRadius: 10, padding: '1rem' }}>
                <div style={{ fontSize: '.6rem', color: '#6aaa96', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.6rem' }}>DOT Timeline</div>
                {[['07:00 AM','🚛','Departure — Amargosa Valley, NV'],['10:15 AM','⛽',"Love's #478 — Tonopah, NV"],['12:30 PM','⏸','Mandatory 30-min Break'],['03:45 PM','✅','Arrival — Walmart DC Sparks, NV']].map(([t,icon,label]) => (
                  <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '.4rem' }}>
                    <span style={{ fontSize: '.62rem', color: '#2e5c50', fontWeight: 700, minWidth: 64, fontVariantNumeric: 'tabular-nums' }}>{t}</span>
                    <span style={{ fontSize: '.75rem' }}>{icon}</span>
                    <span style={{ fontSize: '.68rem', color: '#cceee6' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Glow under card */}
          <div style={{ position: 'absolute', bottom: -40, left: '50%', transform: 'translateX(-50%)', width: '70%', height: 80, background: 'radial-gradient(ellipse,rgba(0,232,176,.15) 0%,transparent 70%)', pointerEvents: 'none' }} />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '5rem 2rem', borderTop: '1px solid rgba(0,232,176,.07)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <div style={{ fontSize: '.7rem', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#00e8b0', marginBottom: '.75rem' }}>How It Works</div>
            <h2 style={{ fontSize: 'clamp(1.75rem,4vw,2.6rem)', fontWeight: 900, letterSpacing: '-.02em', color: '#f0fdf8', lineHeight: 1.15 }}>Load offer to dispatch plan<br /><span style={{ color: '#6aaa96', fontWeight: 500 }}>in under 60 seconds</span></h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px,100%),1fr))', gap: '1.5rem' }}>
            {STEPS.map((step, i) => (
              <div key={step.n} style={{ position: 'relative', background: 'rgba(11,27,24,.6)', border: '1px solid rgba(0,232,176,.1)', borderRadius: 18, padding: '2rem', backdropFilter: 'blur(12px)' }}>
                {i < STEPS.length - 1 && (
                  <div style={{ display: 'none' /* arrow only on desktop */ }} />
                )}
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'rgba(0,232,176,.12)', letterSpacing: '-.04em', lineHeight: 1, marginBottom: '.75rem', fontVariantNumeric: 'tabular-nums' }}>{step.n}</div>
                <h3 style={{ fontWeight: 800, fontSize: '1.05rem', color: '#f0fdf8', marginBottom: '.6rem', lineHeight: 1.3 }}>{step.title}</h3>
                <p style={{ fontSize: '.88rem', color: '#6aaa96', lineHeight: 1.65 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ position: 'relative', zIndex: 1, padding: '5rem 2rem', borderTop: '1px solid rgba(0,232,176,.07)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <div style={{ fontSize: '.7rem', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#00e8b0', marginBottom: '.75rem' }}>Platform Features</div>
            <h2 style={{ fontSize: 'clamp(1.75rem,4vw,2.6rem)', fontWeight: 900, letterSpacing: '-.02em', color: '#f0fdf8', lineHeight: 1.15 }}>Everything one truck needs</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))', gap: '1rem' }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: 'rgba(11,27,24,.5)', border: '1px solid rgba(0,232,176,.08)', borderRadius: 16, padding: '1.5rem', backdropFilter: 'blur(8px)', transition: 'border-color .2s', cursor: 'default' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = `${f.color}30`)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(0,232,176,.08)')}>
                <div style={{ fontSize: '1.75rem', marginBottom: '.75rem', lineHeight: 1 }}>{f.icon}</div>
                <h3 style={{ fontWeight: 800, fontSize: '1rem', color: '#f0fdf8', marginBottom: '.5rem' }}>{f.title}</h3>
                <p style={{ fontSize: '.85rem', color: '#6aaa96', lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '5rem 2rem', borderTop: '1px solid rgba(0,232,176,.07)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', padding: '.4rem 1rem', borderRadius: 999, background: 'rgba(245,194,0,.08)', border: '1px solid rgba(245,194,0,.2)', fontSize: '.7rem', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#f5c200', marginBottom: '1.5rem' }}>
            Owner-Operator Built
          </div>
          <h2 style={{ fontSize: 'clamp(1.75rem,4vw,2.8rem)', fontWeight: 900, letterSpacing: '-.02em', color: '#f0fdf8', lineHeight: 1.15, marginBottom: '1.25rem' }}>
            Know your numbers.<br />Run a tighter operation.
          </h2>
          <p style={{ fontSize: '1.05rem', color: '#6aaa96', lineHeight: 1.7, marginBottom: '2.5rem' }}>
            Built by a trucker, for truckers. No bloat, no monthly seat fees, no guessing. Just clean tools that help you make the right call on every load.
          </p>
          <Link href={ctaHref} style={{ display: 'inline-block', padding: '1rem 2.8rem', borderRadius: 14, background: 'linear-gradient(135deg,#00e8b0,#00c090)', color: '#061210', fontWeight: 900, fontSize: '1.05rem', textDecoration: 'none', boxShadow: '0 6px 32px rgba(0,232,176,.4)', letterSpacing: '.01em' }}>
            {ctaLabel}
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ position: 'relative', zIndex: 1, borderTop: '1px solid rgba(0,232,176,.08)', padding: '2rem', background: 'rgba(3,12,10,.6)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.png" alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
            <div>
              <div style={{ fontWeight: 900, fontSize: '.78rem', color: '#f5c200', letterSpacing: '.04em' }}>3B FLEET COMMANDER</div>
              <div style={{ fontSize: '.6rem', color: '#2e5c50', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Mileage Intelligence System</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <Link href="/login" style={{ fontSize: '.78rem', color: '#6aaa96', textDecoration: 'none', fontWeight: 600 }}>Sign In</Link>
            <Link href="/dashboard" style={{ fontSize: '.78rem', color: '#6aaa96', textDecoration: 'none', fontWeight: 600 }}>Dashboard</Link>
            <span style={{ fontSize: '.72rem', color: '#2e5c50' }}>© 2025 3B Ecosystem · bouncebackbrian.com</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
