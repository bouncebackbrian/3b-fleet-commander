'use client'
/**
 * /driver/hours — Driver weekly-hours portal + personal-record CSV export (spec §10)
 *
 * All earnings figures shown here are ESTIMATES from a single hourly-rate +
 * daily-overtime policy — never a payroll-approved amount (payroll approval
 * workflow is not implemented). See docs/DUMP_TRUCK_MODE.md.
 */
import { useEffect, useState, useCallback } from 'react'
import { captureGeolocation, createId } from '@/lib/dumpTruck/events'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'

type RangeType = 'current_week' | 'previous_week' | 'current_pay_period' | 'previous_pay_period' | 'custom'

interface DailyHoursRow {
  workDate: string
  shiftId: string
  clockInAt: string | null
  clockOutAt: string | null
  totalShiftHours: number
  regularHours: number
  overtimeHours: number
  pretripHours: number
  posttripHours: number
  onDutyNotDrivingHours: number
  emptyDrivingHours: number
  loadedDrivingHours: number
  loadingWaitingHours: number
  unloadingWaitingHours: number
  fuelingHours: number
  delayHours: number
  unpaidBreakHours: number
  vehicleCustodyHours: number
  truckUnit: string | null
  jobsWorked: string
  customersWorked: string
  loadsCompleted: number
  quantityHauled: number
  startOdometer: number | null
  endOdometer: number | null
  shiftMiles: number | null
  estimatedGrossEarnings: number
  submissionStatus: string
  exceptionStatus: 'none' | 'correction_requested'
}

interface RangeSummary {
  daysWorked: number
  totalRegularHours: number
  totalOvertimeHours: number
  totalDriveHours: number
  totalCustodyHours: number
  totalLoads: number
  totalQuantity: number
  totalMiles: number
  estimatedGrossEarnings: number
}

interface HoursResponse {
  range: { start: string; end: string }
  rangeType: RangeType
  rows: DailyHoursRow[]
  summary: RangeSummary
  isDefaultPayPolicy: boolean
}

const RANGE_OPTIONS: { key: RangeType; label: string }[] = [
  { key: 'current_week', label: 'Current Week' },
  { key: 'previous_week', label: 'Previous Week' },
  { key: 'current_pay_period', label: 'Current Pay Period' },
  { key: 'previous_pay_period', label: 'Previous Pay Period' },
  { key: 'custom', label: 'Custom Range' },
]

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }

export default function DriverHoursPage() {
  const [rangeType, setRangeType] = useState<RangeType>('current_week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [data, setData] = useState<HoursResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [correctionShiftId, setCorrectionShiftId] = useState<string | null>(null)
  const [correctionText, setCorrectionText] = useState('')
  const [submittingCorrection, setSubmittingCorrection] = useState(false)

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

  const exportUrl = (type: 'detail' | 'summary') => {
    const params = new URLSearchParams({ range: rangeType, type })
    if (rangeType === 'custom') { params.set('from', customFrom); params.set('to', customTo) }
    return `/api/fleet/dump-truck/hours/export?${params}`
  }

  const submitCorrection = async () => {
    if (!correctionShiftId || !correctionText.trim()) return
    setSubmittingCorrection(true)
    try {
      const geo = await captureGeolocation()
      const now = new Date()
      const res = await fetch('/api/fleet/dump-truck/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: createId(), idempotencyKey: createId(), shiftId: correctionShiftId, eventType: 'correction_requested',
          deviceCapturedAt: now.toISOString(), effectiveAt: now.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, utcOffsetMinutes: -now.getTimezoneOffset(),
          geo, notes: correctionText.trim(),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not submit correction request')
      toast.success('Correction request sent — dispatch/payroll will follow up')
      setCorrectionShiftId(null)
      setCorrectionText('')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit correction request')
    } finally {
      setSubmittingCorrection(false)
    }
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>My Hours</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>
          Every earnings figure below is an <strong>estimate</strong> — regular + daily-overtime hours only,
          at a single business hourly rate. It is not a pay stub. Approved company payroll records control if
          values differ.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {RANGE_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setRangeType(opt.key)}
            style={{
              padding: '.55rem 1rem', borderRadius: 10, fontWeight: 700, fontSize: '.85rem',
              background: rangeType === opt.key ? 'var(--primary)' : 'var(--surface-2)',
              color: rangeType === opt.key ? '#04140f' : 'var(--text)', border: '1px solid var(--border)',
            }}
          >
            {opt.label}
          </button>
        ))}
        {rangeType === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: '.5rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }} />
            <span style={{ color: 'var(--muted)' }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: '.5rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }} />
          </>
        )}
      </div>

      {loading && <div style={{ color: 'var(--muted)' }}>Loading…</div>}

      {!loading && data && (
        <>
          <div style={cardStyle}>
            <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 10 }}>
              {data.range.start} to {data.range.end}
              {data.isDefaultPayPolicy && ' — using default $32/hr, 8hr daily OT policy (business has not set a custom rate)'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
              <Stat label="Days Worked" value={String(data.summary.daysWorked)} />
              <Stat label="Regular Hrs" value={data.summary.totalRegularHours.toFixed(2)} />
              <Stat label="Overtime Hrs" value={data.summary.totalOvertimeHours.toFixed(2)} />
              <Stat label="Drive Hrs" value={data.summary.totalDriveHours.toFixed(2)} />
              <Stat label="Custody Hrs" value={data.summary.totalCustodyHours.toFixed(2)} />
              <Stat label="Loads" value={String(data.summary.totalLoads)} />
              <Stat label="Miles" value={String(data.summary.totalMiles)} />
              <Stat label="Est. Earnings" value={`$${data.summary.estimatedGrossEarnings.toFixed(2)}`} highlight />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem' }}>
              <button onClick={() => window.open(exportUrl('detail'), '_blank')} style={exportBtnStyle}>⬇️ Export My Records (Detail CSV)</button>
              <button onClick={() => window.open(exportUrl('summary'), '_blank')} style={exportBtnStyle}>⬇️ Export Summary CSV</button>
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '1rem' }}>Daily Detail</h2>
            {data.rows.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: '.9rem' }}>No shifts recorded in this range.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--muted)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={th}>Date</th><th style={th}>Truck</th><th style={th}>Total</th><th style={th}>Reg</th>
                      <th style={th}>OT</th><th style={th}>Loads</th><th style={th}>Miles</th><th style={th}>Est. $</th>
                      <th style={th}>Status</th><th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map(r => (
                      <tr key={r.shiftId} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={td}>{r.workDate}</td>
                        <td style={td}>{r.truckUnit ?? '—'}</td>
                        <td style={td}>{r.totalShiftHours.toFixed(2)}</td>
                        <td style={td}>{r.regularHours.toFixed(2)}</td>
                        <td style={td}>{r.overtimeHours.toFixed(2)}</td>
                        <td style={td}>{r.loadsCompleted}</td>
                        <td style={td}>{r.shiftMiles ?? '—'}</td>
                        <td style={td}>${r.estimatedGrossEarnings.toFixed(2)}</td>
                        <td style={td}>
                          {r.submissionStatus}
                          {r.exceptionStatus === 'correction_requested' && (
                            <span style={{ color: 'var(--warn)', marginLeft: 6 }}>⚠️ correction requested</span>
                          )}
                        </td>
                        <td style={td}>
                          <button
                            onClick={() => setCorrectionShiftId(r.shiftId)}
                            style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--primary)', padding: '.3rem .5rem', borderRadius: 6, border: '1px solid var(--border)' }}
                          >
                            Request Correction
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {correctionShiftId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(3,13,11,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setCorrectionShiftId(null)}>
          <div style={{ ...cardStyle, maxWidth: 420, width: '90%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight: 800, marginBottom: '.75rem' }}>Request a Correction</h3>
            <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '.75rem' }}>
              Explain what looks wrong or is missing for this shift (e.g. a missed clock-out, wrong odometer,
              a load that didn't get logged). Dispatch/payroll will review — this does not change the record
              itself.
            </p>
            <textarea
              value={correctionText}
              onChange={e => setCorrectionText(e.target.value)}
              placeholder="What needs to be corrected?"
              style={{ width: '100%', minHeight: 100, padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: '.75rem' }}>
              <button onClick={() => setCorrectionShiftId(null)} style={{ flex: 1, padding: '.7rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>Cancel</button>
              <button
                onClick={submitCorrection}
                disabled={!correctionText.trim() || submittingCorrection}
                style={{ flex: 1, padding: '.7rem', borderRadius: 8, background: 'var(--primary)', color: '#04140f', fontWeight: 800, opacity: correctionText.trim() && !submittingCorrection ? 1 : .5 }}
              >
                {submittingCorrection ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  )
}

const th: React.CSSProperties = { padding: '.5rem .6rem' }
const td: React.CSSProperties = { padding: '.5rem .6rem' }
const exportBtnStyle: React.CSSProperties = {
  padding: '.65rem 1.1rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)',
  fontWeight: 700, fontSize: '.85rem', color: 'var(--primary)',
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: highlight ? '1.3rem' : '1.1rem', fontWeight: 900, color: highlight ? 'var(--primary)' : 'var(--text)' }}>{value}</div>
    </div>
  )
}
