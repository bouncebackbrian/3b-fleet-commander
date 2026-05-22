'use client'
/**
 * TimelineFeed — Unified operational event stream display
 *
 * Reads localStorage-first (instant, no network) and optionally polls
 * for freshness. Groups events by day. Shows load badge when loadId present.
 *
 * Usage:
 *   <TimelineFeed limit={40} />
 *   <TimelineFeed limit={10} compact />  // compact card for dashboard sidebar
 */
import { useState, useEffect } from 'react'
import { readLocalTimeline, EVENT_META } from '@/lib/timeline'
import type { TimelineEvent } from '@/lib/timeline'

interface Props {
  limit?:   number   // max events to render (default 50)
  compact?: boolean  // shorter row height, hide payload detail
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function dayLabel(isoStr: string): string {
  const d    = new Date(isoStr)
  const now  = new Date()
  const diff = now.setHours(0,0,0,0) - new Date(d).setHours(0,0,0,0)
  if (diff === 0)      return 'Today'
  if (diff === 86400000) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function timeLabel(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function relativeTime(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime()
  const min    = Math.floor(diffMs / 60_000)
  if (min < 1)  return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24)  return `${hr}h ago`
  return dayLabel(isoStr)
}

// ── Payload summary line ──────────────────────────────────────────────────────

function payloadSummary(event: TimelineEvent): string | null {
  const p = event.payload
  const parts: string[] = []

  if (p.loadNumber)   parts.push(`#${p.loadNumber}`)
  if (p.origin && p.destination) parts.push(`${p.origin} → ${p.destination}`)
  else if (p.destination)        parts.push(`→ ${p.destination}`)
  if (p.driveRem != null)        parts.push(`${Number(p.driveRem).toFixed(1)}h drive rem`)
  if (p.durationMins != null)    parts.push(`${p.durationMins}m`)
  if (p.docTypes)     parts.push((p.docTypes as string[]).join(', '))
  if (p.app)          parts.push(String(p.app))
  if (p.text)         parts.push(String(p.text))
  if (p.tier)         parts.push(`via ${p.tier}`)

  return parts.length > 0 ? parts.join(' · ') : null
}

// ── Group events by calendar day ─────────────────────────────────────────────

interface DayGroup {
  label:  string
  events: TimelineEvent[]
}

function groupByDay(events: TimelineEvent[]): DayGroup[] {
  const map = new Map<string, TimelineEvent[]>()
  for (const e of events) {
    const key = dayLabel(e.createdAt)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  return Array.from(map.entries()).map(([label, evs]) => ({ label, events: evs }))
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TimelineFeed({ limit = 50, compact = false }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([])

  // Read from localStorage on mount + re-read every 10 s for freshness
  useEffect(() => {
    const load = () => setEvents(readLocalTimeline(limit))
    load()
    const id = setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [limit])

  if (events.length === 0) {
    return (
      <div style={{
        padding: compact ? '.75rem 1rem' : '2rem',
        textAlign: 'center',
        color: 'var(--faint)',
        fontSize: '.82rem',
        fontWeight: 700,
      }}>
        No events yet — activity will appear here as you drive.
      </div>
    )
  }

  const groups = groupByDay(events)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {groups.map(group => (
        <div key={group.label}>

          {/* Day header */}
          <div style={{
            padding:       compact ? '.35rem .9rem' : '.5rem 1rem',
            fontSize:      '.65rem',
            fontWeight:    900,
            color:         'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '.1em',
            background:    'var(--surface-off)',
            borderTop:     '1px solid var(--border)',
            borderBottom:  '1px solid var(--border)',
            position:      'sticky',
            top:           0,
            zIndex:        1,
          }}>
            {group.label}
          </div>

          {/* Events */}
          {group.events.map((event, idx) => {
            const meta    = EVENT_META[event.eventType]
            const summary = payloadSummary(event)
            const isLast  = idx === group.events.length - 1

            return (
              <div
                key={event.id}
                style={{
                  display:      'flex',
                  alignItems:   'flex-start',
                  gap:          compact ? 10 : 12,
                  padding:      compact ? '.5rem .9rem' : '.7rem 1rem',
                  borderBottom: isLast ? 'none' : '1px solid var(--border)',
                  background:   'var(--surface)',
                }}
              >
                {/* Timeline spine dot */}
                <div style={{
                  display:        'flex',
                  flexDirection:  'column',
                  alignItems:     'center',
                  flexShrink:     0,
                  paddingTop:     2,
                }}>
                  <div style={{
                    width:        compact ? 28 : 32,
                    height:       compact ? 28 : 32,
                    borderRadius: '50%',
                    background:   'var(--surface-2)',
                    border:       '1px solid var(--border)',
                    display:      'grid',
                    placeItems:   'center',
                    fontSize:     compact ? '.85rem' : '.95rem',
                    lineHeight:   1,
                    flexShrink:   0,
                  }}>
                    {meta?.emoji ?? '●'}
                  </div>
                </div>

                {/* Event content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display:    'flex',
                    alignItems: 'baseline',
                    gap:        8,
                    flexWrap:   'wrap',
                  }}>
                    <span style={{
                      fontWeight: 800,
                      fontSize:   compact ? '.8rem' : '.88rem',
                      color:      'var(--text)',
                    }}>
                      {meta?.label ?? event.eventType}
                    </span>

                    {event.loadId && (
                      <span style={{
                        fontSize:     '.62rem',
                        fontWeight:   800,
                        color:        'var(--primary)',
                        background:   'rgba(0,232,176,.08)',
                        border:       '1px solid rgba(0,232,176,.2)',
                        borderRadius: 5,
                        padding:      '.1em .4em',
                        whiteSpace:   'nowrap',
                      }}>
                        #{event.loadId}
                      </span>
                    )}
                  </div>

                  {!compact && summary && (
                    <div style={{
                      fontSize:   '.72rem',
                      color:      'var(--muted)',
                      marginTop:  2,
                      overflow:   'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {summary}
                    </div>
                  )}
                </div>

                {/* Time */}
                <div style={{
                  flexShrink:  0,
                  fontSize:    '.65rem',
                  color:       'var(--faint)',
                  fontWeight:  700,
                  fontVariantNumeric: 'tabular-nums',
                  paddingTop:  compact ? 3 : 5,
                  textAlign:   'right',
                  lineHeight:  1.3,
                }}>
                  <div>{timeLabel(event.createdAt)}</div>
                  {!compact && (
                    <div style={{ color: 'var(--faint)', fontWeight: 600 }}>
                      {relativeTime(event.createdAt)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
