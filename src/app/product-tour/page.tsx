'use client'

import Link from 'next/link'
import { FLEET_MODES } from '@/lib/fleet/modes'

const shell: React.CSSProperties = { background: '#030c0a', color: '#eefcf8', minHeight: '100dvh', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }
const card: React.CSSProperties = { border: '1px solid rgba(0,232,176,.12)', background: 'rgba(11,27,24,.72)', borderRadius: 18, padding: '1.15rem' }

export default function ProductTourPage() {
  return (
    <main style={shell}>
      <header style={{ borderBottom: '1px solid rgba(0,232,176,.09)', padding: '1rem 1.25rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ color: '#f5c200', fontWeight: 950, textDecoration: 'none' }}>3B FLEET COMMANDER</Link>
          <Link href="/start" style={{ padding: '.55rem .9rem', borderRadius: 9, background: '#00e8b0', color: '#04110d', fontWeight: 900, textDecoration: 'none', fontSize: '.8rem' }}>Get Started →</Link>
        </div>
      </header>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '4rem 1.25rem 2rem', textAlign: 'center' }}>
        <div style={{ color: '#00e8b0', fontSize: '.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.14em' }}>See it in action</div>
        <h1 style={{ fontSize: 'clamp(2rem,6vw,3.7rem)', lineHeight: 1.05, margin: '.75rem 0 1rem', fontWeight: 950 }}>Built around the work drivers actually do.</h1>
        <p style={{ color: '#78aa9c', lineHeight: 1.7, maxWidth: 700, margin: '0 auto' }}>
          Fleet Commander changes the driver experience by operation type. Real screenshots will replace the branded placeholders as each finished workflow is deployed.
        </p>
      </section>

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1.25rem 4rem', display: 'grid', gap: '1.2rem' }}>
        {FLEET_MODES.map(mode => (
          <article key={mode.id} style={card}>
            <div className="tour-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(280px,.9fr)', gap: '1.2rem', alignItems: 'stretch' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1.8rem' }}>{mode.icon}</span>
                  <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{mode.name}</h2>
                  <span style={{ padding: '.2rem .55rem', borderRadius: 999, fontSize: '.58rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: mode.status === 'live' ? '#00e8b0' : '#f5c200', border: `1px solid ${mode.status === 'live' ? 'rgba(0,232,176,.28)' : 'rgba(245,194,0,.28)'}` }}>{mode.status === 'live' ? 'Live' : 'Coming Soon'}</span>
                </div>
                <p style={{ color: '#7ca99d', lineHeight: 1.6, fontSize: '.84rem' }}>{mode.summary}</p>
                <div className="value-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
                  <ValueList title="Driver" items={mode.driverValue} />
                  <ValueList title="Company" items={mode.companyValue} />
                </div>
                {mode.status === 'live' && mode.driverHref && <Link href={mode.driverHref} style={{ display: 'inline-block', marginTop: '1rem', color: '#00e8b0', fontWeight: 850, textDecoration: 'none' }}>Open live driver mode →</Link>}
              </div>
              <ScreenshotPlaceholder mode={mode.name} comingSoon={mode.status !== 'live'} />
            </div>
          </article>
        ))}
      </section>

      <section style={{ borderTop: '1px solid rgba(0,232,176,.08)', padding: '3rem 1.25rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.7rem', marginBottom: '.6rem' }}>Build first. Capture real screens next.</h2>
        <p style={{ color: '#6f9b8f', maxWidth: 650, margin: '0 auto 1.3rem', lineHeight: 1.6 }}>Each placeholder is intentionally temporary. Once a workflow is finished and deployed, its authentic driver and company screenshots can replace the logo frame one-for-one.</p>
        <Link href="/start" style={{ display: 'inline-block', padding: '.75rem 1.25rem', borderRadius: 10, background: '#00e8b0', color: '#04110d', fontWeight: 950, textDecoration: 'none' }}>Set Up Fleet Commander →</Link>
      </section>

      <style>{`@media(max-width:760px){.tour-grid{grid-template-columns:1fr!important}.value-grid{grid-template-columns:1fr!important}}`}</style>
    </main>
  )
}

function ValueList({ title, items }: { title: string; items: string[] }) {
  return <div style={{ padding: '.8rem', borderRadius: 12, background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)' }}><div style={{ color: '#b7d9d0', fontSize: '.62rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.45rem' }}>{title} value</div>{items.map(item => <div key={item} style={{ color: '#789e94', fontSize: '.73rem', lineHeight: 1.55 }}>✓ {item}</div>)}</div>
}

function ScreenshotPlaceholder({ mode, comingSoon }: { mode: string; comingSoon: boolean }) {
  return <div style={{ borderRadius: 22, padding: 10, background: '#0c1512', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 16px 40px rgba(0,0,0,.25)' }}>
    <div style={{ borderRadius: 16, minHeight: 330, padding: '1rem', background: 'radial-gradient(circle at 50% 35%,rgba(0,232,176,.08),transparent 42%),#06100d', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <img src="/logo.png" alt="Fleet Commander" style={{ width: 92, height: 92, objectFit: 'cover', borderRadius: 18, boxShadow: '0 0 28px rgba(0,232,176,.18)' }} />
      <div style={{ marginTop: 16, color: '#f5c200', fontSize: '.62rem', fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>Fleet Commander</div>
      <div style={{ marginTop: 5, fontSize: '1.05rem', fontWeight: 950 }}>{mode}</div>
      <div style={{ marginTop: 10, maxWidth: 250, color: '#668f83', fontSize: '.7rem', lineHeight: 1.5 }}>{comingSoon ? 'Coming Soon — final driver flow is being built.' : 'Real deployed screenshots will be captured after the current build is finished.'}</div>
      <div style={{ marginTop: 16, padding: '.3rem .65rem', borderRadius: 999, border: `1px solid ${comingSoon ? 'rgba(245,194,0,.25)' : 'rgba(0,232,176,.25)'}`, color: comingSoon ? '#f5c200' : '#00e8b0', fontSize: '.58rem', fontWeight: 900, textTransform: 'uppercase' }}>{comingSoon ? 'Coming Soon' : 'Screenshot Placeholder'}</div>
    </div>
  </div>
}
