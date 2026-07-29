'use client'
import Sheet from './Sheet'
import LogEntryRow from './LogEntryRow'
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
        {all.map(entry => <LogEntryRow key={entry.id} entry={entry} />)}
      </div>
    </Sheet>
  )
}
