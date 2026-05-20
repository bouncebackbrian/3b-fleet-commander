'use client'

interface Props {
  open:               boolean
  onClose:            () => void
  missionDestination: string
  onMarkArrived:      () => void
  onStartBreak:       () => void
}

export default function VoicePanel({ open, onClose, missionDestination, onMarkArrived, onStartBreak }: Props) {
  if (!open) return null
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,13,11,.7)' }} onClick={onClose} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, background: 'var(--surface)', borderTop: '2px solid rgba(0,232,176,.15)', borderRadius: '20px 20px 0 0', padding: '1.5rem 1.5rem 2.5rem', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>🎙 Quick Actions</div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>One-tap operational commands</div>
          </div>
          <button onClick={onClose} style={{ padding: '.4rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <a href="tel:"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 80, borderRadius: 14, background: 'rgba(74,196,255,.07)', border: '1px solid rgba(74,196,255,.25)', color: 'var(--blue)', fontWeight: 800, fontSize: '.9rem', textDecoration: 'none' }}>
            <span style={{ fontSize: '1.5rem' }}>📞</span>Call Dispatch
          </a>
          <a href={`https://maps.apple.com/?daddr=${encodeURIComponent(missionDestination)}`} target="_blank" rel="noreferrer"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 80, borderRadius: 14, background: 'rgba(0,232,176,.07)', border: '1px solid rgba(0,232,176,.25)', color: 'var(--primary)', fontWeight: 800, fontSize: '.9rem', textDecoration: 'none' }}>
            <span style={{ fontSize: '1.5rem' }}>🗺</span>Navigate
          </a>
          <button onClick={onMarkArrived}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 80, borderRadius: 14, background: 'rgba(40,192,72,.07)', border: '1px solid rgba(40,192,72,.25)', color: 'var(--success)', fontWeight: 800, fontSize: '.9rem', cursor: 'pointer' }}>
            <span style={{ fontSize: '1.5rem' }}>✅</span>Mark Arrived
          </button>
          <button onClick={() => { onClose(); onStartBreak() }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 80, borderRadius: 14, background: 'rgba(245,194,0,.07)', border: '1px solid rgba(245,194,0,.25)', color: 'var(--warn)', fontWeight: 800, fontSize: '.9rem', cursor: 'pointer' }}>
            <span style={{ fontSize: '1.5rem' }}>☕</span>Start Break
          </button>
        </div>
      </div>
    </>
  )
}
