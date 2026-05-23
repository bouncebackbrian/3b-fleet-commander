'use client'
/**
 * trailerIntelligence.ts — Trailer + Inspection Intelligence data layer
 *
 * Wraps four existing Supabase tables:
 *   fleet_trailer_profiles  — persistent per-trailer memory
 *   fleet_pretrip_records   — pre-trip checklists tied to loads
 *   fleet_tire_logs         — PSI + tread depth readings per position
 *   fleet_trailer_events    — pickup / drop / hook / damage events
 *   fleet_inspections       — DOT/annual inspection records (from violationVault)
 *
 * Write-through: localStorage first (instant UI) → Supabase async.
 *
 * LS keys:
 *   3b-trailer-profiles  — TrailerProfile[]  (max 50)
 *   3b-pretrip-records   — PreTripRecord[]   (max 200)
 *   3b-tire-logs         — TireLog[]         (max 500)
 *   3b-trailer-events    — TrailerEvent[]    (max 300)
 */

import { createClient } from '@/lib/supabase-browser'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TrailerType = 'dry_van' | 'reefer' | 'flatbed' | 'step_deck' | 'tanker' | 'other'

export interface DamageItem {
  id:        string
  area:      'front' | 'rear' | 'left_side' | 'right_side' | 'roof' | 'floor' | 'doors' | 'landing_gear' | 'other'
  type:      'dent' | 'scratch' | 'hole' | 'crack' | 'broken_light' | 'torn_seal' | 'flat_tire' | 'other'
  severity:  'minor' | 'moderate' | 'major'
  note?:     string
  photoId?:  string   // proofVault doc id
  preExisting: boolean
  loggedAt:  string
  loadNumber?: string
}

export interface TrailerProfile {
  id:                      string
  trailerNumber:           string
  trailerType?:            TrailerType
  year?:                   string
  make?:                   string
  plate?:                  string
  vin?:                    string
  annualInspectionDate?:   string  // YYYY-MM-DD
  annualInspectionExpires?: string
  stateInspectionDate?:    string
  stateInspectionExpires?: string
  conditionNotes?:         string
  damageLog:               DamageItem[]
  totalLoads:              number
  totalMiles:              number
  lastUsedAt?:             string
  lastLoadNumber?:         string
  supabaseId?:             string
  createdAt:               string
  updatedAt:               string
}

// ── Pre-trip checklist ────────────────────────────────────────────────────────

export type CheckResult = 'pass' | 'fail' | 'na'

export interface CheckItem {
  id:      string
  label:   string
  result:  CheckResult
  note?:   string
}

export interface CheckCategory {
  id:      string
  label:   string
  emoji:   string
  items:   CheckItem[]
}

export interface PreTripRecord {
  id:            string
  truckNumber:   string
  trailerNumber: string
  loadId?:       string
  loadNumber?:   string
  orderNumber?:  string
  categories:    CheckCategory[]
  result:        'pass' | 'fail' | 'conditional'
  failCount:     number
  notes:         string
  signedOff:     boolean
  gpsLat?:       number
  gpsLng?:       number
  supabaseId?:   string
  createdAt:     string
}

// ── Tire log ──────────────────────────────────────────────────────────────────

export type TirePosition =
  // Steer axle
  | 'steer_L' | 'steer_R'
  // Drive axle 1
  | 'drive1_LO' | 'drive1_LI' | 'drive1_RI' | 'drive1_RO'
  // Drive axle 2
  | 'drive2_LO' | 'drive2_LI' | 'drive2_RI' | 'drive2_RO'
  // Trailer axle 1
  | 'trail1_LO' | 'trail1_LI' | 'trail1_RI' | 'trail1_RO'
  // Trailer axle 2
  | 'trail2_LO' | 'trail2_LI' | 'trail2_RI' | 'trail2_RO'

export interface TireReading {
  position:    TirePosition
  treadDepth?: number   // 32nds of an inch — DOT min 2/32 steer, 4/32 other warn
  psi?:        number   // PSI (typical steer 110, drive/trailer 100)
  condition:   'good' | 'worn' | 'low_tread' | 'flat' | 'bulge' | 'replace'
  note?:       string
}

export interface TireLog {
  id:            string
  truckNumber:   string
  trailerNumber: string
  loadId?:       string
  readings:      TireReading[]
  notes:         string
  gpsLat?:       number
  gpsLng?:       number
  supabaseId?:   string
  createdAt:     string
}

