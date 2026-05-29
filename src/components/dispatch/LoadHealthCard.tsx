'use client'
/**
 * LoadHealthCard — DispatchOps AI v2
 *
 * Composite health score card for a single active load.
 * Shows: overall score ring, sub-scores, stall timer, risk flags,
 * recovery windows, and exception actions.
 *
 * Stall timer re-evaluates every 60 seconds via setInterval.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  type LoadHealthScore,
  type RecoveryWindow,
  type RiskFlag,
  HEALTH_STATUS_META,
  STALL_META,
  healthScoreColor,
  stallTimeLabel,
  recoveryUrgencyLabel,
  deriveLoadHealth,
  syncExceptionsFromHealth,
  type DeriveHealthOpts,
} from '@/lib/loadHealthEngine'

// ── Sub-score bar ─────────────────────────────────────────────────────────────

function SubScoreBar({ label, value, icon }: { label: string; value: number; icon: string }) {
  const color =
    value >= 80 ? 'var(--primary)' :
    value >= 60 ? 'var(--warn)' :
    value >= 40 ? '#f97316' : 'var(--error)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          {icon} {label}
        </span>
        <span style={{ fontSize: '.68rem', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{
          width: `${value}%`, height: '100%', borderRadius: 2,
          background: value >= 80
            ? 'linear-gradient(90deg,rgba(0,232,176,.6),rgba(0,200,144,.9))'
            : value >= 60 ? 'rgba(245,194,0,.7)' : value >= 40 ? 'rgba(249,115,22,.7)' : 'rgba(232,64,0,.7)',
          transition: 'width .6s ease',
        }} />
      </div>
    </div>
  )
}

// ── Risk flag chip ────────────────────────────────────────────────────────────

function FlagChip({ flag }: { flag: RiskFlag }) {
  const color  = flag.severity === 'critical' ? 'var(--error)' : 'var(--warn)'
  const bg     = flag.severity === 'critical' ? 'rgba(232,64,0,.08)' : 'rgba(245,194,0,.07)'
  const border = flag.severity === 'critical' ? 'rgba(232,64,0,.25)' : 'rgba(245,194,0,.25)'
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '.25rem .6rem', borderRadius: 20,
      background: bg, border: `1px solid ${border}`,
      fontSize: '.6rem', fontWeight: 800, color,
    }}>
      {flag.severity === 'critical' ? '🚨' : '⚠️'}
      {flag.label}
      {flag.value && <span style={{ opacity: .75 }}>· {flag.value}</span>}
    </div>
  )
}

// ── Recovery window card ──────────────────────────────────────────────────────

function RecoveryCard({ w, onAct }: { w: RecoveryWindow; onAct: (w: RecoveryWindow) => void }) {
  const ACTION_EMOJI: Record<string, string> = {
    rest_stop: '🛑', reroute: '🗺', reassign: '🔄',
    extend_delivery: '📅', contact_customer: '📞',
    contact_driver: '📱', schedule_repair: '🔧', split_load: '✂️',
  }
  const urgColor = w.urgencyMins <= 15 ? 'var(--error)' : w.urgencyMins <= 30 ? 'var(--warn)' : 'var(--muted)'

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'start',
      padding: '.65rem .8rem', borderRadius: 10,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: '.72rem', color: 'var(--text)', marginBottom: 3 }}>
          {ACTION_EMOJI[w.type] ?? '▶️'} {w.title}
        </div>
        <div style={{ fontSize: '.62rem', color: 'var(--muted)', lineHeight: 1.55, marginBottom: 4 }}>
          {w.description}
        </div>
        <div style={{ fontSize: '.58rem', fontWeight: 800, color: urgColor }}>
          ⏰ {recoveryUrgencyLabel(w.urgencyMins)}
        </div>
      </div>
      <button
        onClick={() => onAct(w)}
        style={{
          padding: '.35rem .65rem', borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--surface)', color: 'var(--primary)',
          fontSize: '.62rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        Log Action
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  loadNumber:   string
  driverName?:  string
  opts?:        DeriveHealthOpts
  compact?:     boolean             // single-line banner mode
  onActionLog?: (w: RecoveryWindow, loadNumber: string) => void
}

export default function LoadHealthCard({
  loadNumber,
  driverName,
  opts = {},
  compact = false,
  onActionLog,
}: Props) {
  const [score,    setScore]    = useState<LoadHealthScore | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [actioned, setActioned] = useState<string | null>(null)

  const refresh = useCallback(() => {
    const s = deriveLoadHealth(loadNumber, opts)
    syncExceptionsFromHealth(s)
    setScore(s)
  }, [loadNumber, JSON.stringify(opts)])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh()
    // Re-evaluate every 60 s (stall timer)
    const t = setInterval(refresh, 60_000)
    return () => clearInterval(t)
  }, [refresh])

  const handleAction = (w: RecoveryWindow) => {
    setActioned(w.type)
    onActionLog?.(w, loadNumber)
    setTimeout(() => setActioned(null), 4000)
  }

  if (!score) return null

  const meta  = HEALTH_STATUS_META[score.status]
  const stall = STALL_META[score.stallRisk]

  // ── Compact banner mode ──────────────────────────────────────────────────
  if (compact) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '.55rem .9rem', borderRadius: 10,
        background: meta.bg, border: `1px solid ${meta.border}`,
      }}>
        <span style={{ fontSize: '1rem' }}>{meta.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 800, fontSize: '.78rem', color: meta.color }}>
            Load #{loadNumber} — {meta.label}
          </span>
          {driverName && (
            <span style={{ fontSize: '.65rem', color: 'var(--muted)', marginLeft: 8 }}>{driverName}</span>
          )}
        </div>
        <span style={{ fontSize: '.72rem', fontWeight: 900, color: healthScoreColor(score.overall) }}>
          {score.overall}
        </span>
        <span style={{ fontSize: '.7rem' }}>{stall.emoji}</span>
      </div>
    )
  }

  // ── Full card mode ───────────────────────────────────────────────────────
  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${meta.border}`,
      borderRadius: 16, overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          padding: '.9rem 1rem', background: meta.bg, border: 'none',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        {/* Score ring (simple circle) */}
        <div style={{
          width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
          border: `3px solid ${healthScoreColor(score.overall)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surface)',
        }}>
          <span style={{ fontSize: '.7rem', fontWeight: 900, color: healthScoreColor(score.overall) }}>
            {score.overall}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: '.85rem', fontWeight: 900, color: meta.color }}>{meta.emoji} {meta.label}</span>
            <span style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700 }}>Load #{loadNumber}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '.6rem', fontWeight: 800, color: stall.color,
              padding: '.15rem .5rem', borderRadius: 10,
              background: stall.bg, border: `1px solid ${stall.border}`,
            }}>
              {stall.emoji} {stall.label} · {stallTimeLabel(score.stallMinutes)}
            </span>
            {score.etaSlipMins > 0 && (
              <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--warn)' }}>
                ⏱ +{score.etaSlipMins}m slip
              </span>
            )}
            {driverName && (
              <span style={{ fontSize: '.6rem', color: 'var(--muted)' }}>🚛 {driverName}</span>
            )}
          </div>
        </div>

        <span style={{ fontSize: '.7rem', color: 'var(--muted)', flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Risk flags row */}
      {score.riskFlags.length > 0 && (
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap', padding: '.5rem 1rem',
          borderTop: '1px solid var(--border)', background: 'var(--surface)',
        }}>
          {score.riskFlags.slice(0, 4).map((f, i) => <FlagChip key={i} flag={f} />)}
          {score.riskFlags.length > 4 && (
            <span style={{ fontSize: '.6rem', color: 'var(--muted)', alignSelf: 'center' }}>
              +{score.riskFlags.length - 4} more
            </span>
          )}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '.9rem 1rem', borderTop: '1px solid var(--border)', display: 'grid', gap: '.9rem' }}>

          {/* Sub-scores */}
          <div>
            <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.5rem' }}>
              Health Breakdown
            </div>
            <div style={{ display: 'grid', gap: '.55rem' }}>
              <SubScoreBar label="ETA Confidence"    value={score.etaConfidence}   icon="🎯" />
              <SubScoreBar label="HOS Feasibility"   value={score.legalCompletion} icon="⏱" />
              <SubScoreBar label="Weather Exposure"  value={score.weatherExposure} icon="🌤" />
              <SubScoreBar label="Movement Activity" value={score.movementScore}   icon="🚛" />
            </div>
          </div>

          {/* Projected arrival */}
          {score.projectedArrival && (
            <div style={{
              padding: '.6rem .8rem', borderRadius: 10,
              background: 'rgba(245,194,0,.07)', border: '1px solid rgba(245,194,0,.2)',
            }}>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--warn)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>
                ⏰ Projected Arrival (adjusted)
              </div>
              <div style={{ fontSize: '.8rem', fontWeight: 900, color: 'var(--text)' }}>
                {new Date(score.projectedArrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                <span style={{ fontSize: '.65rem', color: 'var(--muted)', fontWeight: 600, marginLeft: 6 }}>
                  {new Date(score.projectedArrival).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: 2 }}>
                Accounts for {score.etaSlipMins > 0 ? `${score.etaSlipMins}m ETA slip` : ''}
                {score.stallMinutes > 30 ? ` + ${score.stallMinutes - 20}m stall delay` : ''}
              </div>
            </div>
          )}

          {/* Recovery windows */}
          {score.recoveryWindows.length > 0 && (
            <div>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.5rem' }}>
                🛠 Recovery Actions
              </div>
              <div style={{ display: 'grid', gap: '.4rem' }}>
                {score.recoveryWindows.map((w, i) => (
                  <div key={i}>
                    {actioned === w.type ? (
                      <div style={{
                        padding: '.6rem .8rem', borderRadius: 10, fontSize: '.68rem',
                        fontWeight: 800, color: 'var(--primary)',
                        background: 'rgba(0,232,176,.07)', border: '1px solid rgba(0,232,176,.2)',
                      }}>
                        ✅ Action logged — {w.title}
                      </div>
                    ) : (
                      <RecoveryCard w={w} onAct={handleAction} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All clear */}
          {score.riskFlags.length === 0 && score.recoveryWindows.length === 0 && (
            <div style={{
              padding: '.7rem .9rem', borderRadius: 10,
              background: 'rgba(0,232,176,.06)', border: '1px solid rgba(0,232,176,.18)',
              fontSize: '.72rem', fontWeight: 800, color: 'var(--primary)',
            }}>
              ✅ No active risk flags — load progressing on schedule
            </div>
          )}

          {/* Stall detail */}
          <div style={{
            padding: '.5rem .75rem', borderRadius: 8,
            background: stall.bg, border: `1px solid ${stall.border}`,
            fontSize: '.62rem', color: stall.color, fontWeight: 700,
          }}>
            {stall.emoji} {stall.description}
          </div>
        </div>
      )}
    </div>
  )
}
