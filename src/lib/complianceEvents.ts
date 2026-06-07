'use client'
/**
 * complianceEvents.ts — Compliance Event Engine
 *
 * Central backbone for violations, warnings, repairs, DOT packets,
 * pre-trip records, and tire logs. Everything that keeps the operation
 * legally clean and dispute-proof.
 *
 * Pattern: localStorage-first → Supabase async (non-blocking, offline-safe).
 * Photos/docs stored as base64 locally; only metadata synced to Supabase.
 *
 * Tables: fleet_compliance_events (goqzhdrmrdlkchmwfiur)
 * Local:  '3b-compliance-events' (newest-first, max 300)
 *         '3b-pretrip-records'   (max 100)
 *         '3b-tire-logs'         (max 500)
 */
import { createClient } from '@/lib/supabase-browser'
import { createAuthClient } from '@/lib/auth-client'

// ── Event type catalogue ──────────────────────────────────────────────────────

export type ComplianceEventType =
  // Violations & warnings
  | 'dot_violation'
  | 'dot_warning'
  | 'out_of_service'
  | 'weight_violation'
  | 'log_violation'
  // Equipment defects
  | 'brake_defect'
  | 'tire_defect'
  | 'lighting_defect'
  | 'equipment_defect'
  // Inspections
  | 'roadside_inspection'
  | 'terminal_inspection'
  | 'inspection_passed'
  | 'inspection_failed'
  // Repairs
  | 'repair_ordered'
  | 'repair_completed'
  | 'repair_verified'
  // Proof uploads
  | 'proof_uploaded'
  // Pre-trip
  | 'pretrip_pass'
  | 'pretrip_fail'

export type ComplianceStatus =
  | 'open'
  | 'repair_pending'
  | 'repair_submitted'
  | 'verified'
  | 'closed'
  | 'contested'

export type ComplianceSeverity = 'critical' | 'major' | 'minor' | 'advisory'

export const COMPLIANCE_EVENT_META: Record<ComplianceEventType, { emoji: string; label: string; isViolation?: boolean; isRepair?: boolean }> = {
  dot_violation:      { emoji: '🚨', label: 'DOT Violation',         isViolation: true  },
  dot_warning:        { emoji: '⚠️', label: 'DOT Warning',           isViolation: true  },
  out_of_service:     { emoji: '🛑', label: 'Out of Service',         isViolation: true  },
  weight_violation:   { emoji: '⚖️', label: 'Weight Violation',       isViolation: true  },
  log_violation:      { emoji: '📋', label: 'Log / HOS Violation',    isViolation: true  },
  brake_defect:       { emoji: '🛑', label: 'Brake Defect',           isViolation: true  },
  tire_defect:        { emoji: '🛞', label: 'Tire Defect',            isViolation: true  },
  lighting_defect:    { emoji: '💡', label: 'Lighting Defect',        isViolation: true  },
  equipment_defect:   { emoji: '⚙️', label: 'Equipment Defect',       isViolation: true  },
  roadside_inspection: { emoji: '🔍', label: 'Roadside Inspection'                       },
  terminal_inspection: { emoji: '🏢', label: 'Terminal Inspection'                       },
  inspection_passed:  { emoji: '✅', label: 'Inspection Passed'                          },
  inspection_failed:  { emoji: '❌', label: 'Inspection Failed',      isViolation: true  },
  repair_ordered:     { emoji: '🔧', label: 'Repair Ordered',         isRepair: true     },
  repair_completed:   { emoji: '✅', label: 'Repair Completed',       isRepair: true     },
  repair_verified:    { emoji: '📋', label: 'Repair Verified',        isRepair: true     },
  proof_uploaded:     { emoji: '📸', label: 'Proof Uploaded'                             },
  pretrip_pass:       { emoji: '✅', label: 'Pre-Trip Passed'                            },
  pretrip_fail:       { emoji: '❌', label: 'Pre-Trip Failed',        isViolation: true  },
}

export const COMPLIANCE_STATUS_META: Record<ComplianceStatus, { label: string; color: string }> = {
  open:             { label: 'Open',             color: 'var(--error)'   },
  repair_pending:   { label: 'Repair Pending',   color: 'var(--warn)'   },
  repair_submitted: { label: 'Repair Submitted', color: '#60c8ff'       },
  verified:         { label: 'Verified',         color: 'var(--success)' },
  closed:           { label: 'Closed',           color: 'var(--muted)'  },
  contested:        { label: 'Contested',        color: '#c890ff'       },
}

