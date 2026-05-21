'use client'
import { useState, useMemo } from 'react'
import type { LoadMission, Expense, OperationalEvent, StopEvent, FuelEntry, DocRecord } from '@/lib/dashboard/types'
import {
  buildTimeline, getOrderNumber,
  type TimelineEntry, type TimelineFilter,
} from '@/lib/dashboard/orderUtils'

interface Props {
  open:        boolean
  onClose:     () => void
  mission:     LoadMission | null
  expenses?:   Expense[]
  fuel?:       FuelEntry[]
  events?:     OperationalEvent[]
  stopEvents?: StopEvent[]
  docs?:       DocRecord[]
  driverMode?: boolean
}

const FILTERS: { key: TimelineFilter; label: string; emoji: string }[] = [
  { key: 'all',      label: 'All',      emoji: '📋' },
  { key: 'stops',    label: 'Stops',    emoji: '📍' },
  { key: 'fuel',     label: 'Fuel',     emoji: '⛽' },
  { key: 'expenses', label: 'Expenses', emoji: '💰' },
  { key: 'docs',     label: 'Docs',     emoji: '📄' },
  { key: 'alerts',   label: 'Alerts',   emoji: '🔔' },
]

const SEVERITY_COLOR: Record<string, string> = {
  info:     'var(--primary)',
  warn:     'var(--warn)',
  critical: 'var(--error)',
}

function fmtTs(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleString('en-US', {
      month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
  } catch { return iso }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

// Group entries by calendar date for date-divider display
function groupByDate(entries: TimelineEntry[]): { date: string; entries: TimelineEntry[] }[] {
  const groups: Map<string, TimelineEntry[]> = new Map()
  for (const e of entries) {
    const d = e.ts.slice(0, 10)
    if (!groups.has(d)) groups.set(d, [])
    groups.get(d)!.push(e)
  }
  return Array.from(groups.entries()).map(([date, entries]) => ({ date, entries }))
}

export default function OrderTimelinePanel({
  open, onClose, mission,
  expenses = [], fuel = [], events = [], stopEvents = [], docs = [],
  driverMode = false,
}: Props) {
  const [filter, setFilter] = useState<TimelineFilter>('all')

  const entries = useMemo(() => {
    if (!mission) return []
    return buildTimeline({ mission, expenses, fuel, events, stopEvents, docs, filter })
  }, [mission, expenses, fuel, events, stopEvents, docs, filter])

  const groups = useMemo(() => groupByDate(entries), [entries])

  if (!open || !mission) return null

  const orderNum  = getOrderNumber(mission)
  const loadNum   = mission.loadNumber || '—'
  const trailNum  = mission.trailerNum || '—'
  const driverSnap = mission.driverName || '—'
  const tractorSnap = mission.tractorId  || '—'
  const createdAt = mission.timestamps?.orderCreatedAt ?? mission.date

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 300 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
        background: 'var(--surface)', borderRadius: '18px 18px 0 0',
        padding: '1.5rem 1.25rem 2rem',
        boxShadow: '0 -4px 30px rgba(0,0,0,.35)',
        maxHeight: '92vh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 1.1rem', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>📋 Order Timeline</div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>
              {orderNum} · Load #{loadNum}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: 'var(--muted)', cursor: 'pointer', padding: '.2rem .4rem', lineHeight: 1 }}
          >×</button>
        </div>

        {/* Order identity bar */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '.65rem .8rem', marginBottom: '1rem', flexShrink: 0,
        }}>
          {[
            ['🚚 Tractor', tractorSnap],
            ['🚛 Trailer', trailNum],
            ...(!driverMode ? [['👤 Driver', driverSnap]] : []),
            ['📅 Created', createdAt ? fmtDate(createdAt) : '—'],
            ['📍 Origin', mission.origin.length > 20 ? mission.origin.slice(0, 18) + '…' : mission.origin],
            ['🏁 Dest', mission.destination.length > 20 ? mission.destination.slice(0, 18) + '…' : mission.destination],
          ].map(([k, v]) => (
            <div key={k as string}>
              <div style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 1 }}>{k}</div>
              <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{v || '—'}</div>
            </div>
          ))}
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem', flexShrink: 0 }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '.32rem .7rem', borderRadius: 20, fontSize: '.72rem', fontWeight: 700,
                cursor: 'pointer', transition: 'all .12s',
                border:      filter === f.key ? '1px solid var(--primary)' : '1px solid var(--border)',
                background:  filter === f.key ? 'rgba(0,232,176,.12)' : 'var(--surface-2)',
                color:       filter === f.key ? 'var(--primary)' : 'var(--muted)',
              }}
            >
              {f.emoji} {f.label}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {entries.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '2.5rem 1rem',
            color: 'var(--muted)', fontSize: '.85rem', lineHeight: 1.6,
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '.75rem' }}>📭</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>No events yet</div>
            <div style={{ fontSize: '.75rem' }}>
              Events appear here as the order progresses — stops, fuel, expenses, docs, and alerts.
            </div>
          </div>
        )}

        {/* Timeline groups */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {groups.map(group => (
            <div key={group.date}>
              {/* Date divider */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, margin: '.75rem 0 .5rem',
              }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>
                  {fmtDate(group.date)}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              {/* Entries */}
              <div style={{ display: 'grid', gap: 5 }}>
                {group.entries.map((entry, ei) => (
                  <TimelineRow key={entry.id} entry={entry} isLast={ei === group.entries.length - 1} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Summary footer */}
        {entries.length > 0 && (
          <div style={{
            marginTop: '1rem', paddingTop: '.75rem', borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600 }}>
              {entries.length} event{entries.length !== 1 ? 's' : ''}
              {filter !== 'all' ? ` · ${filter}` : ''}
            </span>
            <span style={{
              fontSize: '.68rem', fontWeight: 800, padding: '.2rem .6rem', borderRadius: 6,
              background: mission.status === 'completed' ? 'rgba(40,192,72,.1)' : 'rgba(0,232,176,.08)',
              color: mission.status === 'completed' ? 'var(--success)' : 'var(--primary)',
              border: `1px solid ${mission.status === 'completed' ? 'rgba(40,192,72,.2)' : 'rgba(0,232,176,.15)'}`,
            }}>
              {(mission.status ?? 'active').replace('_', ' ').toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </>
  )
}

// ── Single timeline row ───────────────────────────────────────────────────────
function TimelineRow({ entry, isLast }: { entry: TimelineEntry; isLast: boolean }) {
  const alertColor = entry.severity ? SEVERITY_COLOR[entry.severity] : undefined

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', position: 'relative' }}>
      {/* Timeline track */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 28 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: alertColor ? `${alertColor}15` : 'var(--surface-2)',
          border: `1px solid ${alertColor ?? 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '.82rem', flexShrink: 0,
        }}>
          {entry.emoji}
        </div>
        {!isLast && (
          <div style={{ width: 1, flex: 1, minHeight: 14, background: 'var(--border)', marginTop: 2 }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontSize: '.72rem', fontWeight: 800,
            color: alertColor ?? 'var(--text)',
            textTransform: 'uppercase', letterSpacing: '.04em',
          }}>
            {entry.label}
          </span>
          <span style={{ fontSize: '.63rem', color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {fmtTs(entry.ts)}
          </span>
        </div>

        <div style={{ fontSize: '.82rem', color: 'var(--text)', marginTop: 2, lineHeight: 1.4, fontWeight: 500 }}>
          {entry.detail}
        </div>

        {entry.subDetail && (
          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2, lineHeight: 1.35 }}>
            {entry.subDetail}
          </div>
        )}
      </div>
    </div>
  )
}
