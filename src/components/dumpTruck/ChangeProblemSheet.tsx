'use client'
import Sheet from './Sheet'

/** Single entry point for "something about this job changed or went wrong" —
 *  routes to whichever existing sheet already handles that category instead
 *  of showing 5+ separate always-visible buttons on the main driver screen.
 *  End-shift exceptions use their own route because they close custody/pay time.
 */

export type ChangeProblemRoute = 'truck_problem' | 'delay' | 'defect' | 'incident' | 'edit_job' | 'note'

interface Option {
  route: ChangeProblemRoute
  icon: string
  label: string
  hint: string
  enabled: boolean
}

interface Props {
  onClose: () => void
  onSelect: (route: ChangeProblemRoute) => void
  hasActiveJob: boolean
  hasTruck: boolean
}

export default function ChangeProblemSheet({ onClose, onSelect, hasActiveJob, hasTruck }: Props) {
  const options: Option[] = [
    { route: 'truck_problem', icon: '🚨', label: 'Truck Problem', hint: 'Breakdown, can\'t move, mechanical', enabled: hasTruck },
    { route: 'delay', icon: '⏱️', label: 'Waiting / Traffic / Delay', hint: 'Waiting on loader, traffic, scale line, customer', enabled: true },
    { route: 'edit_job', icon: '📍', label: 'Job or Location Changed', hint: 'Dispatch changed job, new site, material changed', enabled: hasActiveJob },
    { route: 'defect', icon: '🔧', label: 'Truck Defect', hint: 'Inspection issue, not a full breakdown', enabled: hasTruck },
    { route: 'incident', icon: '⚠️', label: 'Incident', hint: 'Accident, safety event', enabled: true },
    { route: 'note', icon: '📝', label: 'Other / Note', hint: 'Anything else dispatch should know', enabled: true },
  ]

  return (
    <Sheet title="Change / Problem" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map(opt => (
          <button
            key={opt.route}
            disabled={!opt.enabled}
            onClick={() => onSelect(opt.route)}
            style={{
              display: 'flex', alignItems: 'center', gap: '.75rem', textAlign: 'left',
              padding: '.85rem .9rem', borderRadius: 12, border: '1px solid var(--border)',
              background: 'var(--surface-2)', color: 'var(--text)', opacity: opt.enabled ? 1 : .4,
            }}
          >
            <span style={{ fontSize: '1.3rem' }}>{opt.icon}</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 800, fontSize: '.92rem' }}>{opt.label}</span>
              <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{opt.hint}</span>
            </span>
          </button>
        ))}

        <button
          disabled={!hasTruck}
          onClick={() => { window.location.href = '/driver/dump-truck/end-shift-exception' }}
          style={{
            display: 'flex', alignItems: 'center', gap: '.75rem', textAlign: 'left',
            padding: '.85rem .9rem', borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--surface-2)', color: 'var(--text)', opacity: hasTruck ? 1 : .4,
          }}
        >
          <span style={{ fontSize: '1.3rem' }}>🛑</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 800, fontSize: '.92rem' }}>End Shift Exception</span>
            <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Asset shutdown or Transfer Post-Trip Lite</span>
          </span>
        </button>
      </div>
    </Sheet>
  )
}
