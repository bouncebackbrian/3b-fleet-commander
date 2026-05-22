'use client'
/**
 * ResetPanel — Bottom sheet for HOS rest / reset management.
 * Shows active countdown or presents reset type options.
 */
import type { ResetType } from '@/lib/dashboard/types'
import type { useResetEngine } from '@/hooks/useResetEngine'

type ResetEngineReturn = ReturnType<typeof useResetEngine>

interface Props extends Pick<ResetEngineReturn,
  | 'resetActive' | 'activeReset' | 'resetType'
  | 'elapsedSecs' | 'remainingSecs' | 'targetSecs' | 'progress' | 'isComplete'
  | 'startReset' | 'endReset' | 'fmt'
  | 'RESET_LABELS' | 'RESET_EMOJIS' | 'RESET_TARGETS'
> {
  open:    boolean
  onClose: () => void
}

const RESET_TYPES: ResetType[] = ['30_min_break', '10_hour_reset', '34_hour_restart']

const RESET_DESCRIPTIONS: Record<ResetType, string> = {
  '30_min_break':    'Required after 8h of driving. Logs a 30-min off-duty break.',
  '10_hour_reset':   'Off-duty / sleeper reset. Resets 11h drive + 14h shift window.',
  '34_hour_restart': 'Full cycle restart. Resets 70-hour / 8-day cycle.',
  'custom':          'Custom rest duration.',
}

const RING_SIZE = 120

function ProgressRing({ progress, color, size = RING_SIZE }: { progress: number; color: string; size?: number }) {
  const r   = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const dash = circ * progress
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={8} />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .5s linear' }}
      />
    </svg>
  )
}

export default function ResetPanel({
  open, onClose,
  resetActive, activeReset, resetType,
  elapsedSecs, remainingSecs, targetSecs, progress, isComplete,
  startReset, endReset, fmt,
  RESET_LABELS, RESET_EMOJIS, RESET_TARGETS,
}: Props) {
  if (!open) return null

  const ringColor = isComplete
    ? 'var(--success)'
    : remainingSecs < 300
    ? 'var(--warn)'
    : 'var(--primary)'

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 300 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
        background: 'var(--surface)', borderRadius: '18px 18px 0 0',
        padding: '1.5rem 1.25rem 2.5rem',
        boxShadow: '0 -4px 30px rgba(0,0,0,.35)',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 1.25rem' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>🛌 Rest &amp; Reset</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: 'var(--muted)', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* ── Active reset countdown ── */}
        {resetActive && activeReset && resetType ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            {/* Progress ring */}
            <div style={{ position: 'relative', width: RING_SIZE, height: RING_SIZE }}>
              <ProgressRing progress={progress} color={ringColor} />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ fontSize: '1.8rem', lineHeight: 1 }}>{RESET_EMOJIS[resetType]}</div>
                <div style={{ fontSize: '.68rem', fontWeight: 800, color: ringColor, marginTop: 2, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {isComplete ? 'Done!' : 'Remaining'}
                </div>
              </div>
            </div>

            {/* Time display */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontVariantNumeric: 'tabular-nums', fontWeight: 900,
                fontSize: 'clamp(2rem, 8vw, 2.8rem)', lineHeight: 1,
                color: ringColor, letterSpacing: '-.02em',
              }}>
                {isComplete ? '✓ Done' : fmt(remainingSecs)}
              </div>
              <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 4, fontWeight: 600 }}>
                {RESET_LABELS[resetType]} · {fmt(elapsedSecs)} elapsed
              </div>
              {activeReset.locationName && (
                <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 3 }}>
                  📍 {activeReset.locationName}{activeReset.city ? `, ${activeReset.city}` : ''}{activeReset.state ? ` ${activeReset.state}` : ''}
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ width: '100%', height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${progress * 100}%`, height: '100%', background: ringColor, borderRadius: 4, transition: 'width .5s linear' }} />
            </div>

            {/* Info bar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
              {[
                ['Target', fmt(targetSecs)],
                ['Elapsed', fmt(elapsedSecs)],
              ].map(([label, value]) => (
                <div key={label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '.6rem .8rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              {isComplete ? (
                <button
                  onClick={() => endReset(false)}
                  style={{ flex: 1, padding: '1rem', borderRadius: 14, background: 'var(--success)', border: 'none', color: '#fff', fontWeight: 900, fontSize: '1rem', cursor: 'pointer' }}
                >
                  ✅ Close &amp; Log Reset
                </button>
              ) : (
                <>
                  <button
                    onClick={() => endReset(true)}
                    style={{ flex: 1, padding: '1rem', borderRadius: 14, background: 'rgba(232,64,0,.1)', border: '1px solid rgba(232,64,0,.3)', color: 'var(--error)', fontWeight: 800, fontSize: '.95rem', cursor: 'pointer' }}
                  >
                    ⏹ End Early
                  </button>
                  <button
                    onClick={onClose}
                    style={{ flex: 2, padding: '1rem', borderRadius: 14, background: 'var(--primary)', border: 'none', color: '#061210', fontWeight: 900, fontSize: '1rem', cursor: 'pointer' }}
                  >
                    🛌 Continue Resting
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          /* ── Start a new reset ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            <div style={{ fontSize: '.75rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '.25rem' }}>
              Select rest type to start timer and log the event.
            </div>
            {RESET_TYPES.map(type => (
              <button
                key={type}
                onClick={() => startReset(type)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '1rem 1.1rem', borderRadius: 14,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                  transition: 'border-color .15s',
                }}
              >
                <span style={{ fontSize: '1.8rem', lineHeight: 1, flexShrink: 0 }}>{RESET_EMOJIS[type]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 2 }}>
                    {RESET_LABELS[type]}
                    <span style={{ marginLeft: 8, fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600 }}>
                      {RESET_TARGETS[type]} min
                    </span>
                  </div>
                  <div style={{ fontSize: '.75rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                    {RESET_DESCRIPTIONS[type]}
                  </div>
                </div>
                <span style={{ fontSize: '1.1rem', color: 'var(--muted)', flexShrink: 0 }}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
