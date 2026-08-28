'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type DetailLevel = 'summary' | 'daily' | 'full'

type DriverOption = { userId: string; name: string; threebId: string | null }

type ReportRow = {
  driverId: string
  driverName: string
  threebId: string | null
  workDate: string
  shiftId: string
  clockInAt?: string | null
  clockOutAt?: string | null
  totalShiftHours: number
  paidHours: number
  customerBillableHours: number
  regularHours: number
  overtimeHours: number
  pendingPayableHours: number
  truckUnit: string | null
  loadsCompleted: number
  quantityHauled?: number
  startOdometer: number | null
  endOdometer: number | null
  shiftMiles: number | null
  fuelingHours?: number
  loadingWaitingHours?: number
  unloadingWaitingHours?: number
  trafficDelayHours?: number
  mechanicalDelayHours?: number
  otherDelayHours?: number
  pretripHours?: number
  posttripHours?: number
  exceptionStatus: string
  submissionStatus: string
}

type Summary = {
  daysWorked: number
  totalPaidHours: number
  totalRegularHours: number
  totalOvertimeHours: number
  totalCustomerBillableHours: number
  totalPendingPayableHours: number
  totalLoads: number
  totalMiles: number
  totalQuantity?: number
  totalFuelingHours?: number
  totalTrafficDelayHours?: number
  totalMechanicalDelayHours?: number
  totalOtherDelayHours?: number
}

type ResponseShape = {
  range: { start: string; end: string }
  rows: ReportRow[]
  businessSummary: Summary
}

const input: React.CSSProperties = { padding: '.62rem .7rem', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: '#0b1720', color: '#f8fafc' }
const card: React.CSSProperties = { border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, background: 'rgba(255,255,255,.035)', padding: '1rem' }
const th: React.CSSProperties = { padding: '.65rem .5rem', textAlign: 'left', whiteSpace: 'nowrap', color: '#94a3b8', fontSize: '.72rem' }
const td: React.CSSProperties = { padding: '.65rem .5rem', whiteSpace: 'nowrap', borderTop: '1px solid rgba(255,255,255,.07)', fontSize: '.78rem' }

