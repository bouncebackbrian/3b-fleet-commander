'use client'
import Link from 'next/link'
import type { ActiveTrip } from '@/lib/dashboard/types'
import { fmtTime, fmtDate } from '@/lib/dashboard/helpers'

interface Props {
  activeTrip: ActiveTrip
  onClear:    () => void
  nextStop:   ActiveTrip['stops'][number] | undefined
}

export default function ActiveTripCard({ activeTrip, onClear, nextStop }: Props) {
  const now         = Date.now()
  const depart      = new Date(activeTrip.departTime).getTime()
  const arrive      = new Date(activeTrip.estArrival).getTime()
  const tripProgress = Math.round(Math.min(100, Math.max(0, ((now - depart) / (arrive - depart)) * 100)))

  return (
    <div className="cc-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 6px var(--primary)' }} />
          <span style={{ fontWeight: 800, fontSize: '1rem' }}>Active Trip{activeTrip.loadNumber ? ` — Load #${activeTrip.loadNumber}` : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Link href="/trips" style={{ padding: '.4rem .85rem', borderRadius: 8, border: '1px solid rgba(0,232,176,.3)', fontSize: '.78rem', color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>View plan</Link>
          <button onClick={onClear}
            style={{ padding: '.4rem .75rem', borderRadius: 8, border: '1px solid var(--border)', fontSize: '.75rem', color: 'var(--muted)', cursor: 'pointer', background: 'none' }}>Clear</button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: '1rem' }}>{activeTrip.origin.query}</span>
        <div style={{ flex: 1, minWidth: 40, position: 'relative', height: 8, background: 'var(--surface-off)', borderRadius: 4 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${tripProgress}%`, background: 'linear-gradient(90deg,var(--primary),rgba(40,192,72,.8))', borderRadius: 4, transition: 'width 1s ease' }} />
          {tripProgress > 5 && tripProgress < 98 && (
            <div style={{ position: 'absolute', top: -5, left: `${tripProgress}%`, width: 18, height: 18, background: 'var(--primary)', borderRadius: '50%', transform: 'translateX(-50%)', boxShadow: '0 0 8px var(--primary)', border: '2px solid var(--surface)', display: 'grid', placeItems: 'center', fontSize: '.55rem' }}>🚛</div>
          )}
        </div>
        <span style={{ fontWeight: 800, fontSize: '1rem' }}>{activeTrip.destination.query}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', color: 'var(--muted)', flexWrap: 'wrap', gap: 4 }}>
        <span>{activeTrip.totalMiles} mi · ~{activeTrip.estDriveHours}h · <strong style={{ color: 'var(--primary)' }}>{tripProgress}% done</strong></span>
        <span>ETA {fmtDate(activeTrip.estArrival)} {fmtTime(activeTrip.estArrival)}</span>
      </div>
      {nextStop && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.12)', borderRadius: 10, padding: '.5rem .75rem', marginTop: 8, flexWrap: 'wrap' }}>
          <span>⛽</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '.82rem' }}>Next: {nextStop.name}{nextStop.city ? `, ${nextStop.city}` : ''}</div>
            <div style={{ color: 'var(--muted)', fontSize: '.72rem', marginTop: 1 }}>{nextStop.miFromOrigin} mi · {fmtTime(nextStop.eta)}</div>
          </div>
          {nextStop.diesel != null && <span style={{ fontSize: '.78rem', color: 'var(--warn)', fontWeight: 800 }}>⛽ ${nextStop.diesel.toFixed(3)}/gal</span>}
        </div>
      )}
    </div>
  )
}
