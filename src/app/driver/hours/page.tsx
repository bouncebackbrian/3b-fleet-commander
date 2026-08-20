'use client'
/**
 * /driver/hours — Driver weekly-hours portal + personal-record CSV export (spec §10)
 *
 * All earnings figures shown here are ESTIMATES from a single hourly-rate +
 * daily-overtime policy — never a payroll-approved amount (payroll approval
 * workflow is not implemented). See docs/DUMP_TRUCK_MODE.md.
 */
import { useEffect, useState, useCallback } from 'react'
import { EVENT_LABELS } from '@/lib/dumpTruck/eventLabels'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'
import HoursSignOffSheet from '@/components/dumpTruck/HoursSignOffSheet'

type RangeType = 'current_week' | 'previous_week' | 'current_pay_period' | 'previous_pay_period' | 'custom'

interface DailyHoursRow {
  workDate: string
  shiftId: string
  clockInAt: string | null
  clockOutAt: string | null
  totalShiftHours: number
  rawCalculatedHours: number
  verifiedHoursOverride: { hours: number; reason: string; sourceDocument: string | null } | null
  paidHours: number
  nonPaidOperationalHours: number
  pendingPayableHours: number
  customerBillableHours: number
  nonBilledOperationalHours: number
  pendingBillableHours: number
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
  integrityWarnings: { code: string; message: string }[]
  confirmation: { status: 'confirmed' | 'correction_requested'; createdAt: string; correctionNote: string | null } | null
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
  totalPaidHours: number
  totalNonPaidOperationalHours: number
  totalPendingPayableHours: number
  totalCustomerBillableHours: number
  totalNonBilledOperationalHours: number
  totalPendingBillableHours: number
}

interface TimestampLogEntry {
  id: string
  shiftId: string
  eventType: string
  effectiveAt: string
  notes: string | null
  lat: number | null
  lng: number | null
}

interface PayrollPayment {
  checkNumber: string | null
  amountPaid: number | null
  paidAt: string | null
}

interface HoursResponse {
  range: { start: string; end: string }
  rangeType: RangeType
  rows: DailyHoursRow[]
  summary: RangeSummary
  isDefaultPayPolicy: boolean
  payment: PayrollPayment | null
  payPolicy: { baseHourlyRate: number }
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
  const [signOffRow, setSignOffRow] = useState<DailyHoursRow | null>(null)
  const [logDate, setLogDate] = useState<string | null>(null)
  const [logEntries, setLogEntries] = useState<TimestampLogEntry[]>([])
  const [logLoading, setLogLoading] = useState(false)

