'use client'

import { useCallback, useEffect, useState } from 'react'
import WeeklyTimesheetPanel from '@/components/dumpTruck/WeeklyTimesheetPanel'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'

type RangeType = 'current_week' | 'previous_week' | 'current_pay_period' | 'previous_pay_period' | 'custom'

interface DailyHoursRow {
  workDate: string
  shiftId: string
  totalShiftHours: number
  paidHours: number
  customerBillableHours: number
  regularHours: number
  overtimeHours: number
  truckUnit: string | null
  loadsCompleted: number
  shiftMiles: number | null
  startOdometer: number | null
  endOdometer: number | null
  pendingPayableHours: number
  exceptionStatus: string
  submissionStatus: string
}

interface RangeSummary {
  daysWorked: number
  totalPaidHours: number
  totalRegularHours: number
  totalOvertimeHours: number
  totalCustomerBillableHours: number
  totalPendingPayableHours: number
  totalLoads: number
  totalMiles: number
}

interface HoursResponse {
  range: { start: string; end: string }
  rangeType: RangeType
  rows: DailyHoursRow[]
  summary: RangeSummary
}

const RANGE_OPTIONS: { key: RangeType; label: string }[] = [
  { key: 'current_week', label: 'Current Week' },
  { key: 'previous_week', label: 'Previous Week' },
  { key: 'current_pay_period', label: 'Current Pay Period' },
  { key: 'previous_pay_period', label: 'Previous Pay Period' },
  { key: 'custom', label: 'Custom Range' },
]

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.15rem',
}

export default function DriverHoursPage() {
  const [rangeType, setRangeType] = useState<RangeType>('current_week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [data, setData] = useState<HoursResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (rangeType === 'custom' && (!customFrom || !customTo)) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ range: rangeType })
      if (rangeType === 'custom') { params.set('from', customFrom); params.set('to', customTo) }
      const res = await fetch(`/api/fleet/dump-truck/hours?${params}`)
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not load hours')
      setData(await res.json())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load hours')
    } finally {
      setLoading(false)
    }
  }, [rangeType, customFrom, customTo])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ padding: '1.25rem', maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h1 style={{ fontSize: '1.45rem', fontWeight: 900 }}>My Hours</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.84rem', marginTop: 4 }}>
          Your personal work-hour record. Fleet Commander shows gross payable hours and work activity here; pay rates, payroll dollars, taxes and deductions are managed outside the Driver portal.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {RANGE_OPTIONS.map(opt => (
          <button key={opt.key} onClick={() => setRangeType(opt.key)} style={{
            padding: '.55rem .9rem', borderRadius: 10, border: '1px solid var(--border)', fontWeight: 750,
            background: rangeType === opt.key ? 'var(--primary)' : 'var(--surface-2)', color: rangeType === opt.key ? '#04140f' : 'var(--text)',
          }}>{opt.label}</button>
        ))}
        {rangeType === 'custom' && <>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={inputStyle} />
          <span style={{ color: 'var(--muted)' }}>to</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={inputStyle} />
        </>}
      </div>

      {loading && <div style={{ color: 'var(--muted)' }}>Loading…</div>}

      {!loading && data && <>
        <div style={card}>
          <div style={{ fontSize: '.73rem', color: 'var(--muted)', marginBottom: 10 }}>{data.range.start} to {data.range.end}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))', gap: '.9rem' }}>
            <Stat label="Days Worked" value={String(data.summary.daysWorked)} />
            <Stat label="Gross Pay Hours" value={data.summary.totalPaidHours.toFixed(2)} highlight />
            <Stat label="Regular Hours" value={data.summary.totalRegularHours.toFixed(2)} />
            <Stat label="OT Hours" value={data.summary.totalOvertimeHours.toFixed(2)} />
            <Stat label="Customer/Broker Hours" value={data.summary.totalCustomerBillableHours.toFixed(2)} />
            <Stat label="Additional Work Hours" value={Math.max(0, data.summary.totalPaidHours - data.summary.totalCustomerBillableHours).toFixed(2)} />
            <Stat label="Loads" value={String(data.summary.totalLoads)} />
            <Stat label="Miles" value={String(data.summary.totalMiles)} />
            {data.summary.totalPendingPayableHours > 0 && <Stat label="Pending Review" value={data.summary.totalPendingPayableHours.toFixed(2)} />}
          </div>
        </div>

        {(rangeType === 'current_week' || rangeType === 'previous_week') && (
          <WeeklyTimesheetPanel weekStart={data.range.start} weekEnd={data.range.end} role="driver" />
        )}

        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: '.85rem' }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 850 }}>Daily Hours</h2>
              <div style={{ fontSize: '.74rem', color: 'var(--muted)' }}>Customer/Broker + Additional Work explains the gross payable hours for each day.</div>
            </div>
          </div>
          {data.rows.length === 0 ? <div style={{ color: 'var(--muted)' }}>No shifts recorded.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem', minWidth: 820 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  <th style={th}>Date</th><th style={th}>Truck</th><th style={th}>Total</th><th style={th}>Gross Pay</th><th style={th}>Customer</th><th style={th}>Additional Work</th><th style={th}>Reg</th><th style={th}>OT</th><th style={th}>Loads</th><th style={th}>Miles</th><th style={th}>Status</th>
                </tr></thead>
                <tbody>{data.rows.map(r => {
                  const additional = Math.max(0, r.paidHours - r.customerBillableHours)
                  const status = r.exceptionStatus === 'correction_requested' ? 'Correction requested' : r.pendingPayableHours > 0 ? 'Pending review' : r.submissionStatus
                  return <tr key={r.shiftId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>{r.workDate}</td><td style={td}>{r.truckUnit ?? '—'}</td><td style={td}>{r.totalShiftHours.toFixed(2)}</td><td style={{ ...td, fontWeight: 850 }}>{r.paidHours.toFixed(2)}</td><td style={td}>{r.customerBillableHours.toFixed(2)}</td><td style={td}>{additional.toFixed(2)}</td><td style={td}>{r.regularHours.toFixed(2)}</td><td style={td}>{r.overtimeHours.toFixed(2)}</td><td style={td}>{r.loadsCompleted}</td><td style={td}>{r.shiftMiles ?? '—'}</td><td style={td}>{status}</td>
                  </tr>
                })}</tbody>
              </table>
            </div>
          )}
        </div>
      </>}
      <ToastContainer />
    </div>
  )
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div><div style={{ fontSize: '.65rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800 }}>{label}</div><div style={{ fontSize: '1.25rem', fontWeight: 900, color: highlight ? 'var(--primary)' : 'var(--text)' }}>{value}</div></div>
}

const th: React.CSSProperties = { padding: '.6rem .45rem', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '.65rem .45rem', whiteSpace: 'nowrap' }
const inputStyle: React.CSSProperties = { padding: '.5rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }
