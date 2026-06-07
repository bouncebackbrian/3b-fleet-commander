'use client'
/**
 * trailerEvents.ts — Trailer Lifecycle Event engine
 *
 * Covers every trailer movement: empty hook, loaded hook, empty drop, loaded drop.
 * Each event captures condition checklist, inspection verification, photos, GPS.
 *
 * Pattern: localStorage-first → Supabase async (non-blocking, offline-safe).
 * Photos stored as base64 locally; only metadata synced to Supabase.
 *
 * Table: fleet_trailer_events (Fleet project goqzhdrmrdlkchmwfiur)
 * Local: localStorage '3b-trailer-events' (newest-first, max 200)
 */
import { createClient } from '@/lib/supabase-browser'
import { createAuthClient } from '@/lib/auth-client'

// ── Event types ───────────────────────────────────────────────────────────────

export type TrailerEventType =
  | 'empty_hook'
  | 'loaded_hook'
  | 'empty_drop'
  | 'loaded_drop'

export const TRAILER_EVENT_META: Record<TrailerEventType, { emoji: string; label: string; isHook: boolean }> = {
  empty_hook:  { emoji: '🔗', label: 'Empty Hook',  isHook: true  },
  loaded_hook: { emoji: '📦', label: 'Loaded Hook', isHook: true  },
  empty_drop:  { emoji: '🅿️', label: 'Empty Drop',  isHook: false },
  loaded_drop: { emoji: '✅', label: 'Loaded Drop', isHook: false },
}

// ── Condition checklist ───────────────────────────────────────────────────────

export type ConditionStatus = 'ok' | 'issue' | 'na'

export interface ConditionItem {
  id:     string
  label:  string
  status: ConditionStatus
  notes?: string
}

export const CONDITION_ITEMS: Omit<ConditionItem, 'status'>[] = [
  { id: 'tires',          label: 'Tires / Pressure'   },
  { id: 'air_system',     label: 'Air System'          },
  { id: 'lights',         label: 'Lights'              },
  { id: 'brakes',         label: 'Brakes'              },
  { id: 'mudflaps',       label: 'Mudflaps'            },
  { id: 'landing_gear',   label: 'Landing Gear'        },
  { id: 'suspension',     label: 'Suspension'          },
  { id: 'doors_seals',    label: 'Doors / Seals'       },
  { id: 'floor',          label: 'Floor Condition'     },
  { id: 'cleanliness',    label: 'Cleanliness'         },
  { id: 'visible_damage', label: 'Visible Damage'      },
  { id: 'dents_scrapes',  label: 'Dents / Scrapes'     },
  { id: 'nose_box',       label: 'Nose Box / Lights'   },
  { id: 'reefer_unit',    label: 'Reefer Unit'         },
  { id: 'reefer_fuel',    label: 'Reefer Fuel Level'   },
]

export function defaultConditionList(): ConditionItem[] {
  return CONDITION_ITEMS.map(i => ({ ...i, status: 'na' as ConditionStatus }))
}

// ── Inspection verification ───────────────────────────────────────────────────

export type InspectionType =
  | 'annual'
  | 'fhwa_dot'
  | 'bit'
  | 'reefer'
  | 'registration'

export const INSPECTION_META: Record<InspectionType, { label: string; emoji: string }> = {
  annual:       { label: 'Annual Inspection',        emoji: '📋' },
  fhwa_dot:     { label: 'FHWA / DOT Inspection',   emoji: '🔍' },
  bit:          { label: 'BIT Inspection',           emoji: '🔎' },
  reefer:       { label: 'Reefer Inspection',        emoji: '❄️' },
  registration: { label: 'Registration / Plate',     emoji: '🪪' },
}

export interface TrailerInspectionRecord {
  type:           InspectionType
  inspectionDate?: string      // ISO date
  expirationDate?: string      // ISO date
  inspectorName?:  string
  vin?:            string
  plateNumber?:    string
  verified:        boolean
  expired:         boolean
  daysUntilExpiry?: number     // computed at load time
  photoDataUrl?:   string      // base64 — local only, not synced
}

export function computeExpiry(expirationDate: string | undefined): { expired: boolean; daysUntilExpiry: number | undefined } {
  if (!expirationDate) return { expired: false, daysUntilExpiry: undefined }
  const expMs  = new Date(expirationDate).getTime()
  const nowMs  = Date.now()
  const days   = Math.ceil((expMs - nowMs) / 86_400_000)
  return { expired: days <= 0, daysUntilExpiry: days }
}

// ── Document attachment ───────────────────────────────────────────────────────

export interface TrailerDocument {
  id:         string
  caption:    string
  uploadedAt: string
  dataUrl?:   string   // base64 — local only
}

// ── Main event type ───────────────────────────────────────────────────────────

