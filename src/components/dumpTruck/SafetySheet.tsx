'use client'
import Sheet from './Sheet'

/** Small, secondary safety/emergency panel — reachable everywhere via a
 *  compact icon in TopStatusBar, not a giant permanent top-level button
 *  competing with the primary shift action. */

interface Props {
  onClose: () => void
  onReportIncident: () => void
  onTruckProblem: () => void
}

export default function SafetySheet({ onClose, onReportIncident, onTruckProblem }: Props) {
  return (
    <Sheet title="Safety / Emergency" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <a
          href="tel:911"
          style={{
            display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.9rem 1rem', borderRadius: 12,
            background: 'rgba(220,38,38,.1)', border: '1px solid var(--error)', color: 'var(--error)',
            fontWeight: 900, fontSize: '1rem', textDecoration: 'none',
          }}
        >
          🚑 Call 911
        </a>
        <button
          onClick={onTruckProblem}
          style={{
            display: 'flex', alignItems: 'center', gap: '.75rem', textAlign: 'left', padding: '.85rem .9rem',
            borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 800,
          }}
        >
          🚨 Truck Problem / Breakdown
        </button>
        <button
          onClick={onReportIncident}
          style={{
            display: 'flex', alignItems: 'center', gap: '.75rem', textAlign: 'left', padding: '.85rem .9rem',
            borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 800,
          }}
        >
          ⚠️ Report Incident
        </button>
        <div style={{ fontSize: '.72rem', color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>
          In an emergency, always call 911 first.
        </div>
      </div>
    </Sheet>
  )
}
