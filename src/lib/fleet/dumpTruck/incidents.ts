/**
 * fleet/dumpTruck/incidents.ts — incident + defect quick-action service functions
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { getBusinessProfile } from '@/lib/fleet/business'
import { sendDefectAlertEmail } from '@/lib/email/resend'
import { DumpTruckError } from './shared'
import { placeTruckOnHold, releaseTruckHold } from './equipment'
import {
  validateDisposition, nextStatusFor, setsTruckHold, clearsTruckHold,
  type DefectDispositionAction, type DefectStatus,
} from '@/lib/dumpTruck/defectDisposition'

export interface CreateIncidentInput {
  shiftId?: string | null
  truckId?: string | null
  jobId?: string | null
  incidentType: 'collision' | 'property_damage' | 'near_miss' | 'injury' | 'spill' | 'equipment_failure' | 'other'
  description: string
  occurredAt: string
  lat?: number | null
  lng?: number | null
  injuries: boolean
  policeReportNumber?: string | null
  policeAgency?: string | null
  otherPartyDetails?: Record<string, unknown>
  witnesses?: { name: string; phone?: string }[]
  immediateSafetyStatus: 'safe' | 'needs_assistance' | 'emergency'
  /** A photo uploaded standalone first (see uploadDocument()) — linked to this incident once it exists. */
  photoDocumentId?: string | null
}

export async function createIncident(
  businessId: string, driverId: string, email: string | null, input: CreateIncidentInput,
): Promise<{ id: string }> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_incidents')
    .insert({
      business_id: businessId,
      shift_id: input.shiftId ?? null,
      driver_id: driverId,
      truck_id: input.truckId ?? null,
      job_id: input.jobId ?? null,
      incident_type: input.incidentType,
      description: input.description,
      occurred_at: input.occurredAt,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      injuries: input.injuries,
      police_report_number: input.policeReportNumber ?? null,
      police_agency: input.policeAgency ?? null,
      other_party_details: input.otherPartyDetails ?? {},
      witnesses: input.witnesses ?? [],
      immediate_safety_status: input.immediateSafetyStatus,
    })
    .select('id')
    .single()
  if (error) throw error

  if (input.photoDocumentId) {
    await fleetServiceClient.from('fleet_dt_documents')
      .update({ linked_entity_type: 'incident', linked_entity_id: data.id })
      .eq('id', input.photoDocumentId)
      .eq('business_id', businessId)
  }

  // Safety-critical incidents get flagged for immediate admin visibility.
  const isUrgent = input.injuries || input.immediateSafetyStatus !== 'safe' || input.incidentType === 'collision'
  audit.log({
    userId: driverId, email, action: 'dump_truck.incident.create', resource: 'fleet_dt_incidents',
    resourceId: data.id, metadata: { urgent: isUrgent, incidentType: input.incidentType },
  })

  return { id: data.id }
}

export interface QuickDefectInput {
  truckId: string
  trailerId?: string | null
  shiftId?: string | null
  description: string
  severity: 'monitor' | 'non_safety' | 'safety_critical' | 'out_of_service'
  /** A photo uploaded standalone first (see uploadDocument()) — linked to this defect once it exists. */
  photoDocumentId?: string | null
  lat?: number | null
  lng?: number | null
}

const ALERT_SEVERITIES = new Set(['safety_critical', 'out_of_service'])

export async function reportQuickDefect(
  businessId: string, driverId: string, email: string | null, input: QuickDefectInput,
): Promise<{ id: string }> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_defects')
    .insert({
      business_id: businessId,
      truck_id: input.truckId,
      trailer_id: input.trailerId ?? null,
      shift_id: input.shiftId ?? null,
      description: input.description,
      severity: input.severity,
      reported_by: driverId,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    })
    .select('id, created_at')
    .single()
  if (error) throw error

  if (input.photoDocumentId) {
    await fleetServiceClient.from('fleet_dt_documents')
      .update({ linked_entity_type: 'defect', linked_entity_id: data.id })
      .eq('id', input.photoDocumentId)
      .eq('business_id', businessId)
  }

  audit.log({ userId: driverId, email, action: 'dump_truck.defect.report', resource: 'fleet_dt_defects', resourceId: data.id, metadata: { severity: input.severity } })

  if (ALERT_SEVERITIES.has(input.severity)) {
    // Best-effort — never let an alert-email failure block the defect report itself.
    alertDispatchOfDefect(businessId, driverId, input, data.created_at).catch(err =>
      console.error('[incidents] alertDispatchOfDefect failed:', err))
  }

  return { id: data.id }
}

