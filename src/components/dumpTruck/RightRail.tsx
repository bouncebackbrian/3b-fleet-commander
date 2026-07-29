'use client'
import type { TimelineEntry } from '@/hooks/useDumpTruckDriver'
import LogEntryRow from './LogEntryRow'

const RECENT_COUNT = 3

interface QuickAction { key: string; icon: string; label: string; enabled: boolean }

interface Props {
  timeline: TimelineEntry[]
  loadCount: number
  quickActions: QuickAction[]
  onQuickAction: (key: string) => void
  onViewFullLog: () => void
}

export default function RightRail({ timeline, loadCount, quickActions, onQuickAction, onViewFullLog }: Props) {
  const recent = [...timeline].reverse().slice(0, RECENT_COUNT)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      <div>
        <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
          Quick Actions
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {quickActions.map(qa => (
            <button
              key={qa.key}
              className="dt-quick-btn"
              disabled={!qa.enabled}
              onClick={() => onQuickAction(qa.key)}
              style={{ opacity: qa.enabled ? 1 : .4 }}
            >
              <span style={{ fontSize: '1.2rem' }}>{qa.icon}</span>
              {qa.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          fontSize: '.68rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
          marginBottom: 6, display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Day Activity</span>
          <span>{loadCount} load{loadCount === 1 ? '' : 's'}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {timeline.length === 0 && (
            <div style={{ fontSize: '.8rem', color: 'var(--faint)', padding: '1rem 0' }}>No events yet today.</div>
          )}
          {recent.map(entry => <LogEntryRow key={entry.id} entry={entry} />)}
        </div>
        {timeline.length > 0 && (
          <button
            onClick={onViewFullLog}
            style={{
              marginTop: 8, padding: '.5rem', borderRadius: 8, background: 'var(--surface-2)',
              border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '.76rem', fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            View Full Log ({timeline.length})
          </button>
        )}
      </div>
    </div>
  )
}
