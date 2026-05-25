'use client'
/**
 * maintenanceEngine.ts — Tractor PM Scheduler + Maintenance Intelligence
 *
 * Handles:
 *   - PM type definitions + interval config (miles / days / hours)
 *   - TractorMaintenance record per truck
 *   - PMTask lifecycle: due_soon → scheduled → in_service → completed → closed
 *   - Trigger detection: odometer, engine hours, days since last service
 *   - Service location lookup (Love's / Speedco — configurable API + mock fallback)
 *
 * Supabase tables (fire-and-forget write-through):
 *   fleet_tractor_maintenance  — per-tractor PM history
 *   fleet_pm_tasks             — active/pending PM tasks
 *   fleet_pm_schedules         — scheduled service appointments
 *   fleet_service_locations    — cached service location data
 *
 * LS keys:
 *   3b-tractor-maintenance  — TractorMaintenance[]  (max 50)
 *   3b-pm-tasks             — PMTask[]              (max 200)
 *   3b-pm-schedules         — PMSchedule[]          (max 100)
 *   3b-service-locations    — ServiceLocation[]     (max 100)
 *   3b-service-loc-cache    — { lat, lng, ts } cache metadata
 */

import { createClient } from '@/lib/supabase-browser'

// ── PM Types & Intervals ──────────────────────────────────────────────────────

export type PMType =
  | 'oil_change'
  | 'lube_service'
  | 'fuel_filter'
  | 'air_filter'
  | 'dpf_check'
  | 'tire_rotation'
  | 'brake_inspection'
  | 'dot_inspection'
  | 'pm_a'
  | 'pm_b'
  | 'pm_c'

export type PMStatus =
  | 'due_soon'           // within warning window
  | 'overdue'            // past due mileage/date
  | 'scheduled'          // appointment booked
  | 'in_service'         // currently at shop
  | 'completed'          // service done
  | 'receipt_uploaded'   // receipt attached
  | 'verified'           // fleet admin confirmed
  | 'closed'             // archived

export interface PMIntervalConfig {
  label:       string
  emoji:       string
  miles:       number        // service interval in miles
  days:        number        // max days between services
  hours?:      number        // optional engine hours trigger
  warnMiles:   number        // warn when this many miles remain
  warnDays:    number        // warn when this many days remain
  services:    string[]      // services performed at this PM
  description: string
}

