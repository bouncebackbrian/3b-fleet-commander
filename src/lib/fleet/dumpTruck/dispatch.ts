/**
 * fleet/dumpTruck/dispatch.ts — AI Dispatch Intake & Driver Trip Planning
 *
 * The planning layer on top of the existing job/site/driver/truck tables.
 * Hector pastes/types a job -> AI parses it (route: dispatch/parse) into a
 * fleet_dt_dispatches draft + fleet_dt_dispatch_stops -> locations resolve
 * against real sites or get geocoded (resolveLocationText, sites.ts) ->
 * computeDispatchRoute gets real drive time (routing.ts) and the
 * yard-arrival/leave-yard/target-arrival recommendation
 * (dispatchPlanning.ts) -> Hector reviews/edits -> publishDispatch creates
 * the real fleet_dt_jobs row (via jobs.ts createJob, so the existing driver
 * job list / ticket-instance / shift flow all just work) and an
 * acknowledgement row per assigned driver -> the driver acknowledges and,
 * next shift, "Start Today's Dispatch" preloads the job.
 *
 * Nothing here duplicates job/site/driver/truck data — only the planning
 * metadata (timing, AI parse audit trail, version history, acknowledgement
 * tracking) those tables don't carry.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { DumpTruckError } from './shared'
import { resolveLocationText, type ResolvedLocation } from './sites'
import { createJob, listDrivers } from './jobs'
import { estimateRoute, type LatLng } from '@/lib/dumpTruck/routing'
import { computeArrivalPlan, requiredArrivalChangedMaterially } from '@/lib/dumpTruck/dispatchPlanning'
import type { DumpTruckJob } from '@/lib/dumpTruck/types'

// ── Settings ─────────────────────────────────────────────────────────────

export interface DispatchSettings {
  id: string
  businessId: string
  defaultPretripMinutes: number
  targetEarlyArrivalMinutes: number
  maxLateMinutes: number
  routeRecalcThresholdMinutes: number
  trafficEnabled: boolean
  defaultYardSiteId: string | null
  driverAckRequired: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function settingsFromRow(r: any): DispatchSettings {
  return {
    id: r.id, businessId: r.business_id,
    defaultPretripMinutes: r.default_pretrip_minutes,
    targetEarlyArrivalMinutes: r.target_early_arrival_minutes,
    maxLateMinutes: r.max_late_minutes,
    routeRecalcThresholdMinutes: r.route_recalc_threshold_minutes,
    trafficEnabled: r.traffic_enabled,
    defaultYardSiteId: r.default_yard_site_id,
    driverAckRequired: r.driver_ack_required,
  }
}

/** Fetches the business's dispatch timing policy, creating the default row on first use. */
export async function getDispatchSettings(businessId: string): Promise<DispatchSettings> {
  const { data: existing } = await fleetServiceClient
    .from('fleet_dt_dispatch_settings').select('*').eq('business_id', businessId).maybeSingle()
  if (existing) return settingsFromRow(existing)

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_dispatch_settings').insert({ business_id: businessId }).select('*').single()
  if (error) throw error
  return settingsFromRow(data)
}

export interface UpdateDispatchSettingsInput {
  defaultPretripMinutes?: number
  targetEarlyArrivalMinutes?: number
  maxLateMinutes?: number
  routeRecalcThresholdMinutes?: number
  trafficEnabled?: boolean
  defaultYardSiteId?: string | null
  driverAckRequired?: boolean
}

export async function updateDispatchSettings(
  businessId: string, input: UpdateDispatchSettingsInput, userId: string,
): Promise<DispatchSettings> {
  await getDispatchSettings(businessId) // ensures a row exists
  const patch: Record<string, unknown> = { updated_by: userId }
  if (input.defaultPretripMinutes !== undefined) patch.default_pretrip_minutes = input.defaultPretripMinutes
  if (input.targetEarlyArrivalMinutes !== undefined) patch.target_early_arrival_minutes = input.targetEarlyArrivalMinutes
  if (input.maxLateMinutes !== undefined) patch.max_late_minutes = input.maxLateMinutes
  if (input.routeRecalcThresholdMinutes !== undefined) patch.route_recalc_threshold_minutes = input.routeRecalcThresholdMinutes
  if (input.trafficEnabled !== undefined) patch.traffic_enabled = input.trafficEnabled
  if (input.defaultYardSiteId !== undefined) patch.default_yard_site_id = input.defaultYardSiteId
  if (input.driverAckRequired !== undefined) patch.driver_ack_required = input.driverAckRequired

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_dispatch_settings').update(patch).eq('business_id', businessId).select('*').single()
  if (error) throw error
  return settingsFromRow(data)
}

// ── Driver/truck default resolution ─────────────────────────────────────

/**
 * A driver's "default" truck is derived from their most recent shift — the
 * same self-updating pattern getEffectiveOpsProfileForDriver (shared.ts)
 * uses for ops_profile, rather than a hardcoded name->truck table. It never
 * locks a driver to a truck (spec requirement) — it's just the starting
 * suggestion Hector's picker pre-fills; every dispatch stores the actual
 * truck used. A driver with no shift history yet has no derivable default —
 * Hector assigns a truck manually the first time.
 */
