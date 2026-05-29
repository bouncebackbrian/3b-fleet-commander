'use client'
/**
 * OpsEventFeed — Live unified operations event log viewer
 *
 * Displays events from opsEventLog.ts with:
 *   - Filter bar: severity / engine / load number / open-only toggle
 *   - Severity badges + engine chip
 *   - Inline resolution (input + Save button)
 *   - Auto-refreshes every 30 s
 *   - Compact mode for embedding as a tab panel
 *
 * Props:
 *   loadNumber?  — pre-filter to a single load
 *   maxItems?    — cap rendered rows (default 50)
 *   compact?     — hide filter bar, show only recent 10 events
 */

import { useState, useEffect, useCallback } from 'react'
import {
  readOpsEvents,
  resolveOpsEvent,
  buildOpsEventSummary,
  type OpsEvent,
  type OpsEventSeverity,
  type OpsEventSource,
  type OpsEventFilter,
} from '@/lib/opsEventLog'

// ── Severity display ──────────────────────────────────────────────────────────

const SEV_META: Record<OpsEventSeverity, { label: string; color: string; bg: string; border: string; dot: string }> = {
  info:     { label: 'Info',     color: 'var(--muted)',  bg: 'rgba(120,120,140,.07)', border: 'rgba(120,120,140,.2)',  dot: '⚪' },
  warning:  { label: 'Warning',  color: 'var(--warn)',   bg: 'rgba(245,194,0,.08)',   border: 'rgba(245,194,0,.25)',   dot: '🟡' },
  critical: { label: 'Critical', color: 'var(--error)',  bg: 'rgba(232,64,0,.08)',    border: 'rgba(232,64,0,.25)',    dot: '🔴' },
}