/** Standard trucking PM interval schedule */
export const PM_CONFIG: Record<PMType, PMIntervalConfig> = {
  pm_a: {
    label:       'PM A',
    emoji:       '🔧',
    miles:       15_000,
    days:        90,
    hours:       500,
    warnMiles:   2_000,
    warnDays:    14,
    services:    ['Oil change', 'Oil filter', 'Fuel filter', 'Visual inspection', 'Fluid levels'],
    description: '15k-mile service — oil, filters, fluids, visual',
  },
  pm_b: {
    label:       'PM B',
    emoji:       '🔩',
    miles:       30_000,
    days:        180,
    hours:       1_000,
    warnMiles:   3_000,
    warnDays:    21,
    services:    ['PM A items', 'Air filter', 'Belt inspection', 'Coolant check', 'Battery test'],
    description: '30k-mile service — PM A + air filter, belts, coolant',
  },
  pm_c: {
    label:       'PM C',
    emoji:       '⚙️',
    miles:       60_000,
    days:        365,
    hours:       2_000,
    warnMiles:   5_000,
    warnDays:    30,
    services:    ['PM B items', 'Transmission service', 'DPF inspection', 'Brake inspection', 'Wheel seals'],
    description: '60k-mile service — PM B + transmission, DPF, brakes',
  },
  oil_change: {
    label:       'Oil Change',
    emoji:       '🛢️',
    miles:       15_000,
    days:        90,
    hours:       500,
    warnMiles:   2_000,
    warnDays:    14,
    services:    ['Oil change', 'Oil filter'],
    description: 'Engine oil and oil filter replacement',
  },
  lube_service: {
    label:       'Lube Service',
    emoji:       '💧',
    miles:       15_000,
    days:        90,
    warnMiles:   2_000,
    warnDays:    14,
    services:    ['Chassis lubrication', 'U-joints', 'Driveshaft', 'Slack adjusters'],
    description: 'Full chassis lubrication',
  },
  fuel_filter: {
    label:       'Fuel Filter',
    emoji:       '⛽',
    miles:       25_000,
    days:        180,
    warnMiles:   3_000,
    warnDays:    21,
    services:    ['Primary fuel filter', 'Secondary fuel filter', 'Water separator'],
    description: 'Fuel filter and water separator replacement',
  },
  air_filter: {
    label:       'Air Filter',
    emoji:       '🌀',
    miles:       30_000,
    days:        180,
    warnMiles:   3_000,
    warnDays:    21,
    services:    ['Primary air filter', 'Pre-cleaner'],
    description: 'Engine air filter replacement',
  },
  dpf_check: {
    label:       'DPF Check',
    emoji:       '🔥',
    miles:       50_000,
    days:        365,
    warnMiles:   5_000,
    warnDays:    30,
    services:    ['DPF inspection', 'DPF cleaning if needed', 'EGR check', 'DEF system check'],
    description: 'Diesel particulate filter inspection and cleaning',
  },
  tire_rotation: {
    label:       'Tire Rotation',
    emoji:       '🔵',
    miles:       25_000,
    days:        180,
    warnMiles:   3_000,
    warnDays:    21,
    services:    ['Drive axle rotation', 'Tire inspection', 'Torque check'],
    description: 'Drive axle tire rotation and inspection',
  },
  brake_inspection: {
    label:       'Brake Inspection',
    emoji:       '🔴',
    miles:       25_000,
    days:        90,
    warnMiles:   3_000,
    warnDays:    14,
    services:    ['Brake lining measurement', 'Drum/rotor inspection', 'Slack adjuster check', 'Air system test'],
    description: 'Full brake system inspection',
  },
  dot_inspection: {
    label:       'DOT Inspection',
    emoji:       '⚖️',
    miles:       999_999,  // date-driven only
    days:        365,
    warnMiles:   999_999,
    warnDays:    30,
    services:    ['Annual DOT inspection', 'All systems inspection', 'Safety compliance check'],
    description: 'Annual DOT safety inspection',
  },
}

// ── Service Locations (Love's / Speedco) ──────────────────────────────────────

export type ServiceBrand = 'loves' | 'speedco' | 'petro' | 'ta' | 'pilot' | 'flying_j' | 'other'

export interface ServiceLocation {
  id:             string
  name:           string
  brand:          ServiceBrand
  address:        string
  city:           string
  state:          string
  zip?:           string
  lat:            number
  lng:            number
  phone?:         string
  services:       string[]    // services available at this location
  hours?:         string      // human-readable hours
  hasSpeedco:     boolean
  hasFuelDesk:    boolean
  hasParking:     boolean
  distanceMiles?: number      // computed at query time
  milesAhead?:    number      // on current route (if route data available)
  estimatedWait?: string      // e.g. "~30 min"
  fetchedAt?:     string
}

