'use client'
/**
 * DriveStatusBanner — dynamic single-line operational status
 *
 * Priority: HOS critical → severe weather → high crosswinds → HOS warn
 *           → high fatigue (preference layer only) → wind advisory → On Schedule
 *
 * IMPORTANT: Fatigue tier is PREFERENCE LAYER only.
 *   It shows "Suggested adjustment" language, never "violation" or "required".
 *   DOT compliance rules (HOS critical, HOS risk) are always checked first.
 *
 * Lives at the top of the Drive Mode scrollable content zone.
 */
import type { HOSDisplay, WeatherInfo, WeatherData } from '@/lib/dashboard/types'
import type { FatigueLevel } from '@/lib/recoveryEngine'

type BannerConfig = {
  emoji:  string
  text:   string
  bg:     string
  border: string
  color:  string
}

function deriveBanner(
  hosDisplay:    HOSDisplay | null,
  wx:            WeatherInfo | null,
  weather:       WeatherData | null,
  fatigueLevel?: FatigueLevel | null,
): BannerConfig {
  const gusts = weather?.windGusts ?? weather?.windSpeed ?? 0

  // 1. HOS stop now (≤ 1.5 h drive remaining) — COMPLIANCE
  if (hosDisplay && hosDisplay.driveRem <= 1.5) {
    const mins = Math.round(hosDisplay.driveRem * 60)
    return {
      emoji: '🛑', text: `HOS Critical — ${mins}m drive remaining · Stop required soon`,
      bg: 'rgba(232,64,0,.15)', border: 'rgba(232,64,0,.5)', color: 'var(--error)',
    }
  }

  // 2. Severe weather — SAFETY
  if (wx?.severe) {
    return {
      emoji: '🌩', text: `${wx.label} — Hazardous driving conditions`,
      bg: 'rgba(232,64,0,.1)', border: 'rgba(232,64,0,.4)', color: 'var(--error)',
    }
  }

  // 3. Extreme crosswind risk (gusts ≥ 45 mph) — SAFETY
  if (gusts >= 45) {
    return {
      emoji: '💨', text: `High Crosswinds — Gusts ${gusts} mph · Reduce speed`,
      bg: 'rgba(245,194,0,.12)', border: 'rgba(245,194,0,.45)', color: 'var(--warn)',
    }
  }

  // 4. HOS risk (≤ 4 h drive remaining) — COMPLIANCE
  if (hosDisplay && hosDisplay.driveRem <= 4) {
    return {
      emoji: '⏳', text: `HOS Risk — ${hosDisplay.driveRem.toFixed(1)}h drive remaining`,
      bg: 'rgba(245,194,0,.08)', border: 'rgba(245,194,0,.3)', color: 'var(--warn)',
    }
  }

  // 5. High fatigue — PREFERENCE LAYER (explicit "suggested" language)
  if (fatigueLevel === 'critical') {
    return {
      emoji: '⚠️', text: 'Recovery Stop Suggested — Operational cadence adjustment recommended',
      bg: 'rgba(245,194,0,.08)', border: 'rgba(245,194,0,.25)', color: 'var(--warn)',
    }
  }
  if (fatigueLevel === 'high') {
    return {
      emoji: '🟡', text: 'Recovery Recommended — Suggested stop approaching (not compliance)',
      bg: 'rgba(245,194,0,.06)', border: 'rgba(245,194,0,.2)', color: 'var(--warn)',
    }
  }

  // 6. Wind advisory (gusts 30–44 mph) — SAFETY
  if (gusts >= 30) {
    return {
      emoji: '🌬', text: `Wind Advisory — Gusts ${gusts} mph · Monitor conditions`,
      bg: 'rgba(245,194,0,.07)', border: 'rgba(245,194,0,.2)', color: 'var(--warn)',
    }
  }

  // 7. On schedule — operational rhythm stable
  return {
    emoji: '✅', text: 'On Schedule',
    bg: 'rgba(0,232,176,.07)', border: 'rgba(0,232,176,.2)', color: 'var(--primary)',
  }
}

interface Props {
  hosDisplay:     HOSDisplay | null
  wx:             WeatherInfo | null
  weather:        WeatherData | null
  fatigueLevel?:  FatigueLevel | null   // from recoveryEngine — preference layer only
}

export default function DriveStatusBanner({ hosDisplay, wx, weather, fatigueLevel }: Props) {
  const b = deriveBanner(hosDisplay, wx, weather, fatigueLevel)

  return (
    <div style={{
      width: '100%',
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '.6rem 1rem',
      borderRadius: 12,
      background: b.bg,
      border: `1px solid ${b.border}`,
      flexShrink: 0,
    }}>
      <span style={{ fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}>{b.emoji}</span>
      <span style={{ fontWeight: 800, fontSize: '.9rem', color: b.color, lineHeight: 1.25 }}>
        {b.text}
      </span>
    </div>
  )
}
