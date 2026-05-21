'use client'
import { useState, useEffect } from 'react'
import type { MissionStop, StopType } from '@/lib/dashboard/types'
import DetentionClock from '@/components/dashboard/clocks/DetentionClock'

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

// ── Live-ticking "now" for appointment urgency chips ─────────────────────────
// Tick every 30s — enough granularity for minute-level appointment warnings.
function useLiveMinute(): number {
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return tick
}

// ── Per-stop appointment urgency chip ────────────────────────────────────────
// Returns null when appointment is far out (> 2h) or stop is already done.
function ApptUrgencyChip({ iso, isDone }: { iso: string; isDone: boolean }) {
  const now = useLiveMinute()
  if (isDone) return null

  const apptMs = new Date(iso).getTime()
  if (isNaN(apptMs)) return null
  const mins = Math.round((apptMs - now) / 60000)

  // Only show chip within 2 hours or if overdue
  if (mins > 120) return null

  const abs  = Math.abs(mins)
  const hStr = Math.floor(abs / 60)
  const mStr = abs % 60
  const timeStr = hStr > 0
    ? (mStr > 0 ? `${hStr}h ${mStr}m` : `${hStr}h`)
    : `${mStr}m`

  const isOverdue = mins < 0
  const isUrgent  = mins >= 0 && mins < 20
  const isWarn    = mins >= 20 && mins < 60

  const bg     = isOverdue || isUrgent ? 'rgba(232,64,0,.12)'    : isWarn ? 'rgba(245,194,0,.1)'   : 'rgba(0,232,176,.08)'
  const border = isOverdue || isUrgent ? 'rgba(232,64,0,.3)'     : isWarn ? 'rgba(245,194,0,.25)'  : 'rgba(0,232,176,.2)'
  const color  = isOverdue || isUrgent ? 'var(--error)'          : isWarn ? 'var(--warn)'          : 'var(--primary)'
  const label  = isOverdue
    ? `OVERDUE +${timeStr}`
    : isUrgent
      ? `${timeStr} left`
      : `in ${timeStr}`

  return (
    <span style={{
      fontSize: '.58rem', fontWeight: 800, padding: '.1rem .4rem',
      borderRadius: 4, background: bg, color, border: `1px solid ${border}`,
      letterSpacing: '.04em', whiteSpace: 'nowrap',
      animation: (isOverdue || isUrgent) ? 'apptPulse 2s ease-in-out infinite' : undefined,
    }}>
      ⏰ {label}
    </span>
  )
}

interface Props {
  stops:        MissionStop[]
  onComplete?:  (stopId: string) => void
  onUndo?:      (stopId: string) => void
  onAddStop?:   () => void
  onTapStop?:   (stop: MissionStop) => void   // opens StopLifecyclePanel
  compact?:     boolean
}

export default function StopTimeline({ stops, onComplete, onUndo, onAddStop, onTapStop, compact = false }: Props) {
  if (!stops.length) return null

  const sorted       = [...stops].sort((a, b) => a.sequence - b.sequence)
  const currentIndex = sorted.findIndex(s => !s.completed)
  const doneCount    = sorted.filter(s => s.completed).length

  return (
    <div style={{ display: 'grid', gap: 0 }}>
      <style>{`
        @keyframes apptPulse {
          0%,100% { opacity: 1 }
          50%      { opacity: .55 }
        }
      `}</style>
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

          const hasClock = !compact && stop.lifecycleTimestamps?.arrived && stop.lifecycleStatus !== 'departed'

          return (
            <div
              key={stop.id}
              onClick={onTapStop ? () => onTapStop(stop) : undefined}
              style={{
                position: 'relative', zIndex: 1,
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: compact ? '.45rem 0' : '.55rem 0',
                opacity: isDone ? .65 : 1,
                cursor: onTapStop ? 'pointer' : undefined,
                borderRadius: onTapStop ? 8 : undefined,
              }}
            >
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
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2, alignItems: 'center' }}>
                  {stop.appointmentStart && (
                    <span style={{ fontSize: 'var(--cc-meta)', fontWeight: 700, color: isDone ? 'var(--muted)' : isCurrent ? 'var(--warn)' : 'var(--muted)' }}>
                      🕐 {fmtAppt(stop.appointmentStart)}
                    </span>
                  )}
                  {stop.appointmentStart && (
                    <ApptUrgencyChip iso={stop.appointmentStart} isDone={isDone} />
                  )}
                  {stop.reference && (
                    <span style={{ fontSize: 'var(--cc-meta)', color: 'var(--muted)', fontWeight: 600 }}>
                      REF: {stop.reference}
                    </span>
                  )}
                </div>

                {/* Lifecycle status chip */}
                {stop.lifecycleStatus && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '.58rem', fontWeight: 800, padding: '.1rem .4rem', borderRadius: 4,
                      background: stop.lifecycleStatus === 'departed'
                        ? 'rgba(40,192,72,.12)'
                        : 'rgba(0,232,176,.1)',
                      color: stop.lifecycleStatus === 'departed'
                        ? 'var(--success)'
                        : 'var(--primary)',
                      border: stop.lifecycleStatus === 'departed'
                        ? '1px solid rgba(40,192,72,.3)'
                        : '1px solid rgba(0,232,176,.25)',
                      textTransform: 'uppercase', letterSpacing: '.05em',
                    }}>
                      {stop.lifecycleStatus.replace('_', ' ')}
                    </span>
                    {/* Compact detention badge — shown while at facility */}
                    {stop.lifecycleTimestamps?.arrived && stop.lifecycleStatus !== 'departed' && (
                      <DetentionClock
                        arrivedAt={stop.lifecycleTimestamps.arrived}
                        departedAt={stop.lifecycleTimestamps.departed}
                        freeMinutes={stop.detentionSummary?.freeMinutes ?? 120}
                        ratePerHour={stop.detentionSummary?.ratePerHour ?? 50}
                        compact
                      />
                    )}
                    {/* Final detention amount on departed stops */}
                    {stop.lifecycleStatus === 'departed' && stop.detentionSummary && stop.detentionSummary.detentionMinutes > 0 && (
                      <span style={{ fontSize: '.58rem', fontWeight: 800, padding: '.1rem .4rem', borderRadius: 4, background: 'rgba(232,64,0,.1)', color: 'var(--error)', border: '1px solid rgba(232,64,0,.2)' }}>
                        ⏱ {stop.detentionSummary.detentionMinutes}m · ${stop.detentionSummary.detentionAmount.toFixed(2)}
                      </span>
                    )}
                  </div>
                )}

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
