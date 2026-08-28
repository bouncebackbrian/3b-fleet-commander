'use client'

import Link from 'next/link'
import { getModeUi, type FleetPortal } from '@/lib/fleet/mode-ui'

type Props = {
  modeSlug: string
  portal: FleetPortal
}

const panel: React.CSSProperties = {
  border: '1px solid rgba(0,232,176,.13)',
  background: 'rgba(8,26,22,.78)',
  borderRadius: 16,
  padding: '1rem',
}

export default function ModeWorkspace({ modeSlug, portal }: Props) {
  const mode = getModeUi(modeSlug)
  if (!mode) {
    return <div style={{ padding: '2rem', color: 'var(--muted)' }}>Unknown asset operating mode.</div>
  }

  const actions = portal === 'driver' ? mode.driverActions : portal === 'dispatch' ? mode.dispatchActions : mode.adminActions
  const kpis = portal === 'driver' ? mode.driverKpis : portal === 'dispatch' ? mode.dispatchKpis : mode.adminKpis
  const title = portal === 'driver' ? `${mode.name} Driver` : portal === 'dispatch' ? `${mode.name} Dispatch` : `${mode.name} Admin`

  return (
    <main style={{ width: '100%', maxWidth: 1180, margin: '0 auto', padding: '1.25rem', display: 'grid', gap: 16 }}>
      <section style={{ ...panel, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: 'var(--primary)', fontSize: '.65rem', fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>
            Asset-driven workspace
          </div>
          <h1 style={{ margin: '.4rem 0 .35rem', fontSize: 'clamp(1.45rem,4vw,2.25rem)' }}>{mode.icon} {title}</h1>
          <div style={{ color: 'var(--muted)', fontSize: '.8rem', lineHeight: 1.55 }}>
            This layout is selected from the truck / asset operating classification — not the company type.
          </div>
        </div>
        <Link href="/admin/equipment" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '.72rem', fontWeight: 850 }}>
          View company assets →
        </Link>
      </section>

      {portal === 'driver' && (
        <section style={panel}>
          <div style={{ fontSize: '.68rem', color: 'var(--muted)', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '.08em' }}>Driver workflow</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {mode.primaryFlow.map((step, i) => (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ border: '1px solid rgba(0,232,176,.18)', background: 'rgba(0,232,176,.06)', borderRadius: 999, padding: '.45rem .65rem', fontSize: '.7rem', fontWeight: 800 }}>{step}</span>
                {i < mode.primaryFlow.length - 1 && <span style={{ color: 'var(--faint)' }}>→</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
        {kpis.map(kpi => (
          <div key={kpi.label} style={panel}>
            <div style={{ color: 'var(--muted)', fontSize: '.62rem', fontWeight: 850, textTransform: 'uppercase' }}>{kpi.label}</div>
            <div style={{ fontSize: '1.45rem', fontWeight: 950, marginTop: 7 }}>—</div>
            <div style={{ color: 'var(--faint)', fontSize: '.66rem', marginTop: 4 }}>{kpi.hint}</div>
          </div>
        ))}
      </section>

      <section>
        <div style={{ marginBottom: 8, fontWeight: 900 }}>{portal === 'driver' ? 'Driver tools' : portal === 'dispatch' ? 'Dispatch tools' : 'Admin tools'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
          {actions.map(action => (
            <button key={action.label} type="button" style={{ ...panel, color: 'var(--text)', textAlign: 'left', cursor: 'default' }}>
              <div style={{ fontWeight: 900 }}>{action.label}</div>
              <div style={{ color: 'var(--muted)', fontSize: '.72rem', lineHeight: 1.45, marginTop: 5 }}>{action.detail}</div>
            </button>
          ))}
        </div>
      </section>

      <section style={panel}>
        <div style={{ fontWeight: 900 }}>Reports</div>
        <div style={{ color: 'var(--muted)', fontSize: '.75rem', lineHeight: 1.55, marginTop: 5 }}>
          Reports keep the same date-range, export, corrections and evidence pattern across Fleet Commander. KPI fields change automatically for {mode.name} operations.
        </div>
      </section>
    </main>
  )
}
