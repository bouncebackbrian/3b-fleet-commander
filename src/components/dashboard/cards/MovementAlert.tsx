'use client'

interface Props {
  speedMph:    number | null
  hosStatus:   string | null      // e.g. "Driving", "On Duty", "Off Duty", null
  onDismiss:   () => void
}

export default function MovementAlert({ speedMph, hosStatus, onDismiss }: Props) {
  const isDriving = hosStatus === 'Driving' || hosStatus === 'driving'
  const speed     = speedMph ?? 0

  // ── Two modes ──────────────────────────────────────────────────────────────
  // 1. HOS mismatch (not marked Driving while moving) → amber warning
  // 2. Already marked Driving → soft green confirm banner

  if (isDriving) {
    // Soft confirmation — already correct HOS status
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500,
        padding: '.75rem 1rem',
        background: 'rgba(0,232,176,.12)',
        borderBottom: '2px solid rgba(0,232,176,.3)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.3rem' }}>🚛</span>
          <div>
            <div style={{ fontWeight: 900, fontSize: '.92rem', color: 'var(--primary)', lineHeight: 1.2 }}>
              Rolling — stay focused
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--primary)', opacity: .8, marginTop: 1 }}>
              {speed} mph · HOS: Driving ✓
            </div>
          </div>
        </div>
        <button onClick={onDismiss} style={{
          padding: '.4rem .9rem', borderRadius: 8, border: '1px solid rgba(0,232,176,.4)',
          background: 'rgba(0,232,176,.15)', color: 'var(--primary)',
          fontWeight: 800, fontSize: '.78rem', cursor: 'pointer', flexShrink: 0,
        }}>
          Got it
        </button>
      </div>
    )
  }

  // ── HOS mismatch warning ────────────────────────────────────────────────────
  const statusDisplay = hosStatus ? `HOS: ${hosStatus}` : 'HOS not set'

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500,
      padding: '.8rem 1rem',
      background: 'rgba(245,194,0,.13)',
      borderBottom: '2px solid rgba(245,194,0,.45)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>⚠️</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 900, fontSize: '.92rem', color: '#f5c200', lineHeight: 1.2 }}>
          Movement detected — update HOS
        </div>
        <div style={{ fontSize: '.72rem', color: '#f5c200', opacity: .9, marginTop: 1 }}>
          {speed} mph · {statusDisplay} — switch ELD to Driving
        </div>
      </div>

      <button onClick={onDismiss} style={{
        padding: '.45rem .9rem', borderRadius: 8,
        border: '1px solid rgba(245,194,0,.5)',
        background: 'rgba(245,194,0,.18)',
        color: '#f5c200', fontWeight: 800, fontSize: '.78rem',
        cursor: 'pointer', flexShrink: 0,
      }}>
        Got it
      </button>
    </div>
  )
}
