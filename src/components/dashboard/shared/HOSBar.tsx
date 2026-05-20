'use client'

interface Props {
  label: string
  used:  number
  total: number
  color: string
}

export default function HOSBar({ label, used, total, color }: Props) {
  const pct = Math.min(100, (used / total) * 100)
  const rem = Math.max(0, total - used)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: '.72rem', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
          {rem.toFixed(1)}h left
        </span>
      </div>
      <div style={{ height: 8, background: 'var(--surface-off)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color, borderRadius: 4,
          transition: 'width .5s ease',
          boxShadow: pct > 85 ? `0 0 8px ${color}` : 'none',
        }} />
      </div>
    </div>
  )
}
