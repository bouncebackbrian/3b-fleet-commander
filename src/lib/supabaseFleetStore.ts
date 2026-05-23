'use client'
/**
 * supabaseFleetStore.ts — Unified Supabase persistence layer for Fleet Commander
 *
 * Write-through pattern:
 *   1. Write to localStorage immediately (instant UI, zero latency)
 *   2. Upsert to Supabase async (background sync, fault-tolerant)
 *   3. Return a SyncResult so callers can show save indicators
 *
 * All functions fall back gracefully when Supabase is unavailable —
 * localStorage is always the source of truth for the active session.
 *
 * Tables (Fleet project: goqzhdrmrdlkchmwfiur):
 *   fleet_loads            — load records (missions)
 *   fleet_load_stops       — stop rows with FK to fleet_loads
 *   fleet_driver_updates   — driver-to-dispatch structured messages
 *   fleet_alerts           — dispatch + predictive fleet alerts
 *   fleet_documents        — photos, PDFs, scans
 *   fleet_inspections      — DOT roadside inspection records
 *   fleet_violations       — violation / warning / citation records
 *   fleet_repairs          — repair records linked to violations
 */

import { createClient } from '@/lib/supabase-browser'
import type { MissionStop } from '@/lib/dashboard/types'
import type { DriverUpdate, DispatchAlert } from '@/lib/dispatchEngine'
import type { ViolationRecord, RepairRecord } from '@/lib/violationVault'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SyncResult = {
  ok:      boolean
  id?:     string   // Supabase uuid returned on insert
  error?:  string
}

