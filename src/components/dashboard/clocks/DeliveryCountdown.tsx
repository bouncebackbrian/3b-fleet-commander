'use client'
import { useState, useEffect } from 'react'
import type { MissionStop } from '@/lib/dashboard/types'

// ── Thresholds (minutes) ──────────────────────────────────────────────────────
const SHOW_THRESHOLD_MIN  = 120  // start showing banner at 2 hours out
const WARN_THRESHOLD_MIN  = 60   // amber at 1 hour
const URGENT_THRESHOLD_MIN = 20  // red at 20 min

// ── Urgency tier ──────────────────────────────────────────────────────────────
type Urgency = 'upcoming' | 'warning' | 'urgent' | 'overdue'

function urgencyOf(minsRemaining: number): Urgency {
  if (minsRemaining < 0)                   return 'overdue'
  if (minsRemaining < URGENT_THRESHOLD_MIN) return 'urgent'
  if (minsRemaining < WARN_THRESHOLD_MIN)   return 'warning'
  return 'upcoming'
}

const URGENCY_STYLE: Record<Urgency, {
  bg: string; border: string; color: string; label: string; pulse: boolean
}> = {
  upcoming: { bg: 'rgba(0,232,176,.07)',  border: 'rgba(0,232,176,.25)',  color: 'var(--primary)',  label: 'UPCOMING',  pulse: false },
  warning:  { bg: 'rgba(245,194,0,.09)', border: 'rgba(245,194,0,.3)',   color: 'var(--warn)',     label: 'SOON',      pulse: false },
  urgent:   { bg: 'rgba(232,64,0,.09)',  border: 'rgba(232,64,0,.35)',   color: 'var(--error)',    label: 'IMMINENT',  pulse: true  },
  overdue:  { bg: 'rgba(232,64,0,.12)',  border: 'rgba(232,64,0,.4)',    color: 'var(--error)',    label: 'OVERDUE',   pulse: true  },
}

const STOP_TYPE_EMOJI: Partial<Record<string, string>> = {
  delivery: '🏪',
  pickup:   '📦',
  relay:    '🔄',
  fuel:     '⛽',
  scale:    '⚖️',
  rest:     '🛏️',
  other:    '📍',
}

// ── Format countdown string ───────────────────────────────────────────────────
function fmtCountdown(minsRemaining: number): string {
  const abs = Math.abs(minsRemaining)
  if (abs < 1) return '< 1m'
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ── Format appointment clock time ─────────────────────────────────────────────
function fmtApptTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
  } catch { return '' }
}

// ── Find the next stop with an upcoming (or recently overdue) appointment ─────
function findCountdownStop(stops: MissionStop[]): MissionStop | null {
  const sorted = [...stops].sort((a, b) => a.sequence - b.sequence)
  const now = Date.now()

  // First pass: find incomplete stops with appointmentStart
  for (const stop of sorted) {
    if (stop.completed) continue
    if (!stop.appointmentStart) continue
    const apptMs = new Date(stop.appointmentStart).getTime()
    if (isNaN(apptMs)) continue
    const minsUntil = (apptMs - now) / 60000

    // Show if within SHOW_THRESHOLD or overdue by < 60 min
    if (minsUntil <= SHOW_THRESHOLD_MIN && minsUntil > -60) return stop
  }
  return null
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  stops: MissionStop[]
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function DeliveryCountdown({ stops }: Props) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // Fast tick when < 5 min remaining (every 10s), slower otherwise (every 30s)
    const apptMs = targetStop ? new Date(targetStop.appointmentStart!).getTime() : 0
    const minsLeft = (apptMs - now) / 60000
    const interval = (minsLeft > 0 && minsLeft < 5) ? 10_000 : 30_000

    const id = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(id)
  }) // re-runs on every render — interval adapts as countdown crosses thresholds

  const targetStop = findCountdownStop(stops)
  if (!targetStop || !targetStop.appointmentStart) return null

  const apptMs       = new Date(targetStop.appointmentStart).getTime()
  const minsRemaining = Math.round((apptMs - now) / 60000)
  const urgency       = urgencyOf(minsRemaining)
  const style         = URGENCY_STYLE[urgency]
  const emoji         = STOP_TYPE_EMOJI[targetStop.type] ?? '📍'
  const apptTime      = fmtApptTime(targetStop.appointmentStart)

  // Progress bar: 0% at SHOW_THRESHOLD_MIN out, 100% at appointment time
  const progressPct = Math.min(100, Math.max(0,
    ((SHOW_THRESHOLD_MIN - Math.max(0, minsRemaining)) / SHOW_THRESHOLD_MIN) * 100,
  ))

  const totalStops    = stops.filter(s => !s.completed).length +
                        stops.filter(s => s.completed).length
  const completedCount = stops.filter(s => s.completed).length

  return (
    <div style={{
      borderRadius: 12,
      background: style.bg,
      border: `1px solid ${style.border}`,
      padding: '.75rem .95rem',
      animation: style.pulse ? 'countdownPulse 2s ease-in-out infinite' : undefined,
    }}>
      {/* ── Header row ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.45rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span style={{ fontSize: '.95rem', flexShrink: 0 }}>{emoji}</span>
          <div style={{ minWidth: 0 }}>
            <span style={{
              fontSize: '.65rem', fontWeight: 900, textTransform: 'uppercase',
              letterSpacing: '.08em', color: style.color,
            }}>
              {style.label}
            </span>
            <span style={{
              fontSize: '.72rem', fontWeight: 700, color: 'var(--text)', marginLeft: 6,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {targetStop.name || `Stop ${targetStop.sequence}`}
            </span>
            {(targetStop.city || targetStop.state) && (
              <span style={{ fontSize: '.65rem', color: 'var(--muted)', marginLeft: 5 }}>
                {[targetStop.city, targetStop.state].filter(Boolean).join(', ')}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
          <div style={{ fontSize: '.65rem', color: 'var(--muted)', fontWeight: 600 }}>
            Stop {targetStop.sequence} of {totalStops}
          </div>
          {apptTime && (
            <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--muted)', marginTop: 1 }}>
              appt {apptTime}
            </div>
          )}
        </div>
      </div>

      {/* ── Countdown + progress ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Big countdown */}
        <div style={{
          fontWeight: 900,
          fontSize: minsRemaining < 0 ? '1.1rem' : '1.4rem',
          color: style.color,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
          flexShrink: 0,
          minWidth: 64,
        }}>
          {minsRemaining < 0 ? `+${fmtCountdown(minsRemaining)}` : fmtCountdown(minsRemaining)}
        </div>

        {/* Progress bar (right side) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${progressPct}%`,
              background: urgency === 'upcoming'
                ? 'var(--primary)'
                : urgency === 'warning'
                  ? 'var(--warn)'
                  : 'var(--error)',
              transition: 'width 1s linear',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 600 }}>
              {completedCount > 0 ? `${completedCount} stop${completedCount !== 1 ? 's' : ''} done` : 'en route'}
            </span>
            <span style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 600 }}>
              {minsRemaining < 0 ? 'overdue' : 'to appt'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
