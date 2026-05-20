'use client'
import { fmtTime } from '@/lib/dashboard/helpers'
import type { HOSDisplay, WeatherInfo, LoadMission, ActiveTrip } from '@/lib/dashboard/types'
import type { FuelIntelResult } from '@/lib/scoreLoad'

interface Props {
  liveClock:  string
  mission:    LoadMission | null
  nextStop:   ActiveTrip['stops'][number] | undefined
  hosDisplay: HOSDisplay | null
  driveColor: string
  missionFuel: FuelIntelResult | null
  weather:    { temp: number; windSpeed: number } | null
  wx:         WeatherInfo | null
  onEmergency: () => void
  onExit:      () => void
}

export default function DrivingModeOverlay({
  liveClock, mission, nextStop, hosDisplay, driveColor,
  missionFuel, weather, wx, onEmergency, onExit,
}: Props) {
  return (
    <div className="cc-driving-overlay">
      {/* Clock */}
      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: 'clamp(3rem,10vw,5rem)', color: 'var(--text)', letterSpacing: '-.02em', lineHeight: 1 }}>
        {liveClock}
      </div>

      {/* Active load route */}
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

      {/* Next stop */}
      {nextStop && (
        <div style={{ textAlign: 'center', padding: '.85rem 2rem', borderRadius: 16, background: 'rgba(0,232,176,.07)', border: '1px solid rgba(0,232,176,.2)' }}>
          <div style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Next Stop</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--primary)' }}>{nextStop.name}</div>
          <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginTop: 2 }}>{nextStop.city} · {fmtTime(nextStop.eta)} · {nextStop.miFromOrigin} mi</div>
        </div>
      )}

      {/* HOS drive time */}
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

      {/* Fuel range */}
      {missionFuel && missionFuel.totalMiles > 0 && (
        <div style={{ fontSize: '1rem', color: 'var(--warn)', fontWeight: 700 }}>
          ⛽ ~{missionFuel.gallonsNeeded} gal · ${Math.round(missionFuel.fuelCostTotal)} est. fuel
        </div>
      )}

      {/* Weather */}
      {weather && wx && (
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: wx.color }}>
          {wx.emoji} {weather.temp}°F · {wx.label}
          {wx.severe && <span style={{ color: 'var(--error)' }}> — ⚠️ HAZARDOUS</span>}
        </div>
      )}

      {/* Action row — touch safety: spaced apart */}
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
