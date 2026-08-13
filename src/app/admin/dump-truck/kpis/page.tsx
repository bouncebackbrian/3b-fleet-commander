'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { DefectSeverity } from '@/lib/dumpTruck/types'

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }
const btnStyle: React.CSSProperties = { padding: '.55rem .9rem', borderRadius: 10, background: 'var(--primary)', color: '#04140f', fontWeight: 800, fontSize: '.82rem' }
const btnSecondaryStyle: React.CSSProperties = { padding: '.55rem .9rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 700, fontSize: '.82rem' }
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '.4rem .5rem', color: 'var(--muted)', fontSize: '.72rem', textTransform: 'uppercase' as const }
const tdStyle: React.CSSProperties = { padding: '.5rem', borderTop: '1px solid var(--border)', fontSize: '.85rem' }

const SEVERITY_COLOR: Record<DefectSeverity, string> = {
  monitor: 'var(--muted)', non_safety: 'var(--muted)', safety_critical: 'var(--warn)', out_of_service: 'var(--error)',
}

type RangeChoice = 'current_week' | 'previous_week' | 'custom'

interface RangeSummaryDTO {
  daysWorked: number
  totalRegularHours: number
  totalOvertimeHours: number
  totalLoads: number
  totalQuantity: number
  totalMiles: number
}

interface IssueGroupDTO {
  category: string
  totalCount: number
  openCount: number
  highestSeverity: DefectSeverity
  truckIds: string[]
  reportedByIds: string[]
  sampleDescription: string
}

interface TruckKpiDTO {
  truckId: string
  unitNumber: string
  hours: RangeSummaryDTO
  fuel: { totalGallons: number; totalCost: number; totalMiles: number; avgMpg: number | null } | null
  issueGroups: IssueGroupDTO[]
  openDefectCount: number
}

interface DriverKpiDTO {
  driverId: string
  driverName: string
  hours: RangeSummaryDTO
  issueGroups: IssueGroupDTO[]
}

interface KpiResponse {
  range: { start: string; end: string }
  team: {
    hours: RangeSummaryDTO
    fuel: { totalGallons: number; totalCost: number; totalMiles: number; fleetAvgMpg: number | null }
    teamIssues: IssueGroupDTO[]
  }
  byTruck: TruckKpiDTO[]
  byDriver: DriverKpiDTO[]
}

function hoursLabel(h: RangeSummaryDTO): string {
  const total = h.totalRegularHours + h.totalOvertimeHours
  return h.totalOvertimeHours > 0 ? `${total.toFixed(1)}h (${h.totalOvertimeHours.toFixed(1)} OT)` : `${total.toFixed(1)}h`
}

function toCategoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1)
}

/**
 * Fleet KPIs — hours, loads/tons, fuel/MPG, and recurring issues, broken out
 * per truck and per driver. Nothing is queried fresh here: it fans out to
 * the same builders the Hours and Fuel admin panels already use, plus the
 * same defect data Recurring Issues reads (see fleetKpis.ts), just regrouped
 * by truck/driver. A defect category only shows in the "Team" section once
 * it spans more than one truck or has been reported by more than one driver
 * — otherwise it belongs to that truck's or driver's own card, not the team.
 */
