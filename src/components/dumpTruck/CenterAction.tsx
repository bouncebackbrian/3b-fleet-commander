'use client'
import { useEffect, useState } from 'react'
import type { PrimaryActionSpec } from '@/lib/dumpTruck/stateMachine'

interface JobSummary {
  customerName: string | null
  jobNumber: string | null
  poNumber: string | null
  totalTons: number | null
}

interface Props {
  action: PrimaryActionSpec
  busy: boolean
  disabledReason: string | null
  onPrimary: () => void
  onSecondary: () => void
  /** Shift clock-in time — drives the big running timer above the button. Null hides it (not clocked in yet). */
  clockInAt?: string | null
  loadCount?: number
  job?: JobSummary | null
}

function formatClock(d: Date): string {
  let h = d.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s} ${ampm}`
}

export default function CenterAction({ action, busy, disabledReason, onPrimary, onSecondary, clockInAt, loadCount, job }: Props) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const hasJobInfo = job && (job.customerName || job.jobNumber || job.poNumber || job.totalTons != null)

  return (
    <div className="dt-center-stack" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '100%' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="dt-current-time-label" style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Current Time
        </div>
        <div className="dt-current-time" style={{ fontSize: '2.6rem', fontWeight: 900, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
          {formatClock(now)}
        </div>
      </div>
      {clockInAt && (
        <div className="dt-shift-since" style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--muted)' }}>
          Shift running since {new Date(clockInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </div>
      )}

      {(loadCount != null || hasJobInfo) && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '.5rem',
          width: '100%', maxWidth: 480,
        }}>
          {loadCount != null && <StatPill label="Loads" value={String(loadCount)} highlight />}
          {job?.customerName && <StatPill label="Customer" value={job.customerName} />}
          {job?.jobNumber && <StatPill label="Job #" value={job.jobNumber} />}
          {job?.poNumber && <StatPill label="PO #" value={job.poNumber} />}
          {job?.totalTons != null && <StatPill label="Total Tons" value={job.totalTons.toLocaleString()} />}
        </div>
      )}

      <button className="dt-primary-btn" disabled={busy || !!disabledReason} onClick={onPrimary}>
        {busy ? 'Saving…' : action.label}
      </button>

      {action.secondary && (
        <button className="dt-secondary-btn" disabled={busy || !!disabledReason} onClick={onSecondary}>
          {action.secondary.label}
        </button>
      )}

      {disabledReason && (
        <div style={{
          maxWidth: 480, textAlign: 'center', fontSize: '.85rem', fontWeight: 700,
          color: 'var(--error)', background: 'rgba(232,64,0,.1)', padding: '.6rem 1rem', borderRadius: 10,
        }}>
          ⚠️ {disabledReason}
        </div>
      )}

      <div className="dt-center-hint" style={{
        fontSize: '.72rem', color: 'var(--muted)', textAlign: 'center', maxWidth: 420,
      }}>
        Never interact with this screen while the truck is moving.
      </div>
    </div>
  )
}

function StatPill({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="dt-stat-pill" style={{
      padding: '.4rem .75rem', borderRadius: 10,
      background: highlight ? 'rgba(0,232,176,.1)' : 'var(--surface-2)',
      border: `1px solid ${highlight ? 'var(--primary)' : 'var(--border)'}`,
      textAlign: 'center', minWidth: 76,
    }}>
      <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '.95rem', fontWeight: 800, color: highlight ? 'var(--primary)' : 'var(--text)' }}>{value}</div>
    </div>
  )
}
