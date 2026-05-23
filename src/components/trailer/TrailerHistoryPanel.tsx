'use client'
/**
 * TrailerHistoryPanel — Fleet intelligence view for a specific trailer.
 *
 * Shows: all hook/drop events, condition trends, inspection status,
 * recurring issues flagged in red (repeated on 2+ events).
 *
 * Usage:
 *   <TrailerHistoryPanel open={show} onClose={() => setShow(false)} trailerNumber="53192" />
 */
import { useState, useEffect } from 'react'
import {
  readLocalTrailerEvents,
  TRAILER_EVENT_META,
  INSPECTION_META,
  computeExpiry,
  type TrailerEvent,
  type InspectionType,
} from '@/lib/trailerEvents'

interface Props {
  open:          boolean
  onClose:       () => void
  trailerNumber?: string   // if provided, pre-filters to this trailer
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}
function daysColor(days: number | undefined): string {
  if (days == null) return 'var(--muted)'
  if (days <= 0)    return 'var(--error)'
  if (days <= 30)   return 'var(--warn)'
  return 'var(--success)'
}

export default function TrailerHistoryPanel({ open, onClose, trailerNumber }: Props) {
  const [events,       setEvents]       = useState<TrailerEvent[]>([])
  const [searchNum,    setSearchNum]    = useState(trailerNumber ?? '')
  const [expandedId,   setExpandedId]   = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSearchNum(trailerNumber ?? '')
  }, [open, trailerNumber])

  useEffect(() => {
    const all = readLocalTrailerEvents()
    const filtered = searchNum.trim()
      ? all.filter(e => e.trailerNumber.toLowerCase().includes(searchNum.toLowerCase()))
      : all
    setEvents(filtered.slice(0, 50))
  }, [searchNum])

  if (!open) return null

  // ── Compute recurring issues ──────────────────────────────────────────────
  const issueMap: Record<string, number> = {}
  for (const ev of events) {
    for (const c of ev.condition) {
      if (c.status === 'issue') issueMap[c.label] = (issueMap[c.label] ?? 0) + 1
    }
  }
  const recurringIssues = Object.entries(issueMap)
    .filter(([, cnt]) => cnt >= 2)
    .sort((a, b) => b[1] - a[1])

  // ── Latest inspection status ──────────────────────────────────────────────
  const lastWithInsp = events.find(e => e.inspections.length > 0)
  const inspSummary  = lastWithInsp?.inspections ?? []

  const totalHooks = events.filter(e => TRAILER_EVENT_META[e.eventType].isHook).length
  const totalDrops = events.length - totalHooks
  const totalIssues = events.reduce((n, e) => n + e.condition.filter(c => c.status === 'issue').length, 0)

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,.65)' }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', inset: '4dvh 0 0', zIndex: 211,
        background: 'var(--surface)', borderRadius: '24px 24px 0 0',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '.7rem 1.1rem .5rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>🚛 Trailer History</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--muted)', padding: '4px 8px' }}>✕</button>
          </div>
          <input
            placeholder="Search trailer number…"
            value={searchNum}
            onChange={e => setSearchNum(e.target.value)}
            style={{
              width: '100%', padding: '.5rem .75rem', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text)', fontSize: '.9rem', outline: 'none', boxSizing: 'border-box',
              letterSpacing: '.04em',
            }}
          />
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {events.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--faint)', fontSize: '.85rem' }}>
              No trailer events on record.
            </div>
          ) : (
            <>
              {/* Stats strip */}
              <div style={{
                display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
              }}>
                {[
                  { val: events.length, label: 'Events', color: 'var(--text)' },
                  { val: totalHooks,    label: 'Hooks',  color: 'var(--primary)' },
                  { val: totalDrops,    label: 'Drops',  color: 'var(--blue)'  },
                  { val: totalIssues,   label: 'Issues', color: totalIssues > 0 ? 'var(--error)' : 'var(--success)' },
                ].map(s => (
                  <div key={s.label} style={{
                    flex: 1, textAlign: 'center', padding: '.6rem .25rem',
                    borderRight: '1px solid var(--border)',
                  }}>
                    <div style={{ fontWeight: 900, fontSize: '1.2rem', color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Recurring issues alert */}
              {recurringIssues.length > 0 && (
                <div style={{
                  margin: '.75rem 1.1rem', padding: '.65rem .9rem',
                  borderRadius: 12, background: 'rgba(232,64,0,.08)',
                  border: '1.5px solid var(--error)',
                }}>
                  <div style={{ fontWeight: 900, fontSize: '.8rem', color: 'var(--error)', marginBottom: 4 }}>
                    🚨 Recurring Issues Detected
                  </div>
                  {recurringIssues.map(([label, cnt]) => (
                    <div key={label} style={{ fontSize: '.78rem', color: 'var(--text)', display: 'flex', gap: 6, marginTop: 2 }}>
                      <span style={{ color: 'var(--error)', fontWeight: 800 }}>×{cnt}</span>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Inspection status */}
              {inspSummary.length > 0 && (
                <div style={{ margin: '.5rem 1.1rem', padding: '.65rem .9rem', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 900, fontSize: '.78rem', color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Latest Inspection Status
                  </div>
                  {inspSummary.map(insp => {
                    const im = INSPECTION_META[insp.type as InspectionType]
                    const { daysUntilExpiry } = computeExpiry(insp.expirationDate)
                    return (
                      <div key={insp.type} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span>{im.emoji}</span>
                        <span style={{ flex: 1, fontSize: '.8rem', fontWeight: 600 }}>{im.label}</span>
                        {insp.expirationDate && (
                          <span style={{ fontSize: '.72rem', fontWeight: 800, color: daysColor(daysUntilExpiry) }}>
                            {daysUntilExpiry != null && daysUntilExpiry <= 0
                              ? '🚨 EXPIRED'
                              : daysUntilExpiry != null && daysUntilExpiry <= 30
                              ? `⚠️ ${daysUntilExpiry}d left`
                              : `✅ ${daysUntilExpiry}d left`}
                          </span>
                        )}
                        {!insp.expirationDate && (
                          <span style={{ fontSize: '.7rem', color: 'var(--faint)' }}>No date</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Event list */}
              <div style={{ padding: '0 0 1rem' }}>
                {events.map(ev => {
                  const m         = TRAILER_EVENT_META[ev.eventType]
                  const issueItems = ev.condition.filter(c => c.status === 'issue')
                  const isExpanded = expandedId === ev.id
                  return (
                    <div key={ev.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      {/* Row */}
                      <div
                        onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                        style={{
                          display: 'flex', gap: 12, padding: '.75rem 1.1rem',
                          cursor: 'pointer', alignItems: 'flex-start',
                        }}
                      >
                        <div style={{
                          width: 38, height: 38, borderRadius: '50%',
                          background: 'var(--surface-2)', border: '1px solid var(--border)',
                          display: 'grid', placeItems: 'center', fontSize: '1rem', flexShrink: 0,
                        }}>
                          {m.emoji}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, fontSize: '.88rem' }}>{m.label}</span>
                            <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--primary)', letterSpacing: '.04em' }}>
                              {ev.trailerNumber}
                            </span>
                            {issueItems.length > 0 && (
                              <span style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--error)', background: 'rgba(232,64,0,.1)', border: '1px solid rgba(232,64,0,.2)', borderRadius: 5, padding: '.1em .4em' }}>
                                ⚠️ {issueItems.length} issue{issueItems.length > 1 ? 's' : ''}
                              </span>
                            )}
                            {ev.documents.length > 0 && (
                              <span style={{ fontSize: '.66rem', color: 'var(--muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '.1em .3em' }}>
                                📷 {ev.documents.length}
                              </span>
                            )}
                          </div>
                          {ev.notes && (
                            <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ev.notes}
                            </div>
                          )}
                          <div style={{ fontSize: '.65rem', color: 'var(--faint)', marginTop: 2 }}>
                            {fmtDate(ev.createdAt)} {fmtTime(ev.createdAt)}
                            {ev.gpsLat && ' · 📍'}
                            {ev.sealNumber && ` · Seal: ${ev.sealNumber}`}
                          </div>
                        </div>
                        <span style={{ color: 'var(--muted)', fontSize: '.8rem' }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div style={{ padding: '.5rem 1.1rem .9rem 4rem', background: 'var(--surface-2)' }}>
                          {issueItems.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--error)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Issues</div>
                              {issueItems.map(c => (
                                <div key={c.id} style={{ fontSize: '.78rem', color: 'var(--text)', display: 'flex', gap: 6 }}>
                                  <span style={{ color: 'var(--error)' }}>•</span>
                                  <span>{c.label}{c.notes ? `: ${c.notes}` : ''}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {ev.reeferFuelPct != null && (
                            <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginBottom: 4 }}>
                              ❄️ Reefer fuel: <strong>{ev.reeferFuelPct}%</strong>
                            </div>
                          )}
                          {ev.receiver && (
                            <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginBottom: 4 }}>
                              📦 Receiver: {ev.receiver}{ev.podSigned ? ' · POD ✅' : ''}
                            </div>
                          )}
                          {ev.inspections.length > 0 && (
                            <div style={{ fontSize: '.74rem', color: 'var(--muted)' }}>
                              {ev.inspections.filter(i => i.verified).map(i => (
                                <span key={i.type}>✅ {INSPECTION_META[i.type as InspectionType].label}  </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0, padding: '.6rem 1.1rem 1.4rem',
          borderTop: '1px solid var(--border)',
          fontSize: '.7rem', color: 'var(--faint)', textAlign: 'center',
        }}>
          📱 Stored on device · Showing up to 50 events
        </div>
      </div>
    </>
  )
}
