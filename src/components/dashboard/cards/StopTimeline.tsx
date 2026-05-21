'use client'
import type { MissionStop, StopType } from '@/lib/dashboard/types'

const STOP_META: Record<StopType, { emoji: string; label: string; color: string }> = {
  pickup:   { emoji: '📦', label: 'Pickup',   color: 'var(--primary)' },
  delivery: { emoji: '🏪', label: 'Delivery', color: '#4ac4ff'        },
  relay:    { emoji: '🔄', label: 'Relay',    color: 'var(--warn)'    },
  fuel:     { emoji: '⛽', label: 'Fuel',     color: 'var(--warn)'    },
  yard:     { emoji: '🏠', label: 'Yard',     color: 'var(--muted)'   },
  rest:     { emoji: '🛏️', label: 'Rest',     color: 'var(--muted)'   },
  scale:    { emoji: '⚖️',  label: 'Scale',    color: '#6c9bd2'        },
  repair:   { emoji: '🔧', label: 'Repair',   color: 'var(--error)'   },
  washout:  { emoji: '🚿', label: 'Washout',  color: '#6c9bd2'        },
  other:    { emoji: '📍', label: 'Other',    color: 'var(--muted)'   },
}

function fmtAppt(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) + ' · ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  } catch { return iso }
}

interface Props {
  stops:        MissionStop[]
  onComplete?:  (stopId: string) => void
  onUndo?:      (stopId: string) => void
  onAddStop?:   () => void
  compact?:     boolean
}