export const SEVERITY_META: Record<ComplianceSeverity, { label: string; color: string; points: number }> = {
  critical: { label: 'Critical',  color: 'var(--error)',   points: 10 },
  major:    { label: 'Major',     color: 'var(--warn)',    points: 6  },
  minor:    { label: 'Minor',     color: '#60c8ff',        points: 3  },
  advisory: { label: 'Advisory',  color: 'var(--muted)',   points: 1  },
}

// Common FMCSA violation codes for quick reference
export const COMMON_VIOLATION_CODES: { code: string; desc: string }[] = [
  { code: '393.9',   desc: 'Inoperative required lamp'              },
  { code: '393.11',  desc: 'Inoperative stop lamp'                  },
  { code: '393.45',  desc: 'Brake tubing/hose chafing'              },
  { code: '393.47',  desc: 'Brake adjustment out of adjustment'     },
  { code: '393.48',  desc: 'Brakes inoperative'                     },
  { code: '393.75',  desc: 'Tires — defective/improper'             },
  { code: '393.76',  desc: 'Windshield — improper'                  },
  { code: '395.3',   desc: 'HOS — 11-hour driving limit'            },
  { code: '395.8',   desc: 'RODS — failure to maintain'             },
  { code: '396.3',   desc: 'Inspection/repair/maintenance'          },
  { code: '392.2',   desc: 'Reckless driving'                       },
  { code: '392.2D',  desc: 'Following too close'                    },
  { code: '392.22',  desc: 'Emergency signals — stopped'            },
]

// ── Document type ─────────────────────────────────────────────────────────────

export type ComplianceDocType =
  | 'photo'
  | 'repair_invoice'
  | 'work_order'
  | 'inspection_report'
  | 'citation'
  | 'court_notice'
  | 'other'

export const COMPLIANCE_DOC_LABELS: Record<ComplianceDocType, string> = {
  photo:             'Photo',
  repair_invoice:    'Repair Invoice',
  work_order:        'Work Order',
  inspection_report: 'Inspection Report',
  citation:          'Citation',
  court_notice:      'Court Notice',
  other:             'Other',
}

export interface ComplianceDocument {
  id:         string
  docType:    ComplianceDocType
  caption:    string
  uploadedAt: string
  dataUrl?:   string   // base64 — local only, never synced
}

// ── Main event interface ──────────────────────────────────────────────────────

export interface ComplianceEvent {
  id:            string
  userId?:       string
  businessId?:   string

  // Event classification
  eventType:     ComplianceEventType
  status:        ComplianceStatus
  severity:      ComplianceSeverity

  // Inspection context
  violationCode?:    string    // FMCSA CFR code e.g. "393.47"
  inspectionType?:   string    // 'roadside' | 'terminal' | 'weigh_station'
  inspectionReport?: string    // report / citation number
  officerBadge?:     string
  inspectionLocation?: string

  // Entity context
  driverName?:    string
  truckNumber?:   string
  trailerNumber?: string
  loadId?:        string
  orderNumber?:   string

  // OOS
  outOfService?:  boolean
  oosCleared?:    boolean
  oosClearedAt?:  string

  // Repair tracking
  repairOrderNumber?: string
  repairShop?:        string
  repairCost?:        number
  repairCompletedAt?: string
  repairNotes?:       string

  // Documents
  documents:     ComplianceDocument[]

  // Notes
  notes:         string

  // GPS
  gpsLat?:       number
  gpsLng?:       number

  // Meta
  createdAt:     string
  updatedAt:     string
}

// ── Pre-trip record ───────────────────────────────────────────────────────────

export type PreTripItemStatus = 'pass' | 'fail' | 'na'

export interface PreTripItem {
  id:     string
  label:  string
  status: PreTripItemStatus
  notes?: string
}

