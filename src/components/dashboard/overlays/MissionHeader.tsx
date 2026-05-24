'use client'
/**
 * MissionHeader — persistent mission anchor bar inside Drive Mode
 *
 * Always visible: Load #, Tractor #, Trailer #, Destination, ETA, HOS, Fuel
 * Sits between the Spotify strip and the alert strip.
 * Horizontally scrollable so nothing wraps on small screens.
 */
import type { LoadMission, HOSDisplay, ActiveTrip, VehicleSetup } from '@/lib/dashboard/types'
import type { FuelIntelResult } from '@/lib/scoreLoad'

function fmtHrs(h: number): string {
  const m = Math.round(h * 60)
  if (m < 60) return `${m}m`
  const hh = Math.floor(m / 60)
  const mm = m % 60
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`
}

interface Props {
  mission:     LoadMission | null
  vehicle:     VehicleSetup | null
  hosDisplay:  HOSDisplay | null
  missionFuel: FuelIntelResult | null
  nextStop:    ActiveTrip['stops'][number] | undefined
}

export default function MissionHeader({ mission, vehicle, hosDisplay, missionFuel, nextStop }: Props) {
  if (!mission && !vehicle) return null

  const truckNum   = mission?.tractorId  ?? vehicle?.truckNum   ?? null
  const trailerNum = mission?.trailerNum ?? vehicle?.trailerNum ?? null

  const hosColor = !hosDisplay
    ? 'var(--primary)'
    : hosDisplay.driveRem <= 2 ? 'var(--error)'
    : hosDisplay.driveRem <= 4 ? 'var(--warn)'
    : 'var(--primary)'

  let etaDisplay: string | null = null
  if (nextStop?.eta) {
    try {
      etaDisplay = new Date(nextStop.eta).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
    } catch { /* ignore */ }
  }

  const fuelSummary = missionFuel && missionFuel.totalMiles > 0
    ? `~${missionFuel.gallonsNeeded}gal`
    : null

  const hasIds  = !!(mission?.loadNumber || truckNum || trailerNum)
  const hasData = !!(mission?.destination || etaDisplay || hosDisplay || fuelSummary)

  return (
    <div style={{
      flexShrink: 0,
      background: 'rgba(3,10,9,0.97)',
      borderBottom: '1px solid rgba(0,232,176,.1)',
      padding: '.3rem .9rem',
      display: 'flex', alignItems: 'center',
      overflowX: 'auto', scrollbarWidth: 'none',
      WebkitOverflowScrolling: 'touch',
    }}>

      {/* Identity chips — Load, Tractor, Trailer */}
      {mission?.loadNumber && (
        <Chip label="LOAD" value={`#${mission.loadNumber}`} color="var(--primary)" />
      )}
      {truckNum   && <Chip label="🚛" value={truckNum} />}
      {trailerNum && <Chip label="📦" value={trailerNum} />}

      {/* Divider between identity and operational data */}
      {hasIds && hasData && (
        <div style={{ width: 1, height: 20, background: 'rgba(0,232,176,.15)', margin: '0 8px', flexShrink: 0 }} />
      )}

      {/* Operational chips — Destination, ETA, HOS, Fuel */}
      {mission?.destination && (
        <Chip label="📍" value={mission.destination.split(',')[0]} />
      )}
      {etaDisplay && (
        <Chip label="🕒" value={etaDisplay} />
      )}
      {hosDisplay && (
        <Chip label="⏳" value={fmtHrs(hosDisplay.driveRem)} color={hosColor} />
      )}
      {fuelSummary && (
        <Chip label="⛽" value={fuelSummary} />
      )}
    </div>
  )
}

function Chip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 3,
      padding: '.18rem .45rem',
    }}>
      <span style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700, lineHeight: 1, letterSpacing: '.03em' }}>
        {label}
      </span>
      <span style={{
        fontSize: '.73rem', fontWeight: 900, lineHeight: 1,
        color: color ?? 'var(--text)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </span>
    </div>
  )
}
