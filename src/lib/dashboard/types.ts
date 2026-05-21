import type { RigType } from '@/lib/scoreLoad'

export type EldMode = 'screenshot' | 'samsara'

export type VehicleSetup = {
  truckNum?: string; trailerNum?: string; year?: string
  make?: string; model?: string; trailerType?: string
}

export type HOSData = {
  status: string | null
  driveRemainingHrs: number | null; shiftRemainingHrs: number | null
  breakInHrs: number | null; cycleRemainingHrs: number | null
  driveUsedHrs: number | null; onDutyUsedHrs: number | null
  lastBreakHrs: number | null; notes: string | null
  scannedAt: string
}

export type SamsaraData = {
  hos: {
    driverName: string | null; status: string | null; statusSince: string | null
    driveRemainingHrs: number; shiftRemainingHrs: number
    breakInHrs: number | null; cycleRemainingHrs: number
  } | null
  location: {
    lat: number | null; lng: number | null; speedMph: number | null
    address: string | null; updatedAt: string | null; vehicleName: string | null
  } | null
  todayMiles: number | null; updatedAt: string; error?: string
}

export type ActiveTrip = {
  origin: { query: string; lat?: number; lon?: number; lng?: number }
  destination: { query: string; lat?: number; lon?: number; lng?: number }
  totalMiles: number; departTime: string; estArrival: string; estDriveHours: string
  loadNumber: string | null
  stops: {
    name: string; city: string; state: string; miFromOrigin: number; eta: string
    stopType: string; diesel: number | null
    showers: { available: number; total: number } | null; recommended: boolean
  }[]
}

export type Expense = {
  id: string; date: string; category: string; amount: number
  description: string; location: string; loadNumber: string
  deductPct: number; isDeductible: boolean; createdAt: string
}

export type WeatherData = {
  temp: number; windSpeed: number; code: number; precip: number; lat: number; lng: number
}

// ── Mission lifecycle status ──────────────────────────────────────────────────
export type MissionStatus = 'active' | 'planned' | 'review_required' | 'completed'

// ── Post-trip review captured at completion ───────────────────────────────────
// Stored in fleet_missions.metadata.tripReview — no migration needed.
export type TripReview = {
  actualStart:   string | null   // ISO datetime — when driver actually departed
  actualEnd:     string | null   // ISO datetime — when delivery was confirmed done
  stopsAccurate: boolean         // all planned stops executed as built?
  detention:     boolean
  parkingIssue:  boolean
  routeProblem:  boolean
  fuelIssue:     boolean
  weatherDelay:  boolean
  receiverDelay: boolean
  wouldRunAgain: boolean
  driverRating:  1 | 2 | 3 | 4 | 5
  notes:         string
  reviewedAt:    string          // ISO datetime when review was submitted
}

// ── Stop lifecycle ────────────────────────────────────────────────────────────
// Ordered progression — arrived is always first, departed always last.
// 'waiting' is optional and may be skipped without breaking the sequence.
export type StopLifecycleStatus =
  | 'arrived'
  | 'checked_in'
  | 'waiting'
  | 'docked'
  | 'work_started'
  | 'work_ended'
  | 'departed'

export type StopDetentionSummary = {
  arrivedAt:        string   // ISO — when detention clock started
  departedAt:       string   // ISO — when clock stopped
  dwellMinutes:     number   // total time at facility
  freeMinutes:      number   // agreed free time (default 120)
  detentionMinutes: number   // max(0, dwellMinutes - freeMinutes)
  detentionAmount:  number   // detentionMinutes / 60 * ratePerHour
  ratePerHour:      number   // default 50
}

// ── stop_events row (audit log — never mutated once written) ──────────────────
export type StopEvent = {
  id:           string
  missionId:    string
  stopId:       string
  stopSequence: number
  eventType:    StopLifecycleStatus
  occurredAt:   string   // ISO
  payload?:     Record<string, unknown>
  notes?:       string
  createdAt:    string
}

