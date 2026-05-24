'use client'
/**
 * TireMonitorBanner — Dispatch feed card for active tire monitoring.
 *
 * Shows when any tire position from the last TireLog is being tracked.
 * Renders per-position status rows with comparison history trail.
 *
 * Dispatch feed output format:
 *   ⚠️ Tire Monitoring Active
 *   D1 LO: same → worse  (Warning)
 *   Continue monitoring at next fuel/rest stop.
 */
import { type TireMonitorEntry, type TireComparison, type TireMonitorStatus } from '@/lib/trailerIntelligence'

// ── Meta ──────────────────────────────────────────────────────────────────────

const TIER_COLOR: Record<string, string> = {
  critical:     'var(--error)',
  urgent:       '#ff6b35',
  warning:      'var(--warn)',
  preventative: 'var(--primary)',
}

const STATUS_META: Record<TireMonitorStatus, { label: string; emoji: string; color: string }> = {
  stable_monitoring: { label: 'Monitor',         emoji: '🔵', color: 'var(--primary)' },
  worsening:         { label: 'Worsening',        emoji: '⚠️', color: 'var(--warn)'    },
  service_needed:    { label: 'Service Needed',   emoji: '🛑', color: 'var(--error)'   },
  resolved:          { label: 'Resolved',         emoji: '✅', color: 'var(--success)' },
}

const COMP_SYMBOL: Record<TireComparison, string> = {
  better: '👍',
  same:   '✅',
  worse:  '⚠️',
}

function fmtTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hrs  = Math.floor(diff / 3600000)
  if (mins < 2)  return 'now'
  if (mins < 60) return `${mins}m ago`
  if (hrs  < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  entries:        TireMonitorEntry[]
  onRecheck?:     () => void   // opens TireReinspectionSheet
  compact?:       boolean      // collapsed view for dashboard cards
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TireMonitorBanner({ entries, onRecheck, compact = false }: Props) {
  if (entries.length === 0) return null

  // Hide resolved entries from the default view
  const active   = entries.filter(e => e.status !== 'resolved')
  const resolved = entries.filter(e => e.status === 'resolved')

  if (active.length === 0 && resolved.length === 0) return null

  // Derive worst tier across all active entries
  const ORDER = { critical: 0, urgent: 1, warning: 2, preventative: 3 } as const
  const worstTier = active.reduce<string>(
    (best, e) => (ORDER[e.tier as keyof typeof ORDER] < ORDER[best as keyof typeof ORDER] ? e.tier : best),
    'preventative',
  )
  const headerColor = TIER_COLOR[worstTier]
  const hasUrgent   = worstTier === 'critical' || worstTier === 'urgent'
  const hasWarning  = worstTier === 'warning'

  const headerEmoji = hasUrgent ? '🛑' : hasWarning ? '⚠️' : '🔵'
  const headerLabel = hasUrgent
    ? 'Tire Monitoring — Service Needed'
    : hasWarning
      ? 'Tire Monitoring — Worsening'
      : 'Tire Monitoring Active'

  // Dispatch feed advice copy
  const advice = hasUrgent
    ? 'One or more tires require immediate service. Do not continue without inspection.'
    : hasWarning
      ? 'Tire condition worsening. Plan service at next available stop.'
      : 'Condition unchanged after roadside recheck. Continue monitoring at next fuel/rest stop.'

  return (
    <div style={{
      background: `${headerColor}0d`,
      border: `1.5px solid ${headerColor}40`,
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '.6rem .9rem',
        background: `${headerColor}14`,
        borderBottom: active.length > 0 ? `1px solid ${headerColor}25` : 'none',
      }}>
        <span style={{ fontSize: '1rem' }}>{headerEmoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: '.82rem', color: headerColor }}>
            {headerLabel}
          </div>
          {!compact && (
            <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 1 }}>
              {active.length} position{active.length !== 1 ? 's' : ''} under watch
              {resolved.length > 0 && ` · ${resolved.length} resolved`}
            </div>
          )}
        </div>
        {onRecheck && (
          <button
            onClick={onRecheck}
            style={{
              padding: '.35rem .7rem', borderRadius: 8, border: `1.5px solid ${headerColor}60`,
              background: `${headerColor}14`, color: headerColor,
              fontWeight: 800, fontSize: '.72rem', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            🔁 Recheck
          </button>
        )}
      </div>

      {/* Per-position rows */}
      {active.length > 0 && (
        <div style={{ padding: '.5rem .9rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {active.map(entry => {
            const sm     = STATUS_META[entry.status]
            const tc     = TIER_COLOR[entry.tier]
            const histStr = entry.history.length > 0
              ? entry.history.map(c => COMP_SYMBOL[c]).join(' → ')
              : '—'

            return (
              <div key={entry.position} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '.45rem .65rem',
                background: 'var(--surface-2)', borderRadius: 9,
                borderLeft: `3px solid ${tc}`,
              }}>
                {/* Position + history */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: '.82rem' }}>{entry.label}</span>
                    <span style={{ fontSize: '.68rem', color: 'var(--muted)', fontFamily: 'monospace' }}>
                      {histStr}
                    </span>
                  </div>
                  <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 1, display: 'flex', gap: 8 }}>
                    <span style={{ textTransform: 'capitalize' }}>
                      base: {entry.baseReading.condition.replace('_', ' ')}
                      {entry.baseReading.treadDepth !== undefined && ` · ${entry.baseReading.treadDepth}/32"`}
                      {entry.baseReading.psi !== undefined && ` · ${entry.baseReading.psi} PSI`}
                    </span>
                    <span>checked {fmtTime(entry.lastChecked)}</span>
                  </div>
                </div>

                {/* Status chip */}
                <span style={{
                  fontSize: '.63rem', fontWeight: 800, whiteSpace: 'nowrap',
                  color: sm.color, background: `${sm.color}18`,
                  padding: '2px 8px', borderRadius: 20, border: `1px solid ${sm.color}40`,
                  flexShrink: 0,
                }}>
                  {sm.emoji} {sm.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Dispatch feed advice */}
      {!compact && (
        <div style={{ padding: '.45rem .9rem .65rem', borderTop: active.length > 0 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontStyle: 'italic' }}>
            {advice}
          </div>
          {resolved.length > 0 && (
            <div style={{ marginTop: 4, fontSize: '.68rem', color: 'var(--success)', fontWeight: 700 }}>
              ✅ {resolved.length} tire{resolved.length !== 1 ? 's' : ''} resolved since last log
            </div>
          )}
        </div>
      )}
    </div>
  )
}
