'use client'
import { useState } from 'react'
import type { MissionStop, StopLifecycleStatus } from '@/lib/dashboard/types'
import DetentionClock from '@/components/dashboard/clocks/DetentionClock'

// ── Lifecycle step definitions ────────────────────────────────────────────────
// Ordered progression — arrived is always first, departed always last.
// 'waiting' is optional; driver can skip it directly to 'docked'.
const STEPS: {
  status: StopLifecycleStatus
  label:  string
  icon:   string
  desc:   string
}[] = [
  { status: 'arrived',      label: 'Arrived',        icon: '📍', desc: 'Pulled into facility' },
  { status: 'checked_in',   label: 'Checked In',     icon: '✅', desc: 'Signed in at guard/desk' },
  { status: 'waiting',      label: 'Waiting',        icon: '⏳', desc: 'Waiting for dock assignment' },
  { status: 'docked',       label: 'Docked',         icon: '🚛', desc: 'Backed into dock' },
  { status: 'work_started', label: 'Work Started',   icon: '📦', desc: 'Loading/unloading in progress' },
  { status: 'work_ended',   label: 'Work Complete',  icon: '🏁', desc: 'Work done, awaiting paperwork' },
  { status: 'departed',     label: 'Departed',       icon: '🛣️', desc: 'Left facility — clock stopped' },
]

function nextAfter(current: StopLifecycleStatus | undefined): StopLifecycleStatus | null {
  if (!current) return 'arrived'
  const idx = STEPS.findIndex(s => s.status === current)
  if (idx === -1 || idx >= STEPS.length - 1) return null
  return STEPS[idx + 1].status
}

// 'checked_in' → can skip 'waiting' and go directly to 'docked'
function skipTarget(current: StopLifecycleStatus | undefined): StopLifecycleStatus | null {
  if (current === 'checked_in') return 'docked'
  return null
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  } catch { return iso }
}

function fmtApptShort(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  stop:        MissionStop
  open:        boolean
  onClose:     () => void
  onAdvance:   (status: StopLifecycleStatus, notes?: string) => Promise<void>
  driverMode?: boolean
}

