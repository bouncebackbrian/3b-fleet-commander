'use client'
/**
 * Compliance Command — /compliance
 *
 * Central hub for violations, repairs, pre-trip records, and DOT readiness.
 * Data from localStorage (offline-first) with Supabase async sync.
 */
import { useState, useEffect, useCallback } from 'react'
import TopBar from '@/components/layout/TopBar'
import ComplianceEventSheet from '@/components/compliance/ComplianceEventSheet'
import {
  readLocalComplianceEvents,
  readLocalPreTripRecords,
  getComplianceAlerts,
  COMPLIANCE_EVENT_META,
  COMPLIANCE_STATUS_META,
  SEVERITY_META,
  newComplianceEvent,
  type ComplianceEvent,
  type ComplianceStatus,
  type ComplianceSeverity,
} from '@/lib/complianceEvents'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function ageHours(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

type FilterStatus = 'all' | ComplianceStatus
type FilterSev    = 'all' | ComplianceSeverity

const STATUS_FILTERS: { id: FilterStatus; label: string }[] = [
  { id: 'all',              label: 'All'              },
  { id: 'open',             label: 'Open'             },
  { id: 'repair_pending',   label: 'Repair Pending'   },
  { id: 'repair_submitted', label: 'Submitted'        },
  { id: 'verified',         label: 'Verified'         },
  { id: 'closed',           label: 'Closed'           },
  { id: 'contested',        label: 'Contested'        },
]

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ emoji, label, value, color, sub }: {
  emoji: string; label: string; value: number | string; color: string; sub?: string
}) {
  return (
    <div style={{
      flex: '1 1 0', minWidth: 0,
      background: 'var(--surface-2)', borderRadius: 12,
      padding: '.75rem .8rem',
      border: `1.5px solid ${value === 0 || value === '0' ? 'var(--border)' : color}`,
    }}>
      <div style={{ fontSize: '1.35rem', lineHeight: 1 }}>{emoji}</div>
      <div style={{
        fontSize: '1.45rem', fontWeight: 900, lineHeight: 1.1, marginTop: 4,
        color: value === 0 || value === '0' ? 'var(--muted)' : color,
      }}>
        {value}
      </div>
      <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      {sub && <div style={{ fontSize: '.6rem', color: 'var(--faint)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({ event, onTap }: { event: ComplianceEvent; onTap: () => void }) {
  const meta    = COMPLIANCE_EVENT_META[event.eventType]
  const stMeta  = COMPLIANCE_STATUS_META[event.status]
  const sevMeta = SEVERITY_META[event.severity]
  const isOpen  = event.status === 'open' || event.status === 'repair_pending'
  const age     = ageHours(event.createdAt)

  return (
    <button onClick={onTap} style={{
      width: '100%', textAlign: 'left', background: 'var(--surface-2)',
      border: `1px solid ${event.outOfService && !event.oosCleared ? 'var(--error)' : isOpen ? 'var(--border)' : 'var(--border)'}`,
      borderLeft: `4px solid ${sevMeta.color}`,
      borderRadius: 12, padding: '.7rem .85rem',
      cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 5,
      marginBottom: 8,
    }}>
      {/* Row 1: emoji + type + OOS badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '1rem' }}>{meta.emoji}</span>
          <span style={{ fontWeight: 800, fontSize: '.9rem' }}>{meta.label}</span>
          {event.outOfService && !event.oosCleared && (
            <span style={{ fontSize: '.65rem', fontWeight: 900, color: '#fff', background: 'var(--error)', padding: '1px 6px', borderRadius: 20 }}>OOS</span>
          )}
          {event.oosCleared && (
            <span style={{ fontSize: '.65rem', fontWeight: 900, color: '#000', background: 'var(--success)', padding: '1px 6px', borderRadius: 20 }}>CLEARED</span>
          )}
        </div>
        <span style={{
          fontSize: '.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          background: `${stMeta.color}18`, color: stMeta.color, border: `1px solid ${stMeta.color}40`,
        }}>
          {stMeta.label}
        </span>
      </div>

      {/* Row 2: severity + code + unit */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '.7rem', color: 'var(--muted)' }}>
        <span style={{ color: sevMeta.color, fontWeight: 700 }}>{sevMeta.label}</span>
        {event.violationCode && <span>Code {event.violationCode}</span>}
        {event.truckNumber   && <span>🚛 {event.truckNumber}</span>}
        {event.trailerNumber && <span>🚚 {event.trailerNumber}</span>}
        {event.documents.length > 0 && <span style={{ color: 'var(--success)' }}>📎 {event.documents.length} doc{event.documents.length > 1 ? 's' : ''}</span>}
      </div>

      {/* Row 3: notes preview + age */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: '.72rem', color: 'var(--faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
          {event.notes || event.inspectionLocation || event.repairShop || '—'}
        </div>
        <div style={{ fontSize: '.65rem', color: 'var(--faint)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {age < 24 ? `${Math.round(age)}h ago` : fmtDate(event.createdAt)}
        </div>
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const [events,       setEvents]       = useState<ComplianceEvent[]>([])
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterSev,    setFilterSev]    = useState<FilterSev>('all')
  const [searchQ,      setSearchQ]      = useState('')
  const [sheetOpen,    setSheetOpen]    = useState(false)
  const [editEvent,    setEditEvent]    = useState<ComplianceEvent | undefined>(undefined)
  const [preTripCount, setPreTripCount] = useState(0)
  const [preTripFail,  setPreTripFail]  = useState(0)

  const load = useCallback(() => {
    setEvents(readLocalComplianceEvents())
    const pts = readLocalPreTripRecords()
    setPreTripCount(pts.length)
    setPreTripFail(pts.filter(p => p.result === 'fail').length)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Reload when sheet closes (data may have changed)
  function handleSheetClose() {
    setSheetOpen(false)
    setEditEvent(undefined)
    load()
  }

  function openNew() {
    setEditEvent(undefined)
    setSheetOpen(true)
  }

  function openEdit(ev: ComplianceEvent) {
    setEditEvent(ev)
    setSheetOpen(true)
  }

  // ── Derived stats ──────────────────────────────────────────────────────────

  const openEvents      = events.filter(e => e.status === 'open')
  const oosEvents       = events.filter(e => e.outOfService && !e.oosCleared)
  const missingProof    = events.filter(e =>
    (e.status === 'repair_pending' || e.status === 'repair_submitted') &&
    e.documents.filter(d => d.docType === 'repair_invoice' || d.docType === 'work_order').length === 0
  )
  const criticalOpen    = openEvents.filter(e => e.severity === 'critical')
  const dotReadyPackets = events.filter(e =>
    e.status === 'verified' || e.status === 'closed'
  )

  // Pre-trip pass rate (last 7 days)
  const pts7d           = readLocalPreTripRecords().filter(p => ageHours(p.createdAt) <= 168)
  const preTripPassRate = pts7d.length > 0
    ? Math.round((pts7d.filter(p => p.result === 'pass').length / pts7d.length) * 100)
    : null

  const alerts = getComplianceAlerts()

  // ── Filtered event list ────────────────────────────────────────────────────

  const filtered = events.filter(e => {
    if (filterStatus !== 'all' && e.status !== filterStatus) return false
    if (filterSev    !== 'all' && e.severity !== filterSev)   return false
    if (searchQ) {
      const q = searchQ.toLowerCase()
      const haystack = [
        e.truckNumber, e.trailerNumber, e.driverName, e.violationCode,
        e.inspectionReport, e.inspectionLocation, e.repairShop, e.notes,
        COMPLIANCE_EVENT_META[e.eventType].label,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <TopBar title="Compliance Command" />

      <main style={{ paddingTop: 56, paddingBottom: 80 }}>

        {/* ── Alert banner (only when issues exist) ── */}
        {alerts.length > 0 && (
          <div style={{ padding: '0 1rem', marginBottom: 12, marginTop: 12 }}>
            {alerts.map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '.65rem .9rem', borderRadius: 12, marginBottom: 6,
                background: a.severity === 'critical' ? 'rgba(232,64,0,.12)' : 'rgba(245,194,0,.10)',
                border: `1.5px solid ${a.severity === 'critical' ? 'var(--error)' : 'var(--warn)'}`,
              }}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>{a.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '.85rem', color: a.severity === 'critical' ? 'var(--error)' : 'var(--warn)' }}>{a.text}</div>
                  {a.subtext && <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>{a.subtext}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Stat grid ── */}
        <div style={{ padding: '0 1rem', marginTop: alerts.length === 0 ? 12 : 0 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <StatCard emoji="🛑" label="Out of Service" value={oosEvents.length}      color="var(--error)"   />
            <StatCard emoji="🚨" label="Critical Open"  value={criticalOpen.length}   color="var(--error)"   />
            <StatCard emoji="⚠️" label="Open Issues"    value={openEvents.length}     color="var(--warn)"    />
            <StatCard emoji="📂" label="Missing Proof"  value={missingProof.length}   color="var(--warn)"    />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            <StatCard emoji="✅" label="DOT Ready"      value={dotReadyPackets.length} color="var(--success)" />
            <StatCard emoji="🚛" label="Pre-Trips"       value={preTripCount}           color="var(--primary)" sub={preTripFail > 0 ? `${preTripFail} fail${preTripFail > 1 ? 's' : ''}` : undefined} />
            <StatCard emoji="📊" label="Pass Rate 7d"   value={preTripPassRate !== null ? `${preTripPassRate}%` : '—'} color="var(--success)" />
            <StatCard emoji="📋" label="Total Logged"   value={events.length}          color="var(--primary)" />
          </div>
        </div>

        {/* ── Log new event CTA ── */}
        <div style={{ padding: '0 1rem', marginBottom: 18 }}>
          <button onClick={openNew} style={{
            width: '100%', padding: '1rem', borderRadius: 16, border: 'none',
            background: 'var(--primary)', color: '#000',
            fontWeight: 900, fontSize: '1rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <span style={{ fontSize: '1.1rem' }}>⚖️</span>
            Log Compliance Event
          </button>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => { /* TODO: PreTripSheet */ }} style={{ flex: 1, padding: '.65rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 700, fontSize: '.8rem', cursor: 'pointer' }}>
              🚛 Pre-Trip
            </button>
            <button onClick={() => { /* TODO: TireLogSheet */ }} style={{ flex: 1, padding: '.65rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 700, fontSize: '.8rem', cursor: 'pointer' }}>
              🛞 Tire Log
            </button>
            <button onClick={() => { /* TODO: DOTPacketModal */ }} style={{ flex: 1, padding: '.65rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 700, fontSize: '.8rem', cursor: 'pointer' }}>
              📋 DOT Packet
            </button>
          </div>
        </div>

        {/* ── Filters ── */}
        <div style={{ padding: '0 1rem', marginBottom: 10 }}>
          {/* Search */}
          <input
            type="search"
            placeholder="Search truck#, code, location, notes…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            style={{
              width: '100%', padding: '.6rem .85rem', borderRadius: 12,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text)', fontSize: '.88rem', outline: 'none',
              boxSizing: 'border-box', marginBottom: 10,
            }}
          />

          {/* Status filter chips */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {STATUS_FILTERS.map(f => {
              const sel = filterStatus === f.id
              const color = f.id === 'all' ? 'var(--primary)'
                : f.id === 'open' || f.id === 'repair_pending' ? 'var(--error)'
                : f.id === 'verified' || f.id === 'closed' ? 'var(--success)'
                : 'var(--primary)'
              return (
                <button key={f.id} onClick={() => setFilterStatus(f.id)} style={{
                  padding: '.3rem .7rem', borderRadius: 20, fontSize: '.72rem',
                  fontWeight: sel ? 800 : 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: `1.5px solid ${sel ? color : 'var(--border)'}`,
                  background: sel ? `${color}18` : 'var(--surface-2)',
                  color: sel ? color : 'var(--muted)',
                }}>
                  {f.label}
                </button>
              )
            })}
          </div>

          {/* Severity filter chips */}
          <div style={{ display: 'flex', gap: 6, marginTop: 6, overflowX: 'auto', paddingBottom: 2 }}>
            <button onClick={() => setFilterSev('all')} style={{
              padding: '.28rem .65rem', borderRadius: 20, fontSize: '.7rem',
              fontWeight: filterSev === 'all' ? 800 : 600, cursor: 'pointer', whiteSpace: 'nowrap',
              border: `1.5px solid ${filterSev === 'all' ? 'var(--primary)' : 'var(--border)'}`,
              background: filterSev === 'all' ? 'rgba(0,232,176,.1)' : 'var(--surface-2)',
              color: filterSev === 'all' ? 'var(--primary)' : 'var(--muted)',
            }}>
              All Severity
            </button>
            {(Object.keys(SEVERITY_META) as ComplianceSeverity[]).map(s => {
              const sm  = SEVERITY_META[s]
              const sel = filterSev === s
              return (
                <button key={s} onClick={() => setFilterSev(s)} style={{
                  padding: '.28rem .65rem', borderRadius: 20, fontSize: '.7rem',
                  fontWeight: sel ? 800 : 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: `1.5px solid ${sel ? sm.color : 'var(--border)'}`,
                  background: sel ? `${sm.color}18` : 'var(--surface-2)',
                  color: sel ? sm.color : 'var(--muted)',
                }}>
                  {sm.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Event feed ── */}
        <div style={{ padding: '0 1rem' }}>
          {/* Section label */}
          <div style={{ fontSize: '.65rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            {filtered.length} Event{filtered.length !== 1 ? 's' : ''}
            {filterStatus !== 'all' && ` · ${STATUS_FILTERS.find(f => f.id === filterStatus)?.label}`}
            {filterSev    !== 'all' && ` · ${SEVERITY_META[filterSev as ComplianceSeverity]?.label}`}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--faint)' }}>
              {events.length === 0
                ? (
                  <>
                    <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>⚖️</div>
                    <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 4 }}>Clean record — nothing logged yet</div>
                    <div style={{ fontSize: '.78rem' }}>Tap <strong>Log Compliance Event</strong> to record a violation, warning, inspection, or repair.</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '2rem', marginBottom: 6 }}>🔍</div>
                    <div style={{ fontWeight: 700, fontSize: '.9rem' }}>No events match the filter</div>
                    <button onClick={() => { setFilterStatus('all'); setFilterSev('all'); setSearchQ('') }}
                      style={{ marginTop: 10, padding: '.45rem .9rem', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)', fontSize: '.78rem', cursor: 'pointer' }}>
                      Clear Filters
                    </button>
                  </>
                )
              }
            </div>
          )}

          {filtered.map(ev => (
            <EventRow key={ev.id} event={ev} onTap={() => openEdit(ev)} />
          ))}
        </div>

        {/* ── Pre-trip records section (if any) ── */}
        {preTripCount > 0 && (
          <div style={{ padding: '0 1rem', marginTop: 20 }}>
            <div style={{ fontSize: '.65rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Pre-Trip Records — Last 10
            </div>
            {readLocalPreTripRecords().slice(0, 10).map(pt => (
              <div key={pt.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'var(--surface-2)', border: `1px solid ${pt.result === 'fail' ? 'var(--error)' : 'var(--border)'}`,
                borderRadius: 10, padding: '.6rem .85rem', marginBottom: 6,
                borderLeft: `4px solid ${pt.result === 'fail' ? 'var(--error)' : 'var(--success)'}`,
              }}>
                <span style={{ fontSize: '1.1rem' }}>{pt.result === 'pass' ? '✅' : '❌'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '.85rem', fontWeight: 700 }}>Pre-Trip {pt.result === 'pass' ? 'Passed' : 'Failed'}</div>
                  <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>
                    {pt.truckNumber && `🚛 ${pt.truckNumber}  `}
                    {pt.failCount > 0 && <span style={{ color: 'var(--error)' }}>{pt.failCount} item{pt.failCount > 1 ? 's' : ''} failed</span>}
                  </div>
                </div>
                <div style={{ fontSize: '.65rem', color: 'var(--faint)', textAlign: 'right' }}>
                  {fmtDate(pt.createdAt)}<br />{fmtTime(pt.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}

      </main>

      {/* Sheet */}
      <ComplianceEventSheet
        open={sheetOpen}
        onClose={handleSheetClose}
        existingEvent={editEvent}
      />
    </>
  )
}