async function alertDispatchOfDefect(
  businessId: string, driverId: string, input: QuickDefectInput, reportedAt: string,
): Promise<void> {
  const profile = await getBusinessProfile(businessId)
  if (!profile?.dispatchAlertEmail) return

  const [{ data: truck }, { data: driverProfile }] = await Promise.all([
    fleetServiceClient.from('fleet_equipment').select('unit_number').eq('id', input.truckId).maybeSingle(),
    fleetServiceClient.from('profiles').select('full_name').eq('id', driverId).maybeSingle(),
  ])

  let photo: { bytes: Buffer; mimeType: string } | null = null
  if (input.photoDocumentId) {
    const { data: doc } = await fleetServiceClient.from('fleet_dt_documents')
      .select('storage_path, mime_type').eq('id', input.photoDocumentId).maybeSingle()
    if (doc) {
      const { data: file } = await fleetServiceClient.storage.from('fleet-dt-documents').download(doc.storage_path)
      if (file) photo = { bytes: Buffer.from(await file.arrayBuffer()), mimeType: doc.mime_type ?? 'image/jpeg' }
    }
  }

  await sendDefectAlertEmail({
    to: profile.dispatchAlertEmail,
    businessName: profile.name,
    truckUnit: truck?.unit_number ?? null,
    driverName: driverProfile?.full_name || 'Driver',
    severity: input.severity,
    description: input.description,
    reportedAt,
    photo,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
  })
}

