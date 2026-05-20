'use client'

interface Props {
  operationalAlerts: { high: string[]; low: string[] }
  onOpenHos:         () => void
}

export default function AlertsCard({ operationalAlerts, onOpenHos }: Props) {
  const { high, low } = operationalAlerts
  if (high.length === 0 && low.length === 0) return null

  return (
    <div className="cc-card" style={{
      border:     `1px solid ${high.length > 0 ? 'rgba(232,64,0,.3)' : 'rgba(245,194,0,.25)'}`,
      background:  high.length > 0 ? 'rgba(232,64,0,.04)' : 'rgba(245,194,0,.03)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '.65rem' }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background:  high.length > 0 ? 'var(--error)' : 'var(--warn)',
          boxShadow:   high.length > 0 ? '0 0 8px var(--error)' : '0 0 6px var(--warn)',
          animation: 'pulse 1.5s infinite', flexShrink: 0,
        }} />
        <span style={{ fontWeight: 800, fontSize: '1rem', color: high.length > 0 ? 'var(--error)' : 'var(--warn)' }}>
          {high.length > 0 ? `${high.length} Active Alert${high.length > 1 ? 's' : ''}` : 'Advisory'}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 5 }}>
        {high.map((msg, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '.5rem .75rem', borderRadius: 9, background: 'rgba(232,64,0,.08)', border: '1px solid rgba(232,64,0,.2)', fontSize: '.82rem', color: 'var(--error)', fontWeight: 700, lineHeight: 1.45 }}>
            {msg}
          </div>
        ))}
        {low.map((msg, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '.45rem .7rem', borderRadius: 9, background: 'rgba(245,194,0,.06)', border: '1px solid rgba(245,194,0,.18)', fontSize: '.78rem', color: 'var(--warn)', fontWeight: 600, lineHeight: 1.45 }}>
            {msg}
          </div>
        ))}
      </div>
      {high.some(a => a.includes('HOS')) && (
        <button onClick={onOpenHos}
          style={{ marginTop: '.65rem', width: '100%', padding: '.55rem', borderRadius: 9, border: '1px solid rgba(232,64,0,.25)', background: 'rgba(232,64,0,.07)', color: 'var(--error)', fontWeight: 700, fontSize: '.8rem', cursor: 'pointer', minHeight: 40 }}>
          ⏱ Open HOS Detail →
        </button>
      )}
    </div>
  )
}
