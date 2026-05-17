'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

const TOOLS = [
  { icon: '🗺', label: 'Trip Planner',     sub: 'DOT-safe route + breaks + fuel stops',      href: '/trips',  live: true  },
  { icon: '🤖', label: 'Load Analyzer',    sub: 'Paste any load — get ACCEPT or DENY',        href: '/trips',  live: true  },
  { icon: '⛽', label: 'Fuel Stops',       sub: "Live Love's prices along your route",         href: '/fuel',   live: true  },
  { icon: '📊', label: 'Settlement Audit', sub: 'Catch underpayments before they disappear',   href: '/audit',  live: true  },
  { icon: '⚖️', label: 'Scale Check',     sub: 'Weight compliance before the gate',           href: '#',       live: false },
  { icon: '🌦', label: 'Weather Alerts',  sub: 'Route-aware conditions + road warnings',      href: '#',       live: false },
  { icon: '📄', label: 'Documents',       sub: 'BOL, rate cons, receipts — all in one place', href: '#',       live: false },
  { icon: '💰', label: 'Expenses',        sub: 'Track every dollar in and out per load',      href: '#',       live: false },
]

const STEPS = [
  { n: '01', title: 'Enter your load',        desc: 'Order number, pickup, destination, truck profile. Takes 30 seconds.' },
  { n: '02', title: 'Build the route plan',   desc: 'DOT-compliant timeline: driving segments, mandatory breaks, fuel stop windows.' },
  { n: '03', title: 'Find fuel + showers',    desc: "Live Love's diesel prices and shower availability ranked along your route." },
  { n: '04', title: 'Export to Trucker Path', desc: 'Copy the full stop plan or open it directly in Trucker Path for navigation.' },
]

const BADGES = [
  { label: "Love's Integration", color: '#e05c0a' },
  { label: 'Trucker Path Export', color: '#4ac4ff' },
  { label: 'FMCSA HOS Rules',   color: '#00e8b0' },
  { label: 'Samsara Ready',     color: '#a78bfa' },
]

