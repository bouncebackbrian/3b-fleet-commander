'use client'
/**
 * DriverOpsCockpit — DriverOps AI v2
 *
 * Movement-aware operational mode card for the Drive Mode scrollable zone.
 * Shows current mode with timer, quick-switch buttons, detention clock,
 * break countdown, and mode history summary.
 *
 * Sits in the Drive Mode scrollable content zone, between RecoveryAdvisor
 * and the bottom of the screen.
 *
 * Re-evaluates every 30 seconds to keep timers live.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  type OperationalMode,
  type OpsStatus,
  type ActiveModeSession,
  MODE_META,
  QUICK_SWITCH_MODES,
  getOrInitMode,
  deriveOpsStatus,
  setOperationalMode,
  startDetentionClock,
  endDetentionClock,
  readModeHistory,
  buildModeTimeSummary,
} from '@/lib/driverOpsEngine'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMins(m: number): string {
  const h = Math.floor(m / 60), min = m % 60
  if (h > 0) return min > 0 ? `${h}h ${min}m` : `${h}h`
  return `${min}m`
}

function fmtClock(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ── Break countdown ring ──────────────────────────────────────────────────────

function BreakRing({ pct, remainingMins, targetMins, complete }: {
  pct: number; remainingMins: number; targetMins: number; complete: boolean
}) {
  const r = 28, circ = 2 * Math.PI * r
  const dash = circ * (pct / 100)
  const color = complete ? 'var(--primary)' : pct < 70 ? 'var(--warn)' : '#a78bfa'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: 70, height: 70 }}>
        <svg width="70" height="70" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="35" cy="35" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="5" />
          <circle
            cx="35" cy="35" r={r} fill="none"
            stroke={color} strokeWidth="5"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray .5s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          {complete ? (
            <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>✅</span>
          ) : (
            <>
              <span style={{ fontSize: '.7rem', fontWeight: 900, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {fmtClock(remainingMins)}
              </span>
              <span style={{ fontSize: '.48rem', color: 'var(--muted)', fontWeight: 600 }}>left</span>
            </>
          )}
        </div>
      </div>
      <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700, textAlign: 'center' }}>
        {complete ? 'Break complete' : `${pct}% · ${fmtMins(targetMins)} target`}
      </div>
    </div>
  )
}

// ── Detention timer ───────────────────────────────────────────────────────────

function DetentionTimer({ detention, onEnd }: {
  detention: NonNullable<OpsStatus['detention']>
  onEnd: () => void
}) {
  const overColor = detention.freeTimeUsed ? 'var(--error)' : 'var(--warn)'
  const overBg    = detention.freeTimeUsed ? 'rgba(232,64,0,.09)' : 'rgba(245,194,0,.08)'
  const overBdr   = detention.freeTimeUsed ? 'rgba(232,64,0,.3)'  : 'rgba(245,194,0,.25)'

  return (
    <div style={{
      padding: '.65rem .8rem', borderRadius: 10,
      background: overBg, border: `1px solid ${overBdr}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.35rem' }}>
        <span style={{ fontSize: '.65rem', fontWeight: 800, color: overColor }}>
          ⏸ Detention Clock
        </span>
        <button
          onClick={onEnd}
          style={{
            fontSize: '.58rem', fontWeight: 800, padding: '.2rem .55rem',
            borderRadius: 7, border: `1px solid ${overBdr}`,
            background: 'transparent', color: overColor, cursor: 'pointer',
          }}
        >
          End detention
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem' }}>
        <div style={{ background: 'var(--surface-2)', borderRadius: 7, padding: '.4rem .55rem', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Total time</div>
          <div style={{ fontSize: '.8rem', fontWeight: 900, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtClock(detention.elapsedMins)}
          </div>
        </div>
        <div style={{ background: detention.freeTimeUsed ? 'rgba(232,64,0,.06)' : 'var(--surface-2)', borderRadius: 7, padding: '.4rem .55rem', border: `1px solid ${detention.freeTimeUsed ? 'rgba(232,64,0,.15)' : 'var(--border)'}` }}>
          <div style={{ fontSize: '.55rem', color: detention.freeTimeUsed ? 'var(--error)' : 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
            {detention.freeTimeUsed ? 'Detention billing' : 'Free time'}
          </div>
          <div style={{ fontSize: '.8rem', fontWeight: 900, color: detention.freeTimeUsed ? 'var(--error)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {detention.freeTimeUsed ? fmtClock(detention.detentionMins) : `${120 - detention.elapsedMins}m left`}
          </div>
        </div>
      </div>
      {!detention.freeTimeUsed && (
        <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: '.4rem', lineHeight: 1.5 }}>
          🕐 Free time window: {120 - detention.elapsedMins}m remaining before detention billing starts
        </div>
      )}
      {detention.freeTimeUsed && (
        <div style={{ fontSize: '.62rem', color: 'var(--error)', marginTop: '.4rem', lineHeight: 1.5, fontWeight: 700 }}>
          📋 Detention billing active — document arrival time and log with dispatch
        </div>
      )}
    </div>
  )
}

// ── Mode button ───────────────────────────────────────────────────────────────

function ModeButton({
  mode, active, onClick,
}: { mode: OperationalMode; active: boolean; onClick: () => void }) {
  const meta = MODE_META[mode]
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '.5rem .4rem', borderRadius: 10, cursor: 'pointer',
        border: `1px solid ${active ? meta.border : 'var(--border)'}`,
        background: active ? meta.bg : 'var(--surface-2)',
        minWidth: 58, flex: '1 1 0',
      }}
    >
      <span style={{ fontSize: '1rem' }}>{meta.emoji}</span>
      <span style={{ fontSize: '.52rem', fontWeight: 800, color: active ? meta.color : 'var(--muted)', textAlign: 'center', lineHeight: 1.2 }}>
        {meta.label}
      </span>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  loadNumber?: string
  location?:   string
  compact?:    boolean
}

export default function DriverOpsCockpit({ loadNumber, location, compact = false }: Props) {
  const [session,  setSession]  = useState<ActiveModeSession | null>(null)
  const [status,   setStatus]   = useState<OpsStatus | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [switchMsg, setSwitchMsg] = useState<string | null>(null)

  const refresh = useCallback(() => {
    const s = getOrInitMode(loadNumber)
    setSession(s)
    setStatus(deriveOpsStatus(s))
  }, [loadNumber])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [refresh])

  const handleModeSwitch = (mode: OperationalMode) => {
    const s = setOperationalMode(mode, { loadNumber, location, source: 'manual' })
    setSession(s)
    setStatus(deriveOpsStatus(s))
    setSwitchMsg(`Switched to ${MODE_META[mode].label}`)
    setTimeout(() => setSwitchMsg(null), 3000)

    // Auto-start detention if switching to pickup/delivery
    if (mode === 'pickup' || mode === 'delivery') {
      if (loadNumber) startDetentionClock(loadNumber)
    }
  }

  const handleEndDetention = () => {
    endDetentionClock()
    refresh()
  }

  if (!session || !status) return null

  const meta = status.meta

  // ── Compact strip mode ───────────────────────────────────────────────────
  if (compact) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '.45rem .85rem', borderRadius: 10,
        background: meta.bg, border: `1px solid ${meta.border}`,
      }}>
        <span style={{ fontSize: '1rem', flexShrink: 0 }}>{meta.emoji}</span>
        <span style={{ fontWeight: 800, fontSize: '.75rem', color: meta.color }}>{meta.label}</span>
        <span style={{ fontSize: '.65rem', color: 'var(--muted)', marginLeft: 'auto' }}>
          {status.timerLabel}
        </span>
        {status.isOverdue && (
          <span style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--warn)' }}>⏰</span>
        )}
      </div>
    )
  }

  // ── Full card mode ───────────────────────────────────────────────────────

  const history = readModeHistory().slice(0, 20)
  const timeSummary = buildModeTimeSummary(history)

  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${meta.border}`,
      borderRadius: 16, overflow: 'hidden',
    }}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          padding: '.8rem 1rem', background: meta.bg, border: 'none',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{meta.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontWeight: 900, fontSize: '.85rem', color: meta.color }}>
              {meta.label}
            </span>
            {session.source === 'auto' && (
              <span style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700,
                padding: '.1rem .4rem', borderRadius: 8, background: 'var(--surface-2)' }}>
                AUTO
              </span>
            )}
            {status.isOverdue && (
              <span style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--warn)',
                padding: '.1rem .45rem', borderRadius: 8,
                background: 'rgba(245,194,0,.12)', border: '1px solid rgba(245,194,0,.3)' }}>
                ⏰ Overdue
              </span>
            )}
          </div>
          <div style={{ fontSize: '.65rem', color: 'var(--muted)' }}>
            {status.timerLabel}
            {location && ` · ${location.length > 22 ? location.slice(0, 20) + '…' : location}`}
          </div>
        </div>
        {/* Progress arc for timed modes */}
        {status.progressPct !== null && (
          <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
            <svg width="32" height="32" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="16" cy="16" r="13" fill="none" stroke="var(--surface-2)" strokeWidth="3" />
              <circle cx="16" cy="16" r="13" fill="none" stroke={meta.color} strokeWidth="3"
                strokeDasharray={`${(2 * Math.PI * 13) * (status.progressPct / 100)} ${2 * Math.PI * 13}`}
                strokeLinecap="round" style={{ transition: 'stroke-dasharray .5s ease' }} />
            </svg>
            <span style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '.5rem', fontWeight: 900, color: meta.color,
            }}>
              {status.progressPct}%
            </span>
          </div>
        )}
        <span style={{ fontSize: '.65rem', color: 'var(--muted)', flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Switch message feedback */}
      {switchMsg && (
        <div style={{
          padding: '.4rem 1rem', fontSize: '.65rem', fontWeight: 800,
          color: 'var(--primary)', background: 'rgba(0,232,176,.08)',
          borderTop: '1px solid rgba(0,232,176,.15)',
        }}>
          ✅ {switchMsg}
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '.85rem 1rem', borderTop: '1px solid var(--border)', display: 'grid', gap: '.85rem' }}>

          {/* Break countdown ring */}
          {status.breakCountdown && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <BreakRing
                pct={status.breakCountdown.pct}
                remainingMins={status.breakCountdown.remainingMins}
                targetMins={status.breakCountdown.targetMins}
                complete={status.breakCountdown.complete}
              />
            </div>
          )}

          {/* Detention timer */}
          {status.detention && (
            <DetentionTimer detention={status.detention} onEnd={handleEndDetention} />
          )}

          {/* No detention — start it button at facility */}
          {(status.mode === 'pickup' || status.mode === 'delivery') && !status.detention && (
            <button
              onClick={() => { if (loadNumber) startDetentionClock(loadNumber); refresh() }}
              style={{
                width: '100%', padding: '.6rem', borderRadius: 10,
                border: '1px solid rgba(245,194,0,.3)', background: 'rgba(245,194,0,.07)',
                color: 'var(--warn)', fontWeight: 800, fontSize: '.72rem', cursor: 'pointer',
              }}
            >
              ⏸ Start Detention Clock
            </button>
          )}

          {/* Quick-switch mode buttons */}
          <div>
            <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.5rem' }}>
              Switch Mode
            </div>
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
              {QUICK_SWITCH_MODES.map(m => (
                <ModeButton
                  key={m}
                  mode={m}
                  active={status.mode === m}
                  onClick={() => { if (status.mode !== m) handleModeSwitch(m) }}
                />
              ))}
            </div>
          </div>

          {/* Driving stats from history */}
          {timeSummary.driveSegmentCount > 0 && (
            <div>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.5rem' }}>
                Session Summary
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.4rem' }}>
                {[
                  { label: 'Drive time',  value: fmtMins(timeSummary.totalDrivingMins), color: 'var(--primary)' },
                  { label: 'Break time',  value: fmtMins(timeSummary.totalBreakMins),  color: '#a78bfa' },
                  { label: 'Avg segment', value: fmtMins(timeSummary.avgDriveSegmentMins), color: 'var(--text)' },
                ].map(item => (
                  <div key={item.label} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '.45rem .55rem', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '.72rem', fontWeight: 900, color: item.color }}>{item.value}</div>
                    <div style={{ fontSize: '.52rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Operational guidance per mode */}
          {status.mode === 'breakdown' && (
            <div style={{
              padding: '.7rem .85rem', borderRadius: 10,
              background: 'rgba(232,64,0,.08)', border: '1px solid rgba(232,64,0,.25)',
              display: 'grid', gap: '.3rem',
            }}>
              <div style={{ fontWeight: 800, fontSize: '.72rem', color: 'var(--error)' }}>🚨 Breakdown Checklist</div>
              {['Pull safely off roadway — hazard lights on', 'Place triangles/flares (75ft, 150ft)', 'Contact roadside assistance', 'Notify dispatch with GPS location', 'Document incident with photos'].map((item, i) => (
                <div key={i} style={{ fontSize: '.62rem', color: 'var(--muted)', display: 'flex', gap: 6, lineHeight: 1.4 }}>
                  <span style={{ color: 'var(--error)', flexShrink: 0 }}>·</span>{item}
                </div>
              ))}
            </div>
          )}

          {status.mode === 'severe_weather' && (
            <div style={{
              padding: '.65rem .85rem', borderRadius: 10,
              background: 'rgba(245,194,0,.08)', border: '1px solid rgba(245,194,0,.25)',
              display: 'grid', gap: '.3rem',
            }}>
              <div style={{ fontWeight: 800, fontSize: '.72rem', color: 'var(--warn)' }}>⛈ Weather Hold</div>
              {['Park at nearest safe location — truck stop preferred', 'Do not continue in zero-visibility or extreme winds', 'Monitor NOAA alerts for clearing window', 'Notify dispatch of location and expected delay', 'Log weather hold in dispatch update'].map((item, i) => (
                <div key={i} style={{ fontSize: '.62rem', color: 'var(--muted)', display: 'flex', gap: 6, lineHeight: 1.4 }}>
                  <span style={{ color: 'var(--warn)', flexShrink: 0 }}>·</span>{item}
                </div>
              ))}
            </div>
          )}

          {/* Footer — label */}
          <div style={{
            paddingTop: '.5rem', borderTop: '1px solid var(--border)',
            fontSize: '.58rem', color: 'var(--faint)', lineHeight: 1.5, textAlign: 'center',
          }}>
            Operational mode tracking — does not affect HOS compliance records
          </div>
        </div>
      )}
    </div>
  )
}
