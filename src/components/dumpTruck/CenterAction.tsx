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

function formatElapsed(ms: number): string {
  if (ms < 0) return '0:00:00'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function CenterAction({ action, busy, disabledReason, onPrimary, onSecondary, clockInAt, loadCount, job }: Props) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!clockInAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [clockInAt])

  const hasJobInfo = job && (job.customerName || job.jobNumber || job.poNumber || job.totalTons != null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '100%' }}>
      {clockInAt && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Running Time
          </div>
          <div style={{ fontSize: '2.6rem', fontWeight: 900, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
            {formatElapsed(now - new Date(clockInAt).getTime())}
          </div>
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

      <div style={{
        fontSize: '.72rem', color: 'var(--muted)', textAlign: 'center', maxWidth: 420,
      }}>
        Never interact with this screen while the truck is moving.
      </div>
    </div>
  )
}

function StatPill({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
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