// Mock Love's / Speedco locations — realistic corridor data
// Used as fallback when no API is configured
const MOCK_SERVICE_LOCATIONS: Omit<ServiceLocation, 'distanceMiles' | 'milesAhead'>[] = [
  { id: 'loves-wells-nv',    name: "Love's Travel Stop #634",    brand: 'loves',     address: '1595 6th St',            city: 'Wells',        state: 'NV', lat: 41.1119, lng: -114.9616, phone: '775-752-3321', services: ['Oil change','Tire service','Speedco'], hours: '24 hrs',    hasSpeedco: true,  hasFuelDesk: true,  hasParking: true },
  { id: 'loves-elko-nv',     name: "Love's Travel Stop #289",    brand: 'loves',     address: '3990 E Idaho St',         city: 'Elko',         state: 'NV', lat: 40.8391, lng: -115.7219, phone: '775-738-8873', services: ['Oil change','Tire service','DEF','Speedco'], hours: '24 hrs', hasSpeedco: true,  hasFuelDesk: true,  hasParking: true },
  { id: 'loves-winnemucca-nv',name: "Love's Travel Stop #481",   brand: 'loves',     address: '5880 E Winnemucca Blvd',  city: 'Winnemucca',   state: 'NV', lat: 40.9657, lng: -117.6868, phone: '775-625-4800', services: ['Oil change','Tire repair','DEF'],       hours: '24 hrs',    hasSpeedco: false, hasFuelDesk: true,  hasParking: true },
  { id: 'speedco-salt-lake',  name: 'Speedco #305',               brand: 'speedco',   address: '3490 W 2100 S',           city: 'Salt Lake City',state: 'UT', lat: 40.7127, lng: -111.9576, phone: '801-975-8090', services: ['Oil change','Lube','Transmission','Tires'],hours: 'Mon-Fri 6a-10p Sat 6a-6p', hasSpeedco: true, hasFuelDesk: false, hasParking: false },
  { id: 'loves-slc-ut',       name: "Love's Travel Stop #732",    brand: 'loves',     address: '280 N Redwood Rd',        city: 'North Salt Lake',state: 'UT', lat: 40.8479, lng: -111.9091, phone: '801-936-7980', services: ['Oil change','Tire service','DEF'],      hours: '24 hrs',    hasSpeedco: true,  hasFuelDesk: true,  hasParking: true },
  { id: 'loves-ogden-ut',     name: "Love's Travel Stop #801",    brand: 'loves',     address: '1110 W 21st St',          city: 'Ogden',        state: 'UT', lat: 41.2230, lng: -111.9993, phone: '801-627-4630', services: ['Oil change','DEF','Tire service'],      hours: '24 hrs',    hasSpeedco: false, hasFuelDesk: true,  hasParking: true },
  { id: 'ta-reno-nv',         name: 'TA Reno',                    brand: 'ta',        address: '2255 Victorian Ave',      city: 'Sparks',       state: 'NV', lat: 39.5349, lng: -119.7531, phone: '775-358-8611', services: ['Full service','Oil','Tires','Brakes'],  hours: '24 hrs',    hasSpeedco: false, hasFuelDesk: true,  hasParking: true },
  { id: 'loves-sacramento-ca',name: "Love's Travel Stop #545",    brand: 'loves',     address: '5301 Raley Blvd',         city: 'Sacramento',   state: 'CA', lat: 38.6693, lng: -121.3855, phone: '916-920-3990', services: ['Tire service','DEF','Speedco'],         hours: '24 hrs',    hasSpeedco: true,  hasFuelDesk: true,  hasParking: true },
  { id: 'loves-ontario-ca',   name: "Love's Travel Stop #476",    brand: 'loves',     address: '1750 E Holt Blvd',        city: 'Ontario',      state: 'CA', lat: 34.0634, lng: -117.5877, phone: '909-983-1290', services: ['Oil change','Tires','DEF','Speedco'],   hours: '24 hrs',    hasSpeedco: true,  hasFuelDesk: true,  hasParking: true },
  { id: 'loves-phoenix-az',   name: "Love's Travel Stop #622",    brand: 'loves',     address: '5135 W Buckeye Rd',       city: 'Phoenix',      state: 'AZ', lat: 33.4480, lng: -112.1435, phone: '602-278-9400', services: ['Oil change','Lube','Tires','DEF'],      hours: '24 hrs',    hasSpeedco: false, hasFuelDesk: true,  hasParking: true },
  { id: 'speedco-albuquerque',name: 'Speedco #212',               brand: 'speedco',   address: '6901 Pan American Fwy NE',city: 'Albuquerque',  state: 'NM', lat: 35.1493, lng: -106.5694, phone: '505-828-0222', services: ['Quick lube','Tire rotation','Filters'],hours: 'Mon-Sat 6a-8p',          hasSpeedco: true,  hasFuelDesk: false, hasParking: false },
  { id: 'loves-denver-co',    name: "Love's Travel Stop #557",    brand: 'loves',     address: '4400 Brighton Blvd',      city: 'Denver',       state: 'CO', lat: 39.7721, lng: -104.9640, phone: '303-297-3300', services: ['Oil change','Tires','DEF','Speedco'],   hours: '24 hrs',    hasSpeedco: true,  hasFuelDesk: true,  hasParking: true },
  { id: 'loves-dallas-tx',    name: "Love's Travel Stop #399",    brand: 'loves',     address: '2525 N Stemmons Fwy',     city: 'Dallas',       state: 'TX', lat: 32.8001, lng: -96.8786,  phone: '214-634-5800', services: ['Oil change','Lube','Tires','DEF'],      hours: '24 hrs',    hasSpeedco: false, hasFuelDesk: true,  hasParking: true },
  { id: 'loves-chicago-il',   name: "Love's Travel Stop #711",    brand: 'loves',     address: '3459 S Wentworth Ave',    city: 'Chicago',      state: 'IL', lat: 41.8339, lng: -87.6320,  phone: '312-624-0890', services: ['Oil change','DEF','Tires'],             hours: '24 hrs',    hasSpeedco: false, hasFuelDesk: true,  hasParking: true },
  { id: 'pilot-memphis-tn',   name: 'Pilot Travel Center #424',   brand: 'pilot',     address: '6055 Shelby Dr',          city: 'Memphis',      state: 'TN', lat: 35.0203, lng: -89.8715,  phone: '901-363-4400', services: ['Oil change','Tires','Brakes','DEF'],    hours: '24 hrs',    hasSpeedco: true,  hasFuelDesk: true,  hasParking: true },
]

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PMRecord {
  id:            string
  pmType:        PMType
  completedAt:   string
  odometerAt:    number
  engineHoursAt?: number
  serviceLocation?: string
  cost?:         number
  receiptDocId?: string
  notes?:        string
  techName?:     string
}

export interface TractorMaintenance {
  id:              string
  truckNumber:     string
  make?:           string
  model?:          string
  year?:           string
  currentOdometer: number        // miles
  engineHours?:    number
  pmHistory:       PMRecord[]
  notes?:          string
  supabaseId?:     string
  createdAt:       string
  updatedAt:       string
}

export interface PMTask {
  id:                  string
  truckNumber:         string
  pmType:              PMType
  status:              PMStatus
  dueAtOdometer?:      number    // odometer reading when due
  dueByDate?:          string    // ISO date when due by days
  currentOdometer:     number
  milesUntilDue:       number    // negative = overdue by this many miles
  daysUntilDue?:       number    // negative = overdue by this many days
  scheduledServiceId?: string    // ref to PMSchedule if scheduled
  serviceLocationId?:  string
  completedAt?:        string
  receiptDocId?:       string
  notes?:              string
  supabaseId?:         string
  createdAt:           string
  updatedAt:           string
}

export interface PMSchedule {
  id:                 string
  pmTaskId:           string
  truckNumber:        string
  pmType:             PMType
  serviceLocationId:  string
  scheduledFor?:      string    // ISO datetime if appointment booked
  estimatedCost?:     number
  confirmationCode?:  string
  status:             'pending' | 'confirmed' | 'completed' | 'cancelled'
  notes?:             string
  supabaseId?:        string
  createdAt:          string
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const LS = {
  maintenance:  '3b-tractor-maintenance',
  pmTasks:      '3b-pm-tasks',
  pmSchedules:  '3b-pm-schedules',
  locations:    '3b-service-locations',
  locCache:     '3b-service-loc-cache',
}

function lsRead<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}
function lsSave<T>(key: string, list: T[], max = 200) {
  localStorage.setItem(key, JSON.stringify((list as T[]).slice(0, max)))
}
function uid() { return `pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
function sb() { try { return createClient() } catch { return null } }
function sbFire(q: PromiseLike<unknown>) { Promise.resolve(q).catch(() => { /* silent */ }) }

// ── Trigger engine ────────────────────────────────────────────────────────────

export interface PMTriggerResult {
  pmType:        PMType
  status:        PMStatus
  milesUntilDue: number    // negative = overdue
  daysUntilDue?: number
  dueAtOdometer: number
  dueByDate?:    string
  config:        PMIntervalConfig
}

/**
 * Given a truck's current odometer, engine hours, and PM history,
 * compute which PM types are due or due soon.
 */
export function detectDuePMs(
  truckMaintenance: TractorMaintenance,
  opts?: { includeAll?: boolean },
): PMTriggerResult[] {
  const results: PMTriggerResult[] = []
  const now = Date.now()

  for (const [type, config] of Object.entries(PM_CONFIG) as [PMType, PMIntervalConfig][]) {
    // Skip granular items if pm_a/pm_b/pm_c cover them
    // (Only skip if user is tracking PM A/B/C explicitly)
    const hasPMHistory = truckMaintenance.pmHistory.some(h =>
      h.pmType === 'pm_a' || h.pmType === 'pm_b' || h.pmType === 'pm_c',
    )
    if (hasPMHistory && ['oil_change', 'lube_service', 'fuel_filter', 'air_filter'].includes(type)) {
      continue  // covered by PM A/B/C
    }

    // Find the most recent completion of this PM type
    const lastService = [...truckMaintenance.pmHistory]
      .filter(h => h.pmType === type)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0]

    const lastOdo  = lastService?.odometerAt ?? 0
    const lastDate = lastService?.completedAt ? new Date(lastService.completedAt).getTime() : 0

    // Compute mileage-based trigger
    const dueAtOdo    = lastOdo + config.miles
    const milesUntil  = dueAtOdo - truckMaintenance.currentOdometer

    // Compute date-based trigger
    const dueByDate   = lastDate
      ? new Date(lastDate + config.days * 86_400_000).toISOString()
      : undefined
    const daysUntil   = dueByDate
      ? Math.floor((new Date(dueByDate).getTime() - now) / 86_400_000)
      : undefined

    const isOverdue   = milesUntil < 0 || (daysUntil !== undefined && daysUntil < 0)
    const isDueSoon   = !isOverdue && (milesUntil <= config.warnMiles || (daysUntil !== undefined && daysUntil <= config.warnDays))

    if (isOverdue || isDueSoon || opts?.includeAll) {
      results.push({
        pmType:        type,
        status:        isOverdue ? 'overdue' : 'due_soon',
        milesUntilDue: milesUntil,
        daysUntilDue:  daysUntil,
        dueAtOdometer: dueAtOdo,
        dueByDate,
        config,
      })
    }
  }

  // Sort by urgency: overdue first, then by fewest miles remaining
  return results.sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1
    if (b.status === 'overdue' && a.status !== 'overdue') return  1
    return a.milesUntilDue - b.milesUntilDue
  })
}

// ── Service location queries ──────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R  = 6371
  const dL = (lat2 - lat1) * Math.PI / 180
  const dG = (lng2 - lng1) * Math.PI / 180
  const a  = Math.sin(dL / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dG / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineKm(lat1, lng1, lat2, lng2) * 0.621371
}

const LOC_CACHE_TTL = 30 * 60 * 1000  // 30 min

/**
 * Find Love's / Speedco / TA service locations near a coordinate.
 * Uses configurable API endpoint (NEXT_PUBLIC_LOVEFINDER_ENDPOINT) if set,
 * otherwise falls back to curated mock data sorted by distance.
 */
export async function findServiceLocations(
  lat: number,
  lng: number,
  radiusMiles = 200,
): Promise<ServiceLocation[]> {
  // Check localStorage cache
  try {
    const meta = JSON.parse(localStorage.getItem(LS.locCache) ?? '{}')
    const age  = Date.now() - (meta.ts ?? 0)
    const dist = haversineMiles(lat, lng, meta.lat ?? 0, meta.lng ?? 0)
    if (age < LOC_CACHE_TTL && dist < 20) {
      const cached = lsRead<ServiceLocation>(LS.locations)
      if (cached.length > 0) return cached
    }
  } catch { /* miss — continue */ }

  // Try configurable API endpoint
  const apiEndpoint = process.env.NEXT_PUBLIC_LOVEFINDER_ENDPOINT
  if (apiEndpoint) {
    try {
      const res = await fetch(
        `${apiEndpoint}?lat=${lat}&lng=${lng}&radius=${radiusMiles}`,
        { signal: AbortSignal.timeout(5000) },
      )
      if (res.ok) {
        const data: ServiceLocation[] = await res.json()
        const hydrated = data.map(loc => ({
          ...loc,
          distanceMiles: haversineMiles(lat, lng, loc.lat, loc.lng),
          fetchedAt:     new Date().toISOString(),
        })).sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999))

        lsSave(LS.locations, hydrated, 100)
        localStorage.setItem(LS.locCache, JSON.stringify({ lat, lng, ts: Date.now() }))
        return hydrated
      }
    } catch { /* fall through to mock */ }
  }

  // Mock fallback — filter by radius and sort by distance
  const locations = MOCK_SERVICE_LOCATIONS
    .map(loc => ({
      ...loc,
      distanceMiles: Math.round(haversineMiles(lat, lng, loc.lat, loc.lng)),
      fetchedAt:     new Date().toISOString(),
    }))
    .filter(loc => (loc.distanceMiles ?? 999) <= radiusMiles)
    .sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999))

  lsSave(LS.locations, locations, 100)
  localStorage.setItem(LS.locCache, JSON.stringify({ lat, lng, ts: Date.now() }))
  return locations
}

/** Nearest single service location from cached data (synchronous) */
export function getNearestServiceLocation(
  lat: number, lng: number,
): ServiceLocation | null {
  const all = lsRead<ServiceLocation>(LS.locations)
  if (all.length === 0) return null
  return [...all]
    .map(l => ({ ...l, distanceMiles: haversineMiles(lat, lng, l.lat, l.lng) }))
    .sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999))[0] ?? null
}

// ── TractorMaintenance CRUD ───────────────────────────────────────────────────

export function getTractorMaintenance(truckNumber?: string): TractorMaintenance[] {
  const all = lsRead<TractorMaintenance>(LS.maintenance)
  return truckNumber ? all.filter(t => t.truckNumber === truckNumber) : all
}

export function getTractorRecord(truckNumber: string): TractorMaintenance | undefined {
  return lsRead<TractorMaintenance>(LS.maintenance).find(t => t.truckNumber === truckNumber)
}

export async function saveTractorMaintenance(
  input: Omit<TractorMaintenance, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<TractorMaintenance, 'pmHistory'>>,
): Promise<TractorMaintenance> {
  const now  = new Date().toISOString()
  const all  = lsRead<TractorMaintenance>(LS.maintenance)
  const existing = all.find(t => t.truckNumber === input.truckNumber)

  const record: TractorMaintenance = {
    ...existing,
    ...input,
    id:        existing?.id ?? uid(),
    pmHistory: input.pmHistory ?? existing?.pmHistory ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  const idx = all.findIndex(t => t.truckNumber === input.truckNumber)
  if (idx !== -1) all[idx] = record
  else all.unshift(record)
  lsSave(LS.maintenance, all, 50)

  const client = sb()
  if (client) {
    sbFire(client.from('fleet_tractor_maintenance').upsert({
      truck_number:     record.truckNumber,
      make:             record.make           ?? null,
      model:            record.model          ?? null,
      year:             record.year           ?? null,
      current_odometer: record.currentOdometer,
      engine_hours:     record.engineHours    ?? null,
      pm_history:       record.pmHistory,
      notes:            record.notes          ?? null,
    }, { onConflict: 'truck_number' }))
  }

  return record
}

export async function logPMCompletion(
  truckNumber: string,
  pmType: PMType,
  completion: Omit<PMRecord, 'id' | 'pmType'>,
): Promise<void> {
  const all  = lsRead<TractorMaintenance>(LS.maintenance)
  const idx  = all.findIndex(t => t.truckNumber === truckNumber)
  if (idx === -1) return

  const record: PMRecord = { ...completion, id: uid(), pmType }
  all[idx].pmHistory = [record, ...all[idx].pmHistory]
  all[idx].updatedAt = new Date().toISOString()
  lsSave(LS.maintenance, all, 50)

  // Update PM task status
  const tasks = lsRead<PMTask>(LS.pmTasks)
  const tIdx  = tasks.findIndex(t => t.truckNumber === truckNumber && t.pmType === pmType && t.status !== 'closed')
  if (tIdx !== -1) {
    tasks[tIdx].status      = completion.receiptDocId ? 'receipt_uploaded' : 'completed'
    tasks[tIdx].completedAt = completion.completedAt
    tasks[tIdx].updatedAt   = new Date().toISOString()
    lsSave(LS.pmTasks, tasks, 200)
  }
}

// ── PMTask CRUD ───────────────────────────────────────────────────────────────

export function getPMTasks(truckNumber?: string): PMTask[] {
  const all = lsRead<PMTask>(LS.pmTasks)
  return truckNumber ? all.filter(t => t.truckNumber === truckNumber) : all
}

export function getActivePMTasks(truckNumber?: string): PMTask[] {
  return getPMTasks(truckNumber).filter(t =>
    t.status !== 'closed' && t.status !== 'verified',
  )
}

export async function upsertPMTask(
  input: Omit<PMTask, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<PMTask> {
  const now   = new Date().toISOString()
  const tasks = lsRead<PMTask>(LS.pmTasks)
  const existing = tasks.find(
    t => t.truckNumber === input.truckNumber && t.pmType === input.pmType && t.status !== 'closed',
  )

  const task: PMTask = {
    ...existing,
    ...input,
    id:        existing?.id ?? uid(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  const idx = existing ? tasks.findIndex(t => t.id === existing.id) : -1
  if (idx !== -1) tasks[idx] = task
  else tasks.unshift(task)
  lsSave(LS.pmTasks, tasks, 200)

  const client = sb()
  if (client) {
    sbFire(client.from('fleet_pm_tasks').upsert({
      id:             task.id,
      truck_number:   task.truckNumber,
      pm_type:        task.pmType,
      status:         task.status,
      due_at_odometer:task.dueAtOdometer ?? null,
      due_by_date:    task.dueByDate     ?? null,
      miles_until_due:task.milesUntilDue,
      days_until_due: task.daysUntilDue  ?? null,
      completed_at:   task.completedAt   ?? null,
      receipt_doc_id: task.receiptDocId  ?? null,
      notes:          task.notes         ?? null,
    }, { onConflict: 'id' }))
  }

  return task
}

// ── PM Schedule CRUD ──────────────────────────────────────────────────────────

export function getPMSchedules(truckNumber?: string): PMSchedule[] {
  const all = lsRead<PMSchedule>(LS.pmSchedules)
  return truckNumber ? all.filter(s => s.truckNumber === truckNumber) : all
}

export async function savePMSchedule(
  input: Omit<PMSchedule, 'id' | 'createdAt'>,
): Promise<PMSchedule> {
  const now       = new Date().toISOString()
  const schedules = lsRead<PMSchedule>(LS.pmSchedules)

  const schedule: PMSchedule = { ...input, id: uid(), createdAt: now }
  schedules.unshift(schedule)
  lsSave(LS.pmSchedules, schedules, 100)

  // Mark PM task as scheduled
  const tasks = lsRead<PMTask>(LS.pmTasks)
  const idx   = tasks.findIndex(t => t.id === input.pmTaskId)
  if (idx !== -1) {
    tasks[idx].status              = 'scheduled'
    tasks[idx].scheduledServiceId  = schedule.id
    tasks[idx].serviceLocationId   = input.serviceLocationId
    tasks[idx].updatedAt           = now
    lsSave(LS.pmTasks, tasks, 200)
  }

  const client = sb()
  if (client) {
    sbFire(client.from('fleet_pm_schedules').insert({
      id:                  schedule.id,
      pm_task_id:          schedule.pmTaskId,
      truck_number:        schedule.truckNumber,
      pm_type:             schedule.pmType,
      service_location_id: schedule.serviceLocationId,
      scheduled_for:       schedule.scheduledFor    ?? null,
      estimated_cost:      schedule.estimatedCost   ?? null,
      confirmation_code:   schedule.confirmationCode ?? null,
      status:              schedule.status,
      notes:               schedule.notes           ?? null,
    }))
  }

  return schedule
}

// ── Sync — auto-detect PM tasks from maintenance records ─────────────────────

/**
 * Call this when odometer or engine hours are updated.
 * Auto-creates/updates PMTask records based on current trigger state.
 */
export function syncPMTasks(truckNumber: string): PMTask[] {
  const record = getTractorRecord(truckNumber)
  if (!record) return []

  const triggers = detectDuePMs(record)
  const created:  PMTask[] = []

  for (const trigger of triggers) {
    upsertPMTask({
      truckNumber,
      pmType:        trigger.pmType,
      status:        trigger.status,
      dueAtOdometer: trigger.dueAtOdometer,
      dueByDate:     trigger.dueByDate,
      currentOdometer: record.currentOdometer,
      milesUntilDue: trigger.milesUntilDue,
      daysUntilDue:  trigger.daysUntilDue,
    }).then(t => created.push(t)).catch(() => { /* silent */ })
  }

  return getPMTasks(truckNumber).filter(t => t.status !== 'closed')
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function formatMilesUntil(miles: number): string {
  if (miles < 0)  return `${Math.abs(Math.round(miles)).toLocaleString()} mi overdue`
  if (miles < 500) return `${Math.round(miles)} mi`
  return `${Math.round(miles / 100) * 100 === miles ? miles.toLocaleString() : Math.round(miles).toLocaleString()} mi`
}

export function pmStatusColor(status: PMStatus): string {
  switch (status) {
    case 'overdue':          return 'var(--error)'
    case 'due_soon':         return 'var(--warn)'
    case 'scheduled':        return '#60c8ff'
    case 'in_service':       return 'var(--primary)'
    case 'completed':
    case 'receipt_uploaded':
    case 'verified':
    case 'closed':           return 'var(--success)'
    default:                 return 'var(--muted)'
  }
}

export function pmStatusLabel(status: PMStatus): string {
  switch (status) {
    case 'due_soon':         return 'Due Soon'
    case 'overdue':          return 'Overdue'
    case 'scheduled':        return 'Scheduled'
    case 'in_service':       return 'In Service'
    case 'completed':        return 'Completed'
    case 'receipt_uploaded': return 'Receipt Uploaded'
    case 'verified':         return 'Verified'
    case 'closed':           return 'Closed'
    default:                 return status
  }
}

/** Active context from fleet settings */
export function getMaintenanceContext(): { truckNumber: string; odometer: number } {
  try {
    const s = JSON.parse(localStorage.getItem('3b-fleet-settings') ?? '{}')
    return {
      truckNumber: s.truckNum   ?? '',
      odometer:    s.odometer   ? parseInt(s.odometer, 10) : 0,
    }
  } catch { return { truckNumber: '', odometer: 0 } }
}
