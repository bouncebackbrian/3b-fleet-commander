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
          Fleet Commander changes the driver experience by operation type. Live modes show the current workflow; upcoming modes are clearly marked as previews until their driver flow is released.
        </p>
      </section>

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1.25rem 4rem', display: 'grid', gap: '1.2rem' }}>
        {FLEET_MODES.map(mode => (
          <article key={mode.id} style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(280px,.9fr)', gap: '1.2rem', alignItems: 'stretch' }} className="tour-grid">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1.8rem' }}>{mode.icon}</span>
                  <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{mode.name}</h2>
                  <span style={{ padding: '.2rem .55rem', borderRadius: 999, fontSize: '.58rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: mode.status === 'live' ? '#00e8b0' : '#f5c200', border: `1px solid ${mode.status === 'live' ? 'rgba(0,232,176,.28)' : 'rgba(245,194,0,.28)'}` }}>
                    {mode.status === 'live' ? 'Live' : 'Coming Soon'}
                  </span>
                </div>
                <p style={{ color: '#7ca99d', lineHeight: 1.6, fontSize: '.84rem' }}>{mode.summary}</p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }} className="value-grid">
                  <ValueList title="Driver" items={mode.driverValue} />
                  <ValueList title="Company" items={mode.companyValue} />
                </div>

                {mode.status === 'live' && mode.driverHref && (
                  <Link href={mode.driverHref} style={{ display: 'inline-block', marginTop: '1rem', color: '#00e8b0', fontWeight: 850, textDecoration: 'none' }}>Open live driver mode →</Link>
                )}
              </div>

              <PreviewFrame mode={mode.name} live={mode.status === 'live'} />
            </div>
          </article>
        ))}
      </section>

      <section style={{ borderTop: '1px solid rgba(0,232,176,.08)', padding: '3rem 1.25rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.7rem', marginBottom: '.6rem' }}>Real screenshots replace previews as modes ship.</h2>
        <p style={{ color: '#6f9b8f', maxWidth: 650, margin: '0 auto 1.3rem', lineHeight: 1.6 }}>
          The page is already structured for authentic mobile and dispatch screenshots so prospects can see exactly what drivers and companies receive before subscribing.
        </p>
        <Link href="/start" style={{ display: 'inline-block', padding: '.75rem 1.25rem', borderRadius: 10, background: '#00e8b0', color: '#04110d', fontWeight: 950, textDecoration: 'none' }}>Set Up Fleet Commander →</Link>
      </section>

      <style>{`@media(max-width:760px){.tour-grid{grid-template-columns:1fr!important}.value-grid{grid-template-columns:1fr!important}}`}</style>
    </main>
  )
}

function ValueList({ title, items }: { title: string; items: string[] }) {
  return <div style={{ padding: '.8rem', borderRadius: 12, background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.06)' }}>
    <div style={{ color: '#b7d9d0', fontSize: '.62rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.45rem' }}>{title} value</div>
    {items.map(item => <div key={item} style={{ color: '#789e94', fontSize: '.73rem', lineHeight: 1.55 }}>✓ {item}</div>)}
  </div>
}

function PreviewFrame({ mode, live }: { mode: string; live: boolean }) {
  return <div style={{ borderRadius: 22, padding: 10, background: '#0c1512', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 16px 40px rgba(0,0,0,.25)' }}>
    <div style={{ borderRadius: 16, minHeight: 330, padding: '1rem', background: '#06100d', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div style={{ color: '#00e8b0', fontSize: '.55rem', fontWeight: 900 }}>FLEET COMMANDER</div><div style={{ fontSize: '.85rem', fontWeight: 900 }}>{mode}</div></div>
        <div style={{ padding: '.25rem .5rem', borderRadius: 8, background: live ? 'rgba(0,232,176,.08)' : 'rgba(245,194,0,.08)', color: live ? '#00e8b0' : '#f5c200', fontSize: '.55rem', fontWeight: 900 }}>{live ? 'LIVE UI PREVIEW' : 'CONCEPT PREVIEW'}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
        <MiniStat label="Shift" value="Running" /><MiniStat label="GPS" value="Active" />
      </div>
      <div style={{ flex: 1, borderRadius: 12, border: '1px solid rgba(0,232,176,.1)', background: 'rgba(0,232,176,.03)', padding: '.9rem' }}>
        <div style={{ color: '#789e94', fontSize: '.6rem', fontWeight: 800, textTransform: 'uppercase' }}>Driver workflow</div>
        <div style={{ marginTop: 8, display: 'grid', gap: 7 }}>
          {['Current activity', 'Next required action', 'Time + mileage evidence', 'Photo / ticket / receipt capture'].map(x => <div key={x} style={{ padding: '.6rem', borderRadius: 9, background: 'rgba(255,255,255,.035)', color: '#b9d8d0', fontSize: '.7rem' }}>{x}</div>)}
        </div>
      </div>
      <div style={{ color: '#53786f', fontSize: '.58rem', textAlign: 'center' }}>{live ? 'Screenshot slot ready for deployed app capture' : 'Coming Soon — final UI may change before release'}</div>
    </div>
  </div>
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: '.65rem', borderRadius: 10, background: 'rgba(255,255,255,.035)' }}><div style={{ color: '#5f857a', fontSize: '.52rem', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div><div style={{ marginTop: 3, fontSize: '.75rem', fontWeight: 900 }}>{value}</div></div>
}