export default function StopLifecyclePanel({ stop, open, onClose, onAdvance, driverMode }: Props) {
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const current  = stop.lifecycleStatus
  const ts       = stop.lifecycleTimestamps ?? {}
  const next     = nextAfter(current)
  const skip     = skipTarget(current)
  const nextMeta = next ? STEPS.find(s => s.status === next)! : null
  const skipMeta = skip ? STEPS.find(s => s.status === skip)! : null

  const arrivedAt  = ts.arrived
  const departedAt = ts.departed
  const isDone     = current === 'departed'

  const handleAdvance = async (status: StopLifecycleStatus) => {
    setLoading(true)
    try {
      await onAdvance(status, notes.trim() || undefined)
      setNotes('')
      if (status === 'departed') onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(3,13,11,.75)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
        background: 'var(--surface)',
        borderTop: '2px solid rgba(0,232,176,.2)',
        borderRadius: '20px 20px 0 0',
        padding: '1.5rem 1.25rem 2.5rem',
        maxHeight: '92dvh', overflowY: 'auto',
        boxShadow: '0 -6px 32px rgba(0,0,0,.45)',
      }}>

        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 1.1rem' }} />

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: '1.05rem', lineHeight: 1.25 }}>
              {stop.name || `Stop ${stop.sequence}`}
            </div>
            {(stop.city || stop.address) && (
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
                {stop.address ? `${stop.address}, ` : ''}{stop.city}{stop.state ? `, ${stop.state}` : ''}
              </div>
            )}
            {stop.appointmentStart && (
              <div style={{ fontSize: '.68rem', color: 'var(--warn)', marginTop: 2, fontWeight: 700 }}>
                🕐 Appt: {fmtApptShort(stop.appointmentStart)}
              </div>
            )}
            {stop.reference && (
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 1 }}>
                REF: {stop.reference}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: 'var(--muted)', cursor: 'pointer', flexShrink: 0, padding: '.1rem .3rem' }}
          >
            ×
          </button>
        </div>

        {/* ── Detention Clock — visible from 'arrived' onward ── */}
        {arrivedAt && (
          <div style={{ marginBottom: '1rem' }}>
            <DetentionClock
              arrivedAt={arrivedAt}
              departedAt={departedAt}
              freeMinutes={stop.detentionSummary?.freeMinutes ?? 120}
              ratePerHour={stop.detentionSummary?.ratePerHour ?? 50}
            />
          </div>
        )}

        {/* ── Lifecycle timeline ── */}
        <div style={{ marginBottom: '1.1rem' }}>
          <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.6rem' }}>
            Stop Progress
          </div>
          <div style={{ display: 'grid', gap: 0 }}>
            {STEPS.map((step) => {
              const done      = ts[step.status] !== undefined
              const isCur     = step.status === current
              const isAhead   = !done && !isCur

              return (
                <div key={step.status} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  padding: '.32rem 0', opacity: isAhead ? .4 : 1,
                }}>
                  {/* Node */}
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.68rem',
                    background: done  ? 'rgba(40,192,72,.15)'  : isCur ? 'rgba(0,232,176,.12)' : 'var(--surface-2)',
                    border:     done  ? '2px solid rgba(40,192,72,.4)' : isCur ? '2px solid var(--primary)' : '2px solid var(--border)',
                    boxShadow:  isCur ? '0 0 8px rgba(0,232,176,.3)' : 'none',
                  }}>
                    {done ? '✓' : step.icon}
                  </div>

                  {/* Label + timestamp */}
                  <div style={{ flex: 1, paddingTop: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: '.8rem', lineHeight: 1,
                        fontWeight: isCur ? 800 : done ? 700 : 600,
                        color: isCur ? 'var(--primary)' : done ? 'var(--text)' : 'var(--muted)',
                      }}>
                        {step.label}
                      </span>
                      {isCur && (
                        <span style={{ fontSize: '.55rem', fontWeight: 800, padding: '.1rem .35rem', borderRadius: 4, background: 'rgba(0,232,176,.12)', color: 'var(--primary)', border: '1px solid rgba(0,232,176,.25)' }}>
                          NOW
                        </span>
                      )}
                    </div>
                    {done && ts[step.status] && (
                      <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 1 }}>
                        {fmtTime(ts[step.status]!)}
                      </div>
                    )}
                    {isAhead && (
                      <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: 1, fontStyle: 'italic' }}>
                        {step.desc}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Notes input (hidden in driver mode while driving) ── */}
        {!driverMode && nextMeta && (
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Note (optional) — dock #, delay reason, lumper receipt…"
            style={{
              width: '100%', padding: '.6rem .75rem', borderRadius: 9,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text)', fontSize: '.82rem', outline: 'none',
              boxSizing: 'border-box', marginBottom: '1rem',
            }}
          />
        )}

        {/* ── Primary: Advance to next step ── */}
        {nextMeta && !isDone && (
          <button
            onClick={() => handleAdvance(nextMeta.status)}
            disabled={loading}
            style={{
              width: '100%', padding: '1.05rem', borderRadius: 13, fontWeight: 900,
              fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer', border: 'none',
              background: nextMeta.status === 'departed'
                ? 'rgba(40,192,72,.15)'
                : 'rgba(0,232,176,.14)',
              color: nextMeta.status === 'departed' ? 'var(--success)' : 'var(--primary)',
              boxShadow: '0 2px 12px rgba(0,232,176,.12)',
              marginBottom: skipMeta ? '.55rem' : 0,
            }}
          >
            {loading ? '⟳ Saving…' : `${nextMeta.icon} ${nextMeta.label}`}
            {!loading && (
              <div style={{ fontSize: '.65rem', fontWeight: 600, opacity: .7, marginTop: 3 }}>
                {nextMeta.desc}
              </div>
            )}
          </button>
        )}

        {/* ── Skip Waiting → go straight to Docked ── */}
        {skipMeta && !isDone && !loading && (
          <button
            onClick={() => handleAdvance(skipMeta.status)}
            style={{
              width: '100%', padding: '.65rem', borderRadius: 10, fontWeight: 700,
              fontSize: '.82rem', cursor: 'pointer',
              border: '1px solid var(--border)', background: 'none', color: 'var(--muted)',
            }}
          >
            Skip waiting → {skipMeta.icon} {skipMeta.label}
          </button>
        )}

        {/* ── Departed state ── */}
        {isDone && (
          <div style={{ textAlign: 'center', padding: '1.1rem', borderRadius: 12, background: 'rgba(40,192,72,.08)', border: '1px solid rgba(40,192,72,.2)' }}>
            <div style={{ fontSize: '1.25rem', marginBottom: 4 }}>✅</div>
            <div style={{ fontWeight: 800, color: 'var(--success)', fontSize: '.9rem' }}>
              Stop complete
            </div>
            {ts.departed && (
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 2 }}>
                Departed {fmtTime(ts.departed)}
              </div>
            )}
            {stop.detentionSummary && stop.detentionSummary.detentionMinutes > 0 && (
              <div style={{ fontSize: '.72rem', color: 'var(--error)', fontWeight: 700, marginTop: 6 }}>
                ⏱ {stop.detentionSummary.detentionMinutes}m detention · ${stop.detentionSummary.detentionAmount.toFixed(2)}
              </div>
            )}
          </div>
        )}

      </div>
    </>
  )
}
