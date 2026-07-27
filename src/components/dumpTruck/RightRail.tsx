'use client'
import type { TimelineEntry } from '@/hooks/useDumpTruckDriver'

const EVENT_LABELS: Record<string, string> = {
  clock_in: 'Clocked In', arrive_yard_for_pickup: 'Arrived at Yard', truck_picked_up: 'Truck Picked Up',
  pretrip_started: 'Pre-Trip Started', pretrip_completed: 'Pre-Trip Complete',
  depart_yard: 'Departed Yard', arrive_pickup: 'Arrived Pickup', loading_started: 'Loading Started',
  loading_completed: 'Loading Complete', depart_pickup: 'Left Pickup', arrive_dump: 'Arrived Dump',
  unloading_started: 'Unloading Started', unloading_completed: 'Dumped', depart_dump: 'Left Dump',
  arrive_yard: 'Arrived Yard', break_started: 'Break Started', break_ended: 'Break Ended',
  delay_started: 'Delay Started', delay_ended: 'Delay Ended', fuel_stop_started: 'Fuel Stop',
  fuel_stop_ended: 'Fuel Stop Ended', posttrip_started: 'Post-Trip Started', posttrip_completed: 'Post-Trip Complete',
  truck_dropped_off: 'Truck Dropped Off', clock_out: 'Clocked Out', shift_submitted: 'Day Submitted',
  note: 'Note', photo_captured: 'Photo', ticket_captured: 'Ticket', correction_requested: 'Correction Requested',
}

interface QuickAction { key: string; icon: string; label: string; enabled: boolean }

interface Props {
  timeline: TimelineEntry[]
  loadCount: number
  quickActions: QuickAction[]
  onQuickAction: (key: string) => void
}

export default function RightRail({ timeline, loadCount, quickActions, onQuickAction }: Props) {
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
          {[...timeline].reverse().map(entry => (
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
      </div>
    </div>
  )
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  } catch { return iso }
}
