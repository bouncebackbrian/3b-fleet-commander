'use client'
import { useState, useEffect, useCallback } from 'react'

interface VehicleFuelSummary {
  vehicleId: string
  vehicleUnit: string
  entryCount: number
  totalGallons: number
  totalCost: number
  totalMiles: number
  avgMpg: number | null
  avgPricePerGallon: number | null
}

interface FleetFuelSummary {
  vehicles: VehicleFuelSummary[]
  totalGallons: number
  totalCost: number
  totalMiles: number
  fleetAvgMpg: number | null
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', width: '100%' }
const labelStyle: React.CSSProperties = { fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' as const }

export default function AdminFuelPanel() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [summary, setSummary] = useState<FleetFuelSummary | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    fetch(`/api/fleet/dump-truck/admin/fuel?${params.toString()}`)
      .then(r => r.json())
      .then(setSummary)
      .finally(() => setLoading(false))
  }, [from, to])

  useEffect(load, [load])

  const maxMpg = Math.max(1, ...(summary?.vehicles.map(v => v.avgMpg ?? 0) ?? [0]))

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.5rem' }}>Fuel &amp; MPG — All Trucks</h2>
      <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        Miles, gallons, and cost from driver-logged fuel stops (receipt photo required on every entry).
        Average MPG is total miles ÷ total gallons across the range — a fuel-weighted average, not a
        simple average of each fill-up.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
        <div>
          <div style={labelStyle}>From</div>
          <input style={inputStyle} type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <div style={labelStyle}>To</div>
          <input style={inputStyle} type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </div>

      {summary && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.6rem',
          marginBottom: '1.25rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem',
        }}>
          <Stat label="Fleet Avg MPG" value={summary.fleetAvgMpg != null ? summary.fleetAvgMpg.toFixed(2) : '—'} />
          <Stat label="Total Miles" value={summary.totalMiles.toLocaleString()} />
          <Stat label="Total Gallons" value={summary.totalGallons.toLocaleString()} />
          <Stat label="Total Fuel Cost" value={`$${summary.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        </div>
      )}

      {loading && <div style={{ color: 'var(--muted)', padding: '1rem 0' }}>Loading…</div>}

      {!loading && summary && summary.vehicles.length === 0 && (
        <div style={{ color: 'var(--faint)', padding: '1rem 0' }}>No fuel entries in this range.</div>
      )}

      {!loading && summary && summary.vehicles.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {summary.vehicles.map(v => (
            <div key={v.vehicleId} style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 800, fontSize: '.85rem' }}>{v.vehicleUnit}</div>
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', height: 22 }}>
                <div style={{
                  width: `${v.avgMpg != null ? Math.max(4, (v.avgMpg / maxMpg) * 100) : 0}%`, height: '100%',
                  background: 'var(--primary)', display: 'flex', alignItems: 'center', paddingLeft: 8,
                  fontSize: '.7rem', fontWeight: 800, color: '#04140f', whiteSpace: 'nowrap',
                }}>
                  {v.avgMpg != null ? `${v.avgMpg.toFixed(1)} MPG` : 'no data'}
                </div>
              </div>
              <div style={{ fontSize: '.75rem', color: 'var(--muted)', textAlign: 'right', minWidth: 150 }}>
                {v.totalMiles.toLocaleString()} mi · {v.totalGallons.toLocaleString()} gal · ${v.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{value}</div>
    </div>
  )
}
