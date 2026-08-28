'use client'

import Link from 'next/link'
import DriverDrivingSurface from '@/components/fleet/DriverDrivingSurface'
import { getModeUi, type FleetPortal } from '@/lib/fleet/mode-ui'

type Props = { modeSlug: string; portal: FleetPortal }

const panel: React.CSSProperties = {
  border: '1px solid rgba(0,232,176,.13)',
  background: 'rgba(8,26,22,.78)',
  borderRadius: 16,
  padding: '1rem',
}

export default function ModeWorkspace({ modeSlug, portal }: Props) {
  const mode = getModeUi(modeSlug)
  if (!mode) return <div style={{ padding: '2rem', color: 'var(--muted)' }}>Unknown asset operating mode.</div>

  // Driving-mode workspaces belong to Driver only. Dispatch/Admin mode URLs
  // redirect to their standard dashboards before reaching this component.
  if (portal !== 'driver') {
    return <div style={{ padding: '2rem', color: 'var(--muted)' }}>This operating-mode workspace is Driver-only.</div>
  }

  return (
    <main style={{ width: '100%', maxWidth: 1180, margin: '0 auto', padding: '1.1rem', display: 'grid', gap: 14 }}>
      <section style={{ ...panel, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: 'var(--primary)', fontSize: '.62rem', fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>Driver · Asset Workflow</div>
          <h1 style={{ margin: '.35rem 0 .3rem', fontSize: 'clamp(1.45rem,4vw,2.2rem)' }}>{mode.icon} {mode.name} Driver</h1>
          <div style={{ color: 'var(--muted)', fontSize: '.76rem', lineHeight: 1.5 }}>The assigned asset selects this workflow automatically.</div>
        </div>
        <Link href="/kpis?lens=driver" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '.7rem', fontWeight: 850 }}>My {mode.name} KPIs →</Link>
      </section>

      <DriverDrivingSurface mode={mode} />

      <section style={panel}>
        <div style={{ fontSize: '.64rem', color: 'var(--muted)', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '.08em' }}>Work sequence</div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 9 }}>
          {mode.primaryFlow.map((step, i) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ border: '1px solid rgba(0,232,176,.18)', background: 'rgba(0,232,176,.06)', borderRadius: 999, padding: '.42rem .62rem', fontSize: '.66rem', fontWeight: 800 }}>{step}</span>
              {i < mode.primaryFlow.length - 1 && <span style={{ color: 'var(--faint)' }}>→</span>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div style={{ marginBottom: 8, fontWeight: 900 }}>Stopped / parked tools</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 9 }}>
          {mode.driverActions.map(action => (
            <div key={action.label} style={{ ...panel, color: 'var(--text)' }}>
              <div style={{ fontWeight: 900 }}>{action.label}</div>
              <div style={{ color: 'var(--muted)', fontSize: '.7rem', lineHeight: 1.45, marginTop: 5 }}>{action.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...panel, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 900 }}>Driver records</div>
          <div style={{ color: 'var(--muted)', fontSize: '.7rem', marginTop: 4 }}>Hours, compliance, expenses, KPIs and reports stay in the shared sidebar tabs.</div>
        </div>
        <Link href="/driver/reports" style={{ color: 'var(--primary)', fontSize: '.7rem', fontWeight: 850, textDecoration: 'none' }}>Open Reports →</Link>
      </section>
    </main>
  )
}
