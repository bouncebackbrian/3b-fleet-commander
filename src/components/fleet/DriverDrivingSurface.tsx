'use client'

import { useEffect, useMemo, useState } from 'react'
import { Navigation, AlertTriangle, MapPin, Wind, Clock3, Gauge, CloudSun } from 'lucide-react'
import { useWeather } from '@/hooks/useWeather'
import type { ModeUiConfig } from '@/lib/fleet/mode-ui'

type PositionState = {
  lat: number | null
  lng: number | null
  speedMph: number | null
  accuracy: number | null
}

export default function DriverDrivingSurface({ mode }: { mode: ModeUiConfig }) {
  const { weather, wx, weatherLoading } = useWeather()
  const [now, setNow] = useState(new Date())
  const [position, setPosition] = useState<PositionState>({ lat: null, lng: null, speedMph: null, accuracy: null })

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      pos => {
        const speedMps = pos.coords.speed
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speedMph: speedMps == null ? null : Math.max(0, Math.round(speedMps * 2.236936)),
          accuracy: Math.round(pos.coords.accuracy),
        })
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  const moving = (position.speedMph ?? 0) >= 5
  const wind = weather?.windGusts ?? weather?.windSpeed ?? null
  const severeWind = (wind ?? 0) >= 40
  const locationLabel = position.lat != null && position.lng != null
    ? `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`
    : 'Acquiring GPS…'

  const statusText = useMemo(() => {
    if (moving) return `Driving · ${position.speedMph ?? 0} mph`
    if (position.lat != null) return 'Stopped / parked'
    return 'Location pending'
  }, [moving, position.lat, position.speedMph])

  return (
    <section style={{
      border: '1px solid rgba(0,232,176,.18)',
      borderRadius: 18,
      background: 'linear-gradient(180deg,rgba(8,26,22,.96),rgba(5,15,13,.98))',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '1rem', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: 'var(--primary)', fontSize: '.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.12em' }}>Driving Surface</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 950, marginTop: 4 }}>{mode.icon} {mode.name}</div>
          </div>
          <div style={{ borderRadius: 999, padding: '.48rem .72rem', background: moving ? 'rgba(0,232,176,.12)' : 'rgba(255,255,255,.05)', color: moving ? 'var(--primary)' : 'var(--muted)', fontSize: '.72rem', fontWeight: 900 }}>
            {statusText}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 8 }}>
          <Info icon={<Clock3 size={16}/>} label="Time" value={now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} />
          <Info icon={<Gauge size={16}/>} label="Speed" value={position.speedMph == null ? '—' : `${position.speedMph} mph`} />
          <Info icon={<CloudSun size={16}/>} label="Weather" value={weatherLoading ? 'Updating…' : wx?.label ?? 'Unavailable'} />
          <Info icon={<Wind size={16}/>} label="Wind" value={wind == null ? '—' : `${Math.round(wind)} mph${weather?.windGusts ? ' gust' : ''}`} warn={severeWind} />
        </div>

        <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 13, padding: '.8rem', background: 'rgba(255,255,255,.025)', display: 'grid', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 900 }}><MapPin size={16}/> GPS / Geotagging</div>
          <div style={{ color: 'var(--muted)', fontSize: '.72rem' }}>{locationLabel}</div>
          <div style={{ color: 'var(--faint)', fontSize: '.62rem' }}>
            {position.accuracy != null ? `Accuracy ±${position.accuracy} m · updates automatically while this screen is open` : 'Location events update automatically when permission is available.'}
          </div>
        </div>

        <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 13, padding: '.85rem', background: 'rgba(255,255,255,.025)' }}>
          <div style={{ color: 'var(--muted)', fontSize: '.58rem', fontWeight: 900, textTransform: 'uppercase' }}>Current work</div>
          <div style={{ fontWeight: 950, marginTop: 5 }}>{mode.workUnitLabel} / assigned job</div>
          <div style={{ color: 'var(--muted)', fontSize: '.7rem', lineHeight: 1.45, marginTop: 4 }}>
            Job, stop, material/load information and ETA stay pinned here once the assigned job data is connected for this asset mode.
          </div>
        </div>

        {severeWind && (
          <div style={{ border: '1px solid rgba(245,194,0,.5)', borderRadius: 13, padding: '.8rem', background: 'rgba(245,194,0,.08)', display: 'flex', alignItems: 'center', gap: 9 }}>
            <AlertTriangle size={18}/>
            <div><strong>High wind</strong><div style={{ color: 'var(--muted)', fontSize: '.68rem', marginTop: 2 }}>Wind/gusts are at or above 40 mph. Use extra caution.</div></div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 9 }}>
          <button type="button" style={bigButton}><Navigation size={20}/><span>Navigate</span></button>
          <button type="button" style={{ ...bigButton, borderColor: 'rgba(232,64,0,.35)', color: '#ff8a7a' }}><AlertTriangle size={20}/><span>Problem</span></button>
        </div>

        {moving && (
          <div style={{ textAlign: 'center', color: 'var(--faint)', fontSize: '.62rem', lineHeight: 1.4 }}>
            While moving, Fleet Commander keeps this screen glanceable and automatic. Detailed forms belong at a safe stop.
          </div>
        )}
      </div>
    </section>
  )
}

function Info({ icon, label, value, warn = false }: { icon: React.ReactNode; label: string; value: string; warn?: boolean }) {
  return <div style={{ border: `1px solid ${warn ? 'rgba(245,194,0,.45)' : 'rgba(255,255,255,.08)'}`, borderRadius: 12, padding: '.75rem', background: warn ? 'rgba(245,194,0,.06)' : 'rgba(255,255,255,.025)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: warn ? '#f5c200' : 'var(--muted)', fontSize: '.58rem', fontWeight: 900, textTransform: 'uppercase' }}>{icon}{label}</div>
    <div style={{ fontWeight: 950, marginTop: 6, fontSize: '.9rem' }}>{value}</div>
  </div>
}

const bigButton: React.CSSProperties = {
  minHeight: 72,
  borderRadius: 15,
  border: '1px solid rgba(0,232,176,.28)',
  background: 'rgba(0,232,176,.08)',
  color: 'var(--primary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 9,
  fontSize: '.88rem',
  fontWeight: 950,
}
