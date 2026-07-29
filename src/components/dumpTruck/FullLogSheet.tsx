'use client'
import Sheet from './Sheet'
import { fmtTime } from './RightRail'
import { EVENT_LABELS } from '@/lib/dumpTruck/eventLabels'
import type { TimelineEntry } from '@/hooks/useDumpTruckDriver'

interface Props {
  timeline: TimelineEntry[]
  onClose: () => void
}

export default function FullLogSheet({ timeline, onClose }: Props) {
  const all = [...timeline].reverse()
  return (
    <Sheet title={`Full Log (${all.length})`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {all.length === 0 && (
          <div style={{ fontSize: '.8rem', color: 'var(--faint)', padding: '1rem 0' }}>No events yet today.</div>
        )}
        {all.map(entry => (
          <div key={entry.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '.5rem .6rem',
            borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)',
            opacity: entry.pending ? .65 : 1,
          }}>
            <span style={{ fontSize: '.9rem' }}>{entry.pending ? '⏳' : '✅'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.82rem', fontWeight: 700 }}>{EVENT_LABELS[entry.eventType] ?? entry.eventType}</div>
              {entry.notes && <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{entry.notes}</div>}
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', flexShrink: 0 }}>
              {fmtTime(entry.effectiveAt)}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