export default function HomePage() {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
    })
  }, [])

  const ctaHref  = authed ? '/trips'     : '/login'
  const ctaLabel = authed ? 'Open Trip Planner →' : 'Get Started Free →'

  return (
    <div style={{ minHeight: '100dvh', background: '#030c0a', color: '#cceee6', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', overflowX: 'hidden' }}>

      {/* Grid bg */}
      <div style={{ position: 'fixed', inset: 0, opacity: .022, pointerEvents: 'none', zIndex: 0, backgroundImage: 'linear-gradient(rgba(0,232,176,.8) 1px,transparent 1px),linear-gradient(90deg,rgba(0,232,176,.8) 1px,transparent 1px)', backgroundSize: '52px 52px' }} />
      <div style={{ position: 'fixed', top: '-15%', left: '50%', transform: 'translateX(-50%)', width: 800, height: 500, background: 'radial-gradient(ellipse,rgba(0,232,176,.065) 0%,transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid rgba(0,232,176,.08)', background: 'rgba(3,12,10,.9)', backdropFilter: 'blur(16px)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.png" alt="" style={{ width: 32, height: 32, borderRadius: 7, objectFit: 'cover', boxShadow: '0 0 10px rgba(0,232,176,.3)' }} />
            <div>
              <div style={{ fontWeight: 900, fontSize: '.82rem', color: '#f5c200', letterSpacing: '.04em', lineHeight: 1.1 }}>3B FLEET COMMANDER</div>
              <div style={{ fontSize: '.55rem', color: '#00e8b0', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Mileage Intelligence</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {authed && <Link href="/dashboard" style={{ fontSize: '.8rem', color: '#6aaa96', fontWeight: 600, textDecoration: 'none' }}>Dashboard</Link>}
            <Link href={ctaHref} style={{ padding: '.45rem 1.1rem', borderRadius: 8, background: 'linear-gradient(135deg,#00e8b0,#00c090)', color: '#061210', fontWeight: 800, fontSize: '.8rem', textDecoration: 'none', boxShadow: '0 2px 10px rgba(0,232,176,.28)' }}>
              {authed ? 'Dashboard' : 'Sign In'}
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ position: 'relative', zIndex: 1, padding: 'clamp(4rem,9vw,7rem) 1.5rem clamp(3rem,6vw,5rem)', textAlign: 'center' }}>
        <div style={{ maxWidth: 740, margin: '0 auto' }}>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '.3rem .9rem', borderRadius: 999, border: '1px solid rgba(0,232,176,.22)', background: 'rgba(0,232,176,.05)', marginBottom: '1.75rem' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e8b0', boxShadow: '0 0 7px #00e8b0', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '.68rem', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#00e8b0' }}>Built for owner-operators</span>
          </div>

          <h1 style={{ fontSize: 'clamp(2.2rem,6.5vw,4rem)', fontWeight: 900, lineHeight: 1.09, letterSpacing: '-.03em', margin: '0 0 1.2rem', color: '#f0fdf8' }}>
            Plan smarter trips.<br />
            <span style={{ color: '#f5c200', textShadow: '0 0 36px rgba(245,194,0,.3)' }}>Protect your miles.</span>
          </h1>

          <p style={{ fontSize: 'clamp(.92rem,2.2vw,1.12rem)', color: '#6aaa96', lineHeight: 1.7, maxWidth: 540, margin: '0 auto 2.25rem' }}>
            Enter your load details, build a DOT-aware trip plan, find fuel and shower stops, and export the route into Trucker Path.
          </p>

          <div style={{ display: 'flex', gap: '.8rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href={ctaHref} style={{ padding: '.82rem 1.9rem', borderRadius: 11, background: 'linear-gradient(135deg,#00e8b0,#00c090)', color: '#061210', fontWeight: 900, fontSize: '.98rem', textDecoration: 'none', boxShadow: '0 4px 22px rgba(0,232,176,.38)', letterSpacing: '.01em' }}>
              🗺 {ctaLabel}
            </Link>
            <a href="#tools" style={{ padding: '.82rem 1.7rem', borderRadius: 11, border: '1px solid rgba(0,232,176,.18)', background: 'rgba(0,232,176,.04)', color: '#cceee6', fontWeight: 700, fontSize: '.98rem', textDecoration: 'none' }}>
              See all tools ↓
            </a>
          </div>

          <div style={{ display: 'flex', gap: '.55rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.75rem' }}>
            {BADGES.map(b => (
              <div key={b.label} style={{ padding: '.22rem .7rem', borderRadius: 999, border: `1px solid ${b.color}28`, background: `${b.color}08`, fontSize: '.62rem', fontWeight: 700, letterSpacing: '.07em', color: b.color, textTransform: 'uppercase' }}>
                {b.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ position: 'relative', zIndex: 1, padding: 'clamp(2.5rem,5vw,4.5rem) 1.5rem', borderTop: '1px solid rgba(0,232,176,.07)' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontSize: '.65rem', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#00e8b0', marginBottom: '.5rem' }}>How it works</div>
            <h2 style={{ fontSize: 'clamp(1.4rem,3.5vw,2.1rem)', fontWeight: 900, letterSpacing: '-.02em', color: '#f0fdf8', margin: 0 }}>Load offer to dispatch plan</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(210px,100%),1fr))', gap: '.9rem' }}>
            {STEPS.map(s => (
              <div key={s.n} style={{ background: 'rgba(11,27,24,.55)', border: '1px solid rgba(0,232,176,.09)', borderRadius: 15, padding: '1.4rem', backdropFilter: 'blur(8px)' }}>
                <div style={{ fontSize: '1.9rem', fontWeight: 900, color: 'rgba(0,232,176,.1)', letterSpacing: '-.04em', lineHeight: 1, marginBottom: '.55rem', fontVariantNumeric: 'tabular-nums' }}>{s.n}</div>
                <h3 style={{ fontWeight: 800, fontSize: '.9rem', color: '#f0fdf8', marginBottom: '.35rem', lineHeight: 1.3 }}>{s.title}</h3>
                <p style={{ fontSize: '.78rem', color: '#6aaa96', lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TOOLS GRID */}
      <section id="tools" style={{ position: 'relative', zIndex: 1, padding: 'clamp(2.5rem,5vw,4.5rem) 1.5rem', borderTop: '1px solid rgba(0,232,176,.07)' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontSize: '.65rem', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#00e8b0', marginBottom: '.5rem' }}>The toolkit</div>
            <h2 style={{ fontSize: 'clamp(1.4rem,3.5vw,2.1rem)', fontWeight: 900, letterSpacing: '-.02em', color: '#f0fdf8', margin: 0 }}>Everything one truck needs</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(210px,100%),1fr))', gap: '.8rem' }}>
            {TOOLS.map(t => (
              <Link key={t.label} href={t.live ? t.href : '#tools'} style={{ textDecoration: 'none' }}>
                <div
                  style={{ background: 'rgba(11,27,24,.5)', border: `1px solid ${t.live ? 'rgba(0,232,176,.1)' : 'rgba(255,255,255,.05)'}`, borderRadius: 13, padding: '1.1rem', backdropFilter: 'blur(6px)', transition: 'border-color .18s,background .18s', opacity: t.live ? 1 : .55, position: 'relative', height: '100%' }}
                  onMouseEnter={e => { if (t.live) { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'rgba(0,232,176,.28)'; el.style.background = 'rgba(0,232,176,.04)' } }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = t.live ? 'rgba(0,232,176,.1)' : 'rgba(255,255,255,.05)'; el.style.background = 'rgba(11,27,24,.5)' }}
                >
                  {!t.live && (
                    <div style={{ position: 'absolute', top: 9, right: 9, padding: '.15rem .5rem', borderRadius: 999, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', fontSize: '.54rem', fontWeight: 700, letterSpacing: '.08em', color: '#3a5a50', textTransform: 'uppercase' }}>
                      Soon
                    </div>
                  )}
                  <div style={{ fontSize: '1.45rem', marginBottom: '.55rem', lineHeight: 1 }}>{t.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: '.85rem', color: t.live ? '#f0fdf8' : '#3a5a50', marginBottom: '.25rem' }}>{t.label}</div>
                  <div style={{ fontSize: '.72rem', color: '#3a5a50', lineHeight: 1.5 }}>{t.sub}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section style={{ position: 'relative', zIndex: 1, padding: 'clamp(3rem,6vw,5rem) 1.5rem', borderTop: '1px solid rgba(0,232,176,.07)', textAlign: 'center' }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <div style={{ fontSize: '.65rem', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#f5c200', marginBottom: '.7rem' }}>Owner-Operator Built</div>
          <h2 style={{ fontSize: 'clamp(1.5rem,4vw,2.5rem)', fontWeight: 900, letterSpacing: '-.025em', color: '#f0fdf8', lineHeight: 1.15, marginBottom: '.9rem' }}>
            Know your numbers.<br />Run a tighter operation.
          </h2>
          <p style={{ fontSize: '.92rem', color: '#6aaa96', lineHeight: 1.7, marginBottom: '1.8rem' }}>
            No monthly fees. No bloat. Built around how you actually work.
          </p>
          <Link href={ctaHref} style={{ display: 'inline-block', padding: '.85rem 2.1rem', borderRadius: 12, background: 'linear-gradient(135deg,#00e8b0,#00c090)', color: '#061210', fontWeight: 900, fontSize: '.98rem', textDecoration: 'none', boxShadow: '0 4px 22px rgba(0,232,176,.35)' }}>
            🗺 {ctaLabel}
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid rgba(0,232,176,.07)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.65rem' }}>
          <div style={{ fontSize: '.68rem', color: '#2e5c50', fontWeight: 600 }}>© 2025 3B Ecosystem · fleet.bouncebackbrian.com</div>
          <div style={{ display: 'flex', gap: '1.1rem' }}>
            {[['Trip Planner', '/trips'], ['Loads', '/loads'], ['Fuel', '/fuel'], ['Settings', '/settings']].map(([l, h]) => (
              <Link key={l} href={h} style={{ fontSize: '.68rem', color: '#2e5c50', fontWeight: 600, textDecoration: 'none' }}
                onMouseEnter={e => ((e.target as HTMLElement).style.color = '#6aaa96')}
                onMouseLeave={e => ((e.target as HTMLElement).style.color = '#2e5c50')}>
                {l}
              </Link>
            ))}
          </div>
        </div>
      </footer>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
    </div>
  )
}
