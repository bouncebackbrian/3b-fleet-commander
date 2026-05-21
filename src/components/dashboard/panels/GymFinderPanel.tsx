'use client'
import { useState, useEffect } from 'react'

// ── Brand preference ──────────────────────────────────────────────────────────
type GymBrand = 'planet_fitness' | 'anytime_fitness' | 'ymca' | 'truck_shower' | 'other'

const BRANDS: { id: GymBrand; label: string; icon: string }[] = [
  { id: 'planet_fitness',  label: 'Planet Fitness', icon: '💜' },
  { id: 'anytime_fitness', label: 'Anytime Fitness', icon: '🔑' },
  { id: 'ymca',            label: 'YMCA',            icon: '🏊' },
  { id: 'truck_shower',    label: 'Truck Stop Shower', icon: '🚿' },
  { id: 'other',           label: 'Any Gym',         icon: '🏋️' },
]

const BRAND_SEARCH: Record<GymBrand, string> = {
  planet_fitness:  'Planet Fitness',
  anytime_fitness: 'Anytime Fitness',
  ymca:            'YMCA',
  truck_shower:    'truck stop shower',
  other:           'gym near me',
}

// ── Link builders ─────────────────────────────────────────────────────────────
// With GPS coords: uses coordinates in the URL for accurate "near me" results.
// Without GPS: falls back to a plain search string.

function googleMapsSearch(query: string, coords?: GeolocationCoordinates | null): string {
  if (coords) {
    const ll = `${coords.latitude},${coords.longitude}`
    return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${ll},13z`
  }
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`
}

function appleMapsSearch(query: string, coords?: GeolocationCoordinates | null): string {
  if (coords) {
    return `https://maps.apple.com/?q=${encodeURIComponent(query)}&sll=${coords.latitude},${coords.longitude}&z=13`
  }
  return `https://maps.apple.com/?q=${encodeURIComponent(query)}`
}

// Detect iOS for Apple Maps preference
const isIOS = () => typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent)

function mapsLink(query: string, coords?: GeolocationCoordinates | null): string {
  return isIOS()
    ? appleMapsSearch(query, coords)
    : googleMapsSearch(query, coords)
}

// ── Quick action catalogue ────────────────────────────────────────────────────
// Rendered as large buttons. query() receives current coords at tap time.
function getActions(brand: GymBrand) {
  const brandName = BRAND_SEARCH[brand]
  return [
    {
      icon: '🏋️', label: 'Find Gym Near Me',
      desc: `Search ${brandName}`,
      query: brandName,
      primary: true,
    },
    {
      icon: '🌐', label: 'Planet Fitness Locator',
      desc: 'Official club finder',
      href: 'https://www.planetfitness.com/gyms',
      primary: false,
    },
    {
      icon: '🚿', label: 'Showers Near Me',
      desc: 'Truck stops, gyms, rec centers',
      query: 'shower facility near me',
      primary: false,
    },
    {
      icon: '🧺', label: 'Laundry Near Me',
      desc: 'Laundromats, washateria',
      query: 'laundromat near me',
      primary: false,
    },
    {
      icon: '🥗', label: 'Healthy Food Near Me',
      desc: 'Salads, bowls, protein options',
      query: 'healthy food near me',
      primary: false,
    },
    {
      icon: '🅿️', label: 'Parking + Gym Combo',
      desc: 'Truck parking near gym',
      query: 'gym with truck parking',
      primary: false,
    },
  ]
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  open:         boolean
  onClose:      () => void
  drivingMode?: boolean
}

