'use client'
import { useState } from 'react'
import { fmtTime } from '@/lib/dashboard/helpers'
import type { HOSDisplay, WeatherInfo, LoadMission, ActiveTrip } from '@/lib/dashboard/types'
import type { FuelIntelResult } from '@/lib/scoreLoad'
import SpotifyWidget from '@/components/spotify/SpotifyWidget'
import type { SpotifyTrack, SpotifyStatus } from '@/hooks/useSpotify'

// ── Nav app deep-link targets ─────────────────────────────────────────────────
const NAV_APPS = [
  { label: "Truckers Path", emoji: "🛣", url: "truckerspath://",   fallback: "https://truckerspath.com" },
  { label: "Google Maps",   emoji: "🗺", url: "comgooglemaps://",  fallback: "https://maps.google.com"  },
  { label: "Waze",          emoji: "🔵", url: "waze://",           fallback: "https://waze.com"         },
]

interface Props {
  liveClock:   string
  mission:     LoadMission | null
  nextStop:    ActiveTrip['stops'][number] | undefined
  hosDisplay:  HOSDisplay | null
  driveColor:  string
  missionFuel: FuelIntelResult | null
  weather:     { temp: number; windSpeed: number } | null
  wx:          WeatherInfo | null
  // Spotify
  spotifyTrack?:    SpotifyTrack | null
  spotifyStatus?:   SpotifyStatus
  onSpotifyToggle?: () => void
  onSpotifyNext?:   () => void
  onSpotifyPrev?:   () => void
  // Actions
  onEmergency: () => void
  onExit:      () => void
}

