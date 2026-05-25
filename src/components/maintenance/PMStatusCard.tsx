'use client'
/**
 * PMStatusCard — Compact PM status card for Dashboard + Dispatch.
 *
 * Driver sees:
 *   ⚠️ PM Due Soon
 *   Tractor PM A due in 742 miles.
 *   Suggested Love's: Wells, NV — 118 miles ahead.
 *
 * Dispatch sees:
 *   Tractor #204  PM A due soon
 *   Route match: Love's/Speedco on corridor
 *   Best service window: after delivery / during reset
 */
import Link from 'next/link'
import {
  PM_CONFIG,
  pmStatusColor,
  pmStatusLabel,
  formatMilesUntil,
  type PMTask,
  type ServiceLocation,
  type PMStatus,
} from '@/lib/maintenanceEngine'

// ── Progress bar ──────────────────────────────────────────────────────────────

function PMProgressBar({
  milesUntilDue,
  intervalMiles,
  status,
}: {
  milesUntilDue: number
  intervalMiles: number
  status: PMStatus
}) {
  const pct = status === 'overdue'
    ? 100
    : Math.max(0, Math.min(100, ((intervalMiles - milesUntilDue) / intervalMiles) * 100))

  const color = pmStatusColor(status)

  return (
    <div style={{ height: 4, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 6 }}>
      <div style={{
        height: '100%',
        width:  `${pct}%`,
        background: color,
        borderRadius: 4,
        transition: 'width .4s ease',
      }} />
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  tasks:           PMTask[]
  nearestLocation?: ServiceLocation | null
  truckNumber?:    string
  onSchedule?:     (task: PMTask) => void
  compact?:        boolean  // minimal version for dashboard banner
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PMStatusCard({
  tasks,
  nearestLocation,
  truckNumber,
  onSchedule,
  compact = false,
}: Props) {
  if (tasks.length === 0) return null

  // Show the most urgent task first
  const urgentTask  = tasks[0]
  const cfg         = PM_CONFIG[urgentTask.pmType]
  const statusColor = pmStatusColor(urgentTask.status)
  const isOverdue   = urgentTask.status === 'overdue'

  if (compact) {
    // Banner style for Dashboard cab mode
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: isOverdue ? 'rgba(232,64,0,.08)' : 'rgba(245,194,0,.06)',
        border: `1.5px solid ${statusColor}40`,
        borderRadius: 12, padding: '.6rem .9rem',
      }}>
        <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>
          {isOverdue ? '🛑' : '⚠️'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '.82rem', color: statusColor }}>
            {isOverdue ? 'PM Overdue' : 'PM Due Soon'}
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 1 }}>
            {truckNumber && <span>Tractor {truckNumber} · </span>}
            {cfg.label} {isOverdue ? 'overdue by' : 'due in'} {formatMilesUntil(Math.abs(urgentTask.milesUntilDue))}
            {nearestLocation && (
              <span> · {nearestLocation.name.replace("Love's Travel Stop", "Love's").replace(' Travel Center', '')} — {Math.round(nearestLocation.distanceMiles ?? 0)} mi</span>
            )}
          </div>
          <PMProgressBar milesUntilDue={urgentTask.milesUntilDue} intervalMiles={cfg.miles} status={urgentTask.status} />
        </div>
        {onSchedule && (
          <button
            onClick={() => onSchedule(urgentTask)}
            style={{
              padding: '.3rem .65rem', borderRadius: 8, border: `1.5px solid ${statusColor}60`,
              background: `${statusColor}14`, color: statusColor,
              fontWeight: 800, fontSize: '.7rem', cursor: 'pointer', flexShrink: 0,
            }}
          >
            Schedule →
          </button>
        )}
      </div>
    )
  }

  // Full card version
  return (
    <div style={{
      background: 'var(--surface-2)',
      border: `1.5px solid ${statusColor}30`,
      borderRadius: 14, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '.65rem .95rem .55rem',
        background: `${statusColor}10`,
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.1rem' }}>{isOverdue ? '🛑' : '⚠️'}</span>
          <div>
            <div style={{ fontWeight: 900, fontSize: '.88rem', color: statusColor }}>
              {isOverdue ? 'PM Overdue' : 'PM Due Soon'}
            </div>
            {truckNumber && (
              <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 1 }}>
                Tractor {truckNumber}
              </div>
            )}
          </div>
        </div>
        <Link
          href="/maintenance"
          style={{
            fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600,
            padding: '.25rem .55rem', border: '1px solid var(--border)',
            borderRadius: 7, textDecoration: 'none',
          }}
        >
          All PMs →
        </Link>
      </div>

      {/* PM rows */}
      <div style={{ padding: '.6rem .95rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tasks.slice(0, 3).map(task => {
          const c   = PM_CONFIG[task.pmType]
          const sc  = pmStatusColor(task.status)
          return (
            <div key={task.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '.9rem' }}>{c.emoji}</span>
                  <span style={{ fontWeight: 800, fontSize: '.85rem' }}>{c.label}</span>
                  <span style={{
                    fontSize: '.6rem', fontWeight: 800,
                    color: sc, background: `${sc}18`,
                    padding: '1px 7px', borderRadius: 20, border: `1px solid ${sc}30`,
                  }}>
                    {pmStatusLabel(task.status)}
                  </span>
                </div>
                <span style={{ fontSize: '.78rem', fontWeight: 700, color: sc }}>
                  {task.status === 'overdue' ? '-' : ''}{formatMilesUntil(Math.abs(task.milesUntilDue))}
                </span>
              </div>
              <PMProgressBar milesUntilDue={task.milesUntilDue} intervalMiles={c.miles} status={task.status} />
              {task.status !== 'scheduled' && task.status !== 'completed' && onSchedule && (
                <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => onSchedule(task)}
                    style={{
                      padding: '.25rem .6rem', borderRadius: 7, cursor: 'pointer',
                      border: `1px solid ${sc}50`, background: `${sc}10`,
                      color: sc, fontWeight: 700, fontSize: '.68rem',
                    }}
                  >
                    📅 Schedule
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {tasks.length > 3 && (
          <Link href="/maintenance" style={{ fontSize: '.72rem', color: 'var(--muted)', textDecoration: 'none' }}>
            +{tasks.length - 3} more PM{tasks.length - 3 > 1 ? 's' : ''} →
          </Link>
        )}
      </div>

      {/* Nearest service location */}
      {nearestLocation && (
        <div style={{
          padding: '.55rem .95rem .7rem',
          borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: '.9rem' }}>
            {nearestLocation.brand === 'speedco' ? '🔩' : '❤️'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '.78rem', color: 'var(--text)' }}>
              {nearestLocation.city}, {nearestLocation.state}
              <span style={{ color: 'var(--primary)', marginLeft: 6, fontWeight: 800 }}>
                {Math.round(nearestLocation.distanceMiles ?? 0)} mi
              </span>
            </div>
            <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 1 }}>
              {nearestLocation.name.replace("Love's Travel Stop", "Love's").replace(' Travel Center', '')}
              {nearestLocation.hasSpeedco && ' · Speedco available'}
            </div>
          </div>
          {onSchedule && (
            <button
              onClick={() => onSchedule(urgentTask)}
              style={{
                padding: '.3rem .65rem', borderRadius: 8, border: '1px solid rgba(0,232,176,.3)',
                background: 'rgba(0,232,176,.08)', color: 'var(--primary)',
                fontWeight: 800, fontSize: '.72rem', cursor: 'pointer',
              }}
            >
              Schedule
            </button>
          )}
        </div>
      )}
    </div>
  )
}
