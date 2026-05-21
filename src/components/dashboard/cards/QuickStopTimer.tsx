'use client'
import { useState, useEffect, useRef } from 'react'
import type { MissionStop } from '@/lib/dashboard/types'

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  currentStop:  MissionStop | null
  totalStops:   number
  driverMode?:  boolean
  submitting?:  boolean
  // Handlers provided by dashboard/page — all persistence done there
  onArrive:     () => Promise<void>
  onLeave:      (forceArriveNow: boolean) => Promise<void>
}

// ── Inline confirmation banner ────────────────────────────────────────────────
type ConfirmMode = 'no_arrival' | 'dup_arrival' | null

// ── Dwell timer ───────────────────────────────────────────────────────────────
function useDwellTick(arrivedAt: string | null | undefined): string {
  const [display, setDisplay] = useState('')

  useEffect(() => {
    if (!arrivedAt) { setDisplay(''); return }
    const compute = () => {
      const ms      = Date.now() - new Date(arrivedAt).getTime()
      const total   = Math.max(0, Math.floor(ms / 60000))
      const hours   = Math.floor(total / 60)
      const minutes = total % 60
      if (hours > 0) setDisplay(`${hours}h ${minutes}m`)
      else           setDisplay(`${minutes}m`)
    }
    compute()
    const id = setInterval(compute, 30_000)
    return () => clearInterval(id)
  }, [arrivedAt])

  return display
}