export default function StopTimeline({ stops, onComplete, onUndo, onAddStop, compact = false }: Props) {
  if (!stops.length) return null

  const sorted       = [...stops].sort((a, b) => a.sequence - b.sequence)
  const currentIndex = sorted.findIndex(s => !s.completed)
  const doneCount    = sorted.filter(s => s.completed).length

  return (
    <div style={{ display: 'grid', gap: 0 }}>
      {/* Progress header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 'var(--cc-meta)', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          Mission Timeline
        </span>
        <span style={{ fontSize: 'var(--cc-meta)', fontWeight: 700, color: currentIndex === -1 ? 'var(--success)' : 'var(--primary)' }}>
          {currentIndex === -1 ? '✅ All stops complete' : `Stop ${doneCount + 1} of ${sorted.length}`}
        </span>
      </div>

      {/* Stop list */}
      <div style={{ position: 'relative' }}>
        {/* Connector line — extend a bit further when Add Stop button follows */}
        {sorted.length > 1 && (
          <div style={{ position: 'absolute', left: 13, top: 26, bottom: onAddStop ? 0 : 26, width: 2, background: 'var(--border)', zIndex: 0 }} />
        )}

        {sorted.map((stop, i) => {
          const meta      = STOP_META[stop.type]
          const isDone    = stop.completed === true
          const isCurrent = !isDone && i === currentIndex
          const isNext    = !isDone && i === currentIndex + 1

          return (
            <div key={stop.id} style={{
              position: 'relative', zIndex: 1,
              display: 'flex', gap: 10, alignItems: 'flex-start',
              padding: compact ? '.45rem 0' : '.55rem 0',
              opacity: isDone ? .65 : 1,
            }}>
              {/* Node */}
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDone
                  ? 'rgba(40,192,72,.15)'
                  : isCurrent
                    ? 'rgba(0,232,176,.15)'
                    : 'var(--surface-2)',
                border: isDone
                  ? '2px solid rgba(40,192,72,.4)'
                  : isCurrent
                    ? `2px solid var(--primary)`
                    : '2px solid var(--border)',
                fontSize: '.75rem',
                boxShadow: isCurrent ? '0 0 8px rgba(0,232,176,.3)' : 'none',
              }}>
                {isDone ? '✓' : meta.emoji}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0, paddingBottom: i < sorted.length - 1 ? 4 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {/* Type label */}
                  <span style={{
                    fontSize: 'var(--cc-meta)', fontWeight: 800, textTransform: 'uppercase',
                    letterSpacing: '.06em', color: isDone ? 'var(--muted)' : meta.color,
                  }}>
                    {meta.label}
                  </span>
                  {isCurrent && (
                    <span style={{ fontSize: '.58rem', fontWeight: 800, padding: '.1rem .4rem', borderRadius: 4, background: 'rgba(0,232,176,.12)', color: 'var(--primary)', border: '1px solid rgba(0,232,176,.25)' }}>
                      CURRENT
                    </span>
                  )}
                  {isNext && (
                    <span style={{ fontSize: '.58rem', fontWeight: 700, padding: '.1rem .4rem', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                      NEXT
                    </span>
                  )}
                </div>

                {/* Name */}
                <div style={{ fontWeight: 700, fontSize: 'var(--cc-label)', color: isDone ? 'var(--muted)' : 'var(--text)', marginTop: 1, lineHeight: 1.3 }}>
                  {stop.name || `Stop ${stop.sequence}`}
                </div>

                {/* Address */}
                {(stop.city || stop.address) && (
                  <div style={{ fontSize: 'var(--cc-meta)', color: 'var(--muted)', marginTop: 1 }}>
                    {stop.address ? `${stop.address}, ` : ''}{stop.city}{stop.state ? `, ${stop.state}` : ''}
                  </div>
                )}

                {/* Appointment + reference row */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                  {stop.appointmentStart && (
                    <span style={{ fontSize: 'var(--cc-meta)', fontWeight: 700, color: isDone ? 'var(--muted)' : isCurrent ? 'var(--warn)' : 'var(--muted)' }}>
                      🕐 {fmtAppt(stop.appointmentStart)}
                    </span>
                  )}
                  {stop.reference && (
                    <span style={{ fontSize: 'var(--cc-meta)', color: 'var(--muted)', fontWeight: 600 }}>
                      REF: {stop.reference}
                    </span>
                  )}
                </div>

                {/* Notes */}
                {stop.notes && !compact && (
                  <div style={{ fontSize: 'var(--cc-meta)', color: 'var(--muted)', marginTop: 2, fontStyle: 'italic' }}>
                    {stop.notes}
                  </div>
                )}

                {/* Action buttons */}
                {!compact && (onComplete || onUndo) && (
                  <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                    {!isDone && onComplete && (
                      <button onClick={() => onComplete(stop.id)} style={{
                        fontSize: '.65rem', fontWeight: 800, padding: '.28rem .65rem', borderRadius: 6,
                        border: '1px solid rgba(40,192,72,.3)', background: 'rgba(40,192,72,.08)',
                        color: 'var(--success)', cursor: 'pointer',
                      }}>
                        ✅ Mark Done
                      </button>
                    )}
                    {isDone && onUndo && (
                      <button onClick={() => onUndo(stop.id)} style={{
                        fontSize: '.62rem', fontWeight: 700, padding: '.22rem .55rem', borderRadius: 6,
                        border: '1px solid var(--border)', background: 'none',
                        color: 'var(--muted)', cursor: 'pointer',
                      }}>
                        ↩ Undo
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Add Stop — shown when handler is provided and not compact */}
        {!compact && onAddStop && (
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 10, alignItems: 'center', paddingTop: '.6rem' }}>
            {/* Dashed circle node */}
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px dashed var(--border)', background: 'none', fontSize: '.75rem', color: 'var(--muted)',
            }}>
              +
            </div>
            <button
              onClick={onAddStop}
              style={{
                fontSize: '.75rem', fontWeight: 800, padding: '.3rem .8rem', borderRadius: 7,
                border: '1px dashed rgba(0,232,176,.4)', background: 'rgba(0,232,176,.05)',
                color: 'var(--primary)', cursor: 'pointer',
              }}
            >
              + Add Stop
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
