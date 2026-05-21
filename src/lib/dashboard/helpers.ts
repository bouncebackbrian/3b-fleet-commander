import { getDieselPrice } from '@/lib/scoreLoad'
import type { RigType } from '@/lib/scoreLoad'
import type { LoadMission, WeatherInfo, RoutePreference } from './types'

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export const todayISO = () => new Date().toISOString().slice(0, 10)

export function weatherInfo(code: number): WeatherInfo {
  if (code === 0)                  return { label: 'Clear sky',     emoji: '☀️',  severe: false, color: '#f5c200' }
  if (code <= 3)                   return { label: 'Partly cloudy', emoji: '⛅',  severe: false, color: 'var(--muted)' }
  if (code === 45 || code === 48)  return { label: 'Foggy',         emoji: '🌫️', severe: true,  color: 'var(--warn)' }
  if (code <= 55)                  return { label: 'Drizzle',        emoji: '🌦️', severe: false, color: '#6c9bd2' }
  if (code <= 65)                  return { label: 'Rain',           emoji: '🌧️', severe: code >= 63, color: code >= 63 ? 'var(--warn)' : '#6c9bd2' }
  if (code <= 77)                  return { label: 'Snow / Ice',     emoji: '❄️',  severe: code >= 71, color: code >= 71 ? 'var(--error)' : '#6c9bd2' }
  if (code <= 82)                  return { label: 'Rain showers',   emoji: '🌧️', severe: code === 82, color: '#6c9bd2' }
  if (code <= 86)                  return { label: 'Snow showers',   emoji: '❄️',  severe: true,  color: 'var(--error)' }
  if (code >= 95)                  return { label: 'Thunderstorm',   emoji: '⛈️',  severe: true,  color: 'var(--error)' }
  return                                  { label: 'Overcast',       emoji: '☁️',  severe: false, color: 'var(--muted)' }
}

export const QUICK_CATS = [
  { id: 'fuel',    label: 'Fuel',    emoji: '⛽', deductPct: 100 },
  { id: 'parking', label: 'Parking', emoji: '🅿️', deductPct: 100 },
  { id: 'meals',   label: 'Meals',   emoji: '🍔', deductPct: 80  },
  { id: 'tolls',   label: 'Tolls',   emoji: '🛣️', deductPct: 100 },
  { id: 'repairs', label: 'Repairs', emoji: '🔧', deductPct: 100 },
  { id: 'other',   label: 'Other',   emoji: '📄', deductPct: 100 },
]

// ── Parse from existing `loads` table (META-encoded notes) ───────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseMission(row: any): LoadMission {
  const notes = row.notes ?? ''
  let meta: Record<string, unknown> = {}
  try { const m = notes.match(/\[META:(.*?)\]$/); if (m) meta = JSON.parse(m[1]) } catch { /* ignore */ }
  return {
    id:                  row.id,
    loadNumber:          row.load_number   ?? '',
    broker:              row.broker        ?? undefined,
    origin:              row.origin        ?? '',
    destination:         row.destination   ?? '',
    date:                row.date          ?? '',
    dispatchMiles:       Number(row.dispatch_miles)  || 0,
    deadheadMiles:       Number(row.deadhead_miles)  || 0,
    grossRate:           Number(meta.grossRate)       || 0,
    fuelPrice:           parseFloat(String(meta.fuelPrice)) || getDieselPrice(row.origin ?? ''),
    rigType:             (meta.rigType as RigType)    || 'semi-solo',
    waitHours:           Number(row.wait_hours)       || 0,
    reloadKnown:         Boolean(meta.reloadKnown),
    reloadAreaStrength:  (meta.reloadAreaStrength as 1 | 2 | 3) || 2,
    hasOvernightParking: Boolean(meta.hasOvernightParking),
    loadType:            String(meta.loadType || 'FTL'),
    pickup:              meta.pickup          as string | undefined,
    delivery:            meta.delivery        as string | undefined,
    commodity:           meta.commodity       as string | undefined,
    routePreference:     (meta.routePreference as RoutePreference) ?? 'main_corridors',
    routeNotes:          meta.routeNotes      as string | undefined,
  }
}

// ── Parse from `fleet_missions` table (proper columns, no META hack) ─────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFleetMission(row: any): LoadMission {
  return {
    id:                  row.id,
    loadNumber:          row.load_number           ?? '',
    broker:              row.broker                ?? undefined,
    origin:              row.origin                ?? '',
    destination:         row.destination           ?? '',
    date:                row.date                  ?? '',
    dispatchMiles:       Number(row.dispatch_miles) || 0,
    deadheadMiles:       Number(row.deadhead_miles) || 0,
    grossRate:           Number(row.gross_rate)     || 0,
    fuelPrice:           Number(row.fuel_price)     || getDieselPrice(row.origin ?? ''),
    rigType:             (row.rig_type as RigType)  || 'semi-solo',
    waitHours:           Number(row.wait_hours)     || 0,
    reloadKnown:         Boolean(row.reload_known),
    reloadAreaStrength:  (row.reload_area_strength as 1 | 2 | 3) || 2,
    hasOvernightParking: Boolean(row.has_overnight_parking),
    loadType:            row.load_type              || 'FTL',
    pickup:              row.pickup    ?? undefined,
    delivery:            row.delivery  ?? undefined,
    commodity:           row.commodity ?? undefined,
    // Route preference — column may not exist yet; fall back to metadata jsonb
    routePreference:     (row.route_preference as RoutePreference)
                         ?? ((row.metadata as Record<string, unknown>)?.routePreference as RoutePreference)
                         ?? 'main_corridors',
    routeNotes:          row.route_notes
                         ?? ((row.metadata as Record<string, unknown>)?.routeNotes as string | undefined)
                         ?? undefined,
  }
}

// ── Serialize a LoadMission for insert into fleet_missions ────────────────────
export function missionToRow(m: LoadMission): Record<string, unknown> {
  return {
    id:                    m.id,
    load_number:           m.loadNumber || '',
    broker:                m.broker ?? null,
    origin:                m.origin,
    destination:           m.destination,
    date:                  m.date || todayISO(),
    dispatch_miles:        m.dispatchMiles,
    deadhead_miles:        m.deadheadMiles,
    gross_rate:            m.grossRate,
    fuel_price:            m.fuelPrice,
    rig_type:              m.rigType,
    wait_hours:            m.waitHours,
    reload_known:          m.reloadKnown,
    reload_area_strength:  m.reloadAreaStrength,
    has_overnight_parking: m.hasOvernightParking,
    load_type:             m.loadType,
    pickup:                m.pickup    ?? null,
    delivery:              m.delivery  ?? null,
    commodity:             m.commodity ?? null,
    status:                'active',
    // routePreference + routeNotes stored in metadata jsonb — no column migration needed
    metadata: {
      routePreference: m.routePreference ?? 'main_corridors',
      routeNotes:      m.routeNotes      ?? null,
    },
  }
}
