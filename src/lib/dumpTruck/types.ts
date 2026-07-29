/**
 * Dump Truck Mode — shared types
 *
 * Mirrors the fleet_dt_* Supabase schema (see supabase/migrations/20260727_fleet_dt_*.sql).
 * Client-side types are camelCase; DB rows are snake_case — mapping happens at
 * the API boundary (src/app/api/fleet/dump-truck/*).
 */

// ── Shift state machine ────────────────────────────────────────────────────

export type ShiftState =
  | 'draft'
  | 'clocked_in'
  | 'pretrip_in_progress'
  | 'pretrip_complete'
  | 'active'
  | 'posttrip_in_progress'
  | 'posttrip_complete'
  | 'clocked_out'
  | 'submitted'
  | 'payroll_approved'
  | 'billing_approved'
  | 'locked'
  | 'returned_for_correction'
  | 'void'

// ── Operational event types ────────────────────────────────────────────────

export type DumpTruckEventType =
  | 'clock_in'
  | 'arrive_yard_for_pickup'
  | 'truck_picked_up'
  | 'pretrip_started'
  | 'pretrip_completed'
  | 'depart_yard'
  | 'arrive_pickup'
  | 'loading_started'
  | 'loading_completed'
  | 'depart_pickup'
  | 'arrive_dump'
  | 'unloading_started'
  | 'unloading_completed'
  | 'depart_dump'
  | 'arrive_yard'
  | 'break_started'
  | 'break_ended'
  | 'delay_started'
  | 'delay_ended'
  | 'fuel_stop_started'
  | 'fuel_stop_ended'
  | 'posttrip_started'
  | 'posttrip_completed'
  | 'truck_dropped_off'
  | 'clock_out'
  | 'shift_submitted'
  | 'correction_requested'
  | 'event_corrected'
  | 'shift_approved'
  | 'shift_reopened'
  | 'note'
  | 'photo_captured'
  | 'ticket_captured'
  | 'location_logged'

export type LocationPermissionStatus = 'granted' | 'denied' | 'unavailable' | 'not_requested' | 'timeout'
export type EventSyncState = 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed'

export interface GeoEvidence {
  lat: number | null
  lng: number | null
  accuracyM: number | null
  capturedAt: string | null // ISO
  permission: LocationPermissionStatus
  matchedSiteId?: string | null
  distanceFromSiteM?: number | null
  reverseGeocodedAddress?: string | null
}

export interface DumpTruckEvent {
  id: string // client-generated UUID
  idempotencyKey: string
  businessId: string
  threebId: string | null
  driverId: string
  shiftId: string
  jobId: string | null
  loadCycleId: string | null
  vehicleId: string | null
  trailerId: string | null
  eventType: DumpTruckEventType
  deviceCapturedAt: string // ISO — device clock
  serverReceivedAt?: string | null // filled by server
  effectiveAt: string // ISO — the timestamp we treat as authoritative for ordering
  timezone: string | null
  utcOffsetMinutes: number | null
  geo: GeoEvidence
  odometer: number | null
  notes: string | null
  deviceMetadata: Record<string, unknown>
  syncState: EventSyncState
  correctsEventId?: string | null
  correctionReason?: string | null
}

// ── Site / navigation ───────────────────────────────────────────────────────

export type SiteType =
  | 'yard' | 'pickup' | 'dump' | 'customer' | 'fuel'
  | 'maintenance' | 'scale' | 'disposal' | 'parking' | 'other'

export type PreferredNavPoint = 'address' | 'site_pin' | 'entrance' | 'gate' | 'scale' | 'other'