export interface FleetLoad {
  id?:                  string    // uuid — set by Supabase on first save
  loadNumber:           string
  orderNumber?:         string
  broker?:              string
  dispatcher?:          string
  commodity?:           string
  origin:               string
  destination:          string
  originName?:          string
  destName?:            string
  tractorId?:           string
  trailerNum?:          string
  trailerPlate?:        string
  trailerType?:         string
  rigType?:             string
  grossRate:            number
  cpmRate?:             number
  fuelPrice?:           number
  dispatchMiles:        number
  deadheadMiles:        number
  actualMiles?:         number
  paidMiles?:           number
  loadDate:             string    // YYYY-MM-DD
  pickupAppt?:          string    // ISO
  deliveryAppt?:        string    // ISO
  status:               string    // draft | active | en_route | delivered | completed | cancelled
  routePreference?:     string
  routeNotes?:          string
  waitHours?:           number
  detentionHours?:      number
  detentionPay?:        number
  settlementPay?:       number
  settlementVerified?:  boolean
  driverName?:          string
  driverType?:          string
  paperworkLocation?:   string
  proofSaved?:          boolean
  notes?:               string
  hosNotes?:            string
  metadata?:            Record<string, unknown>
  intakeStep?:          number
  isDraft?:             boolean
  createdAt?:           string
  updatedAt?:           string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sb() {
  try { return createClient() } catch { return null }
}

function uid() {
  return `fl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS = {
  loads:    '3b-fleet-loads',
  stops:    '3b-fleet-load-stops',
  updates:  '3b-driver-updates',
  alerts:   '3b-dispatch-alerts',
  violations: '3b-violations',
  repairs:    '3b-repairs',
}

function lsRead<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}
function lsSave<T>(key: string, list: T[], max = 500) {
  localStorage.setItem(key, JSON.stringify((list as T[]).slice(0, max)))
}

// ── Load CRUD ─────────────────────────────────────────────────────────────────

/**
 * Save a new load draft or update existing.
 * Writes to localStorage first, then upserts to Supabase.
 */
export async function saveLoad(load: FleetLoad): Promise<SyncResult & { load: FleetLoad }> {
  const now = new Date().toISOString()

  // Ensure local id for tracking
  const localId = load.id ?? uid()
  const record  = { ...load, id: localId, updatedAt: now, createdAt: load.createdAt ?? now }

  // Write to localStorage
  const existing = lsRead<FleetLoad>(LS.loads)
  const idx = existing.findIndex(l => l.id === localId)
  if (idx !== -1) existing[idx] = record
  else existing.unshift(record)
  lsSave(LS.loads, existing, 300)

  // Upsert to Supabase
  const client = sb()
  if (!client) return { ok: true, id: localId, load: record }

  const { data, error } = await client
    .from('fleet_loads')
    .upsert(loadToRow(record), { onConflict: 'id' })
    .select('id')
    .single()

  if (error) {
    console.warn('[fleetStore] saveLoad failed:', error.message)
    return { ok: false, error: error.message, id: localId, load: record }
  }

  // Update local record with confirmed Supabase uuid
  const confirmedId = data?.id ?? localId
  if (confirmedId !== localId) {
    record.id = confirmedId
    const fresh = lsRead<FleetLoad>(LS.loads)
    const i2 = fresh.findIndex(l => l.id === localId)
    if (i2 !== -1) { fresh[i2] = record; lsSave(LS.loads, fresh, 300) }
  }

  return { ok: true, id: confirmedId, load: record }
}

export function getLoads(): FleetLoad[] {
  return lsRead<FleetLoad>(LS.loads)
}

export function getLoad(id: string): FleetLoad | undefined {
  return lsRead<FleetLoad>(LS.loads).find(l => l.id === id)
}

export async function deleteLoad(id: string): Promise<SyncResult> {
  const list = lsRead<FleetLoad>(LS.loads).filter(l => l.id !== id)
  lsSave(LS.loads, list, 300)

  const client = sb()
  if (!client) return { ok: true }
  const { error } = await client.from('fleet_loads').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Fetch all non-draft loads from Supabase and refresh localStorage */
export async function syncLoadsFromSupabase(): Promise<FleetLoad[]> {
  const client = sb()
  if (!client) return getLoads()

  const { data, error } = await client
    .from('fleet_loads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error || !data) return getLoads()
  const loads = data.map(rowToLoad)
  lsSave(LS.loads, loads, 300)
  return loads
}

// ── Stop CRUD ─────────────────────────────────────────────────────────────────

export interface FleetStop extends MissionStop {
  loadId?: string   // Supabase uuid of parent fleet_loads row
}

export async function saveStops(loadId: string, loadNumber: string, stops: FleetStop[]): Promise<SyncResult> {
  // Write to localStorage — keyed by loadId
  const allStops = lsRead<FleetStop & { loadId: string }>(LS.stops)
  const others   = allStops.filter(s => s.loadId !== loadId)
  const tagged   = stops.map(s => ({ ...s, loadId }))
  lsSave(LS.stops, [...tagged, ...others], 1000)

  const client = sb()
  if (!client) return { ok: true }

  // Delete existing stops for this load, then insert fresh
  await client.from('fleet_load_stops').delete().eq('load_id', loadId)

  if (stops.length === 0) return { ok: true }

  const rows = stops.map((s, i) => stopToRow(s, loadId, loadNumber, i + 1))
  const { error } = await client.from('fleet_load_stops').insert(rows)
  if (error) {
    console.warn('[fleetStore] saveStops failed:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export function getStopsForLoad(loadId: string): FleetStop[] {
  const all = lsRead<FleetStop & { loadId: string }>(LS.stops)
  return all.filter(s => s.loadId === loadId).sort((a, b) => a.sequence - b.sequence)
}

export async function updateStop(loadId: string, stopId: string, patch: Partial<MissionStop>): Promise<SyncResult> {
  const all = lsRead<FleetStop & { loadId: string }>(LS.stops)
  const idx = all.findIndex(s => s.id === stopId && s.loadId === loadId)
  if (idx !== -1) { all[idx] = { ...all[idx], ...patch }; lsSave(LS.stops, all, 1000) }

  const client = sb()
  if (!client) return { ok: true }

  const { error } = await client
    .from('fleet_load_stops')
    .update(stopPatchToRow(patch))
    .eq('load_id', loadId)
    .eq('id', stopId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── Driver Updates ────────────────────────────────────────────────────────────

export async function persistDriverUpdate(update: DriverUpdate): Promise<SyncResult> {
  const client = sb()
  if (!client) return { ok: true }

  const { data, error } = await client
    .from('fleet_driver_updates')
    .insert({
      load_number:  update.loadNumber,
      driver_name:  update.driverName,
      update_type:  update.type,
      severity:     update.severity,
      location:     update.location ?? null,
      notes:        update.notes    ?? null,
      hos_drive:    update.hosDrive ?? null,
      hos_shift:    update.hosShift ?? null,
      requires_ack: update.ackRequired ?? false,
      occurred_at:  update.timestamp,
    })
    .select('id')
    .single()

  if (error) { console.warn('[fleetStore] persistDriverUpdate:', error.message); return { ok: false, error: error.message } }
  return { ok: true, id: data?.id }
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export async function persistAlert(alert: DispatchAlert): Promise<SyncResult> {
  const client = sb()
  if (!client) return { ok: true }

  const { data, error } = await client
    .from('fleet_alerts')
    .insert({
      load_number:  alert.loadNumber,
      tier:         alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'warning' : 'info',
      category:     'dispatch',
      title:        alert.title,
      body:         alert.body      ?? null,
      acked:        alert.resolved  ?? false,
      escalated:    false,
      created_at:   alert.timestamp,
    })
    .select('id')
    .single()

  if (error) { console.warn('[fleetStore] persistAlert:', error.message); return { ok: false, error: error.message } }
  return { ok: true, id: data?.id }
}

// ── Violations ────────────────────────────────────────────────────────────────

export async function persistViolation(v: ViolationRecord): Promise<SyncResult> {
  const client = sb()
  if (!client) return { ok: true }

  const { data, error } = await client
    .from('fleet_violations')
    .upsert({
      load_number:      v.loadNumber    ?? null,
      violation_type:   v.type,
      severity:         v.severity,
      status:           v.status,
      incident_date:    v.date,
      location:         v.location      ?? null,
      state:            v.state         ?? null,
      agency:           v.agency        ?? null,
      officer_name:     v.officerName   ?? null,
      officer_badge:    v.officerBadge  ?? null,
      report_number:    v.reportNumber  ?? null,
      tractor_id:       v.truckId       ?? null,
      trailer_num:      v.trailerId     ?? null,
      violation_codes:  v.violationCodes ?? [],
      description:      v.description,
      oos_category:     v.oosCategory   ?? null,
      verified_at:      v.verifiedAt    ?? null,
      verified_by:      v.verifiedBy    ?? null,
      verification_note: v.verificationNote ?? null,
    }, { onConflict: 'id' })
    .select('id')
    .single()

  if (error) { console.warn('[fleetStore] persistViolation:', error.message); return { ok: false, error: error.message } }
  return { ok: true, id: data?.id }
}

export async function persistRepair(r: RepairRecord): Promise<SyncResult> {
  const client = sb()
  if (!client) return { ok: true }

  const { data, error } = await client
    .from('fleet_repairs')
    .upsert({
      violation_id:   r.violationId,
      description:    r.description,
      shop:           r.shop            ?? null,
      tech_name:      r.techName        ?? null,
      invoice_number: r.invoiceNumber   ?? null,
      cost:           r.cost            ?? null,
      repair_date:    r.date,
      notes:          r.notes           ?? null,
    }, { onConflict: 'id' })
    .select('id')
    .single()

  if (error) { console.warn('[fleetStore] persistRepair:', error.message); return { ok: false, error: error.message } }
  return { ok: true, id: data?.id }
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function loadToRow(l: FleetLoad): Record<string, unknown> {
  return {
    id:                   l.id,
    load_number:          l.loadNumber,
    order_number:         l.orderNumber         ?? null,
    broker:               l.broker              ?? null,
    dispatcher:           l.dispatcher          ?? null,
    commodity:            l.commodity           ?? null,
    origin:               l.origin,
    destination:          l.destination,
    origin_name:          l.originName          ?? null,
    dest_name:            l.destName            ?? null,
    tractor_id:           l.tractorId           ?? null,
    trailer_num:          l.trailerNum          ?? null,
    trailer_plate:        l.trailerPlate        ?? null,
    trailer_type:         l.trailerType         ?? null,
    rig_type:             l.rigType             ?? null,
    gross_rate:           l.grossRate,
    cpm_rate:             l.cpmRate             ?? null,
    fuel_price:           l.fuelPrice           ?? null,
    dispatch_miles:       l.dispatchMiles,
    deadhead_miles:       l.deadheadMiles,
    actual_miles:         l.actualMiles         ?? null,
    paid_miles:           l.paidMiles           ?? null,
    load_date:            l.loadDate,
    pickup_appt:          l.pickupAppt          ?? null,
    delivery_appt:        l.deliveryAppt        ?? null,
    status:               l.status,
    route_preference:     l.routePreference     ?? null,
    route_notes:          l.routeNotes          ?? null,
    wait_hours:           l.waitHours           ?? null,
    detention_hours:      l.detentionHours      ?? null,
    detention_pay:        l.detentionPay        ?? null,
    settlement_pay:       l.settlementPay       ?? null,
    settlement_verified:  l.settlementVerified  ?? false,
    driver_name:          l.driverName          ?? null,
    driver_type:          l.driverType          ?? null,
    paperwork_location:   l.paperworkLocation   ?? null,
    proof_saved:          l.proofSaved          ?? false,
    notes:                l.notes               ?? null,
    hos_notes:            l.hosNotes            ?? null,
    metadata:             l.metadata            ?? {},
    intake_step:          l.intakeStep          ?? 1,
    is_draft:             l.isDraft             ?? true,
  }
}

function rowToLoad(r: Record<string, unknown>): FleetLoad {
  return {
    id:                  r.id                  as string,
    loadNumber:          r.load_number         as string,
    orderNumber:         r.order_number        as string | undefined,
    broker:              r.broker              as string | undefined,
    dispatcher:          r.dispatcher          as string | undefined,
    commodity:           r.commodity           as string | undefined,
    origin:              r.origin              as string,
    destination:         r.destination         as string,
    originName:          r.origin_name         as string | undefined,
    destName:            r.dest_name           as string | undefined,
    tractorId:           r.tractor_id          as string | undefined,
    trailerNum:          r.trailer_num         as string | undefined,
    trailerPlate:        r.trailer_plate       as string | undefined,
    trailerType:         r.trailer_type        as string | undefined,
    rigType:             r.rig_type            as string | undefined,
    grossRate:           Number(r.gross_rate)  || 0,
    cpmRate:             r.cpm_rate            ? Number(r.cpm_rate)   : undefined,
    fuelPrice:           r.fuel_price          ? Number(r.fuel_price) : undefined,
    dispatchMiles:       Number(r.dispatch_miles) || 0,
    deadheadMiles:       Number(r.deadhead_miles) || 0,
    actualMiles:         r.actual_miles        ? Number(r.actual_miles) : undefined,
    paidMiles:           r.paid_miles          ? Number(r.paid_miles)   : undefined,
    loadDate:            r.load_date           as string,
    pickupAppt:          r.pickup_appt         as string | undefined,
    deliveryAppt:        r.delivery_appt       as string | undefined,
    status:              r.status              as string,
    routePreference:     r.route_preference    as string | undefined,
    routeNotes:          r.route_notes         as string | undefined,
    waitHours:           r.wait_hours          ? Number(r.wait_hours) : undefined,
    detentionHours:      r.detention_hours     ? Number(r.detention_hours) : undefined,
    detentionPay:        r.detention_pay       ? Number(r.detention_pay)   : undefined,
    settlementPay:       r.settlement_pay      ? Number(r.settlement_pay)  : undefined,
    settlementVerified:  Boolean(r.settlement_verified),
    driverName:          r.driver_name         as string | undefined,
    driverType:          r.driver_type         as string | undefined,
    paperworkLocation:   r.paperwork_location  as string | undefined,
    proofSaved:          Boolean(r.proof_saved),
    notes:               r.notes              as string | undefined,
    hosNotes:            r.hos_notes           as string | undefined,
    metadata:            (r.metadata as Record<string, unknown>) ?? {},
    intakeStep:          Number(r.intake_step) || 1,
    isDraft:             Boolean(r.is_draft),
    createdAt:           r.created_at          as string,
    updatedAt:           r.updated_at          as string,
  }
}

function stopToRow(s: FleetStop, loadId: string, loadNumber: string, seq: number): Record<string, unknown> {
  return {
    load_id:           loadId,
    load_number:       loadNumber,
    sequence:          seq,
    stop_type:         s.type,
    name:              s.name         ?? '',
    address:           s.address      ?? null,
    city:              s.city         ?? null,
    state:             s.state        ?? null,
    phone:             s.phone        ?? null,
    appointment_start: s.appointmentStart ?? null,
    appointment_end:   s.appointmentEnd   ?? null,
    reference:         s.reference    ?? null,
    lifecycle_status:  s.lifecycleStatus ?? null,
    completed:         s.completed    ?? false,
    completed_at:      s.completedAt  ?? null,
    notes:             s.notes        ?? null,
    order_number:      s.orderNumber  ?? null,
    mission_id:        s.missionId    ?? null,
  }
}

function stopPatchToRow(patch: Partial<MissionStop>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (patch.lifecycleStatus !== undefined) row.lifecycle_status = patch.lifecycleStatus
  if (patch.completed       !== undefined) row.completed        = patch.completed
  if (patch.completedAt     !== undefined) row.completed_at     = patch.completedAt
  if (patch.notes           !== undefined) row.notes            = patch.notes
  if (patch.appointmentStart !== undefined) row.appointment_start = patch.appointmentStart
  if (patch.appointmentEnd   !== undefined) row.appointment_end   = patch.appointmentEnd
  if (patch.reference       !== undefined) row.reference        = patch.reference
  if (patch.lifecycleTimestamps) {
    const ts = patch.lifecycleTimestamps
    if (ts.arrived)     row.arrived_at      = ts.arrived
    if (ts.checked_in)  row.checked_in_at   = ts.checked_in
    if (ts.waiting)     row.waiting_at      = ts.waiting
    if (ts.docked)      row.docked_at       = ts.docked
    if (ts.work_started) row.work_started_at = ts.work_started
    if (ts.work_ended)  row.work_ended_at   = ts.work_ended
    if (ts.departed)    row.departed_at     = ts.departed
  }
  return row
}

// ── Draft management ──────────────────────────────────────────────────────────

/** Save intake wizard progress so driver can resume later */
export function saveIntakeDraft(draft: Partial<FleetLoad> & { stops?: FleetStop[] }): void {
  localStorage.setItem('3b-intake-draft', JSON.stringify({
    ...draft,
    savedAt: new Date().toISOString(),
  }))
}

export function getIntakeDraft(): (Partial<FleetLoad> & { stops?: FleetStop[]; savedAt?: string }) | null {
  try {
    const raw = localStorage.getItem('3b-intake-draft')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function clearIntakeDraft(): void {
  localStorage.removeItem('3b-intake-draft')
}

/** Returns true if a draft was started within the last 24 hours */
export function hasFreshDraft(): boolean {
  const draft = getIntakeDraft()
  if (!draft?.savedAt) return false
  const age = Date.now() - new Date(draft.savedAt).getTime()
  return age < 24 * 60 * 60 * 1000
}