export interface TrailerEvent {
  id:            string
  userId?:       string
  businessId?:   string
  // Load context
  loadId?:       string
  orderNumber?:  string
  tractorId?:    string
  // Event
  eventType:     TrailerEventType
  trailerNumber: string
  // GPS
  gpsLat?:       number
  gpsLng?:       number
  locationLabel?: string
  // Loaded-hook fields
  sealNumber?:   string
  bolAttached?:  boolean
  // Loaded-drop fields
  receiver?:     string
  podSigned?:    boolean
  sealVerified?: boolean
  deliveryCondition?: string
  // Reefer
  reeferFuelPct?: number   // 0–100
  // Condition checklist
  condition:     ConditionItem[]
  // Inspection verification
  inspections:   TrailerInspectionRecord[]
  // Photos / docs
  documents:     TrailerDocument[]
  // Notes
  notes:         string
  driverAck?:    boolean   // driver acknowledged checklist
  // Meta
  createdAt:     string
  updatedAt:     string
}

// ── Inspection alert helper (used by alert layer) ─────────────────────────────
export interface InspectionAlert {
  trailerNumber: string
  inspectionType: InspectionType
  label:          string
  daysUntilExpiry: number
  severity:       'critical' | 'warn'
}

/** Scan the most recent hook event for this trailer and return expiry alerts. */
export function getInspectionAlerts(trailerNumber: string): InspectionAlert[] {
  const events = readLocalTrailerEvents()
  const last   = events.find(e => e.trailerNumber === trailerNumber && e.inspections.length > 0)
  if (!last) return []
  const alerts: InspectionAlert[] = []
  for (const insp of last.inspections) {
    if (!insp.expirationDate) continue
    const { expired, daysUntilExpiry } = computeExpiry(insp.expirationDate)
    if (expired || (daysUntilExpiry != null && daysUntilExpiry <= 30)) {
      alerts.push({
        trailerNumber,
        inspectionType: insp.type,
        label:          INSPECTION_META[insp.type].label,
        daysUntilExpiry: daysUntilExpiry ?? 0,
        severity:        expired || daysUntilExpiry! <= 0 ? 'critical' : 'warn',
      })
    }
  }
  return alerts
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS_KEY    = '3b-trailer-events'
const MAX_LOCAL = 200

export function readLocalTrailerEvents(): TrailerEvent[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as TrailerEvent[] }
  catch { return [] }
}

function writeLocal(events: TrailerEvent[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(events.slice(0, MAX_LOCAL))) }
  catch { /* storage full */ }
}

function upsertLocal(event: TrailerEvent) {
  const existing = readLocalTrailerEvents()
  const idx = existing.findIndex(e => e.id === event.id)
  if (idx >= 0) { existing[idx] = event; writeLocal(existing) }
  else          { writeLocal([event, ...existing]) }
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

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveTrailerEvent(event: TrailerEvent): Promise<void> {
  event.updatedAt = new Date().toISOString()

  // 1. localStorage — always instant
  upsertLocal(event)

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

    // Strip base64 from docs and inspection photos before sync
    const docsForSync = event.documents.map(({ dataUrl: _d, ...rest }) => rest)
    const inspsForSync = event.inspections.map(({ photoDataUrl: _p, ...rest }) => rest)
    // Condition stripped of any embedded data
    const conditionForSync = event.condition.map(c => ({ id: c.id, label: c.label, status: c.status, notes: c.notes }))

    await supabase.from('fleet_trailer_events').upsert({
      id:                event.id,
      user_id:           user.id,
      business_id:       businessId,
      load_id:           event.loadId        ?? null,
      order_number:      event.orderNumber   ?? null,
      tractor_id:        event.tractorId     ?? null,
      event_type:        event.eventType,
      trailer_number:    event.trailerNumber,
      gps_lat:           event.gpsLat        ?? null,
      gps_lng:           event.gpsLng        ?? null,
      location_label:    event.locationLabel ?? null,
      seal_number:       event.sealNumber    ?? null,
      bol_attached:      event.bolAttached   ?? null,
      receiver:          event.receiver      ?? null,
      pod_signed:        event.podSigned     ?? null,
      seal_verified:     event.sealVerified  ?? null,
      delivery_condition: event.deliveryCondition ?? null,
      reefer_fuel_pct:   event.reeferFuelPct ?? null,
      condition:         conditionForSync,
      inspections:       inspsForSync,
      documents:         docsForSync,
      notes:             event.notes,
      driver_ack:        event.driverAck     ?? false,
      created_at:        event.createdAt,
      updated_at:        event.updatedAt,
    }, { onConflict: 'id' })
  } catch { /* offline — local record is sufficient */ }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function newTrailerEvent(ctx: {
  eventType?:    TrailerEventType
  trailerNumber?: string
  loadId?:       string
  orderNumber?:  string
  tractorId?:    string
}): TrailerEvent {
  return {
    id:            crypto.randomUUID(),
    eventType:     ctx.eventType ?? 'empty_hook',
    trailerNumber: ctx.trailerNumber ?? '',
    loadId:        ctx.loadId,
    orderNumber:   ctx.orderNumber,
    tractorId:     ctx.tractorId,
    condition:     defaultConditionList(),
    inspections:   [],
    documents:     [],
    notes:         '',
    createdAt:     new Date().toISOString(),
    updatedAt:     new Date().toISOString(),
  }
}
