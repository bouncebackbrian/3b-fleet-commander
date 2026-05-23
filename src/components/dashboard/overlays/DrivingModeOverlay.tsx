'use client'
import { useState, useRef } from 'react'
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

// ── Critical alert layer ──────────────────────────────────────────────────────

type AlertSeverity = 'critical' | 'warn'
type AlertId =
  | 'hos_stop_now'
  | 'hos_break_soon'
  | 'hos_shift_ending'
  | 'weather_severe'
  | 'weather_wind'
  | 'fuel_needed'

export interface DrivingAlert {
  id:          AlertId
  emoji:       string
  text:        string
  severity:    AlertSeverity
  actionLabel: string       // visible label after the text
  actionKey:   'break' | 'fuel' | 'dismiss'
}

/** Format fractional hours → "22m" / "1h 8m" */
function fmtHrs(h: number): string {
  const m = Math.round(h * 60)
  if (m < 60) return `${m}m`
  const hh = Math.floor(m / 60)
  const mm = m % 60
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`
}

/**
 * Pure derivation — takes current overlay props, returns ≤3 ordered alerts.
 * Priority: HOS violation risk → severe weather → high wind → fuel.
 */
function deriveDrivingAlerts(
  hosDisplay:  HOSDisplay | null,
  weather:     { temp: number; windSpeed: number } | null,
  wx:          WeatherInfo | null,
  missionFuel: FuelIntelResult | null,
  mission:     LoadMission | null,
): DrivingAlert[] {
  const alerts: DrivingAlert[] = []

  if (hosDisplay) {
    // 1a. Drive limit critical (≤1 h remaining)
    if (hosDisplay.driveRem <= 1) {
      alerts.push({
        id: 'hos_stop_now', emoji: '🛑', severity: 'critical',
        text: `Stop required in ${fmtHrs(hosDisplay.driveRem)}`,
        actionLabel: 'Start break →', actionKey: 'break',
      })
    }
    // 1b. Break due soon (>1 h but ≤2 h)
    else if (hosDisplay.driveRem <= 2) {
      alerts.push({
        id: 'hos_break_soon', emoji: '⚠', severity: 'warn',
        text: `Break due in ${fmtHrs(hosDisplay.driveRem)}`,
        actionLabel: 'Start break →', actionKey: 'break',
      })
    }
    // 1c. Shift ending (≤2 h remaining shift, separate from drive limit)
    if (hosDisplay.shiftRem <= 2 && hosDisplay.driveRem > 2) {
      alerts.push({
        id: 'hos_shift_ending', emoji: '🕐', severity: 'warn',
        text: `Shift ends in ${fmtHrs(hosDisplay.shiftRem)}`,
        actionLabel: 'Start break →', actionKey: 'break',
      })
    }
    // 1d. 30-min break countdown (breakIn field)
    if (hosDisplay.breakIn !== null && hosDisplay.breakIn <= 0.5 && hosDisplay.breakIn > 0) {
      // Only add if no stop/break alert already queued to avoid duplication
      if (!alerts.some(a => a.id === 'hos_stop_now' || a.id === 'hos_break_soon')) {
        alerts.push({
          id: 'hos_break_soon', emoji: '⚠', severity: 'critical',
          text: `Mandatory break in ${fmtHrs(hosDisplay.breakIn)}`,
          actionLabel: 'Start break →', actionKey: 'break',
        })
      }
    }
  }

  // 2. Severe weather
  if (wx?.severe) {
    alerts.push({
      id: 'weather_severe', emoji: '🌩', severity: 'critical',
      text: `Hazardous: ${wx.label}`,
      actionLabel: 'OK', actionKey: 'dismiss',
    })
  } else if (weather && weather.windSpeed >= 40) {
    alerts.push({
      id: 'weather_wind', emoji: '🌬', severity: 'warn',
      text: `High winds ${Math.round(weather.windSpeed)} mph`,
      actionLabel: 'OK', actionKey: 'dismiss',
    })
  }

  // 3. No fuel plan when mission is active
  if (mission && !missionFuel) {
    alerts.push({
      id: 'fuel_needed', emoji: '⛽', severity: 'warn',
      text: 'Fuel plan needed',
      actionLabel: 'Add plan →', actionKey: 'fuel',
    })
  }

  // Critical-first, then warn. Cap at 3 so the strip stays compact.
  return alerts
    .sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1))
    .slice(0, 3)
}

/** Live countdown from now to an ETA string. Re-evaluates on every render (driven by liveClock). */
function fmtEta(etaStr: string): string {
  const diffMs = new Date(etaStr).getTime() - Date.now()
  if (diffMs <= 0) return 'Arrived'
  const totalMin = Math.round(diffMs / 60_000)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
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
  spotifyTrack?:      SpotifyTrack | null
  spotifyStatus?:     SpotifyStatus
  spotifyTrackSaved?: boolean
  onSpotifyToggle?:   () => void
  onSpotifyNext?:     () => void
  onSpotifyPrev?:     () => void
  onSpotifyLike?:     () => void
  // Actions
  onEmergency:  () => void
  onExit:       () => void
  onStartBreak?:      () => void
  onShowFuel?:        () => void
  onDocumentEvent?:   () => void
  onComplianceProof?: () => void
}

export default function DrivingModeOverlay({
  liveClock, mission, nextStop, hosDisplay, driveColor,
  missionFuel, weather, wx,
  spotifyTrack, spotifyStatus, spotifyTrackSaved,
  onSpotifyToggle, onSpotifyNext, onSpotifyPrev, onSpotifyLike,
  onEmergency, onExit, onStartBreak, onShowFuel,
  onDocumentEvent, onComplianceProof,
}: Props) {
  const showSpotify  = spotifyStatus && spotifyStatus !== 'disconnected'
  const [mapOpen,    setMapOpen]    = useState(false)
  const [returnApp,  setReturnApp]  = useState<string | null>(null)
  const [dismissed,  setDismissed]  = useState<Set<AlertId>>(new Set())
  const loggedAlerts = useRef<Set<AlertId>>(new Set())

  // Derive alerts — re-runs every second via liveClock re-render
  const allAlerts = deriveDrivingAlerts(hosDisplay, weather, wx, missionFuel, mission)
  const alerts    = allAlerts.filter(a => !dismissed.has(a.id))

  // Log each unique alert exactly once (not every re-render second)
  alerts.forEach(alert => {
    if (!loggedAlerts.current.has(alert.id)) {
      loggedAlerts.current.add(alert.id)
      void logTimelineEvent('alert_shown', 'alert_layer', {
        alertId:  alert.id,
        severity: alert.severity,
        text:     alert.text,
      }, mission?.loadNumber)
    }
  })

  function handleAlertAction(alert: DrivingAlert) {
    if (alert.actionKey === 'dismiss') {
      setDismissed(prev => new Set([...prev, alert.id]))
      void logTimelineEvent('alert_dismissed', 'alert_layer', {
        alertId:   alert.id,
        severity:  alert.severity,
      }, mission?.loadNumber)
    } else if (alert.actionKey === 'break') {
      onStartBreak ? onStartBreak() : onEmergency()
    } else if (alert.actionKey === 'fuel') {
      onShowFuel?.()
    }
  }

  const navDest = mission?.destination ?? ''

  function openNavApp(app: NavApp) {
    const { url, fallback, openDirect } = buildNavLink(app, navDest)

    const eventType = app.label === 'Truckers Path Route'
      ? 'nav_opened_truckers_path_share_link' as const
      : 'nav_opened' as const

    logTimelineEvent(
      eventType,
      'driving_overlay',
      { app: app.label, destination: navDest, deep_link: url },
      mission?.loadNumber || undefined,
    )
    setReturnApp(app.label)
    setMapOpen(false)

    if (openDirect) {
      window.open(url, '_blank', 'noopener')
      return
    }

    const start = Date.now()
    window.location.href = url
    setTimeout(() => {
      if (Date.now() - start < 1500) window.open(fallback, '_blank', 'noopener')
    }, 700)
  }

  return (
    <div className="cc-driving-overlay">

      {/* ── ZONE 1: Spotify strip — pinned above content, no overlap ── */}
      {showSpotify && (
        <div className="cc-driving-spotify">
          <SpotifyWidget
            track={spotifyTrack ?? null}
            status={spotifyStatus!}
            driving
            trackSaved={spotifyTrackSaved}
            onToggle={onSpotifyToggle ?? (() => {})}
            onNext={onSpotifyNext ?? (() => {})}
            onPrevious={onSpotifyPrev ?? (() => {})}
            onLike={onSpotifyLike}
            onOpen={() => window.open('https://open.spotify.com', '_blank', 'noopener')}
          />
        </div>
      )}

      {/* ── ZONE 2: Critical alert strip — only renders when alerts exist ── */}
      {alerts.length > 0 && (
        <div className="cc-driving-alerts">
          {alerts.map(alert => {
            const isCritical = alert.severity === 'critical'
            return (
              <button
                key={alert.id}
                onClick={() => handleAlertAction(alert)}
                aria-label={`${alert.text} — ${alert.actionLabel}`}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  gap:            7,
                  padding:        '.38rem .75rem',
                  borderRadius:   10,
                  flexShrink:     0,
                  cursor:         'pointer',
                  border:         `1px solid ${isCritical ? 'var(--error)' : 'rgba(245,194,0,.5)'}`,
                  background:     isCritical ? 'rgba(232,64,0,.14)' : 'rgba(245,194,0,.09)',
                  color:          isCritical ? 'var(--error)' : 'var(--warn)',
                  fontWeight:     800,
                  fontSize:       '.78rem',
                  whiteSpace:     'nowrap',
                  lineHeight:     1.2,
                }}
              >
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>{alert.emoji}</span>
                <span>{alert.text}</span>
                <span style={{ opacity: .65, fontSize: '.68rem', fontWeight: 700 }}>
                  {alert.actionLabel}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── ZONE 3: Scrollable center content ── */}
      <div className="cc-driving-content">

        {/* Clock */}
        <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: 'clamp(2.6rem,9vw,5rem)', color: 'var(--text)', letterSpacing: '-.02em', lineHeight: 1 }}>
          {liveClock}
        </div>

        {/* Active load route */}
        {mission && (
          <div>
            <div style={{ fontSize: '.8rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
              Active Load{mission.loadNumber ? ` — ${mission.loadNumber}` : ''}
            </div>
            <div style={{ fontSize: 'clamp(1.1rem,4vw,2.2rem)', fontWeight: 900, color: 'var(--text)', lineHeight: 1.2 }}>
              {mission.origin.split(',')[0]} <span style={{ color: 'var(--primary)' }}>→</span> {mission.destination.split(',')[0]}
            </div>
          </div>
        )}

        {/* Next stop — live countdown, re-evaluates every second via liveClock re-render */}
        {nextStop && (
          <div style={{ padding: '.85rem 1.5rem', borderRadius: 16, background: 'rgba(0,232,176,.07)', border: '1px solid rgba(0,232,176,.2)', width: '100%' }}>
            <div style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Next Stop</div>
            <div style={{ fontSize: 'clamp(1.1rem,4vw,1.4rem)', fontWeight: 900, color: 'var(--primary)' }}>{nextStop.name}</div>
            <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginTop: 4 }}>
              {nextStop.city}
              {nextStop.eta && (
                <>
                  {' · '}
                  <span style={{ color: 'var(--text)', fontWeight: 800 }}>{fmtEta(nextStop.eta)}</span>
                  {' away · '}
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>ETA {fmtTime(nextStop.eta)}</span>
                </>
              )}
              {nextStop.miFromOrigin != null && ` · ${nextStop.miFromOrigin} mi`}
            </div>
          </div>
        )}

        {/* HOS drive time */}
        {hosDisplay && (
          <div>
            <div style={{ fontSize: '.8rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>Drive Time Remaining</div>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: 'clamp(2.4rem,7vw,5rem)', color: driveColor, lineHeight: 1, textShadow: `0 0 32px ${driveColor}50` }}>
              {hosDisplay.driveRem.toFixed(1)}<span style={{ fontSize: '1.5rem', fontWeight: 700, marginLeft: 4 }}>h</span>
            </div>
            {/* HOS warnings surfaced in alert strip — no duplicate inline text needed */}
          </div>
        )}

        {/* Fuel + Weather */}
        {missionFuel && missionFuel.totalMiles > 0 && (
          <div style={{ fontSize: '1rem', color: 'var(--warn)', fontWeight: 700 }}>
            ⛽ ~{missionFuel.gallonsNeeded} gal · ${Math.round(missionFuel.fuelCostTotal)} est. fuel
          </div>
        )}
        {weather && wx && (
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: wx.color }}>
            {wx.emoji} {weather.temp}°F · {wx.label}
            {wx.severe && <span style={{ color: 'var(--error)' }}> — ⚠️ HAZARDOUS</span>}
          </div>
        )}

        {/* Return-to-app banner */}
        {returnApp && (
          <div style={{
            width: '100%',
            padding: '.85rem 1rem', borderRadius: 16,
            background: 'rgba(74,196,255,.08)', border: '1px solid rgba(74,196,255,.3)',
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <span style={{ fontSize: '1.4rem', flexShrink: 0, lineHeight: 1.1 }}>🗺</span>
            <div style={{ flex: 1, minWidth: 0 }}>
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

        {/* Nav picker */}
        <div style={{ width: '100%' }}>
          {!mapOpen ? (
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
            <div style={{
              borderRadius: 18, background: 'rgba(10,24,22,.92)', border: '1px solid rgba(74,196,255,.3)',
              backdropFilter: 'blur(12px)', overflow: 'hidden',
            }}>
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

              <div style={{ padding: '.3rem .9rem .7rem', fontSize: '.6rem', color: 'var(--faint)', textAlign: 'center', lineHeight: 1.5 }}>
                App opens full-screen · Double-press Home to return to Fleet Commander
              </div>
            </div>
          )}
        </div>

      </div>{/* end cc-driving-content */}

      {/* ── ZONE 4: Action buttons — pinned to bottom, never covered ── */}
      <div className="cc-driving-actions">
        {/* Incident / compliance row */}
        <div style={{ display: 'flex', gap: 8, width: '100%', marginBottom: 8 }}>
          {onDocumentEvent && (
            <button
              onClick={onDocumentEvent}
              style={{
                flex: '1 1 0', padding: '.7rem .5rem', borderRadius: 14,
                background: 'rgba(0,160,255,.1)', border: '1px solid rgba(0,160,255,.35)',
                color: '#60c8ff', fontWeight: 800, fontSize: '.82rem',
                cursor: 'pointer', minHeight: 52, lineHeight: 1.2,
              }}
            >
              📸 Document<br />Event
            </button>
          )}
          {onComplianceProof && (
            <button
              onClick={onComplianceProof}
              style={{
                flex: '1 1 0', padding: '.7rem .5rem', borderRadius: 14,
                background: 'rgba(255,200,0,.08)', border: '1px solid rgba(255,200,0,.3)',
                color: '#ffd060', fontWeight: 800, fontSize: '.82rem',
                cursor: 'pointer', minHeight: 52, lineHeight: 1.2,
              }}
            >
              ⚖️ Compliance<br />Proof
            </button>
          )}
        </div>

        {/* End / emergency row */}
        <button onClick={onEmergency}
          style={{ flex: '1 1 140px', padding: '1rem 1.5rem', borderRadius: 16, background: 'rgba(232,64,0,.12)', border: '1px solid var(--error)', color: 'var(--error)', fontWeight: 800, fontSize: '.95rem', cursor: 'pointer', minHeight: 60 }}>
          🚨 Emergency
        </button>
        <button onClick={onExit}
          style={{ flex: '2 1 200px', padding: '1.2rem 2rem', borderRadius: 18, background: 'rgba(232,64,0,.15)', border: '2px solid var(--error)', color: 'var(--error)', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', letterSpacing: '.04em', minHeight: 72 }}>
          🛑 END DRIVING MODE
        </button>
      </div>

    </div>
  )
}
