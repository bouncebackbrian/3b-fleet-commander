'use client'
import { useState } from 'react'
import type { TimelineEntry } from '@/hooks/useDumpTruckDriver'
import type { SiteAwareLabelContext } from '@/lib/dumpTruck/actionLabels'
import LogEntryRow from './LogEntryRow'

const RECENT_COUNT = 3
/** Progressive disclosure (spec: "up to 2-3 secondary actions" visible at once) —
 *  the rest sit behind a "More" toggle instead of a wall of buttons. */
const PRIMARY_COUNT = 3

interface QuickAction { key: string; icon: string; label: string; enabled: boolean }

interface Props {
  timeline: TimelineEntry[]
  loadCount: number
  quickActions: QuickAction[]
  onQuickAction: (key: string) => void
  onViewFullLog: () => void
  labelCtx?: SiteAwareLabelContext
}

export default function RightRail({ timeline, loadCount, quickActions, onQuickAction, onViewFullLog, labelCtx }: Props) {
  const [showMoreActions, setShowMoreActions] = useState(false)
  const recent = [...timeline].reverse().slice(0, RECENT_COUNT)
  const primaryActions = quickActions.slice(0, PRIMARY_COUNT)
  const restActions = quickActions.slice(PRIMARY_COUNT)
  const visibleActions = showMoreActions ? quickActions : primaryActions
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      <div>
        <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
          Quick Actions
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {visibleActions.map(qa => (
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
        {restActions.length > 0 && (
          <button
            onClick={() => setShowMoreActions(v => !v)}
            style={{
              marginTop: 8, width: '100%', padding: '.4rem', borderRadius: 8, background: 'none',
              border: '1px dashed var(--border)', color: 'var(--muted)', fontSize: '.72rem', fontWeight: 700,
            }}
          >
            {showMoreActions ? 'Show Fewer ▲' : `More Actions (${restActions.length}) ▾`}
          </button>
        )}
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
          {recent.map(entry => <LogEntryRow key={entry.id} entry={entry} labelCtx={labelCtx} />)}
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
