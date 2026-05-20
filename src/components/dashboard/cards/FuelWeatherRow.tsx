'use client'
import Link from 'next/link'
import type { WeatherData, WeatherInfo } from '@/lib/dashboard/types'
import type { FuelIntelResult } from '@/lib/scoreLoad'

interface Props {
  missionFuel:    FuelIntelResult | null
  weather:        WeatherData | null
  wx:             WeatherInfo | null
  weatherLoading: boolean
}

export default function FuelWeatherRow({ missionFuel, weather, wx, weatherLoading }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
      {/* FUEL CARD */}
      <div className="cc-card">
        <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '.55rem' }}>⛽ Fuel</div>
        {missionFuel && missionFuel.totalMiles > 0 ? (
          <div style={{ display: 'grid', gap: '.4rem' }}>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: '1.7rem', color: 'var(--warn)', lineHeight: 1 }}>
              ${Math.round(missionFuel.fuelCostTotal)}
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
              ~{missionFuel.gallonsNeeded} gal · ${missionFuel.priceUsed.toFixed(2)}/gal
              {missionFuel.priceIsDefault && <span style={{ color: 'var(--warn)' }}> (est.)</span>}
            </div>
            {missionFuel.stops.length > 0 && missionFuel.stops[0].corridor !== 'N/A' && (
              <div style={{ fontSize: '.7rem', color: 'var(--primary)', fontWeight: 700 }}>📍 {missionFuel.stops[0].location}</div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: '1.8rem', color: 'var(--muted)', lineHeight: 1 }}>—</div>
            <div style={{ fontSize: '.7rem', color: 'var(--faint)', marginTop: 4 }}>Add load miles to estimate</div>
          </div>
        )}
        <Link href="/fuel" style={{ display: 'block', marginTop: '.6rem', fontSize: '.72rem', color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>Fuel log →</Link>
      </div>

      {/* WEATHER CARD */}
      <div className="cc-card" style={{ border: `1px solid ${wx?.severe ? 'rgba(232,128,0,.3)' : 'var(--border)'}` }}>
        <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '.55rem' }}>🌤 Weather</div>
        {weather && wx ? (
          <div style={{ display: 'grid', gap: '.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>{wx.emoji}</span>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.65rem', color: wx.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{weather.temp}°F</div>
                <div style={{ fontSize: '.68rem', color: wx.color, fontWeight: 700 }}>{wx.label}</div>
              </div>
            </div>
            <div style={{ fontSize: '.72rem', color: weather.windSpeed >= 40 ? 'var(--error)' : weather.windSpeed >= 25 ? 'var(--warn)' : 'var(--muted)', fontWeight: 700 }}>
              💨 {weather.windSpeed} mph{weather.windSpeed >= 40 ? ' ⚠️ HIGH WIND' : ''}
            </div>
            {wx.severe && (
              <div style={{ padding: '.3rem .55rem', borderRadius: 7, background: 'rgba(232,64,0,.1)', border: '1px solid rgba(232,64,0,.25)', fontSize: '.68rem', color: 'var(--error)', fontWeight: 700 }}>⚠️ Hazardous conditions</div>
            )}
          </div>
        ) : weatherLoading ? (
          <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Getting location…</div>
        ) : (
          <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Allow location access.</div>
        )}
      </div>
    </div>
  )
}
