'use client'
import type { OperationalEvent, EventSeverity } from '@/lib/dashboard/types'

// ── Severity helpers ──────────────────────────────────────────────────────────
function severityDot(s: EventSeverity) {
  if (s === 'critical') return { color: 'var(--error)',   bg: 'rgba(232,64,0,.1)',   border: 'rgba(232,64,0,.25)'   }
  if (s === 'warn')     return { color: 'var(--warn)',    bg: 'rgba(245,194,0,.09)', border: 'rgba(245,194,0,.25)'  }
  return                       { color: 'var(--primary)', bg: 'rgba(0,232,176,.07)', border: 'rgba(0,232,176,.2)'   }
}

const EVENT_LABELS: Record<string, string> = {
  detention:           'Detention',
  weather_delay:       'Weather Delay',
  fuel_issue:          'Reefer/Fuel',
  receiver_delay:      'Receiver Delay',
  parking_issue:       'Parking',
  breakdown:           'Breakdown',
  route_problem:       'Route Problem',
  successful_delivery: 'Clean Delivery',
  scale_issue:         'Scale Backup',
  traffic_delay:       'Heavy Traffic',
}

const EVENT_EMOJI: Record<string, string> = {
  detention:           '⏱',
  weather_delay:       '🌧️',
  fuel_issue:          '⛽',
  receiver_delay:      '📦',
  parking_issue:       '🅿️',
  breakdown:           '🔧',
  route_problem:       '🗺',
  successful_delivery: '✅',
  scale_issue:         '⚖️',
  traffic_delay:       '🚦',
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return '' }
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  open:            boolean
  onClose:         () => void
  events:          OperationalEvent[]   // current mission events
  history:         OperationalEvent[]   // prior lane history
  insights:        string[]             // deterministic insight strings
  aiInsight:       string | null
  insightLoading:  boolean
  onGenerateInsight: () => void
}

export default function MissionHistoryPanel({
  open, onClose, events, history, insights, aiInsight, insightLoading, onGenerateInsight,
}: Props) {
  if (!open) return null

  const allHistory = history.slice(0, 30)
  const hasHistory = allHistory.length > 0
  const hasEvents  = events.length > 0

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,13,11,.7)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: 'var(--surface)', borderTop: '2px solid rgba(0,232,176,.2)',
        borderRadius: '20px 20px 0 0', padding: '1.5rem 1.5rem 2.5rem',
        maxHeight: '85dvh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>📊 Lane History</div>
          <button
            onClick={onClose}
            style={{ padding: '.4rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}
          >✕</button>
        </div>

        {/* ── Deterministic insight pills ──────────────────────────────────── */}
        {insights.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 2 }}>
              Lane Intelligence
            </div>
            {insights.map((ins, i) => (
              <div key={i} style={{
                padding: '.6rem .85rem', borderRadius: 10, fontSize: '.83rem', fontWeight: 600,
                background: 'var(--surface-2)', border: '1px solid var(--border)', lineHeight: 1.45,
              }}>
                {ins}
              </div>
            ))}
          </div>
        )}

        {/* ── AI Insight ───────────────────────────────────────────────────── */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
              AI Operational Insight
            </div>
            <button
              onClick={onGenerateInsight}
              disabled={insightLoading}
              style={{
                padding: '.35rem .8rem', borderRadius: 8, border: '1px solid rgba(0,232,176,.3)',
                background: insightLoading ? 'transparent' : 'rgba(0,232,176,.07)',
                color: insightLoading ? 'var(--muted)' : 'var(--primary)',
                fontSize: '.75rem', fontWeight: 700, cursor: insightLoading ? 'default' : 'pointer',
              }}
            >
              {insightLoading ? '⏳ Analyzing…' : '✨ Generate'}
            </button>
          </div>

          {aiInsight ? (
            <div style={{
              padding: '.85rem 1rem', borderRadius: 12, fontSize: '.88rem', lineHeight: 1.6, fontWeight: 500,
              background: 'rgba(0,232,176,.06)', border: '1px solid rgba(0,232,176,.2)', color: 'var(--text)',
            }}>
              {aiInsight}
            </div>
          ) : !insightLoading ? (
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', padding: '.6rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              Tap Generate for a dispatcher-style summary of this lane&apos;s patterns.
            </div>
          ) : (
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', padding: '.6rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', animation: 'pulse 1.5s infinite' }}>
              Analyzing lane history…
            </div>
          )}
        </div>

        {/* ── Current Mission Events ───────────────────────────────────────── */}
        {hasEvents && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
              This Run · {events.length} event{events.length !== 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {events.map(ev => {
                const ds = severityDot(ev.severity)
                return (
                  <div key={ev.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '.6rem .8rem',
                    borderRadius: 10, background: ds.bg, border: `1px solid ${ds.border}`,
                  }}>
                    <span style={{ fontSize: '1.1rem', flexShrink: 0, lineHeight: 1.3 }}>{EVENT_EMOJI[ev.eventType] ?? '📌'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '.85rem', color: ds.color, lineHeight: 1.3 }}>
                        {EVENT_LABELS[ev.eventType] ?? ev.eventType}
                        <span style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 500, marginLeft: 6 }}>{fmtDate(ev.createdAt)}</span>
                      </div>
                      {ev.location && <div style={{ fontSize: '.73rem', color: 'var(--muted)', marginTop: 1 }}>📍 {ev.location}</div>}
                      {ev.notes    && <div style={{ fontSize: '.78rem', color: 'var(--text)', marginTop: 3, lineHeight: 1.4 }}>{ev.notes}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Prior Lane History ────────────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
            Prior Runs{hasHistory ? ` · ${history.length} event${history.length !== 1 ? 's' : ''} on record` : ''}
          </div>

          {hasHistory ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {allHistory.map(ev => {
                const ds = severityDot(ev.severity)
                return (
                  <div key={ev.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '.55rem .75rem',
                    borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: '1rem', flexShrink: 0, lineHeight: 1.4 }}>{EVENT_EMOJI[ev.eventType] ?? '📌'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '.82rem', color: ds.color, lineHeight: 1.3 }}>
                        {EVENT_LABELS[ev.eventType] ?? ev.eventType}
                        <span style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>{fmtDate(ev.createdAt)}</span>
                      </div>
                      {ev.location && <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 1 }}>📍 {ev.location}</div>}
                      {ev.notes    && <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>{ev.notes}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ padding: '1rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>🗂</div>
              <div style={{ fontSize: '.82rem', color: 'var(--muted)', fontWeight: 600 }}>No prior history on this lane.</div>
              <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>Log events as you go — the system learns from your runs.</div>
            </div>
          )}
        </div>

      </div>
    </>
  )
}