export default function FleetKpisPage() {
  const [range, setRange] = useState<RangeChoice>('current_week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [data, setData] = useState<KpiResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    if (range === 'custom' && (!customFrom || !customTo)) return
    setLoading(true)
    const params = new URLSearchParams({ range })
    if (range === 'custom') { params.set('from', customFrom); params.set('to', customTo) }
    fetch(`/api/fleet/dump-truck/admin/kpis?${params.toString()}`)
      .then(r => r.json())
      .then(b => setData(b.error ? null : b))
      .finally(() => setLoading(false))
  }, [range, customFrom, customTo])
  useEffect(load, [load])

  const unitFor = (truckId: string) => data?.byTruck.find(t => t.truckId === truckId)?.unitNumber ?? '—'
  const driverNameFor = (driverId: string) => data?.byDriver.find(d => d.driverId === driverId)?.driverName ?? '—'

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>Fleet KPIs</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>
          Hours, loads/tons, fuel, and recurring issues — per truck and per driver, with fleet-wide figures called
          out separately. Full issue history (not just this range) is on{' '}
          <Link href="/admin/dump-truck/recurring-issues" style={{ color: 'var(--primary)', fontWeight: 700 }}>Recurring Issues</Link>.{' '}
          <Link href="/admin/dump-truck" style={{ color: 'var(--primary)', fontWeight: 700 }}>← Back to Dump Truck Setup</Link>
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={range === 'current_week' ? btnStyle : btnSecondaryStyle} onClick={() => setRange('current_week')}>This Week</button>
        <button style={range === 'previous_week' ? btnStyle : btnSecondaryStyle} onClick={() => setRange('previous_week')}>Last Week</button>
        <button style={range === 'custom' ? btnStyle : btnSecondaryStyle} onClick={() => setRange('custom')}>Custom</button>
        {range === 'custom' && (
          <>
            <input type="date" style={inputStyle} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <span style={{ color: 'var(--muted)' }}>to</span>
            <input type="date" style={inputStyle} value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </>
        )}
        {data?.range && <span style={{ color: 'var(--muted)', fontSize: '.78rem', marginLeft: 4 }}>{data.range.start} – {data.range.end}</span>}
      </div>

      {loading && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Loading…</div>}

      {!loading && data && (
        <>
          <div style={{ ...cardStyle, border: '1px solid rgba(0,232,176,.3)' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.75rem' }}>Team (Fleet-Wide)</h2>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '.9rem', marginBottom: data.team.teamIssues.length ? '1rem' : 0 }}>
              <div><div style={{ color: 'var(--muted)', fontSize: '.72rem' }}>Hours</div><strong>{hoursLabel(data.team.hours)}</strong></div>
              <div><div style={{ color: 'var(--muted)', fontSize: '.72rem' }}>Loads</div><strong>{data.team.hours.totalLoads}</strong></div>
              <div><div style={{ color: 'var(--muted)', fontSize: '.72rem' }}>Tons</div><strong>{data.team.hours.totalQuantity.toFixed(1)}</strong></div>
              <div><div style={{ color: 'var(--muted)', fontSize: '.72rem' }}>Miles</div><strong>{data.team.hours.totalMiles}</strong></div>
              <div><div style={{ color: 'var(--muted)', fontSize: '.72rem' }}>Fuel</div><strong>{data.team.fuel.totalGallons.toFixed(0)} gal / ${data.team.fuel.totalCost.toFixed(0)}</strong></div>
              <div><div style={{ color: 'var(--muted)', fontSize: '.72rem' }}>Fleet MPG</div><strong>{data.team.fuel.fleetAvgMpg?.toFixed(2) ?? '—'}</strong></div>
            </div>
            {data.team.teamIssues.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const }}>
                  Issues affecting more than one truck or driver
                </div>
                {data.team.teamIssues.map(g => (
                  <div key={g.category} style={{ fontSize: '.82rem', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <span>
                      <strong>{toCategoryLabel(g.category)}</strong>
                      <span style={{ color: SEVERITY_COLOR[g.highestSeverity], fontWeight: 700, marginLeft: 6 }}>×{g.totalCount}</span>
                      {g.openCount > 0 && <span style={{ color: 'var(--error)', marginLeft: 4 }}>({g.openCount} open)</span>}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>
                      {g.truckIds.map(unitFor).join(', ')} · {g.reportedByIds.map(driverNameFor).join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.75rem' }}>Per Truck</h2>
            {data.byTruck.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No activity in this range.</div>}
            {data.byTruck.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={thStyle}>Truck</th><th style={thStyle}>Hours</th><th style={thStyle}>Loads</th>
                    <th style={thStyle}>Tons</th><th style={thStyle}>Fuel</th><th style={thStyle}>MPG</th><th style={thStyle}>Open Defects</th>
                  </tr></thead>
                  <tbody>
                    {data.byTruck.map(t => (
                      <tr key={t.truckId}>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{t.unitNumber}</td>
                        <td style={tdStyle}>{hoursLabel(t.hours)}</td>
                        <td style={tdStyle}>{t.hours.totalLoads}</td>
                        <td style={tdStyle}>{t.hours.totalQuantity.toFixed(1)}</td>
                        <td style={tdStyle}>{t.fuel ? `$${t.fuel.totalCost.toFixed(0)}` : '—'}</td>
                        <td style={tdStyle}>{t.fuel?.avgMpg?.toFixed(2) ?? '—'}</td>
                        <td style={{ ...tdStyle, color: t.openDefectCount > 0 ? 'var(--error)' : undefined, fontWeight: t.openDefectCount > 0 ? 700 : 400 }}>
                          {t.openDefectCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.75rem' }}>Per Driver</h2>
            {data.byDriver.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No activity in this range.</div>}
            {data.byDriver.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={thStyle}>Driver</th><th style={thStyle}>Hours</th><th style={thStyle}>Loads</th>
                    <th style={thStyle}>Tons</th><th style={thStyle}>Issues Reported</th>
                  </tr></thead>
                  <tbody>
                    {data.byDriver.map(d => (
                      <tr key={d.driverId}>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{d.driverName}</td>
                        <td style={tdStyle}>{hoursLabel(d.hours)}</td>
                        <td style={tdStyle}>{d.hours.totalLoads}</td>
                        <td style={tdStyle}>{d.hours.totalQuantity.toFixed(1)}</td>
                        <td style={tdStyle}>{d.issueGroups.reduce((s, g) => s + g.totalCount, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