export async function getDefaultTruckForDriver(businessId: string, driverId: string): Promise<string | null> {
  const { data } = await fleetServiceClient
    .from('fleet_dt_shifts')
    .select('truck_id')
    .eq('business_id', businessId)
    .eq('driver_id', driverId)
    .not('truck_id', 'is', null)
    .order('clock_in_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.truck_id ?? null
}

export interface DriverTruckMatch {
  driverId: string | null
  driverName: string | null
  truckId: string | null
  truckLabel: string | null
  driverMatchConfidence: 'high' | 'low' | null
  truckMatchConfidence: 'high' | 'default' | 'low' | null
}

/** Matches free-text driver/truck mentions against real business members/equipment. Never fabricates a match. */
export async function resolveDriverAndTruck(
  businessId: string, driverNameRaw: string | null, truckLabelRaw: string | null,
): Promise<DriverTruckMatch> {
  let driverId: string | null = null
  let driverName: string | null = null
  let driverMatchConfidence: DriverTruckMatch['driverMatchConfidence'] = null

  if (driverNameRaw?.trim()) {
    const needle = driverNameRaw.trim().toLowerCase()
    const drivers = await listDrivers(businessId)
    const exact = drivers.find(d => d.name.toLowerCase() === needle)
    const partial = drivers.find(d => d.name.toLowerCase().includes(needle) || needle.includes(d.name.toLowerCase()))
    const match = exact ?? partial
    if (match) {
      driverId = match.userId
      driverName = match.name
      driverMatchConfidence = exact ? 'high' : 'low'
    }
  }

  let truckId: string | null = null
  let truckLabel: string | null = null
  let truckMatchConfidence: DriverTruckMatch['truckMatchConfidence'] = null

  if (truckLabelRaw?.trim()) {
    const digits = truckLabelRaw.replace(/\D/g, '')
    const { data: trucks } = await fleetServiceClient
      .from('fleet_equipment').select('id, unit_number').eq('business_id', businessId)
    const match = (trucks ?? []).find(t => t.unit_number === truckLabelRaw.trim() || (digits && t.unit_number.replace(/\D/g, '') === digits))
    if (match) { truckId = match.id; truckLabel = match.unit_number; truckMatchConfidence = 'high' }
  }

  if (!truckId && driverId) {
    const defaultTruckId = await getDefaultTruckForDriver(businessId, driverId)
    if (defaultTruckId) {
      const { data: truck } = await fleetServiceClient.from('fleet_equipment').select('id, unit_number').eq('id', defaultTruckId).maybeSingle()
      if (truck) { truckId = truck.id; truckLabel = truck.unit_number; truckMatchConfidence = 'default' }
    }
  }

  return { driverId, driverName, truckId, truckLabel, driverMatchConfidence, truckMatchConfidence }
}

// ── Dispatch CRUD ────────────────────────────────────────────────────────

export type DispatchStopType = 'yard' | 'pickup' | 'delivery' | 'return' | 'other'

export interface DispatchStop {
  id: string
  dispatchId: string
  sequence: number
  stopType: DispatchStopType
  siteId: string | null
  siteName: string | null
  rawLocationText: string | null
  siteConfidence: 'high' | 'medium' | 'low' | null
  material: string | null
  notes: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stopFromRow(r: any): DispatchStop {
  return {
    id: r.id, dispatchId: r.dispatch_id, sequence: r.sequence, stopType: r.stop_type,
    siteId: r.site_id, siteName: r.site_name ?? null, rawLocationText: r.raw_location_text,
    siteConfidence: r.site_confidence, material: r.material, notes: r.notes,
  }
}

export interface Dispatch {
  id: string
  businessId: string
  status: 'draft' | 'published' | 'cancelled'
  rawInput: string | null
  source: 'paste' | 'manual'
  dispatchDate: string | null
  customerName: string | null
  brokerId: string | null
  brokerName: string | null
  dispatchContactName: string | null
  dispatchContactPhone: string | null
  poNumber: string | null
  jobNumber: string | null
  loadNumber: string | null
  driverId: string | null
  driverNameRaw: string | null
  truckId: string | null
  truckLabelRaw: string | null
  trailerId: string | null
  yardSiteId: string | null
  requiredArrivalAt: string | null
  material: string | null
  estQuantity: number | null
  quantityUnit: string | null
  numLoadsEstimate: number | null
  weightRequirements: string | null
  ticketRequirements: string | null
  scaleRequired: boolean | null
  specialInstructions: string | null
  gateInstructions: string | null
  contactOnArrivalInstructions: string | null
  safetyInstructions: string | null
  truckRestrictions: string | null
  trailerRequirements: string | null
  returnInstructions: string | null
  estDurationMinutes: number | null
  rateType: 'hourly' | 'per_load' | null
  customerRate: number | null
  driverPayRule: string | null
  notes: string | null
  calculatedDriveMinutes: number | null
  calculatedTrafficDriveMinutes: number | null
  recommendedYardArrivalAt: string | null
  recommendedLeaveYardAt: string | null
  targetSiteArrivalAt: string | null
  routeCalculatedAt: string | null
  jobId: string | null
  currentVersion: number
  publishedAt: string | null
  publishedBy: string | null
  cancelledAt: string | null
  cancelReason: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dispatchFromRow(r: any): Dispatch {
  return {
    id: r.id, businessId: r.business_id, status: r.status, rawInput: r.raw_input, source: r.source,
    dispatchDate: r.dispatch_date, customerName: r.customer_name, brokerId: r.broker_id, brokerName: r.broker_name,
    dispatchContactName: r.dispatch_contact_name, dispatchContactPhone: r.dispatch_contact_phone,
    poNumber: r.po_number, jobNumber: r.job_number, loadNumber: r.load_number,
    driverId: r.driver_id, driverNameRaw: r.driver_name_raw, truckId: r.truck_id, truckLabelRaw: r.truck_label_raw,
    trailerId: r.trailer_id, yardSiteId: r.yard_site_id, requiredArrivalAt: r.required_arrival_at,
    material: r.material, estQuantity: r.est_quantity != null ? Number(r.est_quantity) : null,
    quantityUnit: r.quantity_unit, numLoadsEstimate: r.num_loads_estimate,
    weightRequirements: r.weight_requirements, ticketRequirements: r.ticket_requirements, scaleRequired: r.scale_required,
    specialInstructions: r.special_instructions, gateInstructions: r.gate_instructions,
    contactOnArrivalInstructions: r.contact_on_arrival_instructions, safetyInstructions: r.safety_instructions,
    truckRestrictions: r.truck_restrictions, trailerRequirements: r.trailer_requirements,
    returnInstructions: r.return_instructions, estDurationMinutes: r.est_duration_minutes,
    rateType: r.rate_type, customerRate: r.customer_rate != null ? Number(r.customer_rate) : null,
    driverPayRule: r.driver_pay_rule, notes: r.notes,
    calculatedDriveMinutes: r.calculated_drive_minutes != null ? Number(r.calculated_drive_minutes) : null,
    calculatedTrafficDriveMinutes: r.calculated_traffic_drive_minutes != null ? Number(r.calculated_traffic_drive_minutes) : null,
    recommendedYardArrivalAt: r.recommended_yard_arrival_at, recommendedLeaveYardAt: r.recommended_leave_yard_at,
    targetSiteArrivalAt: r.target_site_arrival_at, routeCalculatedAt: r.route_calculated_at,
    jobId: r.job_id, currentVersion: r.current_version, publishedAt: r.published_at, publishedBy: r.published_by,
    cancelledAt: r.cancelled_at, cancelReason: r.cancel_reason,
    createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

export interface DispatchStopInput {
  stopType: DispatchStopType
  rawLocationText: string
  material?: string | null
  notes?: string | null
}

export interface CreateDispatchInput {
  rawInput?: string | null
  source: 'paste' | 'manual'
  dispatchDate?: string | null
  customerName?: string | null
  brokerId?: string | null
  brokerName?: string | null
  dispatchContactName?: string | null
  dispatchContactPhone?: string | null
  poNumber?: string | null
  jobNumber?: string | null
  loadNumber?: string | null
  driverNameRaw?: string | null
  truckLabelRaw?: string | null
  requiredArrivalAt?: string | null
  material?: string | null
  estQuantity?: number | null
  quantityUnit?: string | null
  numLoadsEstimate?: number | null
  weightRequirements?: string | null
  ticketRequirements?: string | null
  scaleRequired?: boolean | null
  specialInstructions?: string | null
  gateInstructions?: string | null
  contactOnArrivalInstructions?: string | null
  safetyInstructions?: string | null
  truckRestrictions?: string | null
  trailerRequirements?: string | null
  returnInstructions?: string | null
  estDurationMinutes?: number | null
  rateType?: 'hourly' | 'per_load' | null
  customerRate?: number | null
  driverPayRule?: string | null
  notes?: string | null
  stops: DispatchStopInput[]
  /** When the draft came from the AI parser, its raw output is stored for the audit trail. */
  aiParse?: { parsedJson: unknown; confidenceJson: unknown; warnings: unknown; model: string | null }
}

async function insertStops(businessId: string, dispatchId: string, stops: DispatchStopInput[]): Promise<DispatchStop[]> {
  if (stops.length === 0) return []
  const rows = stops.map((s, i) => ({
    business_id: businessId, dispatch_id: dispatchId, sequence: i + 1,
    stop_type: s.stopType, raw_location_text: s.rawLocationText, material: s.material ?? null, notes: s.notes ?? null,
  }))
  const { data, error } = await fleetServiceClient.from('fleet_dt_dispatch_stops').insert(rows).select('*').order('sequence')
  if (error) throw error
  return (data ?? []).map(stopFromRow)
}

/** Creates a draft dispatch (from an AI parse or manual entry) — never publishes, never touches fleet_dt_jobs. */
export async function createDispatchDraft(
  businessId: string, input: CreateDispatchInput, userId: string, email: string | null,
): Promise<Dispatch> {
  const driverTruck = await resolveDriverAndTruck(businessId, input.driverNameRaw ?? null, input.truckLabelRaw ?? null)

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_dispatches')
    .insert({
      business_id: businessId, status: 'draft', raw_input: input.rawInput ?? null, source: input.source,
      dispatch_date: input.dispatchDate ?? null, customer_name: input.customerName ?? null,
      broker_id: input.brokerId ?? null, broker_name: input.brokerName ?? null,
      dispatch_contact_name: input.dispatchContactName ?? null, dispatch_contact_phone: input.dispatchContactPhone ?? null,
      po_number: input.poNumber ?? null, job_number: input.jobNumber ?? null, load_number: input.loadNumber ?? null,
      driver_id: driverTruck.driverId, driver_name_raw: input.driverNameRaw ?? null,
      truck_id: driverTruck.truckId, truck_label_raw: input.truckLabelRaw ?? null,
      required_arrival_at: input.requiredArrivalAt ?? null,
      material: input.material ?? null, est_quantity: input.estQuantity ?? null,
      quantity_unit: input.quantityUnit ?? 'loads', num_loads_estimate: input.numLoadsEstimate ?? null,
      weight_requirements: input.weightRequirements ?? null, ticket_requirements: input.ticketRequirements ?? null,
      scale_required: input.scaleRequired ?? null,
      special_instructions: input.specialInstructions ?? null, gate_instructions: input.gateInstructions ?? null,
      contact_on_arrival_instructions: input.contactOnArrivalInstructions ?? null,
      safety_instructions: input.safetyInstructions ?? null, truck_restrictions: input.truckRestrictions ?? null,
      trailer_requirements: input.trailerRequirements ?? null, return_instructions: input.returnInstructions ?? null,
      est_duration_minutes: input.estDurationMinutes ?? null, rate_type: input.rateType ?? null,
      customer_rate: input.customerRate ?? null, driver_pay_rule: input.driverPayRule ?? null, notes: input.notes ?? null,
      created_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error
  const dispatch = dispatchFromRow(data)

  await insertStops(businessId, dispatch.id, input.stops)

  if (input.aiParse) {
    await fleetServiceClient.from('fleet_dt_dispatch_ai_parses').insert({
      business_id: businessId, dispatch_id: dispatch.id, raw_input: input.rawInput ?? '',
      parsed_json: input.aiParse.parsedJson, confidence_json: input.aiParse.confidenceJson,
      warnings: input.aiParse.warnings, model: input.aiParse.model, created_by: userId,
    })
  }

  audit.log({ userId, email, action: 'dump_truck.dispatch.create_draft', resource: 'fleet_dt_dispatches', resourceId: dispatch.id, after: dispatch })
  return dispatch
}

export async function getDispatch(businessId: string, dispatchId: string): Promise<{ dispatch: Dispatch; stops: DispatchStop[] } | null> {
  const { data, error } = await fleetServiceClient.from('fleet_dt_dispatches').select('*').eq('id', dispatchId).eq('business_id', businessId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const { data: stopRows } = await fleetServiceClient.from('fleet_dt_dispatch_stops').select('*').eq('dispatch_id', dispatchId).order('sequence')
  return { dispatch: dispatchFromRow(data), stops: (stopRows ?? []).map(stopFromRow) }
}

export async function listDispatches(businessId: string, opts: { status?: Dispatch['status'] } = {}): Promise<Dispatch[]> {
  let q = fleetServiceClient.from('fleet_dt_dispatches').select('*').eq('business_id', businessId)
  if (opts.status) q = q.eq('status', opts.status)
  const { data, error } = await q.order('dispatch_date', { ascending: true }).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(dispatchFromRow)
}

/** Every dispatch published for this driver, today or later — spec: never hide assignments until morning-of. */
export async function listDispatchesForDriver(businessId: string, driverId: string): Promise<Dispatch[]> {
  const todayIso = new Date().toISOString().slice(0, 10)
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_dispatches')
    .select('*')
    .eq('business_id', businessId)
    .eq('driver_id', driverId)
    .eq('status', 'published')
    .gte('dispatch_date', todayIso)
    .order('dispatch_date', { ascending: true })
  if (error) throw error
  return (data ?? []).map(dispatchFromRow)
}

export type DraftPatch = Partial<CreateDispatchInput> & { yardSiteId?: string | null }

/** Edits a still-draft dispatch. For a published dispatch, use reviseDispatch instead (records version history + re-ack). */
export async function updateDispatchDraft(
  businessId: string, dispatchId: string, patch: DraftPatch, userId: string, email: string | null,
): Promise<Dispatch> {
  const existing = await getDispatch(businessId, dispatchId)
  if (!existing) throw new DumpTruckError('Dispatch not found', 404)
  if (existing.dispatch.status !== 'draft') throw new DumpTruckError('Only a draft dispatch can be edited directly — use revise for a published one', 400)

  const dbPatch = await buildDbPatch(businessId, patch)

  if (patch.stops) {
    await fleetServiceClient.from('fleet_dt_dispatch_stops').delete().eq('dispatch_id', dispatchId)
    await insertStops(businessId, dispatchId, patch.stops)
  }

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_dispatches').update(dbPatch).eq('id', dispatchId).eq('business_id', businessId).select('*').single()
  if (error) throw error
  const dispatch = dispatchFromRow(data)
  audit.log({ userId, email, action: 'dump_truck.dispatch.update_draft', resource: 'fleet_dt_dispatches', resourceId: dispatch.id, before: existing.dispatch, after: dispatch })
  return dispatch
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildDbPatch(businessId: string, patch: DraftPatch): Promise<Record<string, any>> {
  const dbPatch: Record<string, unknown> = {}
  const map: Record<string, string> = {
    dispatchDate: 'dispatch_date', customerName: 'customer_name', brokerId: 'broker_id', brokerName: 'broker_name',
    dispatchContactName: 'dispatch_contact_name', dispatchContactPhone: 'dispatch_contact_phone',
    poNumber: 'po_number', jobNumber: 'job_number', loadNumber: 'load_number',
    requiredArrivalAt: 'required_arrival_at', material: 'material', estQuantity: 'est_quantity',
    quantityUnit: 'quantity_unit', numLoadsEstimate: 'num_loads_estimate',
    weightRequirements: 'weight_requirements', ticketRequirements: 'ticket_requirements', scaleRequired: 'scale_required',
    specialInstructions: 'special_instructions', gateInstructions: 'gate_instructions',
    contactOnArrivalInstructions: 'contact_on_arrival_instructions', safetyInstructions: 'safety_instructions',
    truckRestrictions: 'truck_restrictions', trailerRequirements: 'trailer_requirements',
    returnInstructions: 'return_instructions', estDurationMinutes: 'est_duration_minutes', rateType: 'rate_type',
    customerRate: 'customer_rate', driverPayRule: 'driver_pay_rule', notes: 'notes', yardSiteId: 'yard_site_id',
  }
  for (const [key, column] of Object.entries(map)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (patch as any)[key]
    if (value !== undefined) dbPatch[column] = value
  }
  if (patch.driverNameRaw !== undefined || patch.truckLabelRaw !== undefined) {
    const dt = await resolveDriverAndTruck(businessId, patch.driverNameRaw ?? null, patch.truckLabelRaw ?? null)
    if (patch.driverNameRaw !== undefined) { dbPatch.driver_name_raw = patch.driverNameRaw; dbPatch.driver_id = dt.driverId }
    if (patch.truckLabelRaw !== undefined) { dbPatch.truck_label_raw = patch.truckLabelRaw; dbPatch.truck_id = dt.truckId }
  }
  return dbPatch
}

/** Direct driver/truck assignment override (Hector picking from a dropdown rather than typed text). */
export async function assignDispatchDriverTruck(
  businessId: string, dispatchId: string, driverId: string | null, truckId: string | null, trailerId: string | null,
  userId: string, email: string | null,
): Promise<Dispatch> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_dispatches')
    .update({ driver_id: driverId, truck_id: truckId, trailer_id: trailerId })
    .eq('id', dispatchId).eq('business_id', businessId).select('*').single()
  if (error) throw error
  const dispatch = dispatchFromRow(data)
  audit.log({ userId, email, action: 'dump_truck.dispatch.assign', resource: 'fleet_dt_dispatches', resourceId: dispatch.id, after: { driverId, truckId, trailerId } })
  return dispatch
}

// ── Location resolution ─────────────────────────────────────────────────

export interface StopResolution extends DispatchStop {
  resolvedLat: number | null
  resolvedLng: number | null
  resolvedAddress: string | null
}

/** Resolves every stop's raw location text against real sites/geocoding and persists the match (spec §Location Normalization). */
export async function resolveDispatchStops(businessId: string, dispatchId: string): Promise<StopResolution[]> {
  const { data: stopRows, error } = await fleetServiceClient.from('fleet_dt_dispatch_stops').select('*').eq('dispatch_id', dispatchId).order('sequence')
  if (error) throw error

  const results: StopResolution[] = []
  for (const row of stopRows ?? []) {
    if (!row.raw_location_text) { results.push({ ...stopFromRow(row), resolvedLat: null, resolvedLng: null, resolvedAddress: null }); continue }
    const resolved: ResolvedLocation | null = await resolveLocationText(businessId, row.raw_location_text)
    if (resolved) {
      await fleetServiceClient.from('fleet_dt_dispatch_stops').update({
        site_id: resolved.siteId, site_confidence: resolved.confidence,
      }).eq('id', row.id)
      results.push({
        ...stopFromRow(row), siteId: resolved.siteId, siteName: resolved.siteName, siteConfidence: resolved.confidence,
        resolvedLat: resolved.lat, resolvedLng: resolved.lng, resolvedAddress: resolved.address,
      })
    } else {
      results.push({ ...stopFromRow(row), resolvedLat: null, resolvedLng: null, resolvedAddress: null })
    }
  }
  return results
}

// ── Route + timing calculation ──────────────────────────────────────────

export interface DispatchRouteLeg {
  legLabel: string
  fromStopId: string | null
  toStopId: string | null
  distanceMiles: number | null
  durationMinutes: number | null
  provider: string | null
}

export interface ComputeRouteResult {
  dispatch: Dispatch
  legs: DispatchRouteLeg[]
  warnings: string[]
}

async function siteLatLng(siteId: string | null): Promise<LatLng | null> {
  if (!siteId) return null
  const { data } = await fleetServiceClient.from('fleet_dt_sites').select('lat, lng').eq('id', siteId).maybeSingle()
  if (!data || data.lat == null || data.lng == null) return null
  return { lat: Number(data.lat), lng: Number(data.lng) }
}

/**
 * Real routed drive time for every leg (yard -> first stop -> ... -> last
 * stop), and the working-backwards yard-arrival recommendation for the
 * first required stop. Persists both the per-leg estimates
 * (fleet_dt_dispatch_route_estimates) and the cached recommendation on the
 * dispatch row itself.
 */
export async function computeDispatchRoute(businessId: string, dispatchId: string): Promise<ComputeRouteResult> {
  const existing = await getDispatch(businessId, dispatchId)
  if (!existing) throw new DumpTruckError('Dispatch not found', 404)
  const { dispatch, stops } = existing
  const settings = await getDispatchSettings(businessId)
  const warnings: string[] = []

  const yardSiteId = dispatch.yardSiteId ?? settings.defaultYardSiteId
  if (!yardSiteId) warnings.push('No yard site configured — set a yard in Dispatch Settings or on this dispatch to calculate drive time.')
  const yardLatLng = await siteLatLng(yardSiteId)
  if (yardSiteId && !yardLatLng) warnings.push('Yard site has no coordinates on file — drive time cannot be calculated.')

  const orderedStops = [...stops].sort((a, b) => a.sequence - b.sequence)
  const points: { stopId: string | null; label: string; latLng: LatLng | null }[] = [
    { stopId: null, label: 'Yard', latLng: yardLatLng },
  ]
  for (const stop of orderedStops) {
    const latLng = await siteLatLng(stop.siteId)
    if (!latLng) warnings.push(`"${stop.rawLocationText ?? stop.siteName ?? stop.stopType}" has no resolved coordinates — that leg's drive time cannot be calculated.`)
    points.push({ stopId: stop.id, label: stop.siteName ?? stop.rawLocationText ?? stop.stopType, latLng })
  }

  await fleetServiceClient.from('fleet_dt_dispatch_route_estimates').delete().eq('dispatch_id', dispatchId)

  const legs: DispatchRouteLeg[] = []
  let driveMinutesToFirstStop: number | null = null
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]
    const to = points[i + 1]
    const legLabel = `${from.label} -> ${to.label}`
    if (!from.latLng || !to.latLng) { legs.push({ legLabel, fromStopId: from.stopId, toStopId: to.stopId, distanceMiles: null, durationMinutes: null, provider: null }); continue }

    const route = await estimateRoute(from.latLng, to.latLng)
    if (!route) { warnings.push(`Could not reach the routing service for "${legLabel}" — try again shortly.`); legs.push({ legLabel, fromStopId: from.stopId, toStopId: to.stopId, distanceMiles: null, durationMinutes: null, provider: null }); continue }

    await fleetServiceClient.from('fleet_dt_dispatch_route_estimates').insert({
      business_id: businessId, dispatch_id: dispatchId, from_stop_id: from.stopId, to_stop_id: to.stopId,
      leg_label: legLabel, distance_miles: route.distanceMiles, duration_minutes: route.durationMinutes,
      traffic_duration_minutes: route.trafficDurationMinutes, provider: route.provider, provider_version: route.providerVersion,
    })
    legs.push({ legLabel, fromStopId: from.stopId, toStopId: to.stopId, distanceMiles: route.distanceMiles, durationMinutes: route.durationMinutes, provider: route.provider })
    if (i === 0) driveMinutesToFirstStop = route.durationMinutes
  }

  if (settings.trafficEnabled) warnings.push('Live traffic is enabled in settings but no traffic data provider is configured — showing normal drive-time estimates only.')

  const dbPatch: Record<string, unknown> = {
    calculated_drive_minutes: driveMinutesToFirstStop,
    route_calculated_at: new Date().toISOString(),
  }

  if (dispatch.requiredArrivalAt && driveMinutesToFirstStop != null) {
    const plan = computeArrivalPlan({
      requiredArrivalAt: dispatch.requiredArrivalAt,
      driveMinutes: driveMinutesToFirstStop,
      settings: { pretripMinutes: settings.defaultPretripMinutes, earlyArrivalBufferMinutes: settings.targetEarlyArrivalMinutes },
    })
    dbPatch.recommended_yard_arrival_at = plan.yardArrivalAt
    dbPatch.recommended_leave_yard_at = plan.leaveYardAt
    dbPatch.target_site_arrival_at = plan.targetArrivalAt
  } else {
    if (!dispatch.requiredArrivalAt) warnings.push('No required arrival time set — cannot calculate yard-arrival/leave-yard recommendation yet.')
    dbPatch.recommended_yard_arrival_at = null
    dbPatch.recommended_leave_yard_at = null
    dbPatch.target_site_arrival_at = null
  }

  const { data, error } = await fleetServiceClient.from('fleet_dt_dispatches').update(dbPatch).eq('id', dispatchId).select('*').single()
  if (error) throw error
  return { dispatch: dispatchFromRow(data), legs, warnings }
}

// ── Publish / revise / cancel ───────────────────────────────────────────

const CRITICAL_FIELDS: { key: keyof Dispatch; label: string }[] = [
  { key: 'dispatchDate', label: 'date' },
  { key: 'driverId', label: 'assigned driver (not yet matched to a registered driver)' },
  { key: 'truckId', label: 'assigned truck' },
  { key: 'requiredArrivalAt', label: 'required arrival time' },
]

async function assertPublishable(businessId: string, dispatch: Dispatch, stops: DispatchStop[]): Promise<void> {
  const missing = CRITICAL_FIELDS.filter(f => dispatch[f.key] == null).map(f => f.label)
  const firstStop = [...stops].sort((a, b) => a.sequence - b.sequence).find(s => s.stopType !== 'yard')
  if (!firstStop || !firstStop.siteId) missing.push('first location (not yet matched to a known site)')
  if (missing.length > 0) {
    throw new DumpTruckError(`Cannot publish — missing/unconfirmed critical fields: ${missing.join(', ')}.`, 422)
  }
}

export interface PublishResult { dispatch: Dispatch; job: DumpTruckJob }

/** Publishes a draft: creates/links the real fleet_dt_jobs row, snapshots version 1, and opens an acknowledgement for the assigned driver. */
export async function publishDispatch(businessId: string, dispatchId: string, userId: string, email: string | null): Promise<PublishResult> {
  const existing = await getDispatch(businessId, dispatchId)
  if (!existing) throw new DumpTruckError('Dispatch not found', 404)
  const { dispatch, stops } = existing
  if (dispatch.status !== 'draft') throw new DumpTruckError('Only a draft dispatch can be published', 400)
  await assertPublishable(businessId, dispatch, stops)

  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence)
  const pickupStop = ordered.find(s => s.stopType === 'pickup')
  const deliveryStop = ordered.find(s => s.stopType === 'delivery')

  const job = await createJob(businessId, {
    jobNumber: dispatch.jobNumber || `DSP-${Date.now().toString(36).toUpperCase()}`,
    poNumber: dispatch.poNumber,
    customerName: dispatch.customerName,
    brokerName: dispatch.brokerName,
    brokerId: dispatch.brokerId,
    driverId: dispatch.driverId,
    truckId: dispatch.truckId,
    trailerId: dispatch.trailerId,
    pickupSiteId: pickupStop?.siteId ?? null,
    dumpSiteId: deliveryStop?.siteId ?? null,
    material: dispatch.material,
    estQuantity: dispatch.estQuantity,
    quantityUnit: (dispatch.quantityUnit as DumpTruckJob['quantityUnit']) ?? 'loads',
    deliveryDate: dispatch.dispatchDate,
    instructions: [dispatch.specialInstructions, dispatch.gateInstructions, dispatch.contactOnArrivalInstructions, dispatch.safetyInstructions]
      .filter(Boolean).join('\n') || null,
    status: 'scheduled',
    contactPhone: dispatch.dispatchContactPhone,
    orderedBy: dispatch.dispatchContactName,
    pricePerHour: dispatch.rateType === 'hourly' ? dispatch.customerRate : null,
    pricePerTon: dispatch.rateType === 'per_load' ? dispatch.customerRate : null,
  }, userId, email)

  const nowIso = new Date().toISOString()
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_dispatches')
    .update({ status: 'published', published_at: nowIso, published_by: userId, job_id: job.id })
    .eq('id', dispatchId).select('*').single()
  if (error) throw error
  const published = dispatchFromRow(data)

  await fleetServiceClient.from('fleet_dt_dispatch_versions').insert({
    business_id: businessId, dispatch_id: dispatchId, version_number: published.currentVersion,
    snapshot: published, changed_fields: {}, reason: 'published', changed_by: userId,
  })

  if (published.driverId) {
    await fleetServiceClient.from('fleet_dt_dispatch_acknowledgements').insert({
      business_id: businessId, dispatch_id: dispatchId, driver_id: published.driverId,
      version_number: published.currentVersion, published_at: nowIso,
    })
  }

  audit.log({ userId, email, action: 'dump_truck.dispatch.publish', resource: 'fleet_dt_dispatches', resourceId: dispatchId, after: { jobId: job.id } })
  return { dispatch: published, job }
}

// ── Multi-driver publish ────────────────────────────────────────────────
// One parsed job (same customer/locations/material/instructions) sent to
// several drivers at once (e.g. 3 trucks hauling the same pickup->dump
// job). The original draft becomes the first driver's dispatch (reuses
// publishDispatch exactly as the single-driver path always has); every
// additional driver gets their own cloned draft (same parsed fields +
// stops, its own driver/truck/trailer) which is independently published —
// so each driver gets their own job, acknowledgement, and version history,
// same as if Hector had pasted the job in three separate times.

export interface DriverAssignment {
  driverId: string
  truckId: string | null
  trailerId: string | null
}

export interface MultiPublishResult {
  results: PublishResult[]
  errors: { driverId: string; error: string }[]
}

async function cloneDraftDispatch(
  businessId: string, source: Dispatch, stops: DispatchStop[], assignment: DriverAssignment, suffix: string, userId: string,
): Promise<Dispatch> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_dispatches')
    .insert({
      business_id: businessId, status: 'draft', raw_input: source.rawInput, source: source.source,
      dispatch_date: source.dispatchDate, customer_name: source.customerName,
      broker_id: source.brokerId, broker_name: source.brokerName,
      dispatch_contact_name: source.dispatchContactName, dispatch_contact_phone: source.dispatchContactPhone,
      po_number: source.poNumber, job_number: source.jobNumber ? `${source.jobNumber}-${suffix}` : null,
      load_number: source.loadNumber,
      driver_id: assignment.driverId, driver_name_raw: null,
      truck_id: assignment.truckId, truck_label_raw: null, trailer_id: assignment.trailerId,
      yard_site_id: source.yardSiteId, required_arrival_at: source.requiredArrivalAt,
      material: source.material, est_quantity: source.estQuantity, quantity_unit: source.quantityUnit,
      num_loads_estimate: source.numLoadsEstimate, weight_requirements: source.weightRequirements,
      ticket_requirements: source.ticketRequirements, scale_required: source.scaleRequired,
      special_instructions: source.specialInstructions, gate_instructions: source.gateInstructions,
      contact_on_arrival_instructions: source.contactOnArrivalInstructions, safety_instructions: source.safetyInstructions,
      truck_restrictions: source.truckRestrictions, trailer_requirements: source.trailerRequirements,
      return_instructions: source.returnInstructions, est_duration_minutes: source.estDurationMinutes,
      rate_type: source.rateType, customer_rate: source.customerRate, driver_pay_rule: source.driverPayRule,
      notes: source.notes,
      calculated_drive_minutes: source.calculatedDriveMinutes, calculated_traffic_drive_minutes: source.calculatedTrafficDriveMinutes,
      recommended_yard_arrival_at: source.recommendedYardArrivalAt, recommended_leave_yard_at: source.recommendedLeaveYardAt,
      target_site_arrival_at: source.targetSiteArrivalAt, route_calculated_at: source.routeCalculatedAt,
      created_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error
  const clone = dispatchFromRow(data)

  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence)
  await insertStops(businessId, clone.id, ordered.map(s => ({
    stopType: s.stopType, rawLocationText: s.rawLocationText ?? '', material: s.material, notes: s.notes,
  })))
  // insertStops doesn't carry over the already-resolved site match — copy it so the
  // clone doesn't need re-geocoding (positional: same order as the source's stops).
  const { data: newStops } = await fleetServiceClient.from('fleet_dt_dispatch_stops').select('id, sequence').eq('dispatch_id', clone.id).order('sequence')
  for (const ns of newStops ?? []) {
    const src = ordered[ns.sequence - 1]
    if (src?.siteId) {
      await fleetServiceClient.from('fleet_dt_dispatch_stops').update({ site_id: src.siteId, site_confidence: src.siteConfidence }).eq('id', ns.id)
    }
  }

  return clone
}

/** Publishes the same parsed job to multiple drivers at once. assignments[0] becomes this dispatch (same as publishDispatch); every subsequent assignment gets its own cloned draft, independently published. A per-driver failure (e.g. missing truck) is collected in `errors` rather than aborting the drivers that already succeeded. */
export async function publishDispatchToDrivers(
  businessId: string, dispatchId: string, assignments: DriverAssignment[], userId: string, email: string | null,
): Promise<MultiPublishResult> {
  if (assignments.length === 0) throw new DumpTruckError('At least one driver must be assigned', 400)
  const existing = await getDispatch(businessId, dispatchId)
  if (!existing) throw new DumpTruckError('Dispatch not found', 404)
  if (existing.dispatch.status !== 'draft') throw new DumpTruckError('Only a draft dispatch can be published', 400)
  const { dispatch: source, stops } = existing

  const results: PublishResult[] = []
  const errors: MultiPublishResult['errors'] = []

  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i]
    try {
      if (i === 0) {
        await assignDispatchDriverTruck(businessId, dispatchId, a.driverId, a.truckId, a.trailerId, userId, email)
        results.push(await publishDispatch(businessId, dispatchId, userId, email))
      } else {
        const clone = await cloneDraftDispatch(businessId, source, stops, a, String(i + 1), userId)
        results.push(await publishDispatch(businessId, clone.id, userId, email))
      }
    } catch (err) {
      errors.push({ driverId: a.driverId, error: err instanceof DumpTruckError ? err.message : 'Could not publish' })
    }
  }

  return { results, errors }
}

/** Revises a published dispatch — records a new version + change diff, and (if driver-facing fields changed) opens a fresh acknowledgement the driver must re-confirm. */
export async function reviseDispatch(
  businessId: string, dispatchId: string, patch: DraftPatch, reason: string, userId: string, email: string | null,
): Promise<Dispatch> {
  const existing = await getDispatch(businessId, dispatchId)
  if (!existing) throw new DumpTruckError('Dispatch not found', 404)
  const before = existing.dispatch
  if (before.status !== 'published') throw new DumpTruckError('Only a published dispatch can be revised', 400)

  const dbPatch = await buildDbPatch(businessId, patch)
  if (patch.stops) {
    await fleetServiceClient.from('fleet_dt_dispatch_stops').delete().eq('dispatch_id', dispatchId)
    await insertStops(businessId, dispatchId, patch.stops)
  }

  const settings = await getDispatchSettings(businessId)
  const materialChange =
    ('driverNameRaw' in patch) || ('truckLabelRaw' in patch) ||
    (patch.requiredArrivalAt !== undefined && requiredArrivalChangedMaterially(before.requiredArrivalAt, patch.requiredArrivalAt ?? null, settings.routeRecalcThresholdMinutes)) ||
    !!patch.stops

  const nextVersion = before.currentVersion + 1
  dbPatch.current_version = nextVersion

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_dispatches').update(dbPatch).eq('id', dispatchId).select('*').single()
  if (error) throw error
  let after = dispatchFromRow(data)

  if (patch.stops || (patch.requiredArrivalAt !== undefined)) {
    const recomputed = await computeDispatchRoute(businessId, dispatchId)
    after = recomputed.dispatch
  }

  const changedFields: Record<string, { before: unknown; after: unknown }> = {}
  for (const key of Object.keys(dbPatch)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const beforeVal = (before as any)[toCamel(key)]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const afterVal = (after as any)[toCamel(key)]
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) changedFields[key] = { before: beforeVal, after: afterVal }
  }

  await fleetServiceClient.from('fleet_dt_dispatch_versions').insert({
    business_id: businessId, dispatch_id: dispatchId, version_number: nextVersion,
    snapshot: after, changed_fields: changedFields, reason, changed_by: userId,
  })

  if (materialChange && after.driverId) {
    await fleetServiceClient.from('fleet_dt_dispatch_acknowledgements').insert({
      business_id: businessId, dispatch_id: dispatchId, driver_id: after.driverId,
      version_number: nextVersion, published_at: new Date().toISOString(),
    })
  }

  audit.log({ userId, email, action: 'dump_truck.dispatch.revise', resource: 'fleet_dt_dispatches', resourceId: dispatchId, before, after, metadata: { reason, materialChange } })
  return after
}

function toCamel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

export async function cancelDispatch(businessId: string, dispatchId: string, reason: string, userId: string, email: string | null): Promise<Dispatch> {
  const existing = await getDispatch(businessId, dispatchId)
  if (!existing) throw new DumpTruckError('Dispatch not found', 404)

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_dispatches')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: userId, cancel_reason: reason })
    .eq('id', dispatchId).select('*').single()
  if (error) throw error
  const dispatch = dispatchFromRow(data)

  if (dispatch.jobId) {
    await fleetServiceClient.from('fleet_dt_jobs').update({ status: 'cancelled' }).eq('id', dispatch.jobId)
  }

  audit.log({ userId, email, action: 'dump_truck.dispatch.cancel', resource: 'fleet_dt_dispatches', resourceId: dispatchId, before: existing.dispatch, after: dispatch, metadata: { reason } })
  return dispatch
}

// ── Driver acknowledgement ──────────────────────────────────────────────

export interface Acknowledgement {
  id: string
  dispatchId: string
  driverId: string
  versionNumber: number
  publishedAt: string | null
  viewedAt: string | null
  acknowledgedAt: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ackFromRow(r: any): Acknowledgement {
  return { id: r.id, dispatchId: r.dispatch_id, driverId: r.driver_id, versionNumber: r.version_number, publishedAt: r.published_at, viewedAt: r.viewed_at, acknowledgedAt: r.acknowledged_at }
}

export async function getCurrentAcknowledgement(businessId: string, dispatchId: string, driverId: string): Promise<Acknowledgement | null> {
  const { data } = await fleetServiceClient
    .from('fleet_dt_dispatch_acknowledgements').select('*')
    .eq('business_id', businessId).eq('dispatch_id', dispatchId).eq('driver_id', driverId)
    .order('version_number', { ascending: false }).limit(1).maybeSingle()
  return data ? ackFromRow(data) : null
}

export async function markDispatchViewed(businessId: string, dispatchId: string, driverId: string): Promise<void> {
  const ack = await getCurrentAcknowledgement(businessId, dispatchId, driverId)
  if (!ack || ack.viewedAt) return
  await fleetServiceClient.from('fleet_dt_dispatch_acknowledgements').update({ viewed_at: new Date().toISOString() }).eq('id', ack.id)
}

// ── Stops joined with site info (for driver-card directions/display) ───

export interface DispatchStopWithSite extends DispatchStop {
  siteLat: number | null
  siteLng: number | null
  siteAddress: string | null
}

/** Stops for a dispatch, joined to their matched site's name/coordinates/address — used by the driver card (Open Directions) and any read-only detail view. */
export async function getDispatchStopsWithSite(dispatchId: string): Promise<DispatchStopWithSite[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_dispatch_stops')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('*, site:fleet_dt_sites(name, lat, lng, address_line1, city, state)' as any)
    .eq('dispatch_id', dispatchId)
    .order('sequence')
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    ...stopFromRow(r),
    siteName: r.site?.name ?? null,
    siteLat: r.site?.lat != null ? Number(r.site.lat) : null,
    siteLng: r.site?.lng != null ? Number(r.site.lng) : null,
    siteAddress: r.site ? [r.site.address_line1, r.site.city, r.site.state].filter(Boolean).join(', ') || null : null,
  }))
}

export async function acknowledgeDispatch(
  businessId: string, dispatchId: string, driverId: string, deviceMetadata: Record<string, unknown>,
): Promise<Acknowledgement> {
  const ack = await getCurrentAcknowledgement(businessId, dispatchId, driverId)
  if (!ack) throw new DumpTruckError('No acknowledgement pending for this driver on this dispatch', 404)
  const nowIso = new Date().toISOString()
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_dispatch_acknowledgements')
    .update({ acknowledged_at: nowIso, viewed_at: ack.viewedAt ?? nowIso, device_metadata: deviceMetadata })
    .eq('id', ack.id).select('*').single()
  if (error) throw error
  audit.log({ userId: driverId, action: 'dump_truck.dispatch.acknowledge', resource: 'fleet_dt_dispatches', resourceId: dispatchId, after: { versionNumber: ack.versionNumber } })
  return ackFromRow(data)
}
