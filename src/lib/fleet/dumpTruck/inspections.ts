/**
 * fleet/dumpTruck/inspections.ts — pre-trip / post-trip inspection service functions
 *
 * Starting an inspection fires pretrip_started/posttrip_started; completing
 * one fires pretrip_completed/posttrip_completed — keeping the shift's
 * primary-sequence flow state in sync without the client needing to call
 * the generic events endpoint separately for those two events.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { getBusinessProfile } from '@/lib/fleet/business'
import { sendDefectAlertEmail } from '@/lib/email/resend'
import { hasBlockingDefect, validateInspectionSubmission } from '@/lib/dumpTruck/inspections'
import type { InspectionItemInput, InspectionTemplateItem, InspectionType, DefectSeverity } from '@/lib/dumpTruck/types'
import { recordEvent, type RecordEventGeoInput } from './events'
import { getShiftById } from './shifts'
import { DumpTruckError, getShiftFlowState } from './shared'

export async function getActiveTemplate(
  businessId: string, inspectionType: InspectionType,
): Promise<{ templateVersionId: string; items: InspectionTemplateItem[] } | null> {
  const { data: template } = await fleetServiceClient
    .from('fleet_dt_inspection_templates')
    .select('id')
    .or(`business_id.eq.${businessId},business_id.is.null`)
    .eq('inspection_type', inspectionType)
    .eq('active', true)
    .order('business_id', { ascending: false, nullsFirst: false }) // business-specific template wins over platform default
    .limit(1)
    .maybeSingle()
  if (!template) return null

  const { data: version } = await fleetServiceClient
    .from('fleet_dt_inspection_template_versions')
    .select('id, items')
    .eq('template_id', template.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!version) return null

  return { templateVersionId: version.id, items: version.items as InspectionTemplateItem[] }
}

export interface StartInspectionInput {
  shiftId: string
  inspectionType: InspectionType
  id: string
  idempotencyKey: string
  deviceCapturedAt: string
  effectiveAt: string
  timezone?: string | null
  utcOffsetMinutes?: number | null
  geo: RecordEventGeoInput
}

export async function startInspection(
  businessId: string, driverId: string, email: string | null, input: StartInspectionInput,
): Promise<{ inspectionId: string; templateVersionId: string; items: InspectionTemplateItem[] }> {
  const shift = await getShiftById(input.shiftId)
  if (!shift || shift.businessId !== businessId || shift.driverId !== driverId) {
    throw new DumpTruckError('Shift not found', 404)
  }
  if (!shift.truckId) throw new DumpTruckError('Shift has no truck assigned', 400)

  // Resume an already-started, not-yet-completed inspection of this type
  // instead of re-firing pretrip_started/posttrip_started (a primary-sequence
  // event, only valid once per shift) and inserting a duplicate row. This is
  // the normal case whenever the checklist sheet gets reopened after already
  // being started — closed early, tab backgrounded, page reloaded — and
  // previously threw a hard "not valid from the current shift state" error
  // that closed the sheet immediately, stranding the driver on the pre-trip
  // step with no way back in.
  const { data: existing } = await fleetServiceClient
    .from('fleet_dt_inspections')
    .select('id, template_version_id')
    .eq('shift_id', input.shiftId)
    .eq('inspection_type', input.inspectionType)
    .neq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    const { data: versionRow } = await fleetServiceClient
      .from('fleet_dt_inspection_template_versions')
      .select('items')
      .eq('id', existing.template_version_id)
      .single()
    return {
      inspectionId: existing.id,
      templateVersionId: existing.template_version_id,
      items: (versionRow?.items ?? []) as InspectionTemplateItem[],
    }
  }

  // pretrip_started/posttrip_started is a primary-sequence event already
  // fired by the driver tapping "Start Pre-Trip"/"Start Post-Trip"
  // (truck_picked_up -> pretrip_in_progress / at_yard_end ->
  // posttrip_in_progress) BEFORE the checklist screen ever opens — that tap
  // goes through the generic event flow, not this function. Re-firing it
  // here was the actual bug: it's only ever valid once per shift, so this
  // call failed unconditionally on every single pre-trip/post-trip, and the
  // client closed the sheet immediately on any error — stranding the driver
  // with no way to open the checklist at all. This function's only job is
  // the checklist's own metadata row; confirm the state transition already
  // happened as a sanity check instead of trying to redo it.
  const flowState = await getShiftFlowState(input.shiftId)
  const expectedState = input.inspectionType === 'pretrip' ? 'pretrip_in_progress' : 'posttrip_in_progress'
  if (flowState !== expectedState) {
    throw new DumpTruckError(
      `Cannot start ${input.inspectionType} inspection — shift is in state "${flowState}", expected "${expectedState}"`,
      409,
    )
  }

  const template = await getActiveTemplate(businessId, input.inspectionType)
  if (!template) throw new DumpTruckError(`No ${input.inspectionType} template configured`, 500)

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_inspections')
    .insert({
      business_id: businessId,
      shift_id: input.shiftId,
      driver_id: driverId,
      truck_id: shift.truckId,
      trailer_id: shift.trailerId,
      inspection_type: input.inspectionType,
      template_version_id: template.templateVersionId,
    })
    .select('id')
    .single()
  if (error) throw error

  return { inspectionId: data.id, templateVersionId: template.templateVersionId, items: template.items }
}

export interface CompleteInspectionInput {
  inspectionId: string
  items: InspectionItemInput[]
  odometer: number | null
  fuelLevel?: string | null
  driverSignature?: string | null
  overrideReason?: string | null
  completionEvent: {
    id: string
    idempotencyKey: string
    deviceCapturedAt: string
    effectiveAt: string
    timezone?: string | null
    utcOffsetMinutes?: number | null
    geo: RecordEventGeoInput
  }
}

export async function completeInspection(
  businessId: string, driverId: string, email: string | null, input: CompleteInspectionInput,
): Promise<{ hasBlockingDefects: boolean }> {
  const { data: inspection, error: fetchError } = await fleetServiceClient
    .from('fleet_dt_inspections')
    .select('id, shift_id, inspection_type, template_version_id, truck_id, trailer_id, driver_id, business_id')
    .eq('id', input.inspectionId)
    .single()
  if (fetchError || !inspection) throw new DumpTruckError('Inspection not found', 404)
  if (inspection.business_id !== businessId || inspection.driver_id !== driverId) {
    throw new DumpTruckError('Inspection not found', 404)
  }

  const { data: versionRow } = await fleetServiceClient
    .from('fleet_dt_inspection_template_versions')
    .select('items')
    .eq('id', inspection.template_version_id)
    .single()
  const templateItems = (versionRow?.items ?? []) as InspectionTemplateItem[]

  const validation = validateInspectionSubmission(templateItems, input.items, input.odometer)
  if (!validation.valid) {
    throw new DumpTruckError(`Inspection incomplete: ${validation.errors.join('; ')}`, 400)
  }

  await fleetServiceClient.from('fleet_dt_inspection_items').insert(
    input.items.map(item => ({
      inspection_id: input.inspectionId,
      item_key: item.itemKey,
      item_label: item.itemLabel,
      category: item.category,
      result: item.result,
      severity: item.severity,
      notes: item.notes,
      photo_doc_id: item.photoDocId ?? null,
    })),
  )

  const blocking = hasBlockingDefect(input.items)
  const anyDefect = input.items.some(i => i.result === 'defect')

  // Create maintenance-facing defect records for anything flagged as a defect.
  const defectItems = input.items.filter(i => i.result === 'defect')
  if (defectItems.length) {
    await fleetServiceClient.from('fleet_dt_defects').insert(
      defectItems.map(item => ({
        business_id: businessId,
        truck_id: inspection.truck_id,
        trailer_id: inspection.trailer_id,
        inspection_id: input.inspectionId,
        shift_id: inspection.shift_id,
        description: `${item.itemLabel}${item.notes ? ` — ${item.notes}` : ''}`,
        severity: item.severity ?? 'non_safety',
        reported_by: driverId,
      })),
    )

    // Tires flagged on pretrip/posttrip re-alert dispatch every single time,
    // deliberately, so a worn tire doesn't fall out of focus until it's
    // actually replaced — unlike other defects, this isn't a one-shot alert.
    const tireItems = defectItems.filter(i => i.itemLabel.toLowerCase().includes('tire'))
    if (tireItems.length) {
      alertDispatchOfTireItems(businessId, driverId, inspection.truck_id, inspection.inspection_type, tireItems)
        .catch(err => console.error('[inspections] alertDispatchOfTireItems failed:', err))
    }
  }

  await fleetServiceClient.from('fleet_dt_inspections').update({
    status: 'completed',
    odometer: input.odometer,
    fuel_level: input.fuelLevel ?? null,
    has_defects: anyDefect,
    has_out_of_service_defect: blocking,
    override_reason: blocking ? input.overrideReason ?? null : null,
    override_by: blocking && input.overrideReason ? driverId : null,
    driver_signature: input.driverSignature ?? null,
    signed_at: input.driverSignature ? new Date().toISOString() : null,
    completed_at: new Date().toISOString(),
  }).eq('id', input.inspectionId)

  await recordEvent(businessId, driverId, email, {
    id: input.completionEvent.id, idempotencyKey: input.completionEvent.idempotencyKey,
    shiftId: inspection.shift_id,
    eventType: inspection.inspection_type === 'pretrip' ? 'pretrip_completed' : 'posttrip_completed',
    deviceCapturedAt: input.completionEvent.deviceCapturedAt, effectiveAt: input.completionEvent.effectiveAt,
    timezone: input.completionEvent.timezone, utcOffsetMinutes: input.completionEvent.utcOffsetMinutes,
    geo: input.completionEvent.geo, odometer: input.odometer,
  })

  audit.log({
    userId: driverId, email, action: `dump_truck.inspection.complete.${inspection.inspection_type}`,
    resource: 'fleet_dt_inspections', resourceId: input.inspectionId,
    metadata: { hasBlockingDefects: blocking, defectCount: defectItems.length },
  })

  return { hasBlockingDefects: blocking }
}

async function alertDispatchOfTireItems(
  businessId: string, driverId: string, truckId: string, inspectionType: InspectionType,
  tireItems: { itemLabel: string; notes: string | null; severity: DefectSeverity | null }[],
): Promise<void> {
  const profile = await getBusinessProfile(businessId)
  if (!profile?.dispatchAlertEmail) return

  const [{ data: truck }, { data: driverProfile }] = await Promise.all([
    fleetServiceClient.from('fleet_equipment').select('unit_number').eq('id', truckId).maybeSingle(),
    fleetServiceClient.from('profiles').select('full_name').eq('id', driverId).maybeSingle(),
  ])

  const description = tireItems
    .map(i => `${i.itemLabel}${i.notes ? ` — ${i.notes}` : ''}`)
    .join('; ')
  const worstSeverity = tireItems.some(i => i.severity === 'out_of_service') ? 'out_of_service'
    : tireItems.some(i => i.severity === 'safety_critical') ? 'safety_critical'
    : tireItems.some(i => i.severity === 'non_safety') ? 'non_safety'
    : 'monitor'

  await sendDefectAlertEmail({
    to: profile.dispatchAlertEmail,
    businessName: profile.name,
    truckUnit: truck?.unit_number ?? null,
    driverName: driverProfile?.full_name || 'Driver',
    severity: worstSeverity,
    description: `[${inspectionType === 'pretrip' ? 'Pre-Trip' : 'Post-Trip'}] ${description}`,
    reportedAt: new Date().toISOString(),
  })
}