// ── Multi-Stop Mission ────────────────────────────────────────────────────────
export type StopType = 'pickup' | 'delivery' | 'relay' | 'fuel' | 'yard' | 'rest' | 'scale' | 'repair' | 'washout' | 'other'

export type MissionStop = {
  id:               string
  sequence:         number        // 1-based display order
  type:             StopType
  name:             string        // facility / store name
  address?:         string        // street address
  city?:            string
  state?:           string
  phone?:           string        // facility phone number
  appointmentStart?: string       // ISO datetime or "YYYY-MM-DD HH:mm"
  appointmentEnd?:   string
  notes?:           string
  reference?:       string        // BOL / REF# / PO#
  completed?:           boolean
  completedAt?:         string                // ISO datetime when marked done
  // Lifecycle (Phase 4G)
  lifecycleStatus?:     StopLifecycleStatus
  lifecycleTimestamps?: Partial<Record<StopLifecycleStatus, string>>  // ISO per step
  detentionSummary?:    StopDetentionSummary
}

// ── Route Preference ─────────────────────────────────────────────────────────
export type RoutePreference =
  | 'main_corridors'   // DEFAULT — interstates + major US highways
  | 'fastest'          // minimize drive time, any route
  | 'fuel_saver'       // optimize for MPG / fuel cost
  | 'avoid_cities'     // bypass metro congestion
  | 'manual_review'    // dispatcher must approve before dispatch

export type RouteRiskLevel = 'LOW' | 'MODERATE' | 'HIGH'

export type RouteRisk = {
  level:       RouteRiskLevel
  reasons:     string[]
  disclaimer:  string | null
  showWarning: boolean
}

export type LoadMission = {
  id: string; loadNumber: string; broker?: string
  origin: string; destination: string; date: string
  dispatchMiles: number; deadheadMiles: number
  grossRate: number; fuelPrice: number; rigType: RigType
  waitHours: number; reloadKnown: boolean; reloadAreaStrength: 1 | 2 | 3
  hasOvernightParking: boolean; loadType: string
  pickup?: string; delivery?: string; commodity?: string
  // Route preference — defaults to 'main_corridors'
  routePreference?: RoutePreference
  routeNotes?:      string          // free-form dispatcher/driver route notes
  // Multi-stop — optional; single-dest missions leave this undefined
  stops?:           MissionStop[]
  // Lifecycle
  status?:          MissionStatus
  tripReview?:      TripReview
}

export type HOSDisplay = {
  driveUsed: number; driveRem: number
  shiftUsed: number; shiftRem: number
  cycleRem: number | null; breakIn: number | null
  status: string | null; source: 'samsara' | 'screenshot'
}

export type WeatherInfo = {
  label: string; emoji: string; severe: boolean; color: string
}

// ── Sync State ───────────────────────────────────────────────────────────────
// Tracks the cloud-sync lifecycle for any write operation.
//   idle       — no pending write
//   saving     — write in flight
//   saved      — last write succeeded (shown briefly then returns to idle)
//   failed     — last write failed (localStorage copy is safe)
//   local_only — Supabase not configured; all data is localStorage-only
export type SyncState = 'idle' | 'saving' | 'saved' | 'failed' | 'local_only'

// ── Operational Memory ────────────────────────────────────────────────────────
export type EventType =
  | 'detention'
  | 'weather_delay'
  | 'fuel_issue'
  | 'receiver_delay'
  | 'parking_issue'
  | 'breakdown'
  | 'route_problem'
  | 'successful_delivery'
  | 'scale_issue'
  | 'traffic_delay'

export type EventSeverity = 'info' | 'warn' | 'critical'

export type OperationalEvent = {
  id:          string
  missionId:   string | null
  loadNumber:  string
  origin:      string
  destination: string
  eventType:   EventType
  severity:    EventSeverity
  notes:       string | null
  location:    string | null
  createdBy:   string | null
  createdAt:   string
}