export interface DumpTruckSite {
  id: string
  businessId: string
  siteType: SiteType
  name: string
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  lat: number | null
  lng: number | null
  geofenceRadiusM: number
  entranceLat: number | null
  entranceLng: number | null
  scaleLat: number | null
  scaleLng: number | null
  preferredNavPoint: PreferredNavPoint
  customerName: string | null
  brokerName: string | null
  instructions: string | null
  routeNotes: string | null
  gateCode: string | null
  gateInstructions: string | null
  restrictions: Record<string, unknown>
  approachDirection: string | null
  avoidNotes: string | null
  contactName: string | null
  contactPhone: string | null
  operatingHours: Record<string, unknown>
  active: boolean
  verified: boolean
}

// ── Jobs / shifts / load cycles ────────────────────────────────────────────

export interface DumpTruckJob {
  id: string
  businessId: string
  jobNumber: string
  poNumber: string | null
  customerName: string | null
  brokerName: string | null
  /** FK into fleet_brokers — null for legacy jobs still only carrying the free-text brokerName. */
  brokerId: string | null
  driverId: string | null
  truckId: string | null
  trailerId: string | null
  pickupSiteId: string | null
  dumpSiteId: string | null
  material: string | null
  estQuantity: number | null
  quantityUnit: 'loads' | 'tons' | 'cubic_yards' | 'hours' | 'miles' | 'units'
  status: 'proposed' | 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled'
  /** 'broker' when a Broker-portal user originated this deal (see proposeJob/acceptJob). */
  source: 'dispatch' | 'broker'
  dispatchAcceptedBy: string | null
  dispatchAcceptedAt: string | null

  // Dispatch-ticket fields (2026-07-28) — mirror the paper dispatch ticket
  // (load time, order/delivery date, cosignee, ordered-by, phone, truck
  // type, directions, travel time, fuel surcharge, price per hour/ton,
  // material cost) so the admin Jobs form can replace it, not just
  // supplement it.
  loadTime: string | null
  orderDate: string | null
  deliveryDate: string | null
  cosigneeName: string | null
  orderedBy: string | null
  contactPhone: string | null
  truckType: string | null
  directions: string | null
  travelTimeMinutes: number | null
  fuelSurcharge: number | null
  pricePerHour: number | null
  pricePerTon: number | null
  materialCost: number | null
}

export interface DumpTruckShift {
  id: string
  businessId: string
  driverId: string
  truckId: string | null
  trailerId: string | null
  state: ShiftState
  clockInAt: string | null
  clockOutAt: string | null
  startYardSiteId: string | null
  endSiteId: string | null
  deviceId: string | null
  loadCount: number
}

export type DriveSegmentCategory = 'empty' | 'loaded' | 'yard_transfer' | 'fuel' | 'maintenance' | 'other'

export interface DriveSegment {
  id: string
  shiftId: string
  loadCycleId: string | null
  originSiteId: string | null
  destinationSiteId: string | null
  departEventId: string
  arriveEventId: string | null
  category: DriveSegmentCategory
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  startOdometer: number | null
  endOdometer: number | null
  segmentMiles: number | null
  isException: boolean
  exceptionReason: string | null
}

export interface LoadCycle {
  id: string
  shiftId: string
  jobId: string
  sequence: number
  pickupSiteId: string | null
  dumpSiteId: string | null
  material: string | null
  quantity: number | null
  quantityUnit: string
  weightTons: number | null
  ticketNumber: string | null
  billableStatus: 'pending' | 'billable' | 'excluded' | 'disputed'
  exceptionFlags: string[]
  driverNotes: string | null
}

// ── Inspections ──────────────────────────────────────────────────────────

export type InspectionType = 'pretrip' | 'posttrip'
export type InspectionItemResult = 'pass' | 'defect' | 'not_applicable' | 'note'
export type DefectSeverity = 'monitor' | 'non_safety' | 'safety_critical' | 'out_of_service'

export interface InspectionTemplateItem {
  key: string
  label: string
  category: string
  requiresOdometer: boolean
  allowNa: boolean
}

export interface InspectionItemInput {
  itemKey: string
  itemLabel: string
  category: string
  result: InspectionItemResult
  severity: DefectSeverity | null
  notes: string | null
  photoDocId?: string | null
}