export const PRETRIP_CHECKLIST: Omit<PreTripItem, 'status'>[] = [
  // Engine compartment
  { id: 'oil_level',        label: 'Oil Level'                },
  { id: 'coolant',          label: 'Coolant Level'            },
  { id: 'belts_hoses',      label: 'Belts & Hoses'            },
  { id: 'power_steering',   label: 'Power Steering Fluid'     },
  { id: 'battery',          label: 'Battery / Terminals'      },
  // Lights
  { id: 'headlights',       label: 'Headlights'               },
  { id: 'tail_lights',      label: 'Tail / Brake Lights'      },
  { id: 'turn_signals',     label: 'Turn Signals'             },
  { id: 'marker_lights',    label: 'Marker / Clearance Lights'},
  { id: 'hazards',          label: 'Hazard Flashers'          },
  // Tires / wheels
  { id: 'steer_tires',      label: 'Steer Tires'              },
  { id: 'drive_tires',      label: 'Drive Tires'              },
  { id: 'trailer_tires',    label: 'Trailer Tires'            },
  { id: 'lug_nuts',         label: 'Lug Nuts / Valve Caps'    },
  // Brakes
  { id: 'air_pressure',     label: 'Air Pressure (90–120 PSI)'},
  { id: 'brake_test',       label: 'Brake Test'               },
  { id: 'abs_light',        label: 'ABS Warning Light Off'    },
  // Cab
  { id: 'mirrors',          label: 'Mirrors Adjusted'         },
  { id: 'wipers',           label: 'Wipers & Washers'         },
  { id: 'horn',             label: 'Horn'                     },
  { id: 'seatbelt',         label: 'Seat Belt'                },
  { id: 'fire_extinguisher',label: 'Fire Extinguisher'        },
  { id: 'triangles',        label: 'Emergency Triangles'      },
  // Coupling
  { id: 'fifth_wheel',      label: 'Fifth Wheel Locked'       },
  { id: 'landing_gear',     label: 'Landing Gear Up'          },
  { id: 'glad_hands',       label: 'Glad Hands Connected'     },
  { id: 'electrical',       label: 'Electrical Connection'    },
  // Trailer
  { id: 'trailer_lights',   label: 'Trailer Lights'           },
  { id: 'trailer_brakes',   label: 'Trailer Brakes'           },
  { id: 'mud_flaps',        label: 'Mud Flaps'                },
  { id: 'doors_sealed',     label: 'Trailer Doors / Seals'    },
]

export function defaultPreTripList(): PreTripItem[] {
  return PRETRIP_CHECKLIST.map(i => ({ ...i, status: 'na' as PreTripItemStatus }))
}

export interface PreTripRecord {
  id:             string
  userId?:        string
  truckNumber?:   string
  trailerNumber?: string
  loadId?:        string
  orderNumber?:   string
  items:          PreTripItem[]
  result:         'pass' | 'fail'
  failCount:      number
  notes:          string
  gpsLat?:        number
  gpsLng?:        number
  signedOff?:     boolean
  createdAt:      string
}

// ── Tire log ─────────────────────────────────────────────────────────────────

export type TirePosition =
  | 'steer_left' | 'steer_right'
  | 'drive1_left_outer' | 'drive1_left_inner' | 'drive1_right_inner' | 'drive1_right_outer'
  | 'drive2_left_outer' | 'drive2_left_inner' | 'drive2_right_inner' | 'drive2_right_outer'
  | 'trailer1_left_outer' | 'trailer1_left_inner' | 'trailer1_right_inner' | 'trailer1_right_outer'
  | 'trailer2_left_outer' | 'trailer2_left_inner' | 'trailer2_right_inner' | 'trailer2_right_outer'

export interface TireReading {
  position:    TirePosition
  depthThirty: number | null    // tread depth in 32nds
  pressurePsi: number | null    // PSI
  condition:   'good' | 'worn' | 'critical' | 'replace'
  notes?:      string
}

export interface TireLog {
  id:             string
  userId?:        string
  truckNumber?:   string
  trailerNumber?: string
  loadId?:        string
  readings:       TireReading[]
  notes:          string
  gpsLat?:        number
  gpsLng?:        number
  createdAt:      string
}

// ── GPS ───────────────────────────────────────────────────────────────────────

export function captureGPS(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()  => resolve(null),
      { timeout: 5000, maximumAge: 30000 },
    )
  })
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS_EVENTS    = '3b-compliance-events'
const LS_PRETRIP   = '3b-pretrip-records'
const LS_TIRE      = '3b-tire-logs'

