'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

// ─── Feature data ────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: '🤖',
    title: 'AI Load Analysis',
    desc: 'Paste any rate confirmation. Claude reads it, calculates net pay after fuel, checks your HOS, flags red flags, and gives you a clear ACCEPT or DENY in seconds.',
    color: '#00e8b0',
    tag: 'Core',
  },
  {
    icon: '🗺',
    title: 'DOT-Compliant Trip Planner',
    desc: 'Full FMCSA timeline with mandatory breaks, fuel stops, 70-hr cycle tracking, and a live map. Saves to your phone as the active trip with ETA countdown.',
    color: '#4ac4ff',
    tag: 'Core',
  },
  {
    icon: '🌤',
    title: 'Live Route Weather',
    desc: 'Real-time conditions at your current location, destination, and midpoint. Fog, ice, high-wind, and storm alerts before you hit the road.',
    color: '#a78bfa',
    tag: 'Safety',
  },
  {
    icon: '⚖️',
    title: 'CAT Scale / Weight Checker',
    desc: 'Enter axle weights, get instant legal/overweight verdict, and receive tandem slide recommendations to fix violations before the DOT does it for you.',
    color: '#f5c200',
    tag: 'Compliance',
  },
  {
    icon: '💵',
    title: 'Expense Tracker',
    desc: 'Log fuel, parking, tolls, meals, and repairs on the road. Calculates IRS-deductible amounts in real time so tax season isn\'t a surprise.',
    color: '#34d399',
    tag: 'Finance',
  },
  {
    icon: '📊',
    title: 'Settlement Audit',
    desc: 'Log every load. Compare dispatched miles vs. ELD miles vs. paid miles. Flag underpayments and generate dispute-ready summaries automatically.',
    color: '#f5c200',
    tag: 'Finance',
  },
  {
    icon: '💬',
    title: 'Dispatch Messages',
    desc: 'One-tap messages for load accept/deny, detention claims, breakdown reports, family check-ins, and weather delays. Professional every time.',
    color: '#fb923c',
    tag: 'Operations',
  },
  {
    icon: '⏱',
    title: 'HOS Tracking',
    desc: 'Scan your ELD screenshot or connect Samsara live. Drive, shift, and 30-min break bars update in real time directly on the Command Center.',
    color: '#6c9bd2',
    tag: 'Compliance',
  },
  {
    icon: '⛽',
    title: 'Fuel Log',
    desc: 'Track every fill-up with location, price, and gallons. Feeds your MIS profitability calculations and expense reports automatically.',
    color: '#34d399',
    tag: 'Finance',
  },
  {
    icon: '📋',
    title: 'Playbook Library',
    desc: 'Pre-built decision playbooks for crosswind, chain laws, parking, receiver issues, winter driving, and metro freight. Escalation levels included.',
    color: '#00e8b0',
    tag: 'Safety',
  },
]

const TAG_COLORS: Record<string, string> = {
  Core:        '#00e8b0',
  Safety:      '#a78bfa',
  Compliance:  '#f5c200',
  Finance:     '#34d399',
  Operations:  '#fb923c',
}

const STEPS = [
  {
    n: '01',
    icon: '📋',
    title: 'Paste the load offer',
    desc: 'Copy any rate confirmation, broker email, or load board listing and paste it into the AI tab. Origin, destination, miles, rate — it reads all of it.',
  },
  {
    n: '02',
    icon: '🤖',
    title: 'Get your verdict instantly',
    desc: 'Claude checks HOS legality, calculates net pay after fuel, flags low CPM, detention risk, and bad receivers — and gives you a plain ACCEPT or DENY.',
  },
  {
    n: '03',
    icon: '🗺',
    title: 'Run the trip on autopilot',
    desc: 'One tap builds a DOT-compliant timeline. The Command Center shows your live ETA, next stop, weather, and HOS bars while you drive.',
  },
]

const STATS = [
  { value: '10+', label: 'integrated tools' },
  { value: '$0',  label: 'monthly fees' },
  { value: '100%', label: 'works offline' },
  { value: '⚡',  label: 'instant AI verdicts' },
]

