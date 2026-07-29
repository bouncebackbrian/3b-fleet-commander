'use client'
import { useState, useEffect, useCallback } from 'react'
import { EVENT_LABELS } from '@/lib/dumpTruck/eventLabels'
import LocationMapSheet from './LocationMapSheet'
import type { DriverOption } from '@/lib/fleet/dumpTruck/jobs'

interface LogEntry {
  id: string
  shiftId: string
  driverId: string
  driverName: string
  truckUnit: string | null
  eventType: string
  effectiveAt: string
  notes: string | null
  lat: number | null
  lng: number | null
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', width: '100%' }
const labelStyle: React.CSSProperties = { fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' as const }

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return iso }
}

export default function AdminActivityLogPanel({ drivers }: { drivers: DriverOption[] }) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [driverId, setDriverId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [mapTarget, setMapTarget] = useState<{ lat: number; lng: number; label: string } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (driverId) params.set('driverId', driverId)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    fetch(`/api/fleet/dump-truck/admin/logs?${params.toString()}`)
      .then(r => r.json())
      .then(b => setEntries(b.entries ?? []))
      .finally(() => setLoading(false))
  }, [driverId, from, to])

  useEffect(load, [load])

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>Activity Log — All Drivers</h2>
      <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        Every clock-in, arrival, load, delay, and location log across the fleet — read-only, most recent first.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
        <div>
          <div style={labelStyle}>Driver</div>
          <select style={inputStyle} value={driverId} onChange={e => setDriverId(e.target.value)}>
            <option value="">All drivers</option>
            {drivers.map(d => <option key={d.userId} value={d.userId}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>From</div>
          <input style={inputStyle} type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <div style={labelStyle}>To</div>
          <input style={inputStyle} type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </div>

      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
              <th style={{ padding: '.4rem 0' }}>When</th>
              <th>Driver</th>
              <th>Truck</th>
              <th>Event</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ padding: '1rem 0', color: 'var(--muted)' }}>Loading…</td></tr>
            )}
            {!loading && entries.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '1rem 0', color: 'var(--faint)' }}>No activity in this range.</td></tr>
            )}
            {entries.map(entry => (
              <tr key={entry.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '.4rem 0', whiteSpace: 'nowrap' }}>{fmtDateTime(entry.effectiveAt)}</td>
                <td>{entry.driverName}</td>
                <td>{entry.truckUnit ?? '—'}</td>
                <td>{EVENT_LABELS[entry.eventType] ?? entry.eventType}</td>
                <td style={{ color: 'var(--muted)' }}>{entry.notes ?? ''}</td>
                <td>
                  {entry.lat != null && entry.lng != null && (
                    <button
                      onClick={() => setMapTarget({ lat: entry.lat!, lng: entry.lng!, label: `${entry.driverName} — ${EVENT_LABELS[entry.eventType] ?? entry.eventType}` })}
                      style={{ fontSize: '.95rem', padding: '.15rem .4rem', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                      aria-label="Open in Maps"
                    >
                      🗺️
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mapTarget && (
        <LocationMapSheet lat={mapTarget.lat} lng={mapTarget.lng} label={mapTarget.label} onClose={() => setMapTarget(null)} />
      )}
    </div>
  )
}
