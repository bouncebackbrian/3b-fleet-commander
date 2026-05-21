import { getDieselPrice } from '@/lib/scoreLoad'
import type { RigType } from '@/lib/scoreLoad'
import type { LoadMission, WeatherInfo, RoutePreference, MissionStop, MissionStatus, TripReview } from './types'

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
    stops:               Array.isArray(meta.stops) ? (meta.stops as MissionStop[]) : undefined,
    status:              (meta.status as MissionStatus)   ?? 'active',
    tripReview:          meta.tripReview                  as TripReview | undefined,
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
    stops:               Array.isArray((row.metadata as Record<string, unknown>)?.stops)
                         ? ((row.metadata as Record<string, unknown>).stops as MissionStop[])
                         : undefined,
    status:              (row.status as MissionStatus) ?? 'active',
    tripReview:          ((row.metadata as Record<string, unknown>)?.tripReview) as TripReview | undefined,
  }
}

// ── Insert a stop into a mission at a given position ─────────────────────────
// position:
//   'after_current'  — immediately after the first incomplete stop
//   'before_final'   — before the last stop in sequence
//   'end'            — append after all existing stops
//   number           — 0-based array index to insert at
//
// Completed stops are never disturbed; re-sequencing updates all sequence
// values to 1-based contiguous integers after the splice.
export function insertStop(
  mission: LoadMission,
  stop: MissionStop,
  position: 'after_current' | 'before_final' | 'end' | number = 'end',
): LoadMission {
  const sorted = [...(mission.stops ?? [])].sort((a, b) => a.sequence - b.sequence)
  const currentIndex = sorted.findIndex(s => !s.completed)

  let insertAt: number
  if (position === 'after_current') {
    insertAt = currentIndex === -1 ? sorted.length : currentIndex + 1
  } else if (position === 'before_final') {
    insertAt = Math.max(0, sorted.length - 1)
  } else if (position === 'end') {
    insertAt = sorted.length
  } else {
    insertAt = Math.max(0, Math.min(position, sorted.length))
  }

  sorted.splice(insertAt, 0, { ...stop, sequence: insertAt + 1 })

  // Re-sequence 1-based from the beginning
  const resequenced = sorted.map((s, i) => ({ ...s, sequence: i + 1 }))

  return { ...mission, stops: resequenced }
}

// ── Identity context for Supabase rows ───────────────────────────────────────
export type RowIdentity = {
  userId?:     string | null
  businessId?: string | null
}

// ── Serialize a LoadMission for insert into fleet_missions ────────────────────
// identity is optional — null/undefined when running in unauthenticated alpha mode.
//
// business_id is omitted from the row when null/undefined.
// Reason: the column may not exist yet on every deployment, or it may exist as
// uuid (older schema) rather than text (newer schema). Omitting a null value
// is safe — Postgres uses the column default (null) when the field is absent
// from the upsert payload, so no data is lost.
export function missionToRow(m: LoadMission, identity?: RowIdentity): Record<string, unknown> {
  const row: Record<string, unknown> = {
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
    status:                m.status ?? 'active',
    user_id:               identity?.userId ?? null,
    // routePreference, routeNotes, stops, tripReview — all in metadata jsonb
    metadata: {
      routePreference: m.routePreference ?? 'main_corridors',
      routeNotes:      m.routeNotes      ?? null,
      stops:           m.stops           ?? null,
      tripReview:      m.tripReview      ?? null,
    },
  }

  // Only include business_id when a real value exists — avoids type conflicts
  // between deployments where the column is uuid vs text.
  if (identity?.businessId) {
    row.business_id = identity.businessId
  }

  return row
}