// ─── Landing page ─────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setAuthed(!!data.session))
  }, [])

  const ctaHref  = authed ? '/dashboard' : '/login'
  const ctaLabel = authed ? 'Go to Dashboard →' : 'Get Started Free →'

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#030c0a',
      color: '#cceee6',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      overflowX: 'hidden',
    }}>

      {/* Background grid */}
      <div style={{ position: 'fixed', inset: 0, opacity: .025, backgroundImage: 'linear-gradient(rgba(0,232,176,.8) 1px,transparent 1px),linear-gradient(90deg,rgba(0,232,176,.8) 1px,transparent 1px)', backgroundSize: '56px 56px', pointerEvents: 'none', zIndex: 0 }} />
      {/* Glow orbs */}
      <div style={{ position: 'fixed', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: 900, height: 600, background: 'radial-gradient(ellipse,rgba(0,232,176,.07) 0%,transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-10%', right: '-10%', width: 600, height: 600, background: 'radial-gradient(ellipse,rgba(74,196,255,.05) 0%,transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* ── NAV ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid rgba(0,232,176,.08)', background: 'rgba(3,12,10,.9)', backdropFilter: 'blur(16px)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.png" alt="3B Fleet Commander" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover', boxShadow: '0 0 12px rgba(0,232,176,.35)' }} />
            <div>
              <div style={{ fontWeight: 900, fontSize: '.85rem', color: '#f5c200', letterSpacing: '.04em', lineHeight: 1.1 }}>3B FLEET COMMANDER</div>
              <div style={{ fontSize: '.55rem', color: '#00e8b0', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Mileage Intelligence</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
            <a href="#features" style={{ fontSize: '.8rem', color: '#6aaa96', fontWeight: 600, textDecoration: 'none', display: 'none' }} className="desktop-only">Features</a>
            {authed && (
              <Link href="/dashboard" style={{ fontSize: '.8rem', color: '#6aaa96', fontWeight: 600, textDecoration: 'none' }}>Dashboard</Link>
            )}
            <Link href={ctaHref} style={{ padding: '.45rem 1.1rem', borderRadius: 8, background: 'linear-gradient(135deg,#00e8b0,#00c090)', color: '#061210', fontWeight: 800, fontSize: '.8rem', textDecoration: 'none', boxShadow: '0 2px 12px rgba(0,232,176,.3)', whiteSpace: 'nowrap' }}>
              {authed ? 'Dashboard' : 'Sign In'}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: 'clamp(3.5rem,8vw,7rem) 1.5rem clamp(3rem,6vw,5rem)', textAlign: 'center' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>

          {/* Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '.3rem .9rem', borderRadius: 999, border: '1px solid rgba(0,232,176,.25)', background: 'rgba(0,232,176,.06)', marginBottom: '1.75rem' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e8b0', boxShadow: '0 0 8px #00e8b0', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '.7rem', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#00e8b0' }}>For Owner-Operators · Free · Works Offline</span>
          </div>

          <h1 style={{ fontSize: 'clamp(2.2rem,7vw,4.4rem)', fontWeight: 900, lineHeight: 1.06, letterSpacing: '-.03em', margin: '0 0 1.4rem', color: '#f0fdf8' }}>
            Stop guessing.<br />
            <span style={{ color: '#f5c200', textShadow: '0 0 40px rgba(245,194,0,.35)' }}>Run a smarter truck.</span>
          </h1>

          <p style={{ fontSize: 'clamp(.95rem,2.5vw,1.2rem)', color: '#6aaa96', lineHeight: 1.75, maxWidth: 640, margin: '0 auto 2.5rem', fontWeight: 400 }}>
            AI load analysis, DOT-compliant trip planning, live weather, scale weight checks, expense tracking, and settlement audits — built into one command center designed around how an owner-operator actually works.
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '3.5rem' }}>
            <Link href={ctaHref} style={{ padding: '.85rem 2rem', borderRadius: 12, background: 'linear-gradient(135deg,#00e8b0,#00c090)', color: '#061210', fontWeight: 900, fontSize: '1rem', textDecoration: 'none', boxShadow: '0 4px 24px rgba(0,232,176,.4)', letterSpacing: '.01em', whiteSpace: 'nowrap' }}>
              {ctaLabel}
            </Link>
            <a href="#features" style={{ padding: '.85rem 1.8rem', borderRadius: 12, border: '1px solid rgba(0,232,176,.2)', background: 'rgba(0,232,176,.04)', color: '#cceee6', fontWeight: 700, fontSize: '1rem', textDecoration: 'none', letterSpacing: '.01em', whiteSpace: 'nowrap' }}>
              See all features ↓
            </a>
          </div>

          {/* Stats strip */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'clamp(1.5rem,4vw,3rem)', flexWrap: 'wrap', marginBottom: '3.5rem' }}>
            {STATS.map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 900, color: '#00e8b0', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '.68rem', color: '#6aaa96', fontWeight: 600, marginTop: 4, letterSpacing: '.05em', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* ── Dashboard preview card ── */}
          <div style={{ position: 'relative' }}>
            <div style={{ borderRadius: 20, border: '1px solid rgba(0,232,176,.15)', background: 'linear-gradient(160deg,rgba(11,27,24,.95),rgba(5,15,13,.98))', padding: 'clamp(1rem,3vw,1.75rem)', boxShadow: '0 24px 80px rgba(0,0,0,.65), 0 0 0 1px rgba(0,232,176,.05)', backdropFilter: 'blur(20px)', textAlign: 'left' }}>

              {/* Window chrome */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1.1rem', paddingBottom: '.9rem', borderBottom: '1px solid rgba(0,232,176,.08)' }}>
                <div style={{ display: 'flex', gap: 5 }}>
                  {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c, opacity: .9 }} />)}
                </div>
                <div style={{ flex: 1, height: 20, borderRadius: 4, background: 'rgba(0,232,176,.05)', border: '1px solid rgba(0,232,176,.08)', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                  <span style={{ fontSize: '.6rem', color: '#2e5c50', fontWeight: 600 }}>3bfleet.app / dashboard</span>
                </div>
                <div style={{ padding: '.2rem .5rem', borderRadius: 4, background: 'rgba(0,232,176,.08)', border: '1px solid rgba(0,232,176,.15)', fontSize: '.55rem', fontWeight: 800, color: '#00e8b0', letterSpacing: '.07em' }}>MIS ACTIVE</div>
              </div>

              {/* Mock KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(110px,100%),1fr))', gap: '.6rem', marginBottom: '.8rem' }}>
                {[
                  { l: 'Net Pay',     v: '$1,428', c: '#00e8b0' },
                  { l: 'Today Exp.',  v: '$87.40',  c: 'var(--text,#f0faf8)' },
                  { l: 'Drive Left',  v: '8.2h',    c: '#00e8b0' },
                  { l: 'Weather',     v: '72°F ☀️', c: '#f5c200' },
                ].map(({ l, v, c }) => (
                  <div key={l} style={{ background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.09)', borderRadius: 10, padding: '.65rem .75rem' }}>
                    <div style={{ fontSize: '.55rem', color: '#6aaa96', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>{l}</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 900, color: c, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Mock trip bar */}
              <div style={{ marginBottom: '.8rem', padding: '.75rem .9rem', borderRadius: 12, background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '.65rem', color: '#6aaa96', fontWeight: 700 }}>
                  <span>Amargosa Valley NV</span>
                  <span style={{ color: '#00e8b0', fontWeight: 800 }}>62% complete</span>
                  <span>Sparks NV</span>
                </div>
                <div style={{ height: 7, background: 'rgba(0,232,176,.08)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '62%', background: 'linear-gradient(90deg,#00e8b0,rgba(40,192,72,.8))', borderRadius: 4, boxShadow: '0 0 8px rgba(0,232,176,.35)' }} />
                  <div style={{ position: 'absolute', top: -3, left: '62%', fontSize: '.75rem', transform: 'translateX(-50%)' }}>🚛</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: '.6rem', color: '#2e5c50' }}>
                  <span>304 mi total</span>
                  <span>ETA 3:45 PM</span>
                </div>
              </div>

              {/* Mock bottom row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
                <div style={{ padding: '.6rem .75rem', borderRadius: 10, background: 'rgba(40,192,72,.05)', border: '1px solid rgba(40,192,72,.12)' }}>
                  <div style={{ fontSize: '.55rem', color: '#6aaa96', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>AI Verdict</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: '.8rem' }}>✅</span>
                    <span style={{ fontWeight: 900, fontSize: '.85rem', color: '#28c048' }}>ACCEPT</span>
                    <span style={{ fontSize: '.58rem', color: '#6aaa96' }}>$1.42 net/mi</span>
                  </div>
                </div>
                <div style={{ padding: '.6rem .75rem', borderRadius: 10, background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.1)' }}>
                  <div style={{ fontSize: '.55rem', color: '#6aaa96', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>Next Stop</div>
                  <div style={{ fontWeight: 700, fontSize: '.75rem', color: '#f0faf8' }}>⛽ Love&apos;s #478 — Tonopah</div>
                  <div style={{ fontSize: '.6rem', color: '#6aaa96', marginTop: 2 }}>142 mi · 10:15 AM · $3.829/gal</div>
                </div>
              </div>
            </div>

            {/* Glow under card */}
            <div style={{ position: 'absolute', bottom: -30, left: '50%', transform: 'translateX(-50%)', width: '60%', height: 60, background: 'radial-gradient(ellipse,rgba(0,232,176,.12) 0%,transparent 70%)', pointerEvents: 'none' }} />
          </div>
        </div>
      </section>

      {/* ── "BUILT BY A TRUCKER" BAND ── */}
      <div style={{ position: 'relative', zIndex: 1, background: 'rgba(0,232,176,.04)', borderTop: '1px solid rgba(0,232,176,.1)', borderBottom: '1px solid rgba(0,232,176,.1)', padding: '1.5rem 1.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem' }}>🚛</div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontWeight: 900, fontSize: 'clamp(.9rem,2.5vw,1.1rem)', color: '#f0fdf8', lineHeight: 1.3 }}>
              Built by an owner-operator, for owner-operators.
            </div>
            <div style={{ fontSize: '.82rem', color: '#6aaa96', marginTop: 5, lineHeight: 1.6 }}>
              No fluff. No seat fees. No data sold. Every feature exists because it solved a real problem on a real load.
            </div>
          </div>
          <Link href={ctaHref} style={{ padding: '.7rem 1.6rem', borderRadius: 10, background: 'rgba(0,232,176,.1)', border: '1px solid rgba(0,232,176,.3)', color: '#00e8b0', fontWeight: 800, fontSize: '.85rem', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {authed ? 'Open dashboard →' : 'Try it free →'}
          </Link>
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: 'clamp(3.5rem,7vw,6rem) 1.5rem', borderTop: '1px solid rgba(0,232,176,.07)' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(2rem,5vw,3.5rem)' }}>
            <div style={{ fontSize: '.68rem', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#00e8b0', marginBottom: '.65rem' }}>How It Works</div>
            <h2 style={{ fontSize: 'clamp(1.6rem,4vw,2.6rem)', fontWeight: 900, letterSpacing: '-.02em', color: '#f0fdf8', lineHeight: 1.15, margin: 0 }}>
              Load offer to rolling in under 60 seconds
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px,100%),1fr))', gap: '1.25rem' }}>
            {STEPS.map((step) => (
              <div key={step.n} style={{ background: 'rgba(11,27,24,.6)', border: '1px solid rgba(0,232,176,.1)', borderRadius: 18, padding: '1.75rem', backdropFilter: 'blur(12px)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 16, right: 18, fontSize: '2.2rem', fontWeight: 900, color: 'rgba(0,232,176,.07)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.04em', lineHeight: 1 }}>{step.n}</div>
                <div style={{ fontSize: '2rem', marginBottom: '.9rem', lineHeight: 1 }}>{step.icon}</div>
                <h3 style={{ fontWeight: 800, fontSize: '1rem', color: '#f0fdf8', marginBottom: '.6rem', lineHeight: 1.3 }}>{step.title}</h3>
                <p style={{ fontSize: '.85rem', color: '#6aaa96', lineHeight: 1.7, margin: 0 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section id="features" style={{ position: 'relative', zIndex: 1, padding: 'clamp(3.5rem,7vw,6rem) 1.5rem', borderTop: '1px solid rgba(0,232,176,.07)' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(2rem,5vw,3.5rem)' }}>
            <div style={{ fontSize: '.68rem', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#00e8b0', marginBottom: '.65rem' }}>Platform Features</div>
            <h2 style={{ fontSize: 'clamp(1.6rem,4vw,2.6rem)', fontWeight: 900, letterSpacing: '-.02em', color: '#f0fdf8', lineHeight: 1.15, margin: 0 }}>
              Everything one truck needs
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(300px,100%),1fr))', gap: '.9rem' }}>
            {FEATURES.map(f => (
              <div key={f.title}
                style={{ background: 'rgba(11,27,24,.5)', border: '1px solid rgba(0,232,176,.08)', borderRadius: 16, padding: '1.3rem 1.4rem', backdropFilter: 'blur(8px)', transition: 'border-color .2s, transform .2s', cursor: 'default', position: 'relative' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${f.color}30`; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,232,176,.08)'; (e.currentTarget as HTMLElement).style.transform = 'none' }}>
                {/* Tag pill */}
                <div style={{ position: 'absolute', top: 12, right: 12, padding: '.15rem .45rem', borderRadius: 5, fontSize: '.55rem', fontWeight: 800, letterSpacing: '.07em', background: `${TAG_COLORS[f.tag] ?? '#00e8b0'}12`, border: `1px solid ${TAG_COLORS[f.tag] ?? '#00e8b0'}25`, color: TAG_COLORS[f.tag] ?? '#00e8b0' }}>
                  {f.tag}
                </div>
                <div style={{ fontSize: '1.65rem', marginBottom: '.65rem', lineHeight: 1 }}>{f.icon}</div>
                <h3 style={{ fontWeight: 800, fontSize: '.95rem', color: '#f0fdf8', marginBottom: '.45rem', paddingRight: '3rem' }}>{f.title}</h3>
                <p style={{ fontSize: '.82rem', color: '#6aaa96', lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PWA INSTALL CALLOUT ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: 'clamp(3rem,6vw,5rem) 1.5rem', borderTop: '1px solid rgba(0,232,176,.07)' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <div style={{ borderRadius: 22, background: 'linear-gradient(135deg,rgba(0,232,176,.08),rgba(0,200,144,.04))', border: '1px solid rgba(0,232,176,.2)', padding: 'clamp(1.75rem,5vw,2.75rem)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '1.25rem', boxShadow: '0 8px 48px rgba(0,232,176,.08)' }}>
            <div style={{ display: 'flex', gap: '-8px' }}>
              <div style={{ width: 54, height: 54, borderRadius: 14, background: 'linear-gradient(135deg,#061210,#0a2218)', border: '1px solid rgba(0,232,176,.25)', display: 'grid', placeItems: 'center', fontSize: '1.5rem', boxShadow: '0 0 20px rgba(0,232,176,.2)' }}>📱</div>
            </div>
            <div>
              <h2 style={{ fontSize: 'clamp(1.3rem,3.5vw,1.9rem)', fontWeight: 900, color: '#f0fdf8', letterSpacing: '-.02em', lineHeight: 1.2, margin: '0 0 .75rem' }}>
                Add to your home screen.<br />
                <span style={{ color: '#00e8b0' }}>Works like a native app.</span>
              </h2>
              <p style={{ fontSize: '.9rem', color: '#6aaa96', lineHeight: 1.7, margin: 0, maxWidth: 500 }}>
                3B Fleet Commander installs as a PWA — no App Store, no updates to manage. Works offline on the road. Your trip data, expenses, and HOS are always available, even when you lose signal in the mountains.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <div style={{ padding: '.65rem 1.25rem', borderRadius: 10, background: 'rgba(0,232,176,.08)', border: '1px solid rgba(0,232,176,.2)', fontSize: '.8rem', color: '#00e8b0', fontWeight: 700 }}>
                📱 iOS: Share → Add to Home Screen
              </div>
              <div style={{ padding: '.65rem 1.25rem', borderRadius: 10, background: 'rgba(0,232,176,.08)', border: '1px solid rgba(0,232,176,.2)', fontSize: '.8rem', color: '#00e8b0', fontWeight: 700 }}>
                🤖 Android: Menu → Install App
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section style={{ position: 'relative', zIndex: 1, padding: 'clamp(3.5rem,8vw,6rem) 1.5rem', borderTop: '1px solid rgba(0,232,176,.07)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', padding: '.35rem .9rem', borderRadius: 999, background: 'rgba(245,194,0,.07)', border: '1px solid rgba(245,194,0,.18)', fontSize: '.68rem', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#f5c200', marginBottom: '1.4rem' }}>
            Owner-Operator Built · Always Free
          </div>
          <h2 style={{ fontSize: 'clamp(1.7rem,4.5vw,2.8rem)', fontWeight: 900, letterSpacing: '-.02em', color: '#f0fdf8', lineHeight: 1.12, marginBottom: '1.2rem' }}>
            Know your numbers.<br />Run a tighter operation.
          </h2>
          <p style={{ fontSize: 'clamp(.9rem,2vw,1.05rem)', color: '#6aaa96', lineHeight: 1.75, marginBottom: '2.25rem' }}>
            No monthly fees. No data sold. No fluff. Just clean tools that help you make the right call on every load — from the cab.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href={ctaHref} style={{ padding: '.9rem 2.4rem', borderRadius: 13, background: 'linear-gradient(135deg,#00e8b0,#00c090)', color: '#061210', fontWeight: 900, fontSize: '1rem', textDecoration: 'none', boxShadow: '0 6px 32px rgba(0,232,176,.4)', letterSpacing: '.01em' }}>
              {ctaLabel}
            </Link>
            <a href="#features" style={{ padding: '.9rem 1.8rem', borderRadius: 13, border: '1px solid rgba(0,232,176,.18)', color: '#6aaa96', fontWeight: 700, fontSize: '1rem', textDecoration: 'none' }}>
              See features ↑
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ position: 'relative', zIndex: 1, borderTop: '1px solid rgba(0,232,176,.08)', padding: '1.75rem 1.5rem', background: 'rgba(3,12,10,.7)' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <img src="/logo.png" alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover', opacity: .8 }} />
            <div>
              <div style={{ fontWeight: 900, fontSize: '.75rem', color: '#f5c200', letterSpacing: '.04em' }}>3B FLEET COMMANDER</div>
              <div style={{ fontSize: '.57rem', color: '#2e5c50', fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase' }}>Mileage Intelligence System</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href="/login" style={{ fontSize: '.75rem', color: '#6aaa96', textDecoration: 'none', fontWeight: 600 }}>Sign In</Link>
            <Link href="/dashboard" style={{ fontSize: '.75rem', color: '#6aaa96', textDecoration: 'none', fontWeight: 600 }}>Dashboard</Link>
            <a href="#features" style={{ fontSize: '.75rem', color: '#6aaa96', textDecoration: 'none', fontWeight: 600 }}>Features</a>
            <span style={{ fontSize: '.68rem', color: '#1e3830' }}>© 2025 3B Ecosystem</span>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: .4; }
        }
      `}</style>
    </div>
  )
}
