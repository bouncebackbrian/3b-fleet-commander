'use client'
/**
 * EscalationPanel — Escalation Engine + Stall Prevention
 *
 * Shows active escalation tier records, stall escalations, and notification
 * log. Allows dispatchers to log actions, escalate manually, and resolve.
 *
 * Runs auto-escalation check on mount + every 60 s.
 * Mounts as a tab inside DispatchOpsPanel.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  type EscalationTierRecord,
  type StallEscalation,
  type EscalationTier,
  type EscalationSummary,
  TIER_META,
  readTierRecords,
  readStallEscalations,
  readNotifications,
  escalateTier,
  resolveEscalation,
  resolveStallEscalation,
  logEscalationAction,
  runAutoEscalationCheck,
  buildEscalationSummary,
  elapsedLabel,
  tierColor,
} from '@/lib/escalationEngine'

function ElapsedBadge({ startedAt }: { startedAt: string }) {
  return (
    <span style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700 }}>
      {elapsedLabel(startedAt)}
    </span>
  )
}

// ── Tier badge ────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: EscalationTier }) {
  const meta = TIER_META[tier]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '.15rem .55rem', borderRadius: 20,
      background: meta.bg, border: `1px solid ${meta.border}`,
      fontSize: '.6rem', fontWeight: 900, color: meta.color,
    }}>
      {meta.emoji} {meta.tier}
    </span>
  )
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function EscalationSummaryBar({ summary }: { summary: EscalationSummary }) {
  if (summary.openCount === 0 && summary.activeStalls === 0) {
    return (
      <div style={{
        padding: '.65rem .9rem', borderRadius: 10,
        background: 'rgba(0,232,176,.06)', border: '1px solid rgba(0,232,176,.18)',
        fontSize: '.7rem', fontWeight: 800, color: 'var(--primary)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        🛰 L0 Monitoring — No active escalations
      </div>
    )
  }

  const topMeta = summary.topTier ? TIER_META[summary.topTier] : null

  return (
    <div style={{
      padding: '.65rem .9rem', borderRadius: 10,
      background: topMeta?.bg ?? 'var(--surface-2)',
      border: `1px solid ${topMeta?.border ?? 'var(--border)'}`,
      display: 'grid', gap: '.4rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 900, fontSize: '.75rem', color: topMeta?.color ?? 'var(--text)' }}>
          {topMeta?.emoji} Top Tier: {topMeta?.label}
        </div>
        <div style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)' }}>
          {summary.openCount} open · {summary.activeStalls} stall{summary.activeStalls !== 1 ? 's' : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        {[
          { tier: 'L1' as EscalationTier, count: summary.l1Count },
          { tier: 'L2' as EscalationTier, count: summary.l2Count },
          { tier: 'L3' as EscalationTier, count: summary.l3Count },
        ].filter(t => t.count > 0).map(t => {
          const m = TIER_META[t.tier]
          return (
            <span key={t.tier} style={{
              fontSize: '.6rem', fontWeight: 800, color: m.color,
              padding: '.15rem .5rem', borderRadius: 10, background: m.bg, border: `1px solid ${m.border}`,
            }}>
              {m.emoji} {t.tier}: {t.count}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Tier record card ──────────────────────────────────────────────────────────

interface TierCardProps {
  rec:        EscalationTierRecord
  dispatcher: string
  onRefresh:  () => void
}

function TierRecordCard({ rec, dispatcher, onRefresh }: TierCardProps) {
  const [acting,   setActing]   = useState(false)
  const [resolving, setResolving] = useState(false)
  const [note,     setNote]     = useState('')
  const meta = TIER_META[rec.tier]

  const handleAction = () => {
    if (!note.trim()) return
    logEscalationAction(rec.id, dispatcher, 'dispatcher', 'note_added', note.trim())
    setNote('')
    setActing(false)
    onRefresh()
  }

  const handleResolve = () => {
    if (!note.trim()) return
    resolveEscalation(rec.id, dispatcher, note.trim())
    setNote('')
    setResolving(false)
    onRefresh()
  }

  const handleEscalate = () => {
    escalateTier(rec.id, `Manually escalated by ${dispatcher}`, dispatcher)
    onRefresh()
  }

  const tierOrder: EscalationTier[] = ['L0', 'L1', 'L2', 'L3']
  const canEscalate = rec.status === 'active' && tierOrder.indexOf(rec.tier) < tierOrder.length - 1

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden',
      border: `1px solid ${meta.border}`,
      background: 'var(--surface)',
    }}>
      {/* Header */}
      <div style={{
        padding: '.7rem .9rem', background: meta.bg,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <TierBadge tier={rec.tier} />
            <span style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--text)' }}>
              Load #{rec.loadNumber}
            </span>
            <ElapsedBadge startedAt={rec.startedAt} />
          </div>
          <div style={{ fontSize: '.62rem', color: 'var(--muted)', lineHeight: 1.45 }}>
            {meta.description}
          </div>
          <div style={{ fontSize: '.58rem', color: 'var(--muted)', marginTop: 3 }}>
            Trigger: {rec.triggerDetail ?? rec.triggerType}
          </div>
        </div>
        {rec.status === 'active' && (
          <span style={{
            fontSize: '.58rem', fontWeight: 800, color: meta.color,
            padding: '.15rem .5rem', borderRadius: 10,
            background: 'var(--surface)', border: `1px solid ${meta.border}`,
            flexShrink: 0,
          }}>
            ACTIVE
          </span>
        )}
      </div>

      {/* Actions */}
      {rec.status === 'active' && (
        <div style={{ padding: '.6rem .9rem', borderTop: '1px solid var(--border)', display: 'grid', gap: '.4rem' }}>
          {/* Action log */}
          {rec.actions.length > 0 && (
            <div style={{ display: 'grid', gap: '.25rem', marginBottom: '.25rem' }}>
              {rec.actions.slice(0, 3).map(a => (
                <div key={a.id} style={{ fontSize: '.6rem', color: 'var(--muted)', display: 'flex', gap: 6, lineHeight: 1.4 }}>
                  <span style={{ color: 'var(--primary)', flexShrink: 0 }}>✓</span>
                  <span><strong>{a.actor}</strong>: {a.note}</span>
                  <span style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--faint)' }}>
                    {elapsedLabel(a.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Inline forms */}
          {(acting || resolving) && (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={resolving ? 'Resolution note…' : 'Action note…'}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') resolving ? handleResolve() : handleAction() }}
                style={{
                  flex: 1, padding: '.35rem .65rem', borderRadius: 7,
                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--text)', fontSize: '.65rem', outline: 'none',
                }}
              />
              <button
                onClick={resolving ? handleResolve : handleAction}
                disabled={!note.trim()}
                style={{
                  padding: '.35rem .65rem', borderRadius: 7, fontSize: '.65rem',
                  fontWeight: 800, border: 'none', cursor: note.trim() ? 'pointer' : 'not-allowed',
                  background: note.trim() ? 'rgba(0,232,176,.15)' : 'var(--surface-2)',
                  color: note.trim() ? 'var(--primary)' : 'var(--muted)',
                }}
              >
                Save
              </button>
              <button
                onClick={() => { setActing(false); setResolving(false); setNote('') }}
                style={{ padding: '.35rem .5rem', borderRadius: 7, fontSize: '.65rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Action buttons */}
          {!acting && !resolving && (
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              <button onClick={() => setActing(true)} style={actionBtnStyle('default')}>
                📝 Log Action
              </button>
              <button onClick={() => setResolving(true)} style={actionBtnStyle('success')}>
                ✅ Resolve
              </button>
              {canEscalate && (
                <button onClick={handleEscalate} style={actionBtnStyle('warn')}>
                  ⬆ Escalate
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {rec.status !== 'active' && rec.resolution && (
        <div style={{ padding: '.5rem .9rem', borderTop: '1px solid var(--border)', fontSize: '.62rem', color: 'var(--primary)', fontWeight: 700 }}>
          ✅ {rec.resolution}
        </div>
      )}
    </div>
  )
}

function actionBtnStyle(variant: 'default' | 'success' | 'warn'): React.CSSProperties {
  const colors = {
    default: { bg: 'var(--surface-2)', border: 'var(--border)', color: 'var(--text)' },
    success: { bg: 'rgba(0,232,176,.08)', border: 'rgba(0,232,176,.25)', color: 'var(--primary)' },
    warn:    { bg: 'rgba(245,194,0,.08)', border: 'rgba(245,194,0,.3)', color: 'var(--warn)' },
  }
  const c = colors[variant]
  return {
    padding: '.3rem .65rem', borderRadius: 8, fontSize: '.62rem', fontWeight: 800,
    background: c.bg, border: `1px solid ${c.border}`, color: c.color, cursor: 'pointer',
  }
}

// ── Stall card ────────────────────────────────────────────────────────────────

function StallCard({ stall, onRefresh, dispatcher }: {
  stall: StallEscalation; onRefresh: () => void; dispatcher: string
}) {
  const [resolving, setResolving] = useState(false)
  const [note,      setNote]      = useState('')
  const meta = TIER_META[stall.currentTier]

  return (
    <div style={{
      padding: '.7rem .9rem', borderRadius: 12,
      background: meta.bg, border: `1px solid ${meta.border}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.35rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TierBadge tier={stall.currentTier} />
          <span style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--text)' }}>
            Stall — Load #{stall.loadNumber}
          </span>
          {stall.driverName && (
            <span style={{ fontSize: '.62rem', color: 'var(--muted)' }}>· {stall.driverName}</span>
          )}
        </div>
        <span style={{ fontSize: '.65rem', fontWeight: 800, color: meta.color }}>
          {stall.stallMinutes}m
        </span>
      </div>
      <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginBottom: '.4rem', lineHeight: 1.4 }}>
        No movement detected for {stall.stallMinutes} minutes. Tier history: {stall.tierHistory.map(h => h.tier).join(' → ')}
      </div>
      {!resolving ? (
        <button
          onClick={() => setResolving(true)}
          style={{ fontSize: '.62rem', fontWeight: 800, padding: '.25rem .65rem', borderRadius: 8, border: `1px solid ${meta.border}`, background: 'transparent', color: meta.color, cursor: 'pointer' }}
        >
          ✅ Resolve Stall
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="How was this resolved?"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && note.trim()) {
                resolveStallEscalation(stall.loadNumber, note.trim())
                onRefresh()
              }
            }}
            style={{ flex: 1, padding: '.3rem .6rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.63rem', outline: 'none' }}
          />
          <button
            onClick={() => { if (note.trim()) { resolveStallEscalation(stall.loadNumber, note.trim()); onRefresh() } }}
            style={{ padding: '.3rem .6rem', borderRadius: 7, fontSize: '.63rem', fontWeight: 800, border: 'none', background: 'rgba(0,232,176,.12)', color: 'var(--primary)', cursor: 'pointer' }}
          >
            Save
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  dispatcherName?: string
  loadNumber?:     string
}

export default function EscalationPanel({ dispatcherName = 'Dispatcher', loadNumber }: Props) {
  const [summary,    setSummary]    = useState<EscalationSummary>({ openCount: 0, l1Count: 0, l2Count: 0, l3Count: 0, activeStalls: 0, topTier: null })
  const [records,    setRecords]    = useState<EscalationTierRecord[]>([])
  const [stalls,     setStalls]     = useState<StallEscalation[]>([])
  const [showClosed, setShowClosed] = useState(false)
  const [tab,        setTab]        = useState<'escalations' | 'stalls'>('escalations')

  const refresh = useCallback(() => {
    runAutoEscalationCheck()
    setRecords(
      (loadNumber ? readTierRecords(loadNumber) : readTierRecords())
        .filter(r => showClosed || r.status === 'active')
        .slice(0, 30)
    )
    setStalls(
      (loadNumber ? readStallEscalations().filter(s => s.loadNumber === loadNumber) : readStallEscalations())
        .filter(s => showClosed || !s.resolved)
        .slice(0, 20)
    )
    setSummary(buildEscalationSummary())
  }, [loadNumber, showClosed])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 60_000)
    return () => clearInterval(t)
  }, [refresh])

  return (
    <div style={{ display: 'grid', gap: '.7rem' }}>
      {/* Summary */}
      <EscalationSummaryBar summary={summary} />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
        {(['escalations', 'stalls'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '.3rem .7rem', borderRadius: 8, fontSize: '.63rem', fontWeight: 800,
              border: `1px solid ${tab === t ? 'rgba(0,232,176,.3)' : 'var(--border)'}`,
              background: tab === t ? 'rgba(0,232,176,.07)' : 'var(--surface-2)',
              color: tab === t ? 'var(--primary)' : 'var(--muted)', cursor: 'pointer',
            }}
          >
            {t === 'escalations' ? `⚡ Tier Records (${records.length})` : `🔴 Stalls (${stalls.length})`}
          </button>
        ))}
        <button
          onClick={() => { setShowClosed(v => !v); setTimeout(refresh, 0) }}
          style={{ marginLeft: 'auto', fontSize: '.6rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          {showClosed ? 'Active only' : 'Show closed'}
        </button>
      </div>

      {/* Tier records */}
      {tab === 'escalations' && (
        <div style={{ display: 'grid', gap: '.5rem' }}>
          {records.length === 0 ? (
            <div style={{ fontSize: '.68rem', color: 'var(--muted)', padding: '.6rem .85rem', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              No active escalation records
            </div>
          ) : records.map(r => (
            <TierRecordCard key={r.id} rec={r} dispatcher={dispatcherName} onRefresh={refresh} />
          ))}
        </div>
      )}

      {/* Stall escalations */}
      {tab === 'stalls' && (
        <div style={{ display: 'grid', gap: '.5rem' }}>
          {stalls.length === 0 ? (
            <div style={{ fontSize: '.68rem', color: 'var(--muted)', padding: '.6rem .85rem', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              No active stall escalations
            </div>
          ) : stalls.map(s => (
            <StallCard key={s.id} stall={s} dispatcher={dispatcherName} onRefresh={refresh} />
          ))}
        </div>
      )}
    </div>
  )
}
