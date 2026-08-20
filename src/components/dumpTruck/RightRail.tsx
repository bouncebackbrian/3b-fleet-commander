'use client'
import { useState } from 'react'

/** Progressive disclosure (spec: "up to 2-3 secondary actions" visible at once) —
 *  the rest sit behind a "More" toggle instead of a wall of buttons. */
const PRIMARY_COUNT = 3

interface QuickAction { key: string; icon: string; label: string; enabled: boolean }

interface Props {
  quickActions: QuickAction[]
  onQuickAction: (key: string) => void
}

export default function RightRail({ quickActions, onQuickAction }: Props) {
  const [showMoreActions, setShowMoreActions] = useState(false)
  const primaryActions = quickActions.slice(0, PRIMARY_COUNT)
  const restActions = quickActions.slice(PRIMARY_COUNT)
  const visibleActions = showMoreActions ? quickActions : primaryActions
  return (
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
  )
}
