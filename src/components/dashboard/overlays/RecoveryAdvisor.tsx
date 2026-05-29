'use client'
/**
 * RecoveryAdvisor — Partial Recovery Credit & Adaptive Cadence UI
 *
 * Lives in Drive Mode scrollable zone.
 * Shows:
 *   - Fatigue level meter
 *   - Continuous drive time + next suggested stop countdown
 *   - Quick-log unplanned stops (restroom, fuel, meal, etc.)
 *   - Cadence adjustment messaging when credit applied
 *   - DOT break status (read-only — compliance layer, never modified)
 *
 * Tone: "Suggested adjustment" — supportive, never punitive.
 * Legal compliance status is SEPARATE and always displayed below the preference layer.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  STOP_TYPE_META,
  getOrCreateSession,
  logRecoveryStop,
  deriveRecoveryStatus,
  getFatigueLevelColor,
  getFatigueLevelLabel,
  formatDriveTime,
  type StopType,
  type RecoverySession,
  type RecoveryStatus,
} from '@/lib/recoveryEngine'

// ── Stop quick-log strip ──────────────────────────────────────────────────────

const QUICK_STOP_TYPES: StopType[] = [
  'restroom', 'stretch', 'fuel', 'fuel_walk', 'meal', 'nap', 'inspection', 'unloading', 'other',
]

interface StopLoggerProps {
  onLogged: (type: StopType, duration: number) => void
  onCancel: () => void
}

function StopLogger({ onLogged, onCancel }: StopLoggerProps) {
  const [selectedType, setSelectedType] = useState<StopType>('restroom')
  const [duration,     setDuration]     = useState('')
  const meta = STOP_TYPE_META[selectedType]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '.75rem .9rem', background: 'var(--surface-2)', borderRadius: 12, marginTop: 8 }}>
      <div style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
        Log Stop — Recovery Credit
      </div>

      {/* Stop type picker */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {QUICK_STOP_TYPES.map(type => {
          const m   = STOP_TYPE_META[type]
          const sel = type === selectedType
          return (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              style={{
                padding: '.22rem .5rem', borderRadius: 20, fontSize: '.65rem', fontWeight: sel ? 800 : 600,
                border: `1.5px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
                background: sel ? 'rgba(0,232,176,.12)' : 'transparent',
                color: sel ? 'var(--primary)' : 'var(--muted)', cursor: 'pointer',
              }}
            >
              {m.emoji} {m.label}
            </button>
          )
        })}
      </div>

      {/* Duration + credit preview */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="number"
          inputMode="numeric"
          placeholder={`${meta.suggestedMinDuration} min`}
          value={duration}
          onChange={e => setDuration(e.target.value)}
          style={{
            width: 80, padding: '.4rem .55rem', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', fontSize: '.88rem', outline: 'none',
          }}
        />
        {duration && parseFloat(duration) > 0 && (
          <div style={{ fontSize: '.68rem', color: 'var(--primary)', fontWeight: 700 }}>
            +{(parseFloat(duration) * meta.coefficient).toFixed(1)} min credit
            <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>
              ({Math.round(meta.coefficient * 100)}% of {duration}m)
            </span>
          </div>
        )}
      </div>

      {/* DOT eligibility note */}
      {meta.isDotEligible && duration && parseFloat(duration) >= 30 && (
        <div style={{ fontSize: '.65rem', color: '#60c8ff', fontWeight: 700 }}>
          ⚖️ This stop may satisfy DOT 30-min break requirement
        </div>
      )}
      {meta.passive && (
        <div style={{ fontSize: '.63rem', color: 'var(--muted)', fontStyle: 'italic' }}>
          Passive stop — HOS clock continues. Partial fatigue benefit only.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            const d = parseFloat(duration)
            if (!d || d <= 0) return
            onLogged(selectedType, d)
          }}
          disabled={!duration || parseFloat(duration) <= 0}
          style={{
            flex: 1, padding: '.55rem', borderRadius: 9, border: 'none',
            background: !duration || parseFloat(duration) <= 0
              ? 'var(--surface)' : 'rgba(0,232,176,.15)',
            color: !duration || parseFloat(duration) <= 0
              ? 'var(--muted)' : 'var(--primary)',
            fontWeight: 800, fontSize: '.82rem',
            cursor: !duration || parseFloat(duration) <= 0 ? 'default' : 'pointer',
          }}
        >
          ✓ Apply Credit
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '.55rem .8rem', borderRadius: 9,
            border: '1px solid var(--border)', background: 'none',
            color: 'var(--muted)', fontWeight: 600, fontSize: '.82rem', cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Fatigue meter ─────────────────────────────────────────────────────────────

function FatigueMeter({ fatigue, maxFatigue = 120 }: { fatigue: number; maxFatigue?: number }) {
  const pct   = Math.min(100, (fatigue / maxFatigue) * 100)
  const color = fatigue >= 90 ? 'var(--error)' : fatigue >= 70 ? 'var(--warn)' : fatigue >= 50 ? '#60c8ff' : 'var(--primary)'

  return (
    <div style={{ height: 5, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${pct}%`, borderRadius: 4,
        background: color, transition: 'width .5s ease, background .3s',
      }} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  /** Injected by DrivingModeOverlay — updates every second via liveClock */
  nowMs?:          number
  compact?:        boolean   // collapsed form for tight spaces
}

export default function RecoveryAdvisor({ nowMs, compact = false }: Props) {
  const [session,       setSession]       = useState<RecoverySession | null>(null)
  const [status,        setStatus]        = useState<RecoveryStatus | null>(null)
  const [showLogger,    setShowLogger]    = useState(false)
  const [lastAdjMsg,    setLastAdjMsg]    = useState<string | null>(null)
  const adjMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [expanded,      setExpanded]      = useState(false)

  const refresh = useCallback(() => {
    const s  = getOrCreateSession()
    const st = deriveRecoveryStatus(s, nowMs ?? Date.now())
    setSession(s)
    setStatus(st)
  }, [nowMs])

  useEffect(() => { refresh() }, [refresh])

  function handleLogged(type: StopType, duration: number) {
    const { status: newStatus } = logRecoveryStop(type, duration)
    setShowLogger(false)

    // Show adjustment message for 8 seconds
    const meta  = STOP_TYPE_META[type]
    const credit = duration * meta.coefficient
    const msg = `${meta.emoji} ${meta.label} credited · +${credit.toFixed(1)} min recovery · cadence adjusted`
    setLastAdjMsg(msg)
    if (adjMsgTimer.current) clearTimeout(adjMsgTimer.current)
    adjMsgTimer.current = setTimeout(() => setLastAdjMsg(null), 8_000)

    refresh()
  }

  if (!status || !session) return null

  const fatColor = getFatigueLevelColor(status.fatigueLevel)
  const isRest   = status.fatigueLevel === 'high' || status.fatigueLevel === 'critical'

  if (compact) {
    // Collapsed strip — just fatigue level + time remaining
    return (
      <div
        onClick={() => setExpanded(p => !p)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          padding: '.5rem .8rem',
          background: isRest ? `${fatColor}0d` : 'rgba(0,0,0,.15)',
          borderRadius: 10, border: `1px solid ${fatColor}30`,
        }}
      >
        <span style={{ fontSize: '.85rem' }}>
          {status.fatigueLevel === 'critical' ? '⚠️' : status.fatigueLevel === 'high' ? '🟡' : '⚡'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '.72rem', fontWeight: 800, color: fatColor }}>
            {getFatigueLevelLabel(status.fatigueLevel)}
          </span>
          <span style={{ fontSize: '.68rem', color: 'var(--muted)', marginLeft: 8 }}>
            {formatDriveTime(status.continuousDriveMin)} driving
          </span>
        </div>
        <span style={{ fontSize: '.65rem', color: 'var(--muted)' }}>{expanded ? '▲' : '▼'}</span>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--surface-2)', borderRadius: 14,
      border: `1.5px solid ${fatColor}25`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(p => !p)}
        style={{
          padding: '.65rem .9rem .55rem',
          background: `${fatColor}0c`,
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>
            {status.fatigueLevel === 'critical' ? '⚠️' :
             status.fatigueLevel === 'high'     ? '🟡' :
             status.fatigueLevel === 'elevated' ? '🟢' : '⚡'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 900, fontSize: '.85rem', color: fatColor }}>
                {getFatigueLevelLabel(status.fatigueLevel)}
              </span>
              <span style={{
                fontSize: '.6rem', fontWeight: 700, color: 'var(--muted)',
                background: 'var(--surface)', padding: '1px 7px', borderRadius: 20,
                border: '1px solid var(--border)',
              }}>
                Operational Guidance
              </span>
            </div>
            <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 1 }}>
              {formatDriveTime(status.continuousDriveMin)} continuous ·{' '}
              {status.nextSuggestedStopIn <= 0
                ? 'recovery stop advised'
                : `next stop in ${Math.round(status.nextSuggestedStopIn)} min`}
            </div>
          </div>
        </div>
        <span style={{ fontSize: '.72rem', color: 'var(--muted)', flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Fatigue meter — always visible */}
      <div style={{ padding: '0 .9rem', marginTop: 6, marginBottom: expanded ? 0 : 6 }}>
        <FatigueMeter fatigue={status.netFatigueMinutes} />
      </div>

      {expanded && (
        <div style={{ padding: '.65rem .9rem .75rem', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Adjustment message — fades after 8s */}
          {lastAdjMsg && (
            <div style={{
              padding: '.45rem .7rem', borderRadius: 9,
              background: 'rgba(0,232,176,.1)', border: '1px solid rgba(0,232,176,.25)',
              fontSize: '.72rem', fontWeight: 700, color: 'var(--primary)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>✅</span>
              <span>Cadence rebalanced — {lastAdjMsg.split('·')[2]?.trim() ?? 'adjusted'}</span>
            </div>
          )}

          {/* Status message */}
          <div style={{ fontSize: '.78rem', color: 'var(--text)', fontWeight: 600, lineHeight: 1.4 }}>
            {status.statusMessage}
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <div style={{ background: 'var(--surface)', borderRadius: 9, padding: '.5rem .6rem' }}>
              <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 2 }}>DRIVING</div>
              <div style={{ fontWeight: 900, fontSize: '.85rem', color: fatColor }}>
                {formatDriveTime(status.continuousDriveMin)}
              </div>
            </div>
            <div style={{ background: 'var(--surface)', borderRadius: 9, padding: '.5rem .6rem' }}>
              <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 2 }}>NEXT STOP</div>
              <div style={{ fontWeight: 900, fontSize: '.85rem' }}>
                {status.nextSuggestedStopIn <= 0
                  ? <span style={{ color: 'var(--warn)' }}>Now</span>
                  : `${Math.round(status.nextSuggestedStopIn)}m`}
              </div>
            </div>
            <div style={{ background: 'var(--surface)', borderRadius: 9, padding: '.5rem .6rem' }}>
              <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 2 }}>QUALITY</div>
              <div style={{ fontWeight: 900, fontSize: '.85rem', color: status.recoveryQualityPct >= 70 ? 'var(--primary)' : 'var(--warn)' }}>
                {status.recoveryQualityPct}%
              </div>
            </div>
          </div>

          {/* Suggested stop when due */}
          {(status.fatigueLevel === 'high' || status.fatigueLevel === 'critical') && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '.55rem .75rem', borderRadius: 10,
              background: `${fatColor}10`, border: `1px solid ${fatColor}30`,
            }}>
              <span style={{ fontSize: '1.1rem' }}>
                {status.fatigueLevel === 'critical' ? '⚠️' : '🟡'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '.8rem', color: fatColor }}>
                  Suggested adjustment: {status.suggestedStopDuration} min recovery stop
                </div>
                <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 1 }}>
                  Operational rebalance — not a compliance requirement
                </div>
              </div>
            </div>
          )}

          {/* Log stop button */}
          {!showLogger && (
            <button
              onClick={() => setShowLogger(true)}
              style={{
                width: '100%', padding: '.6rem', borderRadius: 10,
                border: '1px dashed rgba(0,232,176,.3)', background: 'rgba(0,232,176,.05)',
                color: 'var(--primary)', fontWeight: 700, fontSize: '.8rem', cursor: 'pointer',
              }}
            >
              ⏱ Log Unplanned Stop — Apply Recovery Credit
            </button>
          )}

          {showLogger && (
            <StopLogger
              onLogged={handleLogged}
              onCancel={() => setShowLogger(false)}
            />
          )}

          {/* Recent credits */}
          {session.events.length > 0 && (
            <div>
              <div style={{ fontSize: '.6rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>
                Credits Applied
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[...session.events].reverse().slice(0, 3).map(ev => {
                  const m = STOP_TYPE_META[ev.stopType]
                  return (
                    <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.7rem' }}>
                      <span>{m.emoji}</span>
                      <span style={{ color: 'var(--muted)', flex: 1 }}>{m.label} · {ev.durationMin}m</span>
                      <span style={{ color: 'var(--primary)', fontWeight: 700 }}>+{ev.recoveryCredit.toFixed(1)}m</span>
                      {ev.passive && <span style={{ color: 'var(--muted)', fontSize: '.6rem' }}>(passive)</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Compliance separator — DOT break is SEPARATE */}
          <div style={{
            marginTop: 2,
            padding: '.5rem .75rem', borderRadius: 9,
            background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '.58rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              DOT Compliance — Separate System
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                DOT 30-min break
              </span>
              <span style={{
                fontSize: '.68rem', fontWeight: 800,
                color: status.dotBreakSatisfied ? 'var(--success)'
                  : status.dotBreakStatus === 'required' ? 'var(--error)'
                  : status.dotBreakStatus === 'due_soon' ? 'var(--warn)'
                  : 'var(--muted)',
              }}>
                {status.dotBreakSatisfied ? '✅ Satisfied'
                  : status.dotBreakStatus === 'required' ? '🛑 Required'
                  : status.dotBreakStatus === 'due_soon' ? '⚠️ Due soon'
                  : status.dotBreakStatus === 'monitoring' ? `${Math.round(status.dotBreakCreditMin)}m accrued`
                  : 'Not yet needed'}
              </span>
            </div>
            <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: 3, fontStyle: 'italic' }}>
              Recovery credits never affect DOT compliance requirements
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
