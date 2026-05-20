'use client'

interface Props {
  open:        boolean
  breakSecs:   number
  BREAK_TARGET: number
  fmtBreak:    (s: number) => string
  onEnd:       () => void
  onMinimize:  () => void
}

export default function BreakTimerModal({ open, breakSecs, BREAK_TARGET, fmtBreak, onEnd, onMinimize }: Props) {
  if (!open) return null
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,13,11,.75)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 201, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: '2rem 2.5rem', width: 'min(440px,calc(100vw - 2rem))', display: 'grid', gap: '1.25rem', textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--warn)', letterSpacing: '.12em', textTransform: 'uppercase' }}>☕ BREAK IN PROGRESS</div>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: 'clamp(3rem,10vw,4rem)', color: breakSecs >= BREAK_TARGET ? 'var(--success)' : 'var(--warn)', letterSpacing: '-.02em', lineHeight: 1 }}>
          {fmtBreak(breakSecs)}
        </div>
        {breakSecs < BREAK_TARGET ? (
          <div style={{ fontSize: '.85rem', color: 'var(--muted)', fontWeight: 600 }}>
            {fmtBreak(BREAK_TARGET - breakSecs)} until 30-min DOT break complete
          </div>
        ) : (
          <div style={{ padding: '.5rem 1rem', borderRadius: 10, background: 'rgba(40,192,72,.12)', border: '1px solid rgba(40,192,72,.25)', fontSize: '.9rem', color: 'var(--success)', fontWeight: 800 }}>
            ✅ 30-min DOT break satisfied — safe to drive
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: '.25rem' }}>
          <button onClick={onEnd}
            style={{ padding: '1rem', borderRadius: 12, border: 'none', background: 'rgba(232,64,0,.12)', color: 'var(--error)', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', minHeight: 56 }}>
            🛑 End Break
          </button>
          <button onClick={onMinimize}
            style={{ padding: '1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', minHeight: 56 }}>
            Minimize
          </button>
        </div>
      </div>
    </>
  )
}
