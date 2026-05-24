'use client'
/**
 * DriveWeatherCard — trucking-specific weather panel for Drive Mode
 *
 * Shows what matters for operational decisions:
 *   Wind speed · Wind gusts · Visibility · Rain probability (2h)
 *   Crosswind risk badge (LOW / MODERATE / HIGH)
 *
 * Refreshes every 30 min via useWeather (parent-driven).
 */
import type { WeatherInfo, WeatherData } from '@/lib/dashboard/types'

type CrosswindRisk = 'LOW' | 'MODERATE' | 'HIGH'

function getCrosswindRisk(gusts?: number): CrosswindRisk {
  if (!gusts) return 'LOW'
  if (gusts >= 45) return 'HIGH'
  if (gusts >= 28) return 'MODERATE'
  return 'LOW'
}

const RISK_STYLE: Record<CrosswindRisk, { color: string; bg: string; border: string }> = {
  LOW:      { color: 'var(--primary)', bg: 'rgba(0,232,176,.08)',  border: 'rgba(0,232,176,.25)'  },
  MODERATE: { color: 'var(--warn)',    bg: 'rgba(245,194,0,.09)',  border: 'rgba(245,194,0,.3)'   },
  HIGH:     { color: 'var(--error)',   bg: 'rgba(232,64,0,.1)',    border: 'rgba(232,64,0,.35)'   },
}

interface Props {
  weather:     WeatherData | null
  wx:          WeatherInfo | null
  lastUpdated: Date | null
}

export default function DriveWeatherCard({ weather, wx, lastUpdated }: Props) {
  if (!weather) return null

  const risk      = getCrosswindRisk(weather.windGusts)
  const riskStyle = RISK_STYLE[risk]

  const updatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : null

  return (
    <div style={{
      width: '100%',
      borderRadius: 14,
      background: 'rgba(8,22,20,.75)',
      border: '1px solid rgba(0,232,176,.12)',
      padding: '.85rem 1rem',
    }}>

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.7rem' }}>
        <div style={{
          fontSize: '.65rem', fontWeight: 800,
          color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em',
        }}>
          Operational Weather
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {wx && (
            <>
              <span style={{ fontSize: '1rem' }}>{wx.emoji}</span>
              <span style={{ fontWeight: 800, fontSize: '.75rem', color: wx.color }}>{wx.label}</span>
              <span style={{ color: 'var(--faint)', fontSize: '.65rem' }}>·</span>
            </>
          )}
          <span style={{ fontSize: '.6rem', color: 'var(--faint)', fontWeight: 600 }}>
            {weather.temp}°F{updatedStr ? ` · ${updatedStr}` : ''}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '.5rem .85rem',
      }}>
        <WStat icon="🌬" label="Wind"        value={`${weather.windSpeed} mph`} />
        {weather.windGusts != null && (
          <WStat
            icon="💨" label="Gusts"
            value={`${weather.windGusts} mph`}
            valueColor={weather.windGusts >= 40 ? 'var(--warn)' : undefined}
          />
        )}
        {weather.visibility != null && (
          <WStat
            icon="👁" label="Visibility"
            value={`${weather.visibility} mi`}
            valueColor={
              weather.visibility < 0.5 ? 'var(--error)' :
              weather.visibility < 2   ? 'var(--warn)'  : undefined
            }
          />
        )}
        {weather.precipProbNext2h != null && (
          <WStat
            icon="🌧" label="Rain (2h)"
            value={`${weather.precipProbNext2h}%`}
            valueColor={weather.precipProbNext2h >= 70 ? 'var(--warn)' : undefined}
          />
        )}
      </div>

      {/* Crosswind risk badge */}
      {weather.windGusts != null && (
        <div style={{ marginTop: '.65rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '.28rem .65rem', borderRadius: 8,
            background: riskStyle.bg, border: `1px solid ${riskStyle.border}`,
          }}>
            <span style={{ fontSize: '.68rem' }}>⚡</span>
            <span style={{ fontWeight: 800, fontSize: '.7rem', color: riskStyle.color }}>
              Crosswind Risk: {risk}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function WStat({
  icon, label, value, valueColor,
}: { icon: string; label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{
        fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '.05em',
      }}>
        {icon} {label}
      </div>
      <div style={{
        fontWeight: 900, fontSize: '.9rem',
        color: valueColor ?? 'var(--text)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
    </div>
  )
}
