'use client'
import { useState, useEffect, useCallback } from 'react'
import type { DriverOption } from '@/lib/fleet/dumpTruck/jobs'
import { tipOfTheDay } from '@/lib/dumpTruck/taxTips'

interface DriverSummary {
  driverId: string
  driverName: string
  daysWorked: number
  totalRegularHours: number
  totalOvertimeHours: number
  totalFuelingHours: number
  totalTrafficDelayHours: number
  totalMechanicalDelayHours: number
  totalOtherDelayHours: number
  totalLoads: number
  totalMiles: number
  estimatedGrossEarnings: number
  totalPaidHours: number
  totalNonPaidOperationalHours: number
  totalCustomerBillableHours: number
  totalNonBilledOperationalHours: number
  /** Set when payType = greater_of_hourly_or_revenue_share — null for hourly/per-mile drivers. */
  revenueShareApplied: { usedRevenueShare: boolean; revenueShareAmount: number; truckRevenue: number } | null
}

interface BusinessSummary {
  daysWorked: number
  totalRegularHours: number
  totalOvertimeHours: number
  totalFuelingHours: number
  totalTrafficDelayHours: number
  totalMechanicalDelayHours: number
  totalOtherDelayHours: number
  totalLoads: number
  totalMiles: number
  estimatedGrossEarnings: number
  totalPaidHours: number
  totalNonPaidOperationalHours: number
  totalCustomerBillableHours: number
  totalNonBilledOperationalHours: number
}

interface PaymentDraft {
  checkNumber: string
  amountPaid: string
  paidAt: string
}

