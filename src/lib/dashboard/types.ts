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

// ── Movement mode for expenses / fuel ────────────────────────────────────────
// Describes the truck's operational state when the cost was incurred.
export type MovementMode = 'loaded' | 'empty' | 'bobtail' | 'personal' | 'yard'

export type Expense = {
  id: string; date: string; category: string; amount: number
  description: string; location: string; loadNumber: string
  deductPct: number; isDeductible: boolean; createdAt: string
  // Order-centered attachment (Phase 5C) — all optional for backward compat
  missionId?:    string
  orderNumber?:  string
  stopId?:       string
  movementMode?: MovementMode   // loaded | empty | bobtail | personal | yard
  occurredAt?:   string         // ISO — when the expense happened
  loggedAt?:     string         // ISO — when it was entered in app
  timezone?:     string         // e.g. "America/Chicago"
}

// ── Fuel entry (separate from generic expenses for detailed tracking) ─────────
export type FuelEntry = {
  id:           string
  missionId?:   string
  orderNumber?: string
  stopId?:      string
  date:         string          // YYYY-MM-DD
  location:     string          // station name / address
  gallons:      number
  pricePerGal:  number
  totalCost:    number
  movementMode: MovementMode    // loaded | empty | bobtail | personal | yard
  occurredAt:   string          // ISO — actual pump time
  loggedAt:     string          // ISO — when entered in app
  timezone?:    string
  notes?:       string
}

// ── Doc record ────────────────────────────────────────────────────────────────
export type DocType =
  | 'bol' | 'rate_con' | 'pod' | 'lumper_receipt' | 'scale_ticket'
  | 'fuel_receipt' | 'inspection' | 'incident' | 'other'

export type DocRecord = {
  id:            string
  missionId?:    string
  orderNumber?:  string
  stopId?:       string
  docType:       DocType
  fileName?:     string
  fileUrl?:      string
  thumbnailUrl?: string
  notes?:        string
  createdAt:     string
  occurredAt?:   string   // when the document event happened
  loggedAt:      string   // when it was entered in app
  timezone?:     string
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
  orderNumber?: string   // Phase 5C — order context
  stopId:       string
  stopSequence: number
  eventType:    StopLifecycleStatus
  occurredAt:   string   // ISO — when it happened
  loggedAt?:    string   // ISO — when entered in app (may differ from occurredAt)
  timezone?:    string
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
  // Order-centered context (Phase 5C)
  missionId?:           string
  orderNumber?:         string
  loggedAt?:            string   // ISO — when stop was added to the record
  // Lifecycle (Phase 4G)
  lifecycleStatus?:     StopLifecycleStatus
  // ISO timestamps per lifecycle step — keys map to human labels:
  //   arrived | checked_in | waiting | docked | work_started | work_ended | departed
  lifecycleTimestamps?: Partial<Record<StopLifecycleStatus, string>>
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

// ── Order timestamp ledger (Phase 5C) ────────────────────────────────────────
// Top-level timestamps for the whole order lifecycle.
// Per-stop timestamps live in MissionStop.lifecycleTimestamps.
export type OrderTimestamps = {
  orderCreatedAt?:      string   // ISO — when mission record was created
  orderAcceptedAt?:     string   // ISO — when driver accepted the load
  pickupScheduledAt?:   string   // ISO — appointment time at first pickup
  pickupArrivedAt?:     string   // ISO — driver arrived at first pickup
  pickupDepartedAt?:    string   // ISO — driver departed first pickup
  deliveryScheduledAt?: string   // ISO — appointment time at final delivery
  deliveryArrivedAt?:   string   // ISO — driver arrived at final delivery
  deliveryDepartedAt?:  string   // ISO — driver departed final delivery
  completedAt?:         string   // ISO — order fully complete
  reviewCompletedAt?:   string   // ISO — post-trip review submitted
  lastUpdatedAt?:       string   // ISO — any record write updates this
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
  // ── Order-centered identity (Phase 5C) ──────────────────────────────────────
  orderNumber?:     string          // human-readable order ID (e.g. ORD-20260521-A3X9)
  driverName?:      string          // snapshot at dispatch — settings.driverName
  tractorId?:       string          // snapshot at dispatch — settings.truckNum
  trailerNum?:      string          // order-specific trailer (overrides settings default)
  trailerPlate?:    string          // order-specific trailer plate
  timestamps?:      OrderTimestamps // full order timestamp ledger
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
  orderNumber?: string          // Phase 5C
  loadNumber:  string
  origin:      string
  destination: string
  eventType:   EventType
  severity:    EventSeverity
  notes:       string | null
  location:    string | null
  createdBy:   string | null
  createdAt:   string
  occurredAt?:  string          // ISO — when the event actually happened
  loggedAt?:    string          // ISO — when entered in app
  timezone?:    string
}
