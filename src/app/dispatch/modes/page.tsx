'use client'

import Link from 'next/link'
import { FLEET_MODES } from '@/lib/fleet/modes'

export default function DispatchModesPage() {
  return (
    <div style={{ maxWidth: 1050, margin: '0 auto', padding: '1.5rem' }}>
      <div style={{ marginBottom: '1.3rem' }}>
        <div style={{ color: 'var(--primary)', fontSize: '.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.12em' }}>Dispatch by operating mode</div>
        <h1 style={{ margin: '.35rem 0 .45rem', fontSize: '1.6rem' }}>Open only the workflow you dispatch.</h1>
        <p style={{ color: 'var(--muted)', maxWidth: 760, lineHeight: 1.6, fontSize: '.84rem' }}>
          Each Fleet Commander operating mode has its own driver and dispatch experience. Dispatchers should see the trucks, jobs, exceptions, evidence and profitability signals that belong to the mode they are assigned to — not unrelated fleet tools.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 12 }}>
        {FLEET_MODES.map(mode => {
          const available = mode.status === 'live' && !!mode.dispatchHref
          return (
            <div key={mode.id} style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 15, padding: '1rem', opacity: available ? 1 : .64 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.6rem' }}>{mode.icon}</span>
                <span style={{ color: available ? 'var(--primary)' : 'var(--warn)', fontSize: '.58rem', fontWeight: 900, textTransform: 'uppercase' }}>
                  {available ? 'Live' : 'Coming Soon'}
                </span>
              </div>
              <div style={{ marginTop: 7, fontWeight: 900 }}>{mode.name} Dispatch</div>
              <p style={{ color: 'var(--muted)', fontSize: '.72rem', lineHeight: 1.5, minHeight: 44 }}>{mode.summary}</p>
              {available ? (
                <Link href={mode.dispatchHref!} style={{ display: 'inline-block', marginTop: 4, color: 'var(--primary)', fontSize: '.75rem', fontWeight: 850, textDecoration: 'none' }}>
                  Open {mode.name} Dispatch →
                </Link>
              ) : (
                <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: '.7rem' }}>Dispatch flow releases with this operating mode.</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
