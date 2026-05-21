'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import type { LoadMission } from '@/lib/dashboard/types'

// ── Types ─────────────────────────────────────────────────────────────────────
type GeoResult = {
  city:       string | null
  state:      string | null
  lat:        number
  lon:        number
  updatedAt:  Date
}

// ── Reverse geocode via OpenStreetMap Nominatim (free, no key) ────────────────
async function reverseGeocode(lat: number, lon: number): Promise<{ city: string | null; state: string | null }> {
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`,
      { headers: { 'User-Agent': '3BFleetCommander/1.0' } }
    )
    if (!res.ok) return { city: null, state: null }
    const data = await res.json()
    const addr = data.address ?? {}
    const city  = addr.city || addr.town || addr.village || addr.county || null
    const state = addr.state || null
    // Abbreviate state if possible (Nominatim returns full name in US)
    const stateAbbr = state ? STATE_ABBR[state] ?? state : null
    return { city, state: stateAbbr }
  } catch {
    return { city: null, state: null }
  }
}

// US state name → abbreviation lookup
const STATE_ABBR: Record<string, string> = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
  'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
  'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
  'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH',
  'New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC',
  'North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA',
  'Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN',
  'Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA',
  'West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
}

// ── Route progress estimate ───────────────────────────────────────────────────
// Estimates elapsed miles based on avg road speed + time since mission date.
// Shows a progress bar and fraction — purely informational, no GPS route needed.
const AVG_MPH = 52 // Avg for a loaded semi including stops / breaks

type RouteProgress = {
  elapsedMi:    number
  totalMi:      number
  pct:          number          // 0–100
  elapsedHrs:   number
  etaText:      string | null   // "~Xh Ym remaining" or "Due for delivery"
}

function estimateRouteProgress(mission: LoadMission): RouteProgress | null {
  const totalMi = mission.dispatchMiles
  if (!totalMi || totalMi <= 0) return null

  // Use earliest departed stop timestamp, or fall back to mission date at 06:00
  let departedAt: Date | null = null
  for (const stop of mission.stops ?? []) {
    const ts = stop.lifecycleTimestamps?.departed
    if (ts) {
      const d = new Date(ts)
      if (!departedAt || d < departedAt) departedAt = d
    }
  }
  if (!departedAt && mission.date) {
    // No departure recorded — estimate from mission date at 06:00 local
    departedAt = new Date(`${mission.date}T06:00:00`)
  }
  if (!departedAt) return null

  const nowMs      = Date.now()
  const elapsedMs  = nowMs - departedAt.getTime()
  if (elapsedMs < 0) return null            // Mission is in the future

  const elapsedHrs = elapsedMs / 3_600_000
  const elapsedMi  = Math.min(Math.round(elapsedHrs * AVG_MPH), totalMi)
  const pct        = Math.min((elapsedMi / totalMi) * 100, 100)

  const remainingMi  = totalMi - elapsedMi
  const remainingHrs = remainingMi / AVG_MPH
  let etaText: string | null = null
  if (pct >= 99) {
    etaText = 'Near delivery'
  } else {
    const hrs  = Math.floor(remainingHrs)
    const mins = Math.round((remainingHrs - hrs) * 60)
    etaText = hrs > 0 ? `~${hrs}h ${mins}m remaining` : `~${mins}m remaining`
  }

  return { elapsedMi, totalMi, pct, elapsedHrs, etaText }
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  mission?: LoadMission | null
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function LocationBar({ mission }: Props) {
  const [geo,     setGeo]     = useState<GeoResult | null>(null)
  const [geoErr,  setGeoErr]  = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [now,     setNow]     = useState(() => new Date())

  // Tick every 60s to keep route progress + timestamps fresh
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // ── Fetch GPS location ─────────────────────────────────────────────────────
  const fetchLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setGeoErr('Geolocation not available')
      return
    }
    setLoading(true)
    setGeoErr(null)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lon } = pos.coords
        const { city, state } = await reverseGeocode(lat, lon)
        setGeo({ city, state, lat, lon, updatedAt: new Date() })
        setLoading(false)
      },
      err => {
        setGeoErr(err.code === 1 ? 'Location blocked' : 'Location unavailable')
        setLoading(false)
      },
      { timeout: 10_000, maximumAge: 300_000 }  // cache up to 5 min
    )
  }, [])

  // Auto-fetch on mount, refresh every 10 min
  const fetchedRef = useRef(false)
  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    fetchLocation()
  }, [fetchLocation])

  useEffect(() => {
    const id = setInterval(fetchLocation, 10 * 60_000)
    return () => clearInterval(id)
  }, [fetchLocation])

  // ── Route progress (recalculates on every tick) ────────────────────────────
  void now // tick dependency
  const progress = mission ? estimateRouteProgress(mission) : null

  // ── Format helpers ─────────────────────────────────────────────────────────
  const locationStr = geo
    ? [geo.city, geo.state].filter(Boolean).join(', ') || 'Unknown area'
    : null

  const updatedAgo = geo?.updatedAt
    ? (() => {
        const diffMin = Math.floor((Date.now() - geo.updatedAt.getTime()) / 60_000)
        if (diffMin < 1) return 'just now'
        if (diffMin < 60) return `${diffMin}m ago`
        return `${Math.floor(diffMin / 60)}h ago`
      })()
    : null

  // Don't render if no data and still loading initial (avoids empty space flash)
  if (!geo && !geoErr && loading) return null

  const hasMission = !!mission

  return (
    <div style={{
      borderRadius: 14,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      padding: '.65rem .9rem',
      display: 'grid',
      gap: '.5rem',
    }}>

      {/* ── GPS location row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '.9rem', lineHeight: 1 }}>📍</span>
          {loading && !geo ? (
            <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Locating…</span>
          ) : geoErr && !geo ? (
            <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{geoErr}</span>
          ) : locationStr ? (
            <span style={{ fontWeight: 800, fontSize: '.82rem', color: 'var(--text)' }}>{locationStr}</span>
          ) : null}
          {updatedAgo && (
            <span style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 600 }}>· {updatedAgo}</span>
          )}
        </div>

        {/* Refresh button */}
        <button
          onClick={fetchLocation}
          disabled={loading}
          title="Refresh location"
          style={{
            fontSize: '.65rem', fontWeight: 700, padding: '.2rem .55rem', borderRadius: 6,
            border: '1px solid var(--border)', background: 'none',
            color: 'var(--muted)', cursor: loading ? 'default' : 'pointer',
            opacity: loading ? .5 : 1,
          }}
        >
          {loading ? '⌛' : '↻'}
        </button>
      </div>

      {/* ── Route progress (only if active mission with miles) ── */}
      {hasMission && progress && (
        <div style={{ display: 'grid', gap: 5 }}>
          {/* Labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
              {mission!.origin?.split(',')[0]} → {mission!.destination?.split(',')[0]}
            </span>
            <span style={{ fontSize: '.65rem', color: 'var(--muted)', fontWeight: 600 }}>
              est. ~{progress.elapsedMi.toLocaleString()} / {progress.totalMi.toLocaleString()} mi
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
            <div style={{
              height: '100%',
              width: `${progress.pct}%`,
              borderRadius: 3,
              background: progress.pct >= 90
                ? 'var(--success)'
                : progress.pct >= 60
                  ? 'var(--primary)'
                  : 'var(--warn)',
              transition: 'width .6s ease',
              boxShadow: `0 0 6px ${progress.pct >= 90 ? 'rgba(40,192,72,.4)' : progress.pct >= 60 ? 'rgba(0,232,176,.4)' : 'rgba(245,194,0,.3)'}`,
            }} />
            {/* Truck icon marker */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: `${Math.max(2, Math.min(progress.pct, 97))}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: '.55rem',
              lineHeight: 1,
            }}>🚛</div>
          </div>

          {/* ETA text */}
          {progress.etaText && (
            <div style={{ fontSize: '.65rem', color: progress.pct >= 90 ? 'var(--success)' : 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>
              {progress.etaText}
            </div>
          )}
        </div>
      )}

      {/* ── No mission hint ── */}
      {!hasMission && (
        <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontStyle: 'italic' }}>
          No active run — route progress appears when a load is dispatched
        </div>
      )}
    </div>
  )
}