const ENGINE_LABELS: Record<OpsEventSource, string> = {
  dispatch_engine:    'Dispatch',
  escalation_engine:  'Escalation',
  load_health_engine: 'Load Health',
  driver_ops_engine:  'DriverOps',
  recovery_engine:    'Recovery',
  hos_planning:       'HOS Plan',
  maintenance_engine: 'Maintenance',
  notification_router:'Notify',
  manual:             'Manual',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ── Event row ─────────────────────────────────────────────────────────────────

function EventRow({
  event,
  onResolve,
}: {
  event:     OpsEvent
  onResolve: (id: string, resolution: string) => void
}) {
  const [resolving, setResolving] = useState(false)
  const [note, setNote]           = useState('')
  const sev = SEV_META[event.severity]

  return (
    <div style={{
      padding: '.6rem .75rem',
      borderRadius: 10,
      background: event.resolvedAt ? 'rgba(0,0,0,.02)' : sev.bg,
      border: `1px solid ${event.resolvedAt ? 'var(--border)' : sev.border}`,
      opacity: event.resolvedAt ? 0.65 : 1,
      display: 'grid', gap: '.3rem',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '.7rem' }}>{sev.dot}</span>

        {/* Engine chip */}
        <span style={{
          fontSize: '.52rem', fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '.07em', padding: '.1rem .4rem', borderRadius: 6,
          background: 'var(--surface-2)', color: 'var(--muted)',
          border: '1px solid var(--border)',
        }}>
          {ENGINE_LABELS[event.sourceEngine] ?? event.sourceEngine}
        </span>

        {event.loadNumber && (
          <span style={{
            fontSize: '.55rem', fontWeight: 700, color: 'var(--primary)',
            padding: '.1rem .4rem', borderRadius: 6,
            background: 'rgba(0,232,176,.07)', border: '1px solid rgba(0,232,176,.2)',
          }}>
            #{event.loadNumber}
          </span>
        )}

        <span style={{ fontSize: '.65rem', fontWeight: 700, color: sev.color, flex: 1 }}>
          {event.title}
        </span>

        <span style={{ fontSize: '.55rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          {relativeTime(event.createdAt)}
        </span>
      </div>

      {/* Body */}
      {event.body && (
        <div style={{ fontSize: '.62rem', color: 'var(--muted)', paddingLeft: '1.1rem' }}>
          {event.body}
        </div>
      )}

      {/* Resolved label */}
      {event.resolvedAt && (
        <div style={{ fontSize: '.58rem', color: 'var(--primary)', paddingLeft: '1.1rem' }}>
          ✅ Resolved {relativeTime(event.resolvedAt)}{event.resolution ? ` — ${event.resolution}` : ''}
        </div>
      )}

      {/* Resolve inline */}
      {!event.resolvedAt && !resolving && (
        <button
          onClick={() => setResolving(true)}
          style={{
            alignSelf: 'start', marginLeft: '1.1rem',
            fontSize: '.58rem', fontWeight: 700, color: 'var(--muted)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            textDecoration: 'underline dotted',
          }}
        >
          Mark resolved
        </button>
      )}

      {resolving && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: '1.1rem', flexWrap: 'wrap' }}>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Resolution note (optional)"
            style={{
              flex: 1, minWidth: 140, fontSize: '.62rem', padding: '.3rem .5rem',
              borderRadius: 7, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--fg)',
            }}
          />
          <button
            onClick={() => { onResolve(event.id, note || 'Resolved'); setResolving(false); setNote('') }}
            style={{
              fontSize: '.62rem', fontWeight: 800, color: 'var(--primary)',
              background: 'rgba(0,232,176,.1)', border: '1px solid rgba(0,232,176,.3)',
              borderRadius: 7, padding: '.3rem .6rem', cursor: 'pointer',
            }}
          >
            Save
          </button>
          <button
            onClick={() => { setResolving(false); setNote('') }}
            style={{
              fontSize: '.62rem', fontWeight: 700, color: 'var(--muted)',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  loadNumber?: string
  maxItems?:   number
  compact?:    boolean
}

export default function OpsEventFeed({ loadNumber, maxItems = 50, compact = false }: Props) {
  const [events,       setEvents]       = useState<OpsEvent[]>([])
  const [filterSev,    setFilterSev]    = useState<OpsEventSeverity | 'all'>('all')
  const [filterEngine, setFilterEngine] = useState<OpsEventSource | 'all'>('all')
  const [openOnly,     setOpenOnly]     = useState(false)
  const [searchLoad,   setSearchLoad]   = useState(loadNumber ?? '')
  const [summary,      setSummary]      = useState({ total: 0, critical: 0, warning: 0, open: 0, unsynced: 0 })

  const load = useCallback(() => {
    const filter: OpsEventFilter = {
      limit: compact ? 10 : maxItems,
    }
    if (filterSev !== 'all')    filter.severity     = filterSev
    if (filterEngine !== 'all') filter.sourceEngine = filterEngine
    if (openOnly)               filter.openOnly     = true
    if (searchLoad)             filter.loadNumber   = searchLoad

    setEvents(readOpsEvents(filter))
    const s = buildOpsEventSummary()
    setSummary({ total: s.total, critical: s.critical, warning: s.warning, open: s.open, unsynced: s.unsynced })
  }, [filterSev, filterEngine, openOnly, searchLoad, maxItems, compact])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  const handleResolve = (id: string, resolution: string) => {
    resolveOpsEvent(id, resolution)
    load()
  }

  if (compact) {
    return (
      <div style={{ display: 'grid', gap: '.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
            📋 Recent Ops Events
          </span>
          {summary.critical > 0 && (
            <span style={{ fontSize: '.58rem', fontWeight: 900, color: 'var(--error)', padding: '.1rem .4rem', borderRadius: 7, background: 'rgba(232,64,0,.1)' }}>
              {summary.critical} critical
            </span>
          )}
        </div>
        {events.length === 0 ? (
          <div style={{ fontSize: '.65rem', color: 'var(--muted)', padding: '.5rem 0' }}>No events logged yet.</div>
        ) : (
          events.map(e => <EventRow key={e.id} event={e} onResolve={handleResolve} />)
        )}
      </div>
    )
  }

  // ── Full mode ────────────────────────────────────────────────────────────────

  const sevOptions: Array<OpsEventSeverity | 'all'> = ['all', 'critical', 'warning', 'info']
  const engineOptions: Array<OpsEventSource | 'all'> = [
    'all', 'escalation_engine', 'load_health_engine', 'driver_ops_engine',
    'hos_planning', 'dispatch_engine', 'notification_router', 'manual',
  ]

  return (
    <div style={{ display: 'grid', gap: '.75rem' }}>

      {/* Summary bar */}
      <div style={{
        padding: '.65rem 1rem', borderRadius: 12,
        background: 'var(--surface)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
          📋 Ops Event Log
        </span>
        <span style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--muted)' }}>{summary.total} total</span>
        {summary.critical > 0 && (
          <span style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--error)', padding: '.15rem .45rem', borderRadius: 7, background: 'rgba(232,64,0,.1)', border: '1px solid rgba(232,64,0,.2)' }}>
            🔴 {summary.critical} critical
          </span>
        )}
        {summary.warning > 0 && (
          <span style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--warn)', padding: '.15rem .45rem', borderRadius: 7, background: 'rgba(245,194,0,.08)', border: '1px solid rgba(245,194,0,.2)' }}>
            ⚠️ {summary.warning} warning
          </span>
        )}
        <span style={{ fontSize: '.65rem', color: 'var(--muted)' }}>{summary.open} open</span>
        {summary.unsynced > 0 && (
          <span style={{ fontSize: '.58rem', color: 'var(--muted)', marginLeft: 'auto' }}>
            ⏳ {summary.unsynced} pending sync
          </span>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Severity filter */}
        <div style={{ display: 'flex', gap: '.25rem' }}>
          {sevOptions.map(s => (
            <button
              key={s}
              onClick={() => setFilterSev(s)}
              style={{
                fontSize: '.6rem', fontWeight: 800, padding: '.28rem .55rem', borderRadius: 7,
                cursor: 'pointer', textTransform: 'capitalize',
                border: `1px solid ${filterSev === s ? (s === 'critical' ? 'rgba(232,64,0,.4)' : s === 'warning' ? 'rgba(245,194,0,.4)' : 'rgba(0,232,176,.35)') : 'var(--border)'}`,
                background: filterSev === s ? (s === 'critical' ? 'rgba(232,64,0,.1)' : s === 'warning' ? 'rgba(245,194,0,.1)' : 'rgba(0,232,176,.08)') : 'var(--surface-2)',
                color: filterSev === s ? (s === 'critical' ? 'var(--error)' : s === 'warning' ? 'var(--warn)' : 'var(--primary)') : 'var(--muted)',
              }}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>

        {/* Engine filter */}
        <select
          value={filterEngine}
          onChange={e => setFilterEngine(e.target.value as OpsEventSource | 'all')}
          style={{
            fontSize: '.62rem', padding: '.28rem .5rem', borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--fg)', cursor: 'pointer',
          }}
        >
          {engineOptions.map(e => (
            <option key={e} value={e}>
              {e === 'all' ? 'All engines' : ENGINE_LABELS[e] ?? e}
            </option>
          ))}
        </select>

        {/* Load number search */}
        {!loadNumber && (
          <input
            value={searchLoad}
            onChange={e => setSearchLoad(e.target.value)}
            placeholder="Load #"
            style={{
              width: 80, fontSize: '.62rem', padding: '.28rem .5rem', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)',
            }}
          />
        )}

        {/* Open only toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.62rem', color: 'var(--muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={openOnly} onChange={e => setOpenOnly(e.target.checked)} />
          Open only
        </label>
      </div>

      {/* Event list */}
      {events.length === 0 ? (
        <div style={{
          padding: '1.5rem', borderRadius: 12, textAlign: 'center',
          background: 'var(--surface)', border: '1px solid var(--border)',
          fontSize: '.7rem', color: 'var(--muted)',
        }}>
          No events match the current filters.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '.4rem' }}>
          {events.map(e => <EventRow key={e.id} event={e} onResolve={handleResolve} />)}
        </div>
      )}
    </div>
  )
}