  const viewTimestamps = async (workDate: string) => {
    setLogDate(workDate)
    setLogLoading(true)
    try {
      const res = await fetch(`/api/fleet/dump-truck/hours/log?from=${workDate}&to=${workDate}`)
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not load timestamps')
      const body = await res.json()
      const entries = (body.entries ?? []) as TimestampLogEntry[]
      setLogEntries([...entries].sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt)))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load timestamps')
      setLogDate(null)
    } finally {
      setLogLoading(false)
    }
  }

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

  const exportUrl = (type: 'detail' | 'summary', format: 'csv' | 'pdf' = 'csv') => {
    const params = new URLSearchParams({ range: rangeType, type, format })
    if (rangeType === 'custom') { params.set('from', customFrom); params.set('to', customTo) }
    return `/api/fleet/dump-truck/hours/export?${params}`
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
          </div>

          {data.summary.totalNonPaidOperationalHours > 0 && (
            <div style={{ ...cardStyle, border: '1px solid rgba(217,154,43,.35)' }}>
              <div style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--warn, #d99a2b)', textTransform: 'uppercase', marginBottom: 4 }}>
                Tracked Operational Time — Not Included in Current Payroll
              </div>
              <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '.75rem' }}>
                This time really happened and is recorded (breakdown waiting, return-to-yard drive, post-trip),
                but Cal-Neva&apos;s current pay policy for these categories doesn&apos;t count it toward your paid
                hours above. It&apos;s shown here so the full picture of your day is visible.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                <Stat label="Non-Paid Operational" value={`${data.summary.totalNonPaidOperationalHours.toFixed(2)} hrs`} />
                {data.summary.totalPendingPayableHours > 0 && (
                  <Stat label="Pending Review" value={`${data.summary.totalPendingPayableHours.toFixed(2)} hrs`} />
                )}
                <Stat
                  label="Non-Paid Time Value (Opportunity Cost)"
                  value={`$${(data.summary.totalNonPaidOperationalHours * data.payPolicy.baseHourlyRate).toFixed(2)}`}
                />
              </div>
              <p style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: '.6rem', fontStyle: 'italic' }}>
                This dollar figure is an analytics estimate at your hourly rate — not an amount owed unless
                management has approved it as payable.
              </p>
            </div>
          )}

          <div style={cardStyle}>
            {data.payment && (data.payment.checkNumber || data.payment.amountPaid != null) && (
              <div style={{ marginTop: '1.25rem', padding: '.85rem 1rem', borderRadius: 10, background: 'rgba(0,232,176,.06)', border: '1px solid rgba(0,232,176,.2)' }}>
                <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: 6 }}>Paid</div>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '.85rem' }}>
                  {data.payment.checkNumber && <div><span style={{ color: 'var(--muted)' }}>Check #</span> <strong>{data.payment.checkNumber}</strong></div>}
                  {data.payment.amountPaid != null && <div><span style={{ color: 'var(--muted)' }}>Amount</span> <strong>${data.payment.amountPaid.toFixed(2)}</strong></div>}
                  {data.payment.paidAt && <div><span style={{ color: 'var(--muted)' }}>Date</span> <strong>{data.payment.paidAt}</strong></div>}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem', flexWrap: 'wrap' }}>
              <button onClick={() => window.open(exportUrl('summary', 'pdf'), '_blank')} style={exportBtnStyle}>📄 End of Week Report (PDF)</button>
              <button onClick={() => window.open(exportUrl('summary'), '_blank')} style={exportBtnStyle}>⬇️ End of Week Report (CSV)</button>
              <button onClick={() => window.open(exportUrl('detail'), '_blank')} style={exportBtnStyle}>⬇️ Detail CSV</button>
              <button onClick={() => window.open(exportUrl('detail', 'pdf'), '_blank')} style={exportBtnStyle}>📄 Detail PDF</button>
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
                      <th style={th}>Date</th><th style={th}>Truck</th><th style={th}>Total</th><th style={th}>Paid</th><th style={th}>Reg</th>
                      <th style={th}>OT</th><th style={th}>Loads</th><th style={th}>Miles</th><th style={th}>Est. $</th>
                      <th style={th}>Status</th><th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map(r => (
                      <tr key={r.shiftId} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={td}>{r.workDate}</td>
                        <td style={td}>{r.truckUnit ?? '—'}</td>
                        <td style={td}>
                          {r.totalShiftHours.toFixed(2)}
                          {r.verifiedHoursOverride && (
                            <span
                              style={{ color: 'var(--primary)', marginLeft: 4, fontSize: '.7rem', cursor: 'default' }}
                              title={`Verified/payroll hours — raw clocked time was ${r.rawCalculatedHours.toFixed(2)}h. Reason: ${r.verifiedHoursOverride.reason}${r.verifiedHoursOverride.sourceDocument ? ` (${r.verifiedHoursOverride.sourceDocument})` : ''}`}
                            >
                              ✓ verified
                            </span>
                          )}
                        </td>
                        <td style={td}>
                          {r.paidHours.toFixed(2)}
                          {r.nonPaidOperationalHours > 0 && (
                            <span style={{ color: 'var(--warn, #d99a2b)', marginLeft: 4, fontSize: '.7rem', cursor: 'default' }} title={`${r.nonPaidOperationalHours.toFixed(2)}h tracked but not paid this shift`}>
                              ⚠
                            </span>
                          )}
                        </td>
                        <td style={td}>{r.regularHours.toFixed(2)}</td>
                        <td style={td}>{r.overtimeHours.toFixed(2)}</td>
                        <td style={td}>{r.loadsCompleted}</td>
                        <td style={td}>{r.shiftMiles ?? '—'}</td>
                        <td style={td}>${r.estimatedGrossEarnings.toFixed(2)}</td>
                        <td style={td}>
                          {r.submissionStatus}
                          {r.confirmation?.status === 'confirmed' && (
                            <span style={{ color: 'var(--primary)', marginLeft: 6 }} title={`Signed ${new Date(r.confirmation.createdAt).toLocaleString()}`}>✅ confirmed</span>
                          )}
                          {r.confirmation?.status === 'correction_requested' && (
                            <span style={{ color: 'var(--warn)', marginLeft: 6, cursor: 'default' }} title={r.confirmation.correctionNote ?? undefined}>⚠️ correction requested</span>
                          )}
                          {r.integrityWarnings.length > 0 && (
                            <span
                              style={{ color: 'var(--warn)', marginLeft: 6, cursor: 'default' }}
                              title={r.integrityWarnings.map(w => w.message).join('\n')}
                            >
                              🚩 flagged for review
                            </span>
                          )}
                        </td>
                        <td style={{ ...td, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => viewTimestamps(r.workDate)}
                            style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--primary)', padding: '.3rem .5rem', borderRadius: 6, border: '1px solid var(--border)' }}
                          >
                            View Timestamps
                          </button>
                          <button
                            onClick={() => window.open(`/api/fleet/dump-truck/shifts/${r.shiftId}/report`, '_blank')}
                            style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--primary)', padding: '.3rem .5rem', borderRadius: 6, border: '1px solid var(--border)' }}
                          >
                            📄 Shift Report
                          </button>
                          <button
                            onClick={() => setSignOffRow(r)}
                            style={{
                              fontSize: '.72rem', fontWeight: 700, padding: '.3rem .5rem', borderRadius: 6, border: '1px solid var(--border)',
                              color: r.confirmation?.status === 'confirmed' ? 'var(--muted)' : '#04140f',
                              background: r.confirmation?.status === 'confirmed' ? 'transparent' : 'var(--primary)',
                            }}
                          >
                            {r.confirmation?.status === 'confirmed' ? 'Re-Confirm' : r.confirmation?.status === 'correction_requested' ? 'Resubmit' : '✅ Confirm Hours'}
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

      {logDate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(3,13,11,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setLogDate(null)}>
          <div style={{ ...cardStyle, maxWidth: 480, width: '90%', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight: 800, marginBottom: '.75rem' }}>Timestamps — {logDate}</h3>
            {logLoading && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Loading…</div>}
            {!logLoading && logEntries.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No events found for this day.</div>
            )}
            {!logLoading && logEntries.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {logEntries.map(e => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '.5rem .6rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '.82rem', fontWeight: 700 }}>{EVENT_LABELS[e.eventType] ?? e.eventType}</div>
                      {e.notes && <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{e.notes}</div>}
                    </div>
                    <div style={{ fontSize: '.75rem', color: 'var(--muted)', flexShrink: 0 }}>
                      {new Date(e.effectiveAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setLogDate(null)} style={{ width: '100%', marginTop: '1rem', padding: '.7rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>Close</button>
          </div>
        </div>
      )}

      {signOffRow && (
        <HoursSignOffSheet
          shiftId={signOffRow.shiftId}
          workDate={signOffRow.workDate}
          totalHours={signOffRow.totalShiftHours}
          onClose={() => setSignOffRow(null)}
          onDone={load}
        />
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