function fmtDateTime(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function n(value: number | undefined | null) { return Number(value ?? 0).toFixed(2) }

export default function CustomHoursReport({ drivers }: { drivers: DriverOption[] }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [driverId, setDriverId] = useState('')
  const [level, setLevel] = useState<DetailLevel>('daily')
  const [data, setData] = useState<ResponseShape | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const now = new Date()
    const end = now.toISOString().slice(0, 10)
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - 30)
    setFrom(startDate.toISOString().slice(0, 10))
    setTo(end)
  }, [])

  const generate = useCallback(async () => {
    if (!from || !to) return
    if (from > to) { setError('Start date must be on or before end date.'); return }
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ range: 'custom', from, to })
      if (driverId) params.set('driverId', driverId)
      const res = await fetch(`/api/fleet/dump-truck/admin/hours?${params}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not generate report')
      setData(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate report')
    } finally { setLoading(false) }
  }, [from, to, driverId])

  useEffect(() => { if (from && to) void generate() }, [from, to, driverId, generate])

  const selectedDriver = useMemo(() => drivers.find(d => d.userId === driverId), [drivers, driverId])
  const summary = data?.businessSummary
  const extraHours = summary ? Math.max(0, summary.totalPaidHours - summary.totalCustomerBillableHours) : 0

  const download = (type: 'detail' | 'summary', format: 'csv' | 'pdf') => {
    if (!from || !to) return
    const params = new URLSearchParams({ range: 'custom', from, to, type, format })
    if (driverId) params.set('driverId', driverId)
    window.open(`/api/fleet/dump-truck/admin/hours/export?${params}`, '_blank')
  }

  return <div style={{ display: 'grid', gap: 16 }}>
    <section style={card}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, alignItems: 'end' }}>
        <label><div style={{ color: '#94a3b8', fontSize: '.68rem', fontWeight: 800, marginBottom: 5 }}>START DATE</div><input style={{ ...input, width: '100%', boxSizing: 'border-box' }} type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label><div style={{ color: '#94a3b8', fontSize: '.68rem', fontWeight: 800, marginBottom: 5 }}>END DATE</div><input style={{ ...input, width: '100%', boxSizing: 'border-box' }} type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        <label><div style={{ color: '#94a3b8', fontSize: '.68rem', fontWeight: 800, marginBottom: 5 }}>DRIVER</div><select style={{ ...input, width: '100%' }} value={driverId} onChange={e => setDriverId(e.target.value)}><option value="">All drivers</option>{drivers.map(d => <option key={d.userId} value={d.userId}>{d.name}{d.threebId ? ` · ${d.threebId}` : ''}</option>)}</select></label>
        <button onClick={generate} disabled={loading || !from || !to} style={{ padding: '.72rem 1rem', borderRadius: 10, border: 0, background: '#34d399', color: '#052e24', fontWeight: 900, opacity: loading ? .6 : 1 }}>{loading ? 'Generating…' : 'Generate Report'}</button>
      </div>
      {error && <div style={{ marginTop: 10, color: '#fca5a5', fontSize: '.8rem' }}>{error}</div>}
    </section>

    <section style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {(['summary','daily','full'] as DetailLevel[]).map(v => <button key={v} onClick={() => setLevel(v)} style={{ padding: '.55rem .85rem', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', background: level === v ? '#34d399' : 'rgba(255,255,255,.04)', color: level === v ? '#052e24' : '#e2e8f0', fontWeight: 800, textTransform: 'capitalize' }}>{v === 'full' ? 'Full Detail' : v}</button>)}
      <div style={{ flex: 1 }} />
      <button onClick={() => download(level === 'summary' ? 'summary' : 'detail', 'pdf')} style={{ padding: '.55rem .85rem', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)', color: '#e2e8f0', fontWeight: 800 }}>📄 PDF</button>
      <button onClick={() => download(level === 'summary' ? 'summary' : 'detail', 'csv')} style={{ padding: '.55rem .85rem', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)', color: '#e2e8f0', fontWeight: 800 }}>⬇ CSV</button>
    </section>

    {data && summary && <>
      <section style={card}>
        <div style={{ color: '#94a3b8', fontSize: '.75rem' }}>{data.range.start} through {data.range.end}{selectedDriver ? ` · ${selectedDriver.name}` : ' · All drivers'}</div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(125px,1fr))', gap: 12 }}>
          <Stat label="Days Worked" value={String(summary.daysWorked)} />
          <Stat label="Total Hours" value={n(summary.totalPaidHours)} strong />
          <Stat label="Regular" value={n(summary.totalRegularHours)} />
          <Stat label="Overtime" value={n(summary.totalOvertimeHours)} />
          <Stat label="Broker/Customer" value={n(summary.totalCustomerBillableHours)} />
          <Stat label="Additional Work" value={n(extraHours)} />
          <Stat label="Pending Review" value={n(summary.totalPendingPayableHours)} />
          <Stat label="Loads" value={String(summary.totalLoads)} />
          <Stat label="Miles" value={n(summary.totalMiles)} />
          {level === 'full' && <><Stat label="Fueling Hrs" value={n(summary.totalFuelingHours)} /><Stat label="Traffic Delay" value={n(summary.totalTrafficDelayHours)} /><Stat label="Mechanical Delay" value={n(summary.totalMechanicalDelayHours)} /><Stat label="Other Delay" value={n(summary.totalOtherDelayHours)} /></>}
        </div>
      </section>

      {level !== 'summary' && <section style={card}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Daily Hours</h2>
        <div style={{ color: '#94a3b8', marginTop: 4, fontSize: '.75rem' }}>One row per recorded shift/day in the selected range.</div>
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: level === 'full' ? 1500 : 950 }}>
            <thead><tr><th style={th}>Date</th>{!driverId && <th style={th}>Driver</th>}<th style={th}>Truck</th>{level === 'full' && <><th style={th}>Clock In</th><th style={th}>Clock Out</th></>}<th style={th}>Total Hrs</th><th style={th}>Reg</th><th style={th}>OT</th><th style={th}>Broker Hrs</th><th style={th}>Extra Hrs</th><th style={th}>Loads</th><th style={th}>Miles</th>{level === 'full' && <><th style={th}>Start Odo</th><th style={th}>End Odo</th><th style={th}>PreTrip</th><th style={th}>PostTrip</th><th style={th}>Fuel</th><th style={th}>Wait/Load</th><th style={th}>Wait/Unload</th><th style={th}>Traffic</th><th style={th}>Mechanical</th><th style={th}>Other Delay</th><th style={th}>Status</th></>}</tr></thead>
            <tbody>{data.rows.map(r => {
              const extra = Math.max(0, r.paidHours - r.customerBillableHours)
              return <tr key={r.shiftId}><td style={td}>{r.workDate}</td>{!driverId && <td style={td}>{r.driverName}</td>}<td style={td}>{r.truckUnit ?? '—'}</td>{level === 'full' && <><td style={td}>{fmtDateTime(r.clockInAt)}</td><td style={td}>{fmtDateTime(r.clockOutAt)}</td></>}<td style={{ ...td, fontWeight: 900 }}>{n(r.paidHours)}</td><td style={td}>{n(r.regularHours)}</td><td style={td}>{n(r.overtimeHours)}</td><td style={td}>{n(r.customerBillableHours)}</td><td style={td}>{n(extra)}</td><td style={td}>{r.loadsCompleted}</td><td style={td}>{r.shiftMiles ?? '—'}</td>{level === 'full' && <><td style={td}>{r.startOdometer ?? '—'}</td><td style={td}>{r.endOdometer ?? '—'}</td><td style={td}>{n(r.pretripHours)}</td><td style={td}>{n(r.posttripHours)}</td><td style={td}>{n(r.fuelingHours)}</td><td style={td}>{n(r.loadingWaitingHours)}</td><td style={td}>{n(r.unloadingWaitingHours)}</td><td style={td}>{n(r.trafficDelayHours)}</td><td style={td}>{n(r.mechanicalDelayHours)}</td><td style={td}>{n(r.otherDelayHours)}</td><td style={td}>{r.exceptionStatus === 'none' ? r.submissionStatus : r.exceptionStatus}</td></>}</tr>
            })}</tbody>
          </table>
        </div>
      </section>}
    </>}
  </div>
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div><div style={{ color: '#94a3b8', fontSize: '.64rem', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div><div style={{ marginTop: 3, fontSize: strong ? '1.45rem' : '1.18rem', fontWeight: 950, color: strong ? '#34d399' : '#f8fafc' }}>{value}</div></div>
}
