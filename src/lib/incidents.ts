'use client'
/**
 * incidents.ts — Load Incident / Compliance Case engine
 *
 * Pattern: localStorage-first → Supabase async (non-blocking).
 * Photos stored as base64 locally; only metadata synced to Supabase.
 *
 * Table: fleet_incidents (Fleet project goqzhdrmrdlkchmwfiur)
 * Local: localStorage '3b-incidents' (newest-first, max 100)
 */
import { createClient } from '@/lib/supabase-browser'
import { createAuthClient } from '@/lib/auth-client'

// ── Event catalogue ───────────────────────────────────────────────────────────
export type IncidentEventType =
  | 'blown_tire'
  | 'air_leak'
  | 'breakdown'
  | 'repair_waiting'
  | 'port_of_entry'
  | 'detention_delay'
  | 'road_closure'
  | 'general_proof'
  | 'dot_warning'
  | 'dot_violation'
  | 'inspection_report'
  | 'equipment_defect'
  | 'brake_issue'
  | 'lighting_issue'
  | 'overweight_scale'

export type IncidentStatus =
  | 'open'
  | 'repair_pending'
  | 'fixed'
  | 'verified'
  | 'closed'

export const INCIDENT_META: Record<IncidentEventType, { emoji: string; label: string; compliance?: boolean }> = {
  blown_tire:        { emoji: '🛞', label: 'Blown Tire'            },
  air_leak:          { emoji: '💨', label: 'Air Leak'              },
  breakdown:         { emoji: '🔧', label: 'Breakdown'             },
  repair_waiting:    { emoji: '🧰', label: 'Waiting on Repair'     },
  port_of_entry:     { emoji: '⚖️', label: 'Port of Entry Issue'  , compliance: true },
  detention_delay:   { emoji: '⏱', label: 'Detention / Delay'     },
  road_closure:      { emoji: '🚧', label: 'Road Closure'          },
  general_proof:     { emoji: '📸', label: 'General Proof'         },
  dot_warning:       { emoji: '⚠️', label: 'DOT Warning'           , compliance: true },
  dot_violation:     { emoji: '🚨', label: 'DOT Violation'         , compliance: true },
  inspection_report: { emoji: '📋', label: 'Inspection Report'     , compliance: true },
  equipment_defect:  { emoji: '⚙️', label: 'Equipment Defect'      , compliance: true },
  brake_issue:       { emoji: '🛑', label: 'Brake Issue'           , compliance: true },
  lighting_issue:    { emoji: '💡', label: 'Lighting Issue'        , compliance: true },
  overweight_scale:  { emoji: '⚖️', label: 'Overweight / Scale'   , compliance: true },
}

export const STATUS_META: Record<IncidentStatus, { label: string; color: string }> = {
  open:           { label: 'Open',           color: 'var(--error)' },
  repair_pending: { label: 'Repair Pending', color: 'var(--warn)'  },
  fixed:          { label: 'Fixed',          color: 'var(--blue)'  },
  verified:       { label: 'Verified',       color: 'var(--success)' },
  closed:         { label: 'Closed',         color: 'var(--muted)'  },
}

// Quick categories shown in the sheet (top row)
export const QUICK_CATEGORIES: IncidentEventType[] = [
  'blown_tire', 'air_leak', 'breakdown', 'repair_waiting',
  'port_of_entry', 'detention_delay', 'road_closure', 'general_proof',
]

// Compliance categories (expandable section)
export const COMPLIANCE_CATEGORIES: IncidentEventType[] = [
  'dot_warning', 'dot_violation', 'inspection_report', 'equipment_defect',
  'brake_issue', 'lighting_issue', 'overweight_scale',
]

// ── Types ─────────────────────────────────────────────────────────────────────
export interface IncidentDocument {
  id:         string
  caption:    string
  uploadedAt: string
  dataUrl?:   string   // base64 — stored locally only, not synced to Supabase
}

export interface Incident {
  id:            string
  userId?:       string
  businessId?:   string
  // Load context
  loadId?:       string
  orderNumber?:  string
  runNumber?:    string
  truckNumber?:  string
  trailerNumber?: string
  // Event
  eventType:     IncidentEventType
  status:        IncidentStatus
  // Location
  gpsLat?:       number
  gpsLng?:       number
  locationLabel?: string
  // Content
  notes:         string
  documents:     IncidentDocument[]
  // Compliance extras
  violationCode?: string
  officerNotes?:  string
  caseNumber?:    string
  // Meta
  createdAt:     string
  updatedAt:     string
}

// ── localStorage helpers ──────────────────────────────────────────────────────
const LS_KEY  = '3b-incidents'
const MAX_LOCAL = 100

export function readLocalIncidents(): Incident[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as Incident[] }
  catch { return [] }
}

function writeLocalIncidents(incidents: Incident[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(incidents.slice(0, MAX_LOCAL))) }
  catch { /* storage full */ }
}

function upsertLocal(incident: Incident) {
  const existing = readLocalIncidents()
  const idx = existing.findIndex(i => i.id === incident.id)
  if (idx >= 0) {
    existing[idx] = incident
    writeLocalIncidents(existing)
  } else {
    writeLocalIncidents([incident, ...existing])
  }
}

// ── GPS helper ────────────────────────────────────────────────────────────────
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

// ── Save incident (localStorage-first → Supabase async) ──────────────────────
export async function saveIncident(incident: Incident): Promise<void> {
  incident.updatedAt = new Date().toISOString()

  // 1. localStorage — always, instant
  upsertLocal(incident)

  // 2. Supabase async
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

    // Strip base64 data from documents before syncing (store metadata only)
    const docsForSync = incident.documents.map(({ dataUrl: _d, ...rest }) => rest)

    await supabase.from('fleet_incidents').upsert({
      id:             incident.id,
      user_id:        user.id,
      business_id:    businessId,
      load_id:        incident.loadId        ?? null,
      order_number:   incident.orderNumber   ?? null,
      run_number:     incident.runNumber     ?? null,
      truck_number:   incident.truckNumber   ?? null,
      trailer_number: incident.trailerNumber ?? null,
      event_type:     incident.eventType,
      status:         incident.status,
      gps_lat:        incident.gpsLat        ?? null,
      gps_lng:        incident.gpsLng        ?? null,
      location_label: incident.locationLabel ?? null,
      notes:          incident.notes,
      documents:      docsForSync,
      violation_code: incident.violationCode ?? null,
      officer_notes:  incident.officerNotes  ?? null,
      case_number:    incident.caseNumber    ?? null,
      created_at:     incident.createdAt,
      updated_at:     incident.updatedAt,
    }, { onConflict: 'id' })
  } catch { /* offline — local record is sufficient */ }
}

/** Create a new incident shell pre-filled from active mission context. */
export function newIncident(ctx: {
  loadId?:       string
  truckNumber?:  string
  trailerNumber?: string
  orderNumber?:  string
  runNumber?:    string
}): Incident {
  return {
    id:            crypto.randomUUID(),
    eventType:     'general_proof',
    status:        'open',
    notes:         '',
    documents:     [],
    loadId:        ctx.loadId,
    truckNumber:   ctx.truckNumber,
    trailerNumber: ctx.trailerNumber,
    orderNumber:   ctx.orderNumber,
    runNumber:     ctx.runNumber,
    createdAt:     new Date().toISOString(),
    updatedAt:     new Date().toISOString(),
  }
}