// ── Trailer events ────────────────────────────────────────────────────────────

export type TrailerEventType =
  | 'pickup'           // hooking a new trailer
  | 'drop'             // dropping a trailer
  | 'empty_hook'       // hooking an empty trailer
  | 'inspection'       // visual inspection at scene
  | 'damage_found'     // damage discovered
  | 'damage_cleared'   // pre-existing damage confirmed cleared
  | 'reefer_check'     // reefer unit check
  | 'seal_verified'    // seal # confirmed
  | 'fuel_added'       // reefer fuel added

export interface TrailerEvent {
  id:              string
  eventType:       TrailerEventType
  trailerNumber:   string
  tractorId?:      string
  loadId?:         string
  loadNumber?:     string
  orderNumber?:    string
  locationLabel?:  string
  gpsLat?:         number
  gpsLng?:         number
  sealNumber?:     string
  sealVerified?:   boolean
  bolAttached?:    boolean
  reeferFuelPct?:  number
  reeferTempSet?:  number
  // Condition snapshot
  condition:       Record<string, CheckResult>   // area → result
  damageItems:     DamageItem[]
  // Docs
  photoIds:        string[]   // proofVault doc ids
  notes:           string
  driverAck:       boolean
  supabaseId?:     string
  createdAt:       string
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export const TIRE_POSITION_META: Record<TirePosition, { label: string; group: string; minTread: number; targetPsi: number }> = {
  steer_L:    { label: 'Steer L',   group: 'Steer',    minTread: 4, targetPsi: 110 },
  steer_R:    { label: 'Steer R',   group: 'Steer',    minTread: 4, targetPsi: 110 },
  drive1_LO:  { label: 'D1 LO',     group: 'Drive 1',  minTread: 2, targetPsi: 100 },
  drive1_LI:  { label: 'D1 LI',     group: 'Drive 1',  minTread: 2, targetPsi: 100 },
  drive1_RI:  { label: 'D1 RI',     group: 'Drive 1',  minTread: 2, targetPsi: 100 },
  drive1_RO:  { label: 'D1 RO',     group: 'Drive 1',  minTread: 2, targetPsi: 100 },
  drive2_LO:  { label: 'D2 LO',     group: 'Drive 2',  minTread: 2, targetPsi: 100 },
  drive2_LI:  { label: 'D2 LI',     group: 'Drive 2',  minTread: 2, targetPsi: 100 },
  drive2_RI:  { label: 'D2 RI',     group: 'Drive 2',  minTread: 2, targetPsi: 100 },
  drive2_RO:  { label: 'D2 RO',     group: 'Drive 2',  minTread: 2, targetPsi: 100 },
  trail1_LO:  { label: 'T1 LO',     group: 'Trailer 1',minTread: 2, targetPsi: 100 },
  trail1_LI:  { label: 'T1 LI',     group: 'Trailer 1',minTread: 2, targetPsi: 100 },
  trail1_RI:  { label: 'T1 RI',     group: 'Trailer 1',minTread: 2, targetPsi: 100 },
  trail1_RO:  { label: 'T1 RO',     group: 'Trailer 1',minTread: 2, targetPsi: 100 },
  trail2_LO:  { label: 'T2 LO',     group: 'Trailer 2',minTread: 2, targetPsi: 100 },
  trail2_LI:  { label: 'T2 LI',     group: 'Trailer 2',minTread: 2, targetPsi: 100 },
  trail2_RI:  { label: 'T2 RI',     group: 'Trailer 2',minTread: 2, targetPsi: 100 },
  trail2_RO:  { label: 'T2 RO',     group: 'Trailer 2',minTread: 2, targetPsi: 100 },
}

export const DAMAGE_AREA_META: Record<DamageItem['area'], { label: string; emoji: string }> = {
  front:        { label: 'Front',        emoji: '⬆️' },
  rear:         { label: 'Rear',         emoji: '⬇️' },
  left_side:    { label: 'Left Side',    emoji: '◀️' },
  right_side:   { label: 'Right Side',   emoji: '▶️' },
  roof:         { label: 'Roof',         emoji: '⬆️' },
  floor:        { label: 'Floor',        emoji: '⬇️' },
  doors:        { label: 'Doors',        emoji: '🚪' },
  landing_gear: { label: 'Landing Gear', emoji: '🦵' },
  other:        { label: 'Other',        emoji: '❓' },
}

// ── Default pre-trip checklist template ───────────────────────────────────────

export function makeDefaultChecklist(isReefer = false): CheckCategory[] {
  const base: CheckCategory[] = [
    {
      id: 'tires', label: 'Tires', emoji: '🔵',
      items: [
        { id: 'tire_visual',  label: 'No visible cuts, bulges, or flat tires', result: 'pass' },
        { id: 'tire_tread',   label: 'Tread depth ≥ 2/32" (4/32" steer)',     result: 'pass' },
        { id: 'tire_psi',     label: 'Tire pressure within spec',              result: 'pass' },
        { id: 'tire_valve',   label: 'Valve stems & caps present',             result: 'pass' },
      ],
    },
    {
      id: 'brakes', label: 'Brakes', emoji: '🔴',
      items: [
        { id: 'brake_lines',    label: 'Air lines & glad hands secure/sealed',   result: 'pass' },
        { id: 'brake_glad',     label: 'Glad hands connected, no air leaks',     result: 'pass' },
        { id: 'brake_slack',    label: 'Slack adjusters in range (< 1" travel)', result: 'pass' },
        { id: 'brake_drums',    label: 'No cracked drums or worn linings visible', result: 'pass' },
      ],
    },
    {
      id: 'lights', label: 'Lights', emoji: '💡',
      items: [
        { id: 'light_tail',     label: 'Tail / brake / turn lights working',      result: 'pass' },
        { id: 'light_marker',   label: 'All marker / clearance lights working',   result: 'pass' },
        { id: 'light_reflector',label: 'Reflectors present and clean',            result: 'pass' },
        { id: 'light_interior', label: 'Interior cargo lights (if equipped)',      result: 'na'   },
      ],
    },
    {
      id: 'coupling', label: 'Coupling', emoji: '🔗',
      items: [
        { id: 'fifth_wheel',  label: '5th wheel fully locked, handle secured',  result: 'pass' },
        { id: 'kingpin',      label: 'Kingpin fully seated, no movement',        result: 'pass' },
        { id: 'safety_chain', label: 'Safety chains crossed and secured',        result: 'pass' },
        { id: 'elec_conn',    label: 'Electrical connection secure, ABS light off', result: 'pass' },
      ],
    },
    {
      id: 'body', label: 'Trailer Body', emoji: '🚛',
      items: [
        { id: 'doors',        label: 'Doors open/close properly, hinges ok',    result: 'pass' },
        { id: 'door_seals',   label: 'Door seals intact, no gaps',              result: 'pass' },
        { id: 'floor',        label: 'Floor solid, no holes or soft spots',     result: 'pass' },
        { id: 'walls_roof',   label: 'Walls and roof no major damage',          result: 'pass' },
        { id: 'landing_gear', label: 'Landing gear fully raised and secured',   result: 'pass' },
      ],
    },
    {
      id: 'cargo', label: 'Cargo / Securement', emoji: '📦',
      items: [
        { id: 'cargo_blocked',  label: 'Cargo properly blocked and braced',     result: 'pass' },
        { id: 'cargo_straps',   label: 'Straps / chains rated and secured',     result: 'pass' },
        { id: 'cargo_sealed',   label: 'Trailer sealed (if required)',           result: 'na'   },
        { id: 'weight_ok',      label: 'Weight within legal limits',             result: 'pass' },
      ],
    },
  ]

  if (isReefer) {
    base.push({
      id: 'reefer', label: 'Reefer Unit', emoji: '❄️',
      items: [
        { id: 'reefer_temp',    label: 'Temp set to load requirement',           result: 'pass' },
        { id: 'reefer_fuel',    label: 'Reefer fuel ≥ 25%',                      result: 'pass' },
        { id: 'reefer_alarms',  label: 'No active alarms on reefer unit',        result: 'pass' },
        { id: 'reefer_drain',   label: 'Drain plug secure / condensate ok',      result: 'pass' },
      ],
    })
  }

  return base
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const LS = {
  profiles: '3b-trailer-profiles',
  pretrip:  '3b-pretrip-records',
  tireLogs: '3b-tire-logs',
  events:   '3b-trailer-events',
}

function lsRead<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}

// Supabase fire-and-forget — PostgrestFilterBuilder is PromiseLike, not full Promise
function sbFire(query: PromiseLike<unknown>): void {
  Promise.resolve(query).catch(() => { /* silent */ })
}
function lsSave<T>(key: string, list: T[], max = 300) {
  localStorage.setItem(key, JSON.stringify((list as T[]).slice(0, max)))
}

function uid() { return `ti-${Date.now()}-${Math.random().toString(36).slice(2,8)}` }

function sb() { try { return createClient() } catch { return null } }

// ── Trailer profiles ──────────────────────────────────────────────────────────

export function getProfiles(): TrailerProfile[] {
  return lsRead<TrailerProfile>(LS.profiles)
}

export function getProfile(trailerNumber: string): TrailerProfile | undefined {
  return lsRead<TrailerProfile>(LS.profiles).find(p => p.trailerNumber === trailerNumber)
}

export async function saveProfile(input: Omit<TrailerProfile, 'id' | 'damageLog' | 'totalLoads' | 'totalMiles' | 'createdAt' | 'updatedAt'> & Partial<Pick<TrailerProfile, 'damageLog' | 'totalLoads' | 'totalMiles'>>): Promise<TrailerProfile> {
  const now = new Date().toISOString()
  const profiles = lsRead<TrailerProfile>(LS.profiles)
  const existing = profiles.find(p => p.trailerNumber === input.trailerNumber)

  const profile: TrailerProfile = {
    ...existing,
    ...input,
    id:         existing?.id ?? uid(),
    damageLog:  input.damageLog  ?? existing?.damageLog  ?? [],
    totalLoads: input.totalLoads ?? existing?.totalLoads ?? 0,
    totalMiles: input.totalMiles ?? existing?.totalMiles ?? 0,
    createdAt:  existing?.createdAt ?? now,
    updatedAt:  now,
  }

  const idx = profiles.findIndex(p => p.trailerNumber === input.trailerNumber)
  if (idx !== -1) profiles[idx] = profile
  else profiles.unshift(profile)
  lsSave(LS.profiles, profiles, 50)

  // Supabase upsert
  const client = sb()
  if (client) {
    sbFire(client.from('fleet_trailer_profiles').upsert({
      trailer_number:            profile.trailerNumber,
      trailer_type:              profile.trailerType   ?? null,
      year:                      profile.year          ?? null,
      make:                      profile.make          ?? null,
      plate:                     profile.plate         ?? null,
      vin:                       profile.vin           ?? null,
      annual_inspection_date:    profile.annualInspectionDate    ?? null,
      annual_inspection_expires: profile.annualInspectionExpires ?? null,
      state_inspection_date:     profile.stateInspectionDate     ?? null,
      state_inspection_expires:  profile.stateInspectionExpires  ?? null,
      condition_notes:           profile.conditionNotes ?? null,
      damage_log:                profile.damageLog,
      total_loads:               profile.totalLoads,
      total_miles:               profile.totalMiles,
      last_used_at:              profile.lastUsedAt   ?? null,
      last_load_number:          profile.lastLoadNumber ?? null,
    }, { onConflict: 'trailer_number' }))
  }

  return profile
}

export function addDamageToProfile(trailerNumber: string, damage: Omit<DamageItem, 'id' | 'loggedAt'>): void {
  const profiles = lsRead<TrailerProfile>(LS.profiles)
  const idx = profiles.findIndex(p => p.trailerNumber === trailerNumber)
  if (idx === -1) return
  const item: DamageItem = { ...damage, id: uid(), loggedAt: new Date().toISOString() }
  profiles[idx].damageLog = [item, ...profiles[idx].damageLog]
  profiles[idx].updatedAt = new Date().toISOString()
  lsSave(LS.profiles, profiles, 50)
}

// ── Pre-trip records ──────────────────────────────────────────────────────────

export function getPreTripRecords(limit = 50): PreTripRecord[] {
  return lsRead<PreTripRecord>(LS.pretrip).slice(0, limit)
}

export function getLastPreTrip(trailerNumber?: string): PreTripRecord | undefined {
  const all = lsRead<PreTripRecord>(LS.pretrip)
  return trailerNumber ? all.find(r => r.trailerNumber === trailerNumber) : all[0]
}

export async function savePreTrip(record: Omit<PreTripRecord, 'id' | 'createdAt'>): Promise<PreTripRecord> {
  const now = new Date().toISOString()
  const saved: PreTripRecord = { ...record, id: uid(), createdAt: now }

  const all = lsRead<PreTripRecord>(LS.pretrip)
  all.unshift(saved)
  lsSave(LS.pretrip, all, 200)

  // Supabase
  const client = sb()
  if (client) {
    sbFire(client.from('fleet_pretrip_records').insert({
      id:             saved.id,
      truck_number:   saved.truckNumber,
      trailer_number: saved.trailerNumber,
      load_id:        saved.loadId      ?? null,
      order_number:   saved.orderNumber ?? null,
      items:          saved.categories,
      result:         saved.result,
      fail_count:     saved.failCount,
      notes:          saved.notes,
      signed_off:     saved.signedOff,
      gps_lat:        saved.gpsLat ?? null,
      gps_lng:        saved.gpsLng ?? null,
    }))
  }

  return saved
}

// ── Tire logs ─────────────────────────────────────────────────────────────────

export function getTireLogs(trailerNumber?: string, limit = 30): TireLog[] {
  const all = lsRead<TireLog>(LS.tireLogs)
  return (trailerNumber ? all.filter(l => l.trailerNumber === trailerNumber) : all).slice(0, limit)
}

export function getLastTireLog(trailerNumber: string): TireLog | undefined {
  return lsRead<TireLog>(LS.tireLogs).find(l => l.trailerNumber === trailerNumber)
}

export async function saveTireLog(record: Omit<TireLog, 'id' | 'createdAt'>): Promise<TireLog> {
  const now = new Date().toISOString()
  const saved: TireLog = { ...record, id: uid(), createdAt: now }

  const all = lsRead<TireLog>(LS.tireLogs)
  all.unshift(saved)
  lsSave(LS.tireLogs, all, 500)

  const client = sb()
  if (client) {
    sbFire(client.from('fleet_tire_logs').insert({
      id:             saved.id,
      truck_number:   saved.truckNumber,
      trailer_number: saved.trailerNumber,
      load_id:        saved.loadId ?? null,
      readings:       saved.readings,
      notes:          saved.notes,
      gps_lat:        saved.gpsLat ?? null,
      gps_lng:        saved.gpsLng ?? null,
    }))
  }

  return saved
}

// ── Trailer events ────────────────────────────────────────────────────────────

export function getTrailerEvents(trailerNumber?: string, limit = 50): TrailerEvent[] {
  const all = lsRead<TrailerEvent>(LS.events)
  return (trailerNumber ? all.filter(e => e.trailerNumber === trailerNumber) : all).slice(0, limit)
}

export async function saveTrailerEvent(record: Omit<TrailerEvent, 'id' | 'createdAt'>): Promise<TrailerEvent> {
  const now = new Date().toISOString()
  const saved: TrailerEvent = { ...record, id: uid(), createdAt: now }

  const all = lsRead<TrailerEvent>(LS.events)
  all.unshift(saved)
  lsSave(LS.events, all, 300)

  // Update profile stats
  if (saved.trailerNumber) {
    const profile = getProfile(saved.trailerNumber)
    await saveProfile({
      trailerNumber:   saved.trailerNumber,
      ...(profile ?? {}),
      lastUsedAt:      now,
      lastLoadNumber:  saved.loadNumber ?? profile?.lastLoadNumber,
      totalLoads:      (profile?.totalLoads ?? 0) + (['pickup','empty_hook'].includes(saved.eventType) ? 1 : 0),
    })
  }

  const client = sb()
  if (client) {
    sbFire(client.from('fleet_trailer_events').insert({
      load_id:          saved.loadId        ?? null,
      order_number:     saved.orderNumber   ?? null,
      tractor_id:       saved.tractorId     ?? null,
      event_type:       saved.eventType,
      trailer_number:   saved.trailerNumber,
      gps_lat:          saved.gpsLat        ?? null,
      gps_lng:          saved.gpsLng        ?? null,
      location_label:   saved.locationLabel ?? null,
      seal_number:      saved.sealNumber    ?? null,
      seal_verified:    saved.sealVerified  ?? false,
      bol_attached:     saved.bolAttached   ?? false,
      reefer_fuel_pct:  saved.reeferFuelPct ?? null,
      condition:        saved.condition,
      inspections:      saved.damageItems,
      documents:        saved.photoIds,
      notes:            saved.notes,
      driver_ack:       saved.driverAck,
    }))
  }

  return saved
}

// ── Inspection expiry analysis ────────────────────────────────────────────────

export interface InspectionExpiryAlert {
  trailerNumber: string
  type:          'annual' | 'state'
  expiresAt:     string
  daysUntil:     number
  tier:          'info' | 'preventative' | 'warning' | 'urgent' | 'critical'
}

export function getExpiryAlerts(): InspectionExpiryAlert[] {
  const profiles = lsRead<TrailerProfile>(LS.profiles)
  const alerts:   InspectionExpiryAlert[] = []
  const now       = Date.now()

  for (const p of profiles) {
    for (const [type, expiresStr] of [
      ['annual', p.annualInspectionExpires],
      ['state',  p.stateInspectionExpires],
    ] as [string, string | undefined][]) {
      if (!expiresStr) continue
      const daysUntil = Math.floor((new Date(expiresStr).getTime() - now) / 86400000)
      const tier = daysUntil < 0 ? 'critical' : daysUntil <= 7 ? 'urgent' : daysUntil <= 14 ? 'warning' : daysUntil <= 30 ? 'preventative' : 'info'
      if (daysUntil <= 45) {
        alerts.push({ trailerNumber: p.trailerNumber, type: type as 'annual' | 'state', expiresAt: expiresStr, daysUntil, tier })
      }
    }
  }

  return alerts.sort((a, b) => a.daysUntil - b.daysUntil)
}

// ── Tire analysis ─────────────────────────────────────────────────────────────

export interface TireAlert {
  position:    TirePosition
  label:       string
  issue:       string
  tier:        'warning' | 'urgent' | 'critical'
  treadDepth?: number
  psi?:        number
}

export function analyzeTires(log: TireLog): TireAlert[] {
  const alerts: TireAlert[] = []
  for (const r of log.readings) {
    const meta = TIRE_POSITION_META[r.position]
    if (r.condition === 'replace' || r.condition === 'flat') {
      alerts.push({ position: r.position, label: meta.label, issue: r.condition === 'flat' ? 'Flat tire' : 'Replace immediately', tier: 'critical', treadDepth: r.treadDepth, psi: r.psi })
      continue
    }
    if (r.treadDepth !== undefined) {
      if (r.treadDepth <= meta.minTread) {
        alerts.push({ position: r.position, label: meta.label, issue: `Tread ${r.treadDepth}/32" — at DOT minimum`, tier: 'urgent', treadDepth: r.treadDepth })
      } else if (r.treadDepth <= meta.minTread + 2) {
        alerts.push({ position: r.position, label: meta.label, issue: `Tread ${r.treadDepth}/32" — approaching minimum`, tier: 'warning', treadDepth: r.treadDepth })
      }
    }
    if (r.psi !== undefined) {
      const psiLow  = meta.targetPsi * 0.85
      const psiHigh = meta.targetPsi * 1.15
      if (r.psi < psiLow) {
        alerts.push({ position: r.position, label: meta.label, issue: `Low PSI: ${r.psi} (target ${meta.targetPsi})`, tier: r.psi < meta.targetPsi * 0.75 ? 'urgent' : 'warning', psi: r.psi })
      } else if (r.psi > psiHigh) {
        alerts.push({ position: r.position, label: meta.label, issue: `High PSI: ${r.psi} (target ${meta.targetPsi})`, tier: 'warning', psi: r.psi })
      }
    }
    if (r.condition === 'bulge') {
      alerts.push({ position: r.position, label: meta.label, issue: 'Bulge detected — replace immediately', tier: 'critical' })
    }
  }
  return alerts
}

// ── Context helpers ───────────────────────────────────────────────────────────

export function getActiveContext(): { truckNumber: string; trailerNumber: string; loadNumber: string; loadId: string } {
  try {
    const settings = JSON.parse(localStorage.getItem('3b-fleet-settings') ?? '{}')
    const lastLoad  = JSON.parse(localStorage.getItem('3b-latest-load')   ?? '{}')
    return {
      truckNumber:   settings.truckNum   ?? '',
      trailerNumber: settings.trailerNum ?? lastLoad.trailerNum ?? '',
      loadNumber:    lastLoad.loadNumber ?? '',
      loadId:        lastLoad.id         ?? '',
    }
  } catch { return { truckNumber: '', trailerNumber: '', loadNumber: '', loadId: '' } }
}