export default function DrivingModeOverlay({
  liveClock, mission, nextStop, hosDisplay, driveColor,
  missionFuel, weather, wx,
  spotifyTrack, spotifyStatus, onSpotifyToggle, onSpotifyNext, onSpotifyPrev,
  onEmergency, onExit,
}: Props) {
  const showSpotify = spotifyStatus && spotifyStatus !== 'disconnected'
  const [mapOpen, setMapOpen] = useState(false)

  function openNavApp(app: typeof NAV_APPS[number]) {
    // Try deep link first; fall back to web URL after 600ms if app doesn't open
    const start = Date.now()
    window.location.href = app.url
    setTimeout(() => {
      if (Date.now() - start < 1500) window.open(app.fallback, '_blank', 'noopener')
    }, 600)
    setMapOpen(false)
  }

  return (
    <div className="cc-driving-overlay">
      {/* ── Clock ── */}
      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: 'clamp(3rem,10vw,5rem)', color: 'var(--text)', letterSpacing: '-.02em', lineHeight: 1 }}>
        {liveClock}
      </div>

      {/* ── Spotify player — visible above everything else ── */}
      {showSpotify && (
        <div style={{ width: '100%', maxWidth: 420 }}>
          <SpotifyWidget
            track={spotifyTrack ?? null}
            status={spotifyStatus!}
            driving
            onToggle={onSpotifyToggle ?? (() => {})}
            onNext={onSpotifyNext ?? (() => {})}
            onPrevious={onSpotifyPrev ?? (() => {})}
            onOpen={() => window.open('https://open.spotify.com', '_blank', 'noopener')}
          />
        </div>
      )}

      {/* ── Active load route ── */}
      {mission && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '.8rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
            Active Load{mission.loadNumber ? ` — ${mission.loadNumber}` : ''}
          </div>
          <div style={{ fontSize: 'clamp(1.3rem,4vw,2.2rem)', fontWeight: 900, color: 'var(--text)', lineHeight: 1.2 }}>
            {mission.origin.split(',')[0]} <span style={{ color: 'var(--primary)' }}>→</span> {mission.destination.split(',')[0]}
          </div>
        </div>
      )}

      {/* ── Next stop ── */}
      {nextStop && (
        <div style={{ textAlign: 'center', padding: '.85rem 2rem', borderRadius: 16, background: 'rgba(0,232,176,.07)', border: '1px solid rgba(0,232,176,.2)' }}>
          <div style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Next Stop</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--primary)' }}>{nextStop.name}</div>
          <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginTop: 2 }}>{nextStop.city} · {fmtTime(nextStop.eta)} · {nextStop.miFromOrigin} mi</div>
        </div>
      )}

      {/* ── HOS drive time ── */}
      {hosDisplay && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '.8rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>Drive Time Remaining</div>
          <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: 'clamp(3rem,8vw,5rem)', color: driveColor, lineHeight: 1, textShadow: `0 0 32px ${driveColor}50` }}>
            {hosDisplay.driveRem.toFixed(1)}<span style={{ fontSize: '1.5rem', fontWeight: 700, marginLeft: 4 }}>h</span>
          </div>
          {hosDisplay.driveRem <= 2 && (
            <div style={{ marginTop: 10, fontSize: '1rem', color: 'var(--error)', fontWeight: 800 }}>⚠️ MANDATORY STOP APPROACHING</div>
          )}
        </div>
      )}

      {/* ── Fuel + Weather ── */}
      {missionFuel && missionFuel.totalMiles > 0 && (
        <div style={{ fontSize: '1rem', color: 'var(--warn)', fontWeight: 700 }}>
          ⛽ ~{missionFuel.gallonsNeeded} gal · ${Math.round(missionFuel.fuelCostTotal)} est. fuel
        </div>
      )}
      {weather && wx && (
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: wx.color }}>
          {wx.emoji} {weather.temp}°F · {wx.label}
          {wx.severe && <span style={{ color: 'var(--error)' }}> — ⚠️ HAZARDOUS</span>}
        </div>
      )}

      {/* ── Map / Navigation PiP ── */}
      <div style={{ width: '100%', maxWidth: 420 }}>
        {!mapOpen ? (
          /* Collapsed PiP chip */
          <button
            onClick={() => setMapOpen(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 10, padding: '.85rem 1.5rem', borderRadius: 16,
              background: 'rgba(74,196,255,.07)', border: '1px solid rgba(74,196,255,.25)',
              color: 'var(--blue)', fontWeight: 800, fontSize: '1rem', cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '1.35rem' }}>🗺</span>
            Open Navigation App
            <span style={{ fontSize: '.75rem', opacity: .65, marginLeft: 2 }}>▾</span>
          </button>
        ) : (
          /* Expanded nav picker */
          <div style={{
            borderRadius: 18, background: 'rgba(10,24,22,.92)', border: '1px solid rgba(74,196,255,.3)',
            backdropFilter: 'blur(12px)', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.8rem 1.1rem .5rem' }}>
              <div style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                📍 Open Navigation
              </div>
              <button onClick={() => setMapOpen(false)} style={{ padding: '.2rem .5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.75rem' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '.4rem .8rem .9rem' }}>
              {NAV_APPS.map(app => (
                <button
                  key={app.label}
                  onClick={() => openNavApp(app)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '.9rem 1.2rem',
                    borderRadius: 13, border: '1px solid rgba(74,196,255,.2)',
                    background: 'rgba(74,196,255,.06)', cursor: 'pointer',
                    color: 'var(--text)', fontWeight: 800, fontSize: '1.05rem',
                    textAlign: 'left', minHeight: 64,
                  }}
                >
                  <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{app.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: '1rem' }}>{app.label}</div>
                    <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 1 }}>
                      {app.label === 'Truckers Path' ? 'Weigh stations · truck routes · fuel' :
                       app.label === 'Google Maps'   ? 'Turn-by-turn navigation' :
                       'Live traffic & hazards'}
                    </div>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: '1rem', color: 'var(--muted)' }}>→</span>
                </button>
              ))}
            </div>
            <div style={{ padding: '.4rem .9rem .7rem', fontSize: '.6rem', color: 'var(--faint)', textAlign: 'center', lineHeight: 1.5 }}>
              ℹ️ App will open full-screen. Double-press home to switch back to Fleet Commander.
            </div>
          </div>
        )}
      </div>

      {/* ── Action row ── */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginTop: '1rem' }}>
        <button onClick={onEmergency}
          style={{ padding: '1rem 2rem', borderRadius: 16, background: 'rgba(232,64,0,.12)', border: '1px solid var(--error)', color: 'var(--error)', fontWeight: 800, fontSize: '.95rem', cursor: 'pointer', minHeight: 60, minWidth: 160 }}>
          🚨 Emergency
        </button>
        <button onClick={onExit}
          style={{ padding: '1.2rem 3rem', borderRadius: 18, background: 'rgba(232,64,0,.15)', border: '2px solid var(--error)', color: 'var(--error)', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', letterSpacing: '.04em', minWidth: 260, minHeight: 72 }}>
          🛑 END DRIVING MODE
        </button>
      </div>
    </div>
  )
}