type RangeChoice = 'current_week' | 'previous_week' | 'custom'

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', width: '100%' }
const labelStyle: React.CSSProperties = { fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' as const }
const btnStyle: React.CSSProperties = { padding: '.6rem 1rem', borderRadius: 10, background: 'var(--primary)', color: '#04140f', fontWeight: 800 }
const btnSecondaryStyle: React.CSSProperties = { padding: '.6rem 1rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 700 }

export default function AdminPayrollHoursPanel({ drivers }: { drivers: DriverOption[] }) {
  const [range, setRange] = useState<RangeChoice>('current_week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [driverId, setDriverId] = useState('')
  const [driverSummaries, setDriverSummaries] = useState<DriverSummary[]>([])
  const [businessSummary, setBusinessSummary] = useState<BusinessSummary | null>(null)
  const [rangeLabel, setRangeLabel] = useState<{ start: string; end: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [payments, setPayments] = useState<Record<string, PaymentDraft>>({})
  const [savingPayment, setSavingPayment] = useState<string | null>(null)
  const [taxProfiles, setTaxProfiles] = useState<Record<string, { classification: 'w2' | '1099'; withholdingPercent: number | null }>>({})

  useEffect(() => {
    fetch('/api/fleet/dump-truck/driver-tax').then(r => r.json()).then(b => {
      const map: Record<string, { classification: 'w2' | '1099'; withholdingPercent: number | null }> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (b.profiles ?? []) as any[]) map[p.driverId] = { classification: p.classification, withholdingPercent: p.withholdingPercent }
      setTaxProfiles(map)
    }).catch(() => {})
  }, [])

  const buildParams = useCallback(() => {
    const params = new URLSearchParams({ range })
    if (range === 'custom') { params.set('from', customFrom); params.set('to', customTo) }
    if (driverId) params.set('driverId', driverId)
    return params
  }, [range, customFrom, customTo, driverId])

  const load = useCallback(() => {
    if (range === 'custom' && (!customFrom || !customTo)) return
    setLoading(true)
    fetch(`/api/fleet/dump-truck/admin/hours?${buildParams().toString()}`)
      .then(r => r.json())
      .then(b => {
        setDriverSummaries(b.driverSummaries ?? [])
        setBusinessSummary(b.businessSummary ?? null)
        setRangeLabel(b.range ?? null)
      })
      .finally(() => setLoading(false))
  }, [range, customFrom, customTo, buildParams])

  useEffect(load, [load])

  const loadPayments = useCallback(() => {
    if (range === 'custom' && (!customFrom || !customTo)) return
    const params = new URLSearchParams({ range })
    if (range === 'custom') { params.set('from', customFrom); params.set('to', customTo) }
    fetch(`/api/fleet/dump-truck/admin/payroll/payments?${params.toString()}`)
      .then(r => r.json())
      .then(b => {
        const drafts: Record<string, PaymentDraft> = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const p of (b.payments ?? []) as any[]) {
          drafts[p.driverId] = {
            checkNumber: p.checkNumber ?? '', amountPaid: p.amountPaid != null ? String(p.amountPaid) : '', paidAt: p.paidAt ?? '',
          }
        }
        setPayments(drafts)
      })
  }, [range, customFrom, customTo])

  useEffect(loadPayments, [loadPayments])

  const paymentFor = (driverId: string): PaymentDraft => payments[driverId] ?? { checkNumber: '', amountPaid: '', paidAt: '' }

  const savePayment = async (driverId: string) => {
    const draft = paymentFor(driverId)
    setSavingPayment(driverId)
    try {
      await fetch('/api/fleet/dump-truck/admin/payroll/payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId, range, from: range === 'custom' ? customFrom : undefined, to: range === 'custom' ? customTo : undefined,
          checkNumber: draft.checkNumber || null,
          amountPaid: draft.amountPaid ? Number(draft.amountPaid) : null,
          paidAt: draft.paidAt || null,
        }),
      })
    } finally {
      setSavingPayment(null)
    }
  }

  const download = (type: 'detail' | 'summary', format: 'csv' | 'pdf' = 'csv') => {
    const params = buildParams()
    params.set('type', type)
    params.set('format', format)
    window.open(`/api/fleet/dump-truck/admin/hours/export?${params.toString()}`, '_blank')
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.5rem' }}>Payroll Hours — All Drivers</h2>
      <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        Pay week runs Monday–Sunday. Figures are estimates from a single hourly-rate + daily-overtime policy —
        not payroll-approved wages. &quot;Other work&quot; hours (fueling, traffic, mechanical) are broken out
        separately from drive/custody time.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
        <div>
          <div style={labelStyle}>Range</div>
          <select style={inputStyle} value={range} onChange={e => setRange(e.target.value as RangeChoice)}>
            <option value="current_week">Current Week (Mon–Sun)</option>
            <option value="previous_week">Previous Week</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        {range === 'custom' && (
          <>
            <div>
              <div style={labelStyle}>From</div>
              <input style={inputStyle} type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            </div>
            <div>
              <div style={labelStyle}>To</div>
              <input style={inputStyle} type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </div>
          </>
        )}
        <div>
          <div style={labelStyle}>Driver</div>
          <select style={inputStyle} value={driverId} onChange={e => setDriverId(e.target.value)}>
            <option value="">All drivers</option>
            {drivers.map(d => <option key={d.userId} value={d.userId}>{d.name}</option>)}
          </select>
        </div>
      </div>

      {rangeLabel && (
        <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: '.75rem' }}>
          Showing {rangeLabel.start} to {rangeLabel.end}
        </div>
      )}

      <div style={{ display: 'flex', gap: '.75rem', marginBottom: '1.25rem' }}>
        <button style={btnStyle} onClick={() => download('detail')}>⬇ Detail CSV</button>
        <button style={btnSecondaryStyle} onClick={() => download('detail', 'pdf')}>📄 Detail PDF</button>
        <button style={btnSecondaryStyle} onClick={() => download('summary')}>⬇ Summary CSV</button>
        <button style={btnSecondaryStyle} onClick={() => download('summary', 'pdf')}>📄 Summary PDF</button>
      </div>

      {businessSummary && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.6rem',
          marginBottom: '1.25rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem',
        }}>
          <SummaryStat label="Total Operational Hrs" value={round2(businessSummary.totalPaidHours + businessSummary.totalNonPaidOperationalHours)} />
          <SummaryStat label="Paid Hrs" value={businessSummary.totalPaidHours} />
          <SummaryStat label="Non-Paid Operational Hrs" value={businessSummary.totalNonPaidOperationalHours} />
          <SummaryStat label="Billable Hrs" value={businessSummary.totalCustomerBillableHours} />
          <SummaryStat label="Non-Billed Hrs" value={businessSummary.totalNonBilledOperationalHours} />
          <SummaryStat label="Regular Hrs" value={businessSummary.totalRegularHours} />
          <SummaryStat label="Overtime Hrs" value={businessSummary.totalOvertimeHours} />
          <SummaryStat label="Fueling Hrs" value={businessSummary.totalFuelingHours} />
          <SummaryStat label="Traffic Hrs" value={businessSummary.totalTrafficDelayHours} />
          <SummaryStat label="Mechanical Hrs" value={businessSummary.totalMechanicalDelayHours} />
          <SummaryStat label="Other Delay Hrs" value={businessSummary.totalOtherDelayHours} />
          <SummaryStat label="Loads" value={businessSummary.totalLoads} />
          <SummaryStat label="Miles" value={businessSummary.totalMiles} />
          <SummaryStat label="Est. Gross ($)" value={businessSummary.estimatedGrossEarnings} />
        </div>
      )}

      {driverSummaries.some(s => taxProfiles[s.driverId]?.classification === '1099') && (
        <div style={{ fontSize: '.78rem', color: 'var(--muted)', fontStyle: 'italic', marginBottom: '.75rem', padding: '.6rem .75rem', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
          💡 {tipOfTheDay()}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
              <th style={{ padding: '.4rem .5rem .4rem 0' }}>Driver</th>
              <th>Days</th>
              <th>Total Op.</th>
              <th>Paid</th>
              <th>Non-Paid</th>
              <th>Billable</th>
              <th>Non-Billed</th>
              <th>Reg</th>
              <th>OT</th>
              <th>Fuel</th>
              <th>Traffic</th>
              <th>Mech.</th>
              <th>Other Delay</th>
              <th>Loads</th>
              <th>Miles</th>
              <th>Est. Gross</th>
              <th>Check #</th>
              <th>Amount Paid</th>
              <th>Paid Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={20} style={{ padding: '1rem 0', color: 'var(--muted)' }}>Loading…</td></tr>
            )}
            {!loading && driverSummaries.length === 0 && (
              <tr><td colSpan={20} style={{ padding: '1rem 0', color: 'var(--faint)' }}>No shifts in this range.</td></tr>
            )}
            {driverSummaries.map(s => {
              const draft = paymentFor(s.driverId)
              return (
                <tr key={s.driverId} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '.4rem .5rem .4rem 0', fontWeight: 700 }}>{s.driverName}</td>
                  <td>{s.daysWorked}</td>
                  <td>{round2(s.totalPaidHours + s.totalNonPaidOperationalHours)}</td>
                  <td>{s.totalPaidHours}</td>
                  <td>{s.totalNonPaidOperationalHours > 0 ? <span style={{ color: 'var(--warn, #d99a2b)' }}>{s.totalNonPaidOperationalHours}</span> : s.totalNonPaidOperationalHours}</td>
                  <td>{s.totalCustomerBillableHours}</td>
                  <td>{s.totalNonBilledOperationalHours}</td>
                  <td>{s.totalRegularHours}</td>
                  <td>{s.totalOvertimeHours}</td>
                  <td>{s.totalFuelingHours}</td>
                  <td>{s.totalTrafficDelayHours}</td>
                  <td>{s.totalMechanicalDelayHours}</td>
                  <td>{s.totalOtherDelayHours}</td>
                  <td>{s.totalLoads}</td>
                  <td>{s.totalMiles}</td>
                  <td>
                    ${s.estimatedGrossEarnings.toFixed(2)}
                    {s.revenueShareApplied?.usedRevenueShare && (
                      <span title={`Revenue share ($${s.revenueShareApplied.revenueShareAmount.toFixed(2)} on $${s.revenueShareApplied.truckRevenue.toFixed(2)} truck revenue) beat the hourly floor`} style={{ marginLeft: 4, fontSize: '.68rem', color: 'var(--primary)', fontWeight: 800 }}>
                        ●%
                      </span>
                    )}
                  </td>
                  <td>
                    <input
                      style={{ ...inputStyle, padding: '.3rem .4rem', fontSize: '.78rem', minWidth: 80 }}
                      value={draft.checkNumber}
                      onChange={e => setPayments(p => ({ ...p, [s.driverId]: { ...draft, checkNumber: e.target.value } }))}
                    />
                  </td>
                  <td>
                    <input
                      style={{ ...inputStyle, padding: '.3rem .4rem', fontSize: '.78rem', minWidth: 90 }}
                      type="number" step="0.01"
                      value={draft.amountPaid}
                      onChange={e => setPayments(p => ({ ...p, [s.driverId]: { ...draft, amountPaid: e.target.value } }))}
                    />
                    {taxProfiles[s.driverId]?.classification === '1099' && taxProfiles[s.driverId]?.withholdingPercent != null && draft.amountPaid && (
                      <div style={{ fontSize: '.68rem', color: 'var(--warn)', marginTop: 2, whiteSpace: 'nowrap' }}>
                        Suggest setting aside ${(Number(draft.amountPaid) * (taxProfiles[s.driverId].withholdingPercent as number) / 100).toFixed(2)}
                      </div>
                    )}
                  </td>
                  <td>
                    <input
                      style={{ ...inputStyle, padding: '.3rem .4rem', fontSize: '.78rem', minWidth: 130 }}
                      type="date"
                      value={draft.paidAt}
                      onChange={e => setPayments(p => ({ ...p, [s.driverId]: { ...draft, paidAt: e.target.value } }))}
                    />
                  </td>
                  <td>
                    <button
                      onClick={() => savePayment(s.driverId)}
                      disabled={savingPayment === s.driverId}
                      style={{ padding: '.3rem .6rem', borderRadius: 6, background: 'var(--primary)', color: '#04140f', fontWeight: 800, fontSize: '.72rem', opacity: savingPayment === s.driverId ? .5 : 1 }}
                    >
                      {savingPayment === s.driverId ? '…' : 'Save'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: '1rem' }}>{value}</div>
    </div>
  )
}