export default function GymFinderPanel({ open, onClose, drivingMode }: Props) {
  const [brand,  setBrand]  = useState<GymBrand>('planet_fitness')
  const [coords, setCoords] = useState<GeolocationCoordinates | null>(null)
  const [locErr, setLocErr] = useState(false)

  // ── Persist brand preference ──────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('3b-gym-brand') as GymBrand | null
      if (saved && BRANDS.find(b => b.id === saved)) setBrand(saved)
    } catch { /* ignore */ }
  }, [])

  const pickBrand = (b: GymBrand) => {
    setBrand(b)
    try { localStorage.setItem('3b-gym-brand', b) } catch { /* ignore */ }
  }

  // ── Request GPS when panel opens ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos  => setCoords(pos.coords),
      _err => setLocErr(true),
      { timeout: 6000, maximumAge: 60000 },
    )
  }, [open])

  if (!open) return null

  const actions = getActions(brand)

  const go = (action: typeof actions[number]) => {
    if ('href' in action && action.href) {
      window.open(action.href, '_blank', 'noopener,noreferrer')
    } else if ('query' in action && action.query) {
      window.open(mapsLink(action.query, coords), '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(3,13,11,.75)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
        background: 'var(--surface)',
        borderTop: '2px solid rgba(0,184,232,.3)',
        borderRadius: '20px 20px 0 0',
        padding: '1.5rem 1.5rem 2.5rem',
        maxHeight: '90dvh', overflowY: 'auto',
        boxShadow: 'var(--shadow-lg)',
      }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.5rem' }}>💪</span> Gym Finder
            </div>
            <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>
              {coords
                ? `📍 GPS locked · ${isIOS() ? 'Apple Maps' : 'Google Maps'}`
                : locErr
                  ? '📍 Location unavailable — searches open without GPS'
                  : '📍 Getting your location…'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ padding: '.4rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.85rem', flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        {/* ── Driving Mode warning ── */}
        {drivingMode && (
          <div style={{
            padding: '.65rem .9rem', borderRadius: 10, marginBottom: '1rem',
            background: 'rgba(245,194,0,.07)', border: '1px solid rgba(245,194,0,.25)',
            fontSize: '.72rem', fontWeight: 700, color: 'var(--warn)', lineHeight: 1.5,
          }}>
            ⚠ Driving Mode is ON — plan gym stops while parked.
          </div>
        )}

        {/* ── Brand preference ── */}
        {!drivingMode && (
          <>
            <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.55rem' }}>
              Preferred Gym
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1.1rem' }}>
              {BRANDS.map(b => (
                <button
                  key={b.id}
                  onClick={() => pickBrand(b.id)}
                  style={{
                    padding: '.32rem .75rem', borderRadius: 8, cursor: 'pointer',
                    fontSize: '.72rem', fontWeight: 700,
                    border: brand === b.id ? '1px solid rgba(0,184,232,.5)' : '1px solid var(--border)',
                    background: brand === b.id ? 'rgba(0,184,232,.1)' : 'var(--surface-2)',
                    color: brand === b.id ? '#00b8e8' : 'var(--muted)',
                    transition: 'all .12s',
                  }}
                >
                  {b.icon} {b.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Quick actions ── */}
        <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.65rem' }}>
          Find Nearby
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {actions.map(a => (
            <button
              key={a.label}
              onClick={() => go(a)}
              style={{
                padding: '1rem .9rem', borderRadius: 13, textAlign: 'left', cursor: 'pointer',
                border: a.primary
                  ? '1px solid rgba(0,184,232,.4)'
                  : '1px solid var(--border)',
                background: a.primary
                  ? 'rgba(0,184,232,.08)'
                  : 'var(--surface-2)',
                minHeight: drivingMode ? 84 : 76,
                transition: 'border-color .12s',
              }}
            >
              <div style={{ fontSize: drivingMode ? '1.75rem' : '1.45rem', marginBottom: 4, lineHeight: 1 }}>{a.icon}</div>
              <div style={{ fontSize: drivingMode ? '.9rem' : '.8rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.25 }}>
                {a.label}
              </div>
              {!drivingMode && (
                <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 3, lineHeight: 1.4 }}>
                  {a.desc}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* ── Planet Fitness day pass note ── */}
        {!drivingMode && (
          <div style={{
            marginTop: '1.1rem', padding: '.65rem .9rem', borderRadius: 10,
            background: 'rgba(98,0,234,.06)', border: '1px solid rgba(98,0,234,.15)',
            fontSize: '.7rem', color: 'var(--muted)', lineHeight: 1.6,
          }}>
            💜 <strong style={{ color: 'var(--text)' }}>Planet Fitness:</strong> $10/month Classic or $25 Black Card (guest + any club access).
            Black Card members can use any location nationwide — ideal for truckers.
          </div>
        )}

        {/* ── Safety note ── */}
        <div style={{
          marginTop: '.85rem', padding: '.65rem .9rem', borderRadius: 10,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          fontSize: '.68rem', color: 'var(--muted)', lineHeight: 1.65,
        }}>
          🛡 <strong style={{ color: 'var(--text)' }}>Safety:</strong> Confirm truck-safe parking before visiting.
          Many Planet Fitness locations have lot restrictions — call ahead or check Google Maps reviews for trucker notes.
        </div>

      </div>
    </>
  )
}