export function readLocalComplianceEvents(): ComplianceEvent[] {
  try { return JSON.parse(localStorage.getItem(LS_EVENTS) ?? '[]') as ComplianceEvent[] }
  catch { return [] }
}

export function readLocalPreTripRecords(): PreTripRecord[] {
  try { return JSON.parse(localStorage.getItem(LS_PRETRIP) ?? '[]') as PreTripRecord[] }
  catch { return [] }
}

export function readLocalTireLogs(): TireLog[] {
  try { return JSON.parse(localStorage.getItem(LS_TIRE) ?? '[]') as TireLog[] }
  catch { return [] }
}

function upsertLocal<T extends { id: string }>(key: string, record: T, max: number) {
  try {
    const existing: T[] = JSON.parse(localStorage.getItem(key) ?? '[]')
    const idx = existing.findIndex(r => r.id === record.id)
    if (idx >= 0) existing[idx] = record
    else          existing.unshift(record)
    localStorage.setItem(key, JSON.stringify(existing.slice(0, max)))
  } catch { /* storage full */ }
}

// ── Save compliance event ─────────────────────────────────────────────────────

export async function saveComplianceEvent(event: ComplianceEvent): Promise<void> {
  event.updatedAt = new Date().toISOString()
  upsertLocal(LS_EVENTS, event, 300)

  try {
    const supabase = createClient()
    const { data: { user } } = await createAuthClient().auth.getUser()
    if (!user) return

    let businessId: string | null = null
    try {
      const { data: prof } = await supabase
        .from('profiles').select('business_id').eq('id', user.id).single()
      businessId = (prof as Record<string, string> | null)?.business_id ?? null
    } catch { /* ignore */ }

    // Strip base64 from docs before sync
    const docsForSync = event.documents.map(({ dataUrl: _d, ...rest }) => rest)

    await supabase.from('fleet_compliance_events').upsert({
      id:                  event.id,
      user_id:             user.id,
      business_id:         businessId,
      event_type:          event.eventType,
      status:              event.status,
      severity:            event.severity,
      violation_code:      event.violationCode      ?? null,
      inspection_type:     event.inspectionType     ?? null,
      inspection_report:   event.inspectionReport   ?? null,
      officer_badge:       event.officerBadge       ?? null,
      inspection_location: event.inspectionLocation ?? null,
      driver_name:         event.driverName         ?? null,
      truck_number:        event.truckNumber        ?? null,
      trailer_number:      event.trailerNumber      ?? null,
      load_id:             event.loadId             ?? null,
      order_number:        event.orderNumber        ?? null,
      out_of_service:      event.outOfService       ?? false,
      oos_cleared:         event.oosCleared         ?? false,
      oos_cleared_at:      event.oosClearedAt       ?? null,
      repair_order_number: event.repairOrderNumber  ?? null,
      repair_shop:         event.repairShop         ?? null,
      repair_cost:         event.repairCost         ?? null,
      repair_completed_at: event.repairCompletedAt  ?? null,
      repair_notes:        event.repairNotes        ?? null,
      documents:           docsForSync,
      notes:               event.notes,
      gps_lat:             event.gpsLat             ?? null,
      gps_lng:             event.gpsLng             ?? null,
      created_at:          event.createdAt,
      updated_at:          event.updatedAt,
    }, { onConflict: 'id' })
  } catch { /* offline — local sufficient */ }
}

// ── Save pre-trip record ──────────────────────────────────────────────────────

export async function savePreTripRecord(record: PreTripRecord): Promise<void> {
  upsertLocal(LS_PRETRIP, record, 100)
  // Supabase sync via fleet_compliance_events as pretrip_pass/fail event (lightweight)
  try {
    const supabase = createClient()
    const { data: { user } } = await createAuthClient().auth.getUser()
    if (!user) return

    let businessId: string | null = null
    try {
      const { data: prof } = await supabase
        .from('profiles').select('business_id').eq('id', user.id).single()
      businessId = (prof as Record<string, string> | null)?.business_id ?? null
    } catch { /* ignore */ }

    await supabase.from('fleet_compliance_events').insert({
      id:           record.id + '-pretrip',
      user_id:      user.id,
      business_id:  businessId,
      event_type:   record.result === 'pass' ? 'pretrip_pass' : 'pretrip_fail',
      status:       record.result === 'pass' ? 'closed' : 'open',
      severity:     record.failCount > 3 ? 'major' : record.failCount > 0 ? 'minor' : 'advisory',
      truck_number: record.truckNumber   ?? null,
      trailer_number: record.trailerNumber ?? null,
      load_id:      record.loadId        ?? null,
      order_number: record.orderNumber   ?? null,
      notes:        `Pre-trip: ${record.failCount} failures. ${record.notes}`.trim(),
      gps_lat:      record.gpsLat        ?? null,
      gps_lng:      record.gpsLng        ?? null,
      documents:    [],
      out_of_service: false,
      oos_cleared:  false,
      created_at:   record.createdAt,
      updated_at:   record.createdAt,
    })
  } catch { /* offline */ }
}