// ── Format arrival time label ─────────────────────────────────────────────────
function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
  } catch { return '' }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function QuickStopTimer({
  currentStop,
  totalStops,
  driverMode = false,
  submitting = false,
  onArrive,
  onLeave,
}: Props) {
  const [confirming,  setConfirming]  = useState<ConfirmMode>(null)
  const [busy,        setBusy]        = useState(false)

  // When the current stop changes (e.g. stop completes → advances), clear dialog
  const prevStopId = useRef<string | null>(null)
  useEffect(() => {
    if (currentStop?.id !== prevStopId.current) {
      setConfirming(null)
      prevStopId.current = currentStop?.id ?? null
    }
  }, [currentStop?.id])

  const arrivedAt    = currentStop?.lifecycleTimestamps?.arrived ?? null
  const departedAt   = currentStop?.lifecycleTimestamps?.departed ?? null
  const isCompleted  = !!currentStop?.completed || !!departedAt
  const dwellDisplay = useDwellTick(arrivedAt)

  // Nothing to show when no stop or already departed
  if (!currentStop || isCompleted) return null

  const stopLabel = currentStop.name
    ? currentStop.name.length > 28
      ? currentStop.name.slice(0, 26) + '…'
      : currentStop.name
    : `Stop ${currentStop.sequence}`
  const locLabel  = currentStop.city
    ? `${currentStop.city}${currentStop.state ? `, ${currentStop.state}` : ''}`
    : null

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleArrive = async () => {
    if (busy || submitting) return
    if (arrivedAt) {
      // Already arrived — ask to overwrite
      setConfirming('dup_arrival')
      return
    }
    setBusy(true)
    try { await onArrive() } finally { setBusy(false) }
  }

  const handleLeave = async () => {
    if (busy || submitting) return
    if (!arrivedAt) {
      // No arrival recorded — prompt confirm
      setConfirming('no_arrival')
      return
    }
    setBusy(true)
    try { await onLeave(false) } finally { setBusy(false); setConfirming(null) }
  }

  const handleConfirmNoArrival = async () => {
    setBusy(true)
    try { await onLeave(true) } finally { setBusy(false); setConfirming(null) }
  }

  const handleConfirmDupArrival = async () => {
    setBusy(true)
    try { await onArrive() } finally { setBusy(false); setConfirming(null) }
  }

  const isLoading = busy || submitting

  return (
    <div style={{
      borderRadius: 12,
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {/* ── Stop context header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '.55rem .9rem',
        borderBottom: '1px solid var(--border)',
        background: 'rgba(0,232,176,.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{
            fontSize: '.6rem', fontWeight: 800, letterSpacing: '.07em',
            textTransform: 'uppercase', color: 'var(--primary)', flexShrink: 0,
          }}>
            Stop {currentStop.sequence} of {totalStops}
          </span>
          <span style={{
            fontSize: '.75rem', fontWeight: 700, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {stopLabel}
          </span>
          {locLabel && (
            <span style={{ fontSize: '.65rem', color: 'var(--muted)', flexShrink: 0 }}>
              {locLabel}
            </span>
          )}
        </div>
        {/* On-site dwell badge — appears after arrived */}
        {arrivedAt && dwellDisplay && (
          <span style={{
            fontSize: '.68rem', fontWeight: 800, color: 'var(--primary)',
            background: 'rgba(0,232,176,.12)', border: '1px solid rgba(0,232,176,.25)',
            borderRadius: 6, padding: '.15rem .5rem', flexShrink: 0, whiteSpace: 'nowrap',
          }}>
            On site: {dwellDisplay}
          </span>
        )}
      </div>

      {/* ── Arrived chip (shown after tapping arrived) ── */}
      {arrivedAt && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '.4rem .9rem',
          fontSize: '.7rem', fontWeight: 700, color: 'var(--success)',
          borderBottom: '1px solid var(--border)',
        }}>
          <span>✅</span>
          <span>Arrived {fmtTime(arrivedAt)}</span>
        </div>
      )}

      {/* ── Confirm banners ── */}
      {confirming === 'no_arrival' && (
        <div style={{
          padding: '.6rem .9rem',
          background: 'rgba(245,194,0,.08)',
          borderBottom: '1px solid rgba(245,194,0,.2)',
        }}>
          <div style={{ fontSize: '.73rem', fontWeight: 700, color: 'var(--warn)', marginBottom: '.45rem', lineHeight: 1.4 }}>
            ⚠ No arrival time recorded. Set arrival to now and depart?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleConfirmNoArrival}
              disabled={isLoading}
              style={{
                flex: 1, padding: '.45rem', borderRadius: 8, fontWeight: 800, fontSize: '.75rem',
                border: '1px solid rgba(245,194,0,.4)', background: 'rgba(245,194,0,.12)',
                color: 'var(--warn)', cursor: 'pointer',
              }}
            >
              {isLoading ? '⟳' : 'Yes, depart'}
            </button>
            <button
              onClick={() => setConfirming(null)}
              disabled={isLoading}
              style={{
                flex: 1, padding: '.45rem', borderRadius: 8, fontWeight: 700, fontSize: '.75rem',
                border: '1px solid var(--border)', background: 'none',
                color: 'var(--muted)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirming === 'dup_arrival' && (
        <div style={{
          padding: '.6rem .9rem',
          background: 'rgba(245,194,0,.08)',
          borderBottom: '1px solid rgba(245,194,0,.2)',
        }}>
          <div style={{ fontSize: '.73rem', fontWeight: 700, color: 'var(--warn)', marginBottom: '.45rem', lineHeight: 1.4 }}>
            ⚠ Already marked arrived at {fmtTime(arrivedAt!)}. Update to now?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleConfirmDupArrival}
              disabled={isLoading}
              style={{
                flex: 1, padding: '.45rem', borderRadius: 8, fontWeight: 800, fontSize: '.75rem',
                border: '1px solid rgba(245,194,0,.4)', background: 'rgba(245,194,0,.12)',
                color: 'var(--warn)', cursor: 'pointer',
              }}
            >
              {isLoading ? '⟳' : 'Yes, update'}
            </button>
            <button
              onClick={() => setConfirming(null)}
              disabled={isLoading}
              style={{
                flex: 1, padding: '.45rem', borderRadius: 8, fontWeight: 700, fontSize: '.75rem',
                border: '1px solid var(--border)', background: 'none',
                color: 'var(--muted)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Main action buttons ── */}
      {confirming === null && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: arrivedAt ? '1fr' : '1fr 1fr',
          gap: 0,
        }}>
          {/* Arrived button — hidden once arrival is logged */}
          {!arrivedAt && (
            <button
              onClick={handleArrive}
              disabled={isLoading}
              style={{
                height: 64,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 4,
                border: 'none',
                borderRight: '1px solid var(--border)',
                background: isLoading ? 'var(--surface-2)' : 'rgba(40,192,72,.08)',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'background .15s',
              }}
            >
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{isLoading ? '⟳' : '📍'}</span>
              <span style={{
                fontSize: '.72rem', fontWeight: 900, letterSpacing: '.05em',
                textTransform: 'uppercase',
                color: isLoading ? 'var(--muted)' : 'var(--success)',
              }}>
                Arrived
              </span>
            </button>
          )}

          {/* Leaving button */}
          <button
            onClick={handleLeave}
            disabled={isLoading}
            style={{
              height: 64,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4,
              border: 'none',
              background: isLoading
                ? 'var(--surface-2)'
                : arrivedAt
                  ? 'rgba(245,194,0,.1)'
                  : 'rgba(245,194,0,.06)',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'background .15s',
            }}
          >
            <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{isLoading ? '⟳' : '🚛'}</span>
            <span style={{
              fontSize: '.72rem', fontWeight: 900, letterSpacing: '.05em',
              textTransform: 'uppercase',
              color: isLoading ? 'var(--muted)' : 'var(--warn)',
            }}>
              Leaving
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
