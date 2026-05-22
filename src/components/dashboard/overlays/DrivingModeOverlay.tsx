'use client'
import { useState } from 'react'
import { fmtTime } from '@/lib/dashboard/helpers'
import type { HOSDisplay, WeatherInfo, LoadMission, ActiveTrip } from '@/lib/dashboard/types'
import type { FuelIntelResult } from '@/lib/scoreLoad'
import SpotifyWidget from '@/components/spotify/SpotifyWidget'
import type { SpotifyTrack, SpotifyStatus } from '@/hooks/useSpotify'
import { logTimelineEvent } from '@/lib/timeline'

// ── Nav app descriptors ───────────────────────────────────────────────────────
const NAV_APPS = [
  { label: "Truckers Path Route", emoji: "🛣", desc: "Shared route · weigh stations · truck stops" },
  { label: "Truckers Path App",   emoji: "🚛", desc: "Open Truckers Path app directly"             },
  { label: "Google Maps",         emoji: "🗺", desc: "Turn-by-turn navigation"                     },
  { label: "Waze",                emoji: "🔵", desc: "Live traffic & hazards"                      },
] as const

type NavApp = typeof NAV_APPS[number]

/** Build the best deep-link URL for each app, pre-filled with destination. */
function buildNavLink(app: NavApp, destination: string): { url: string; fallback: string; openDirect?: boolean } {
  const d = encodeURIComponent(destination)
  switch (app.label) {
    case 'Truckers Path Route':
      // Shared route link — open directly in new tab, no deep-link needed
      return {
        url:        'https://tpurl.link/rVella',
        fallback:   'https://tpurl.link/rVella',
        openDirect: true,
      }
    case 'Truckers Path App':
      return {
        url:      'truckerspath://',
        fallback: 'https://truckerspath.com',
      }
    case 'Google Maps':
      return {
        url:      `comgooglemaps://?daddr=${d}&directionsmode=driving`,
        fallback: `https://www.google.com/maps/dir/?api=1&destination=${d}`,
      }
    case 'Waze':
      return {
        url:      `waze://?q=${d}&navigate=yes`,
        fallback: `https://waze.com/ul?q=${d}&navigate=yes`,
      }
    default:
      return { url: 'https://truckerspath.com', fallback: 'https://truckerspath.com', openDirect: true }
  }
}


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
  const showSpotify  = spotifyStatus && spotifyStatus !== 'disconnected'
  const [mapOpen,    setMapOpen]    = useState(false)
  const [returnApp,  setReturnApp]  = useState<string | null>(null)

  // Best destination string: use active mission dropoff, or empty
  const navDest = mission?.destination ?? ''

  function openNavApp(app: NavApp) {
    const { url, fallback, openDirect } = buildNavLink(app, navDest)

    // Determine the correct timeline event type
    const eventType = app.label === 'Truckers Path Route'
      ? 'nav_opened_truckers_path_share_link' as const
      : 'nav_opened' as const

    // Log to unified timeline (localStorage-first → Supabase async)
    logTimelineEvent(
      eventType,
      'driving_overlay',
      { app: app.label, destination: navDest, deep_link: url },
      mission?.loadNumber || undefined,
    )
    setReturnApp(app.label)
    setMapOpen(false)

    if (openDirect) {
      // Web URL — open directly in new tab; no deep-link timeout needed
      window.open(url, '_blank', 'noopener')
      return
    }

    // Try native deep link; if the app isn't installed the browser won't navigate,
    // so after 700 ms open the web fallback instead.
    const start = Date.now()
    window.location.href = url
    setTimeout(() => {
      // If less than 1.5 s have passed the page is still in foreground → app not installed
      if (Date.now() - start < 1500) window.open(fallback, '_blank', 'noopener')
    }, 700)
  }

  return (
    <div className="cc-driving-overlay">

      {/* ── Spotify strip — pinned to top, out of flex flow ── */}
      {showSpotify && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '.6rem .75rem' }}>
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

      {/* ── Clock ── */}
      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: 'clamp(3rem,10vw,5rem)', color: 'var(--text)', letterSpacing: '-.02em', lineHeight: 1 }}>
        {liveClock}
      </div>

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

      {/* ── Return-to-app banner (shown after nav app is launched) ── */}
      {returnApp && (
        <div style={{
          width: '100%', maxWidth: 420,
          padding: '.85rem 1rem', borderRadius: 16,
          background: 'rgba(74,196,255,.08)', border: '1px solid rgba(74,196,255,.3)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span style={{ fontSize: '1.4rem', flexShrink: 0, lineHeight: 1.1 }}>🗺</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '.88rem', color: 'var(--blue)' }}>
              {returnApp} opened
            </div>
            <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>
              Return here to update miles, rest time, fuel, or scan documents.
              {navDest ? <><br /><span style={{ color: 'var(--text)', fontWeight: 700 }}>Destination: {navDest.split(',').slice(0,2).join(',')}</span></> : null}
            </div>
          </div>
          <button
            onClick={() => setReturnApp(null)}
            style={{ flexShrink: 0, padding: '.2rem .45rem', borderRadius: 6, border: '1px solid rgba(74,196,255,.2)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.72rem', lineHeight: 1 }}>
            ✕
          </button>
        </div>
      )}

      {/* ── Map / Navigation PiP ── */}
      <div style={{ width: '100%', maxWidth: 420 }}>
        {!mapOpen ? (
          /* Collapsed chip — shows destination when a load is active */
          <button
            onClick={() => setMapOpen(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '.85rem 1.1rem', borderRadius: 16,
              background: 'rgba(74,196,255,.07)', border: '1px solid rgba(74,196,255,.25)',
              color: 'var(--blue)', fontWeight: 800, fontSize: '.95rem', cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '1.3rem' }}>🗺</span>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div>Open Navigation App</div>
              {navDest && (
                <div style={{ fontSize: '.65rem', color: 'var(--muted)', fontWeight: 600, marginTop: 1 }}>
                  → {navDest.split(',').slice(0,2).join(',')}
                </div>
              )}
            </div>
            <span style={{ fontSize: '.75rem', opacity: .65 }}>▾</span>
          </button>
        ) : (
          /* Expanded nav picker */
          <div style={{
            borderRadius: 18, background: 'rgba(10,24,22,.92)', border: '1px solid rgba(74,196,255,.3)',
            backdropFilter: 'blur(12px)', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.8rem 1.1rem .5rem' }}>
              <div>
                <div style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                  📍 Navigate To
                </div>
                {navDest ? (
                  <div style={{ fontSize: '.9rem', fontWeight: 900, color: 'var(--text)', marginTop: 2 }}>
                    {navDest.split(',').slice(0,2).join(',')}
                  </div>
                ) : (
                  <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 2 }}>No active load — searching manually</div>
                )}
              </div>
              <button onClick={() => setMapOpen(false)} style={{ padding: '.2rem .5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.75rem' }}>✕</button>
            </div>

            {/* App buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '.4rem .8rem .9rem' }}>
              {NAV_APPS.map(app => {
                const hasDeepDest = app.label !== 'Truckers Path Route' && app.label !== 'Truckers Path App' && !!navDest
                return (
                  <button
                    key={app.label}
                    onClick={() => openNavApp(app)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '.9rem 1.2rem',
                      borderRadius: 13, border: '1px solid rgba(74,196,255,.2)',
                      background: 'rgba(74,196,255,.06)', cursor: 'pointer',
                      color: 'var(--text)', fontWeight: 800, textAlign: 'left', minHeight: 64,
                    }}
                  >
                    <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{app.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 900, fontSize: '1rem' }}>{app.label}</div>
                      <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 1 }}>
                        {hasDeepDest
                          ? <span style={{ color: 'rgba(74,196,255,.7)' }}>→ {navDest.split(',').slice(0,2).join(',')}</span>
                          : app.desc}
                      </div>
                    </div>
                    <span style={{ fontSize: '.95rem', color: 'var(--muted)' }}>→</span>
                  </button>
                )
              })}
            </div>

            {/* Footer hint */}
            <div style={{ padding: '.3rem .9rem .7rem', fontSize: '.6rem', color: 'var(--faint)', textAlign: 'center', lineHeight: 1.5 }}>
              App opens full-screen · Double-press Home to return to Fleet Commander
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
