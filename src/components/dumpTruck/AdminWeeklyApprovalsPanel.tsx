'use client'
/**
 * AdminWeeklyApprovalsPanel — dispatch's queue of every driver's weekly
 * timesheet status for one Monday–Sunday week (who's waiting on dispatch,
 * who hasn't submitted, who's already approved). Reviewing/approving a row
 * reuses WeeklyTimesheetPanel with role="dispatch" — same recap, escalations,
 * and sign-off flow the driver sees, just from the other side.
 */
import { useState, useEffect, useCallback } from 'react'
import type { DriverOption } from '@/lib/fleet/dumpTruck/jobs'
import WeeklyTimesheetPanel from './WeeklyTimesheetPanel'

type Status = 'not_submitted' | 'correction_requested' | 'pending_dispatch' | 'sent_back' | 'approved'

interface WeeklyTimesheetDTO {
  driverId: string
  weekStart: string
  weekEnd: string
  status: Status
  summary: { daysWorked: number; totalRegularHours: number; totalOvertimeHours: number; estimatedGrossEarnings: number }
  escalations: { workDate: string; code: string; message: string }[]
}

const STATUS_LABEL: Record<Status, string> = {
  not_submitted: 'Driver hasn’t signed yet',
  correction_requested: 'Driver flagged a correction',
  pending_dispatch: 'Ready for your approval',
  sent_back: 'Sent back to driver',
  approved: '✅ Approved',
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const btnSecondaryStyle: React.CSSProperties = { padding: '.5rem .9rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 700, fontSize: '.8rem' }

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().slice(0, 10)
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function AdminWeeklyApprovalsPanel({ drivers }: { drivers: DriverOption[] }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date().toISOString().slice(0, 10)))
  const weekEnd = addDays(weekStart, 6)
  const [timesheets, setTimesheets] = useState<WeeklyTimesheetDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [openDriverId, setOpenDriverId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/fleet/dump-truck/admin/hours/weekly-approvals?weekStart=${weekStart}&weekEnd=${weekEnd}`)
      .then(r => r.json())
      .then(b => setTimesheets(b.timesheets ?? []))
      .finally(() => setLoading(false))
  }, [weekStart, weekEnd])
  useEffect(load, [load])

  const nameFor = (driverId: string) => drivers.find(d => d.userId === driverId)?.name ?? driverId

  const pendingCount = timesheets.filter(t => t.status === 'pending_dispatch').length

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
          Weekly Timesheet Approvals {pendingCount > 0 && <span style={{ color: 'var(--warn, #d99a2b)' }}>({pendingCount} pending)</span>}
        </h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={btnSecondaryStyle} onClick={() => setWeekStart(mondayOf(addDays(weekStart, -7)))}>◀ Prior Week</button>
          <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{weekStart} – {weekEnd}</span>
          <button style={btnSecondaryStyle} onClick={() => setWeekStart(mondayOf(addDays(weekStart, 7)))}>Next Week ▶</button>
        </div>
      </div>
      <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        Driver signs off on the week first — once they do, it lands here for your approval. Sending a week back
        returns it to the driver with your note; approving requires your own signature.
      </p>

      {loading && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Loading…</div>}
      {!loading && timesheets.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No shifts recorded for any driver this week.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {timesheets.map(ts => (
          <div key={ts.driverId}>
            <button
              onClick={() => setOpenDriverId(openDriverId === ts.driverId ? null : ts.driverId)}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                padding: '.7rem .9rem', borderRadius: 10, border: '1px solid var(--border)',
                background: ts.status === 'pending_dispatch' ? 'rgba(0,232,176,.06)' : 'var(--surface-2)',
                textAlign: 'left',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '.88rem' }}>{nameFor(ts.driverId)}</span>
              <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                {ts.summary.totalRegularHours.toFixed(2)} reg / {ts.summary.totalOvertimeHours.toFixed(2)} OT
                {ts.escalations.length > 0 && <span style={{ color: 'var(--warn, #d99a2b)', marginLeft: 8 }}>🚩 {ts.escalations.length}</span>}
              </span>
              <span style={{
                fontSize: '.72rem', fontWeight: 800, padding: '.25rem .55rem', borderRadius: 999,
                background: ts.status === 'approved' ? 'rgba(0,232,176,.12)' : ts.status === 'correction_requested' || ts.status === 'sent_back' ? 'rgba(217,154,43,.12)' : 'var(--surface)',
                color: ts.status === 'approved' ? 'var(--primary)' : ts.status === 'correction_requested' || ts.status === 'sent_back' ? 'var(--warn, #d99a2b)' : 'var(--muted)',
                border: '1px solid var(--border)',
              }}>
                {STATUS_LABEL[ts.status]}
              </span>
            </button>
            {openDriverId === ts.driverId && (
              <div style={{ marginTop: 8 }}>
                <WeeklyTimesheetPanel
                  weekStart={weekStart} weekEnd={weekEnd} role="dispatch"
                  driverId={ts.driverId} driverName={nameFor(ts.driverId)}
                  onChanged={load}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
