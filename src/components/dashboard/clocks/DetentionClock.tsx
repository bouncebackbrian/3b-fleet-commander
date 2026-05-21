'use client'
import { useState, useEffect } from 'react'

interface Props {
  arrivedAt:    string    // ISO — detention clock start
  departedAt?:  string    // ISO — if set, shows final summary (no live tick)
  freeMinutes?: number    // free time before detention starts (default 120)
  ratePerHour?: number    // detention rate in $/hr (default 50)
  compact?:     boolean   // inline badge mode for timeline rows
}

function fmtMins(m: number): string {
  const h  = Math.floor(m / 60)
  const mn = Math.round(m % 60)
  return h > 0 ? `${h}h ${mn}m` : `${mn}m`
}

export default function DetentionClock({
  arrivedAt,
  departedAt,
  freeMinutes = 120,
  ratePerHour = 50,
  compact     = false,
}: Props) {
  // Tick every 30s while still at facility — fine resolution for detention context
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (departedAt) return
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [departedAt])

  const endMs          = departedAt ? new Date(departedAt).getTime() : now
  const startMs        = new Date(arrivedAt).getTime()
  const dwellMin       = Math.max(0, (endMs - startMs) / 60_000)
  const freeLeft       = freeMinutes - dwellMin
  const inDetention    = freeLeft < 0
  const detMin         = Math.max(0, -freeLeft)
  const detAmount      = (detMin / 60) * ratePerHour
  const approaching    = !inDetention && freeLeft < 30  // warn in last 30 min

  const color       = inDetention ? 'var(--error)' : approaching ? 'var(--warn)' : 'var(--primary)'
  const bgColor     = inDetention ? 'rgba(232,64,0,.07)'   : approaching ? 'rgba(245,194,0,.07)'   : 'rgba(0,232,176,.05)'
  const borderColor = inDetention ? 'rgba(232,64,0,.22)'   : approaching ? 'rgba(245,194,0,.22)'   : 'rgba(0,232,176,.18)'

  // ── Compact badge (for StopTimeline row) ─────────────────────────────────
  if (compact) {
    return (
      <span style={{
        display: 'inline-block',
        fontSize: '.6rem', fontWeight: 800, padding: '.15rem .5rem', borderRadius: 5,
        background: bgColor, border: `1px solid ${borderColor}`, color,
      }}>
        {inDetention
          ? `🔴 +${fmtMins(detMin)} detention`
          : approaching
            ? `⚠ ${fmtMins(freeLeft)} free left`
            : `🟢 ${fmtMins(dwellMin)} dwell`}
      </span>
    )
  }

  // ── Full card (for StopLifecyclePanel) ────────────────────────────────────
  const barPct     = Math.min(100, (dwellMin / freeMinutes) * 100)
  const overflowPct= inDetention ? Math.min(60, (detMin / freeMinutes) * 100) : 0

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 13, padding: '.9rem 1rem' }}>

      {/* Row 1 — header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.55rem' }}>
        <span style={{ fontSize: '.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--muted)' }}>
          {departedAt ? '⏱ Dwell Summary' : '⏱ Dwell Clock'}
        </span>
        {!departedAt && (
          <span style={{ fontSize: '.58rem', color: 'var(--muted)', fontStyle: 'italic' }}>live</span>
        )}
      </div>

      {/* Row 2 — dwell time vs detention */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.5rem' }}>
        <div>
          <div style={{ fontSize: '1.65rem', fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {fmtMins(dwellMin)}
          </div>
          <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: 2 }}>total dwell</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {inDetention ? (
            <>
              <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--error)', lineHeight: 1 }}>
                +{fmtMins(detMin)}
              </div>
              <div style={{ fontSize: '.6rem', color: 'var(--error)', marginTop: 2, fontWeight: 700 }}>in detention</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '1rem', fontWeight: 900, color, lineHeight: 1 }}>
                {fmtMins(freeLeft)} left
              </div>
              <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: 2 }}>free time remaining</div>
            </>
          )}
        </div>
      </div>

      {/* Row 3 — detention $$ */}
      {inDetention && (
        <div style={{
          padding: '.4rem .65rem', borderRadius: 8, marginBottom: '.5rem',
          background: 'rgba(232,64,0,.1)', border: '1px solid rgba(232,64,0,.2)',
          fontSize: '.75rem', fontWeight: 800, color: 'var(--error)',
        }}>
          💰 ${detAmount.toFixed(2)} est. detention
          <span style={{ fontSize: '.62rem', fontWeight: 600, color: 'var(--muted)', marginLeft: 6 }}>
            @${ratePerHour}/hr · document for broker claim
          </span>
        </div>
      )}

      {/* Row 4 — progress bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: '.55rem', color: 'var(--muted)' }}>0</span>
          <span style={{ fontSize: '.55rem', color: 'var(--muted)' }}>{freeMinutes} min free</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', position: 'relative', overflow: 'visible' }}>
          {/* Free-time fill */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3,
            width: `${barPct}%`,
            background: color,
            transition: 'width 2s linear',
          }} />
          {/* Detention overflow (red, grows past the bar edge) */}
          {overflowPct > 0 && (
            <div style={{
              position: 'absolute', left: '100%', top: -2, height: 10,
              borderRadius: '0 3px 3px 0',
              width: `${overflowPct}%`, minWidth: 5,
              background: 'var(--error)',
            }} />
          )}
        </div>
      </div>

    </div>
  )
}
