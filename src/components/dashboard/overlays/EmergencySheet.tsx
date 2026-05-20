'use client'

interface Props {
  open:        boolean
  onClose:     () => void
  loadNumber?: string
}

export default function EmergencySheet({ open, onClose, loadNumber }: Props) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', padding: '1.5rem' }}>
      <div style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--error)', letterSpacing: '.15em', textTransform: 'uppercase', animation: 'pulse 1.5s infinite' }}>⚠️ EMERGENCY PANEL</div>
      <div style={{ fontWeight: 900, fontSize: '1.35rem', color: 'var(--text)' }}>Select Action</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%', maxWidth: 480 }}>
        <a href="tel:911"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 88, borderRadius: 16, background: 'rgba(232,64,0,.15)', border: '2px solid var(--error)', color: 'var(--error)', fontWeight: 900, fontSize: '.95rem', textDecoration: 'none' }}>
          <span style={{ fontSize: '1.75rem' }}>🚨</span>Call 911
        </a>
        <a href="tel:18004267452"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 88, borderRadius: 16, background: 'rgba(74,196,255,.08)', border: '2px solid var(--blue)', color: 'var(--blue)', fontWeight: 900, fontSize: '.95rem', textDecoration: 'none' }}>
          <span style={{ fontSize: '1.75rem' }}>🔧</span>Roadside
        </a>
        <a href="tel:"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 88, borderRadius: 16, background: 'rgba(0,232,176,.07)', border: '2px solid rgba(0,232,176,.4)', color: 'var(--primary)', fontWeight: 900, fontSize: '.95rem', textDecoration: 'none' }}>
          <span style={{ fontSize: '1.75rem' }}>📞</span>Call Broker
        </a>
        <button
          onClick={() => {
            try { localStorage.setItem('3b-incident', JSON.stringify({ reportedAt: new Date().toISOString(), loadNumber: loadNumber ?? '' })) } catch { /* ignore */ }
            onClose()
          }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 88, borderRadius: 16, background: 'rgba(245,194,0,.07)', border: '2px solid rgba(245,194,0,.4)', color: 'var(--warn)', fontWeight: 900, fontSize: '.95rem', cursor: 'pointer' }}>
          <span style={{ fontSize: '1.75rem' }}>📋</span>Log Incident
        </button>
      </div>
      <button onClick={onClose}
        style={{ marginTop: '1rem', padding: '1rem 3rem', borderRadius: 14, border: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', background: 'none', minHeight: 56 }}>
        ✕ Close
      </button>
    </div>
  )
}