// ── Factories ─────────────────────────────────────────────────────────────────

export function newComplianceEvent(ctx?: {
  eventType?:    ComplianceEventType
  severity?:     ComplianceSeverity
  truckNumber?:  string
  trailerNumber?: string
  loadId?:       string
  orderNumber?:  string
}): ComplianceEvent {
  return {
    id:          crypto.randomUUID(),
    eventType:   ctx?.eventType   ?? 'dot_warning',
    status:      'open',
    severity:    ctx?.severity    ?? 'minor',
    truckNumber: ctx?.truckNumber,
    trailerNumber: ctx?.trailerNumber,
    loadId:      ctx?.loadId,
    orderNumber: ctx?.orderNumber,
    documents:   [],
    notes:       '',
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  }
}

export function newPreTripRecord(ctx?: {
  truckNumber?:   string
  trailerNumber?: string
  loadId?:        string
  orderNumber?:   string
}): PreTripRecord {
  return {
    id:            crypto.randomUUID(),
    truckNumber:   ctx?.truckNumber,
    trailerNumber: ctx?.trailerNumber,
    loadId:        ctx?.loadId,
    orderNumber:   ctx?.orderNumber,
    items:         defaultPreTripList(),
    result:        'pass',
    failCount:     0,
    notes:         '',
    signedOff:     false,
    createdAt:     new Date().toISOString(),
  }
}

// ── Compliance intelligence (for dispatch alert feed) ─────────────────────────

export interface ComplianceAlert {
  id:       string
  severity: 'critical' | 'warn' | 'info'
  emoji:    string
  text:     string
  subtext?: string
  href?:    string
}

/** Aggregate all open compliance issues into a prioritized alert list. */
export function getComplianceAlerts(): ComplianceAlert[] {
  const alerts: ComplianceAlert[] = []
  const events = readLocalComplianceEvents()

  const open    = events.filter(e => e.status === 'open')
  const oos     = events.filter(e => e.outOfService && !e.oosCleared)
  const noProof = events.filter(e =>
    (e.status === 'repair_pending' || e.status === 'repair_submitted') &&
    e.documents.filter(d => d.docType === 'repair_invoice' || d.docType === 'work_order').length === 0
  )

  if (oos.length > 0) {
    alerts.push({
      id:       'oos',
      severity: 'critical',
      emoji:    '🛑',
      text:     `${oos.length} unit${oos.length > 1 ? 's' : ''} Out of Service`,
      subtext:  oos.map(e => e.truckNumber ?? e.trailerNumber ?? 'Unknown').join(', '),
      href:     '/compliance',
    })
  }

  const criticalOpen = open.filter(e => e.severity === 'critical')
  if (criticalOpen.length > 0) {
    alerts.push({
      id:       'critical_open',
      severity: 'critical',
      emoji:    '🚨',
      text:     `${criticalOpen.length} critical violation${criticalOpen.length > 1 ? 's' : ''} open`,
      href:     '/compliance',
    })
  }

  if (open.length > criticalOpen.length) {
    alerts.push({
      id:       'open_violations',
      severity: 'warn',
      emoji:    '⚠️',
      text:     `${open.length} open compliance issue${open.length > 1 ? 's' : ''}`,
      href:     '/compliance',
    })
  }

  if (noProof.length > 0) {
    alerts.push({
      id:       'missing_proof',
      severity: 'warn',
      emoji:    '📂',
      text:     `${noProof.length} repair${noProof.length > 1 ? 's' : ''} missing proof documents`,
      href:     '/compliance',
    })
  }

  return alerts
}