export interface DefectRow {
  id: string
  truckId: string
  trailerId: string | null
  description: string
  severity: 'monitor' | 'non_safety' | 'safety_critical' | 'out_of_service'
  status: 'open' | 'acknowledged' | 'resolved' | 'deferred'
  reportedBy: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  /** Stamped when status moves to 'acknowledged' — used as "service person arrived" (paired with resolvedAt as "left/done"). */
  acknowledgedAt: string | null
  resolutionNotes: string | null
  createdAt: string
  photoDocumentId: string | null
  lat: number | null
  lng: number | null
  assignedTo: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defectFromRow(r: any, photoDocumentId: string | null): DefectRow {
  return {
    id: r.id, truckId: r.truck_id, trailerId: r.trailer_id, description: r.description,
    severity: r.severity, status: r.status, reportedBy: r.reported_by, resolvedBy: r.resolved_by,
    resolvedAt: r.resolved_at, acknowledgedAt: r.acknowledged_at, resolutionNotes: r.resolution_notes, createdAt: r.created_at,
    photoDocumentId, lat: r.lat, lng: r.lng, assignedTo: r.assigned_to,
  }
}

/** Recent defects for the admin "Open Defects" panel — open/acknowledged first, most recent overall capped. */
export async function listDefects(businessId: string): Promise<DefectRow[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_defects')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  const rows = data ?? []
  if (rows.length === 0) return []

  const { data: docs } = await fleetServiceClient
    .from('fleet_dt_documents')
    .select('id, linked_entity_id')
    .eq('linked_entity_type', 'defect')
    .in('linked_entity_id', rows.map(r => r.id))
  const photoByDefect = new Map((docs ?? []).map(d => [d.linked_entity_id, d.id]))

  return rows.map(r => defectFromRow(r, photoByDefect.get(r.id) ?? null))
}

/** Defects reported during specific shifts — powers end-of-shift and end-of-week reports (truck issues section). */
export async function listDefectsForShifts(businessId: string, shiftIds: string[]): Promise<DefectRow[]> {
  if (shiftIds.length === 0) return []
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_defects')
    .select('*')
    .eq('business_id', businessId)
    .in('shift_id', shiftIds)
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = data ?? []
  if (rows.length === 0) return []

  const { data: docs } = await fleetServiceClient
    .from('fleet_dt_documents')
    .select('id, linked_entity_id')
    .eq('linked_entity_type', 'defect')
    .in('linked_entity_id', rows.map(r => r.id))
  const photoByDefect = new Map((docs ?? []).map(d => [d.linked_entity_id, d.id]))

  return rows.map(r => defectFromRow(r, photoByDefect.get(r.id) ?? null))
}

export interface ResolveDefectInput {
  status?: 'acknowledged' | 'resolved' | 'deferred'
  resolutionNotes?: string | null
  /** Who dispatch sent to handle it — a mobile tire tech, a tow company, a shop name. Free text. */
  assignedTo?: string | null
}

/** Downtime = resolved_at - created_at, computed at read time — see admin panel. */
export async function resolveDefect(
  businessId: string, defectId: string, input: ResolveDefectInput, userId: string, email: string | null,
): Promise<DefectRow> {
  const patch: Record<string, unknown> = {}
  if (input.status) {
    patch.status = input.status
    if (input.status === 'acknowledged') {
      patch.acknowledged_at = new Date().toISOString()
    }
    if (input.status === 'resolved') {
      patch.resolved_by = userId
      patch.resolved_at = new Date().toISOString()
    }
  }
  if (input.resolutionNotes !== undefined) patch.resolution_notes = input.resolutionNotes
  if (input.assignedTo !== undefined) patch.assigned_to = input.assignedTo

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_defects')
    .update(patch)
    .eq('id', defectId)
    .eq('business_id', businessId)
    .select('*')
    .single()
  if (error) throw error

  audit.log({
    userId, email, action: input.status ? `dump_truck.defect.${input.status}` : 'dump_truck.defect.assign',
    resource: 'fleet_dt_defects', resourceId: defectId,
  })

  const { data: doc } = await fleetServiceClient.from('fleet_dt_documents')
    .select('id').eq('linked_entity_type', 'defect').eq('linked_entity_id', defectId).maybeSingle()
  return defectFromRow(data, doc?.id ?? null)
}

// ── Dispatch defect-review dispositions (spec §5.1) ──────────────────────────
// The seven dispatch actions on an open defect. Every call writes an
// append-only fleet_dt_defect_dispositions row (before/after state, actor,
// reason, instruction) in addition to whatever it changes on the defect
// itself or (for place_on_hold/mark_operable) on the truck's hold state.
// See defectDisposition.ts for the pure transition/validation rules this wraps.

export interface DefectDispositionRow {
  id: string
  defectId: string
  action: DefectDispositionAction
  actorId: string
  reason: string | null
  instruction: string | null
  beforeStatus: DefectStatus
  afterStatus: DefectStatus
  createdAt: string
}

export interface RecordDispositionInput {
  action: DefectDispositionAction
  reason?: string | null
  instruction?: string | null
  /** assign_maintenance only — who dispatch sent (shop name, mobile tech, tow company). */
  assignedTo?: string | null
}

export async function recordDefectDisposition(
  businessId: string, defectId: string, input: RecordDispositionInput, actorId: string, email: string | null,
): Promise<{ defect: DefectRow; disposition: DefectDispositionRow }> {
  const { data: existing, error: fetchError } = await fleetServiceClient
    .from('fleet_dt_defects')
    .select('*')
    .eq('id', defectId)
    .eq('business_id', businessId)
    .single()
  if (fetchError) throw new DumpTruckError('Defect not found', 404)

  const currentStatus = existing.status as DefectStatus
  const validation = validateDisposition({
    action: input.action, currentStatus, reason: input.reason, instruction: input.instruction,
  })
  if (!validation.ok) throw new DumpTruckError(validation.error!, 400)

  const afterStatus = nextStatusFor(input.action, currentStatus)
  const patch: Record<string, unknown> = {}
  if (afterStatus !== currentStatus) {
    patch.status = afterStatus
    if (afterStatus === 'acknowledged') patch.acknowledged_at = new Date().toISOString()
    if (afterStatus === 'resolved') { patch.resolved_by = actorId; patch.resolved_at = new Date().toISOString() }
    if (afterStatus === 'open' && input.action === 'reopen') { patch.resolved_by = null; patch.resolved_at = null }
  }
  if ((input.action === 'request_details' || input.action === 'place_on_hold') && input.reason) {
    patch.resolution_notes = existing.resolution_notes ? `${existing.resolution_notes}\n\n${input.reason}` : input.reason
  }
  if (input.action === 'resolve' && input.reason?.trim()) {
    patch.resolution_notes = existing.resolution_notes ? `${existing.resolution_notes}\n\n${input.reason}` : input.reason
  }
  if (input.assignedTo !== undefined) patch.assigned_to = input.assignedTo

  let updated = existing
  if (Object.keys(patch).length > 0) {
    const { data, error } = await fleetServiceClient
      .from('fleet_dt_defects').update(patch).eq('id', defectId).eq('business_id', businessId)
      .select('*').single()
    if (error) throw error
    updated = data
  }

  if (setsTruckHold(input.action)) {
    await placeTruckOnHold(businessId, existing.truck_id, input.reason!, actorId)
  }
  if (clearsTruckHold(input.action)) {
    await releaseTruckHold(businessId, existing.truck_id, input.instruction!, actorId)
  }

  const { data: dispositionRow, error: dispositionError } = await fleetServiceClient
    .from('fleet_dt_defect_dispositions')
    .insert({
      business_id: businessId, defect_id: defectId, action: input.action, actor_id: actorId,
      reason: input.reason ?? null, instruction: input.instruction ?? null,
      before_status: currentStatus, after_status: afterStatus,
    })
    .select('*')
    .single()
  if (dispositionError) throw dispositionError

  audit.log({
    userId: actorId, email, action: `dump_truck.defect.disposition.${input.action}`,
    resource: 'fleet_dt_defects', resourceId: defectId, metadata: { beforeStatus: currentStatus, afterStatus },
  })

  const { data: doc } = await fleetServiceClient.from('fleet_dt_documents')
    .select('id').eq('linked_entity_type', 'defect').eq('linked_entity_id', defectId).maybeSingle()

  return {
    defect: defectFromRow(updated, doc?.id ?? null),
    disposition: {
      id: dispositionRow.id, defectId: dispositionRow.defect_id, action: dispositionRow.action,
      actorId: dispositionRow.actor_id, reason: dispositionRow.reason, instruction: dispositionRow.instruction,
      beforeStatus: dispositionRow.before_status, afterStatus: dispositionRow.after_status, createdAt: dispositionRow.created_at,
    },
  }
}

export interface IncidentRow {
  id: string
  incidentType: CreateIncidentInput['incidentType']
  description: string
  occurredAt: string
  truckId: string | null
  jobId: string | null
  driverId: string
  lat: number | null
  lng: number | null
  injuries: boolean
  immediateSafetyStatus: 'safe' | 'needs_assistance' | 'emergency'
  policeReportNumber: string | null
  policeAgency: string | null
  photoDocumentId: string | null
  createdAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function incidentFromRow(r: any, photoDocumentId: string | null): IncidentRow {
  return {
    id: r.id, incidentType: r.incident_type, description: r.description, occurredAt: r.occurred_at,
    truckId: r.truck_id, jobId: r.job_id, driverId: r.driver_id, lat: r.lat, lng: r.lng,
    injuries: r.injuries, immediateSafetyStatus: r.immediate_safety_status,
    policeReportNumber: r.police_report_number, policeAgency: r.police_agency,
    photoDocumentId, createdAt: r.created_at,
  }
}

/** Recent incidents for the admin Safety panel — most recent first, capped. */
export async function listIncidents(businessId: string): Promise<IncidentRow[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_incidents')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  const rows = data ?? []
  if (rows.length === 0) return []

  const { data: docs } = await fleetServiceClient
    .from('fleet_dt_documents')
    .select('id, linked_entity_id')
    .eq('linked_entity_type', 'incident')
    .in('linked_entity_id', rows.map(r => r.id))
  const photoByIncident = new Map((docs ?? []).map(d => [d.linked_entity_id, d.id]))

  return rows.map(r => incidentFromRow(r, photoByIncident.get(r.id) ?? null))
}

export async function listDefectDispositions(businessId: string, defectId: string): Promise<DefectDispositionRow[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_defect_dispositions')
    .select('*')
    .eq('business_id', businessId)
    .eq('defect_id', defectId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id, defectId: r.defect_id, action: r.action, actorId: r.actor_id, reason: r.reason, instruction: r.instruction,
    beforeStatus: r.before_status, afterStatus: r.after_status, createdAt: r.created_at,
  }))
}
