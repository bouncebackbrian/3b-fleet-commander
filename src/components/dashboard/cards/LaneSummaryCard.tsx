'use client'
import type { LaneMetrics } from '@/hooks/useLaneIntelligence'

interface Props {
  metrics:   LaneMetrics | null
  loading?:  boolean
  onTap?:    () => void
}

const RISK_STYLE: Record<
  'LOW' | 'MODERATE' | 'HIGH',
  { bg: string; border: string; color: string; label: string; dot: string }
> = {
  LOW:      { bg: 'rgba(40,192,72,.08)',    border: 'rgba(40,192,72,.2)',    color: 'var(--success)', label: 'LOW RISK',      dot: '🟢' },
  MODERATE: { bg: 'rgba(245,194,0,.08)',    border: 'rgba(245,194,0,.2)',    color: 'var(--warn)',    label: 'MODERATE RISK', dot: '🟡' },
  HIGH:     { bg: 'rgba(232,64,0,.08)',     border: 'rgba(232,64,0,.2)',     color: 'var(--error)',   label: 'HIGH RISK',     dot: '🔴' },
}

const CONF_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low:    '⚠ low data',
  medium: '~data',
  high:   '✓ verified',
}

export default function LaneSummaryCard({ metrics, loading, onTap }: Props) {
  // Never mount if there's no data yet
  if (loading) {
    return (
      <div style={{
        padding: '.5rem .85rem', borderRadius: 9,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
        Loading lane history…
      </div>
    )
  }

  // No runs on this lane — render nothing (don't clutter the card)
  if (!metrics || metrics.totalRuns === 0) return null

  const rs = RISK_STYLE[metrics.riskLevel]
  const stars = metrics.avgRating != null
    ? `${metrics.avgRating.toFixed(1)}★`
    : null
  const wra = metrics.wouldRunAgainPct != null
    ? `${Math.round(metrics.wouldRunAgainPct)}% run again`
    : null
  const topIssue = metrics.riskReasons[0] ?? null
  const confLabel = CONF_LABEL[metrics.confidence]

  return (
    <button
      onClick={onTap}
      disabled={!onTap}
      style={{
        all: 'unset',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '.55rem .85rem',
        borderRadius: 9,
        background: rs.bg,
        border: `1px solid ${rs.border}`,
        cursor: onTap ? 'pointer' : 'default',
        boxSizing: 'border-box',
      }}
      aria-label={`Lane intelligence — ${metrics.totalRuns} run${metrics.totalRuns !== 1 ? 's' : ''}`}
    >
      {/* Risk dot + label */}
      <span style={{ fontSize: '.75rem', flexShrink: 0 }}>{rs.dot}</span>
      <span style={{
        fontWeight: 900, fontSize: '.65rem', letterSpacing: '.06em',
        color: rs.color, textTransform: 'uppercase', flexShrink: 0,
      }}>
        {rs.label}
      </span>

      {/* Divider */}
      <span style={{ color: 'var(--border)', flexShrink: 0 }}>|</span>

      {/* Run count */}
      <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text)', flexShrink: 0, whiteSpace: 'nowrap' }}>
        {metrics.totalRuns} run{metrics.totalRuns !== 1 ? 's' : ''}
      </span>

      {/* Rating */}
      {stars && (
        <>
          <span style={{ color: 'var(--border)', flexShrink: 0 }}>·</span>
          <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#f5c200', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {stars}
          </span>
        </>
      )}

      {/* Would run again */}
      {wra && (
        <>
          <span style={{ color: 'var(--border)', flexShrink: 0 }}>·</span>
          <span style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {wra}
          </span>
        </>
      )}

      {/* Top risk reason — truncated */}
      {topIssue && (
        <span style={{
          fontSize: '.65rem', fontWeight: 600, color: rs.color,
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minWidth: 0,
        }}>
          · {topIssue}
        </span>
      )}

      {/* Confidence + tap hint */}
      <span style={{
        fontSize: '.6rem', fontWeight: 700, color: 'var(--muted)',
        flexShrink: 0, marginLeft: 'auto', whiteSpace: 'nowrap',
      }}>
        {confLabel}{onTap ? ' →' : ''}
      </span>
    </button>
  )
}
