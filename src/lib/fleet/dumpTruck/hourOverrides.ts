/**
 * fleet/dumpTruck/hourOverrides.ts — verified paper-sheet / dispatcher hour
 * overrides (fleet_dt_shift_hour_overrides)
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'

export interface ShiftHourOverride {
  id: string
  shiftId: string
  verifiedHours: number
  sourceDocument: string | null
  reason: string
  createdBy: string
  createdAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): ShiftHourOverride {
  return {
    id: r.id,
    shiftId: r.shift_id,
    verifiedHours: Number(r.verified_hours),
    sourceDocument: r.source_document,
    reason: r.reason,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }
}

export async function getActiveOverride(shiftId: string): Promise<ShiftHourOverride | null> {
  const { data } = await fleetServiceClient
    .from('fleet_dt_shift_hour_overrides')
    .select('id, shift_id, verified_hours, source_document, reason, created_by, created_at')
    .eq('shift_id', shiftId)
    .is('superseded_at', null)
    .maybeSingle()
  return data ? fromRow(data) : null
}

export async function listOverrideHistory(shiftId: string): Promise<ShiftHourOverride[]> {
  const { data } = await fleetServiceClient
    .from('fleet_dt_shift_hour_overrides')
    .select('id, shift_id, verified_hours, source_document, reason, created_by, created_at')
    .eq('shift_id', shiftId)
    .order('created_at', { ascending: false })
  return (data ?? []).map(fromRow)
}

/**
 * Records a verified-hours override for a shift. The partial unique index
 * permits only one active override, so the prior row must be marked
 * superseded before the replacement insert. If the replacement insert fails,
 * the prior row is restored to active to avoid losing the authoritative value.
 */
export async function applyShiftHourOverride(params: {
  businessId: string
  shiftId: string
  verifiedHours: number
  reason: string
  sourceDocument: string | null
  actorId: string
  actorEmail?: string | null
}): Promise<ShiftHourOverride> {
  const prior = await getActiveOverride(params.shiftId)
  const supersededAt = new Date().toISOString()

  if (prior) {
    const { error: supersedeError } = await fleetServiceClient
      .from('fleet_dt_shift_hour_overrides')
      .update({ superseded_at: supersededAt })
      .eq('id', prior.id)
    if (supersedeError) throw supersedeError
  }

  const { data: inserted, error: insertError } = await fleetServiceClient
    .from('fleet_dt_shift_hour_overrides')
    .insert({
      business_id: params.businessId,
      shift_id: params.shiftId,
      verified_hours: params.verifiedHours,
      source_document: params.sourceDocument,
      reason: params.reason,
      created_by: params.actorId,
    })
    .select('id, shift_id, verified_hours, source_document, reason, created_by, created_at')
    .single()

  if (insertError) {
    // Best-effort rollback of the supersede if the replacement failed.
    if (prior) {
      await fleetServiceClient
        .from('fleet_dt_shift_hour_overrides')
        .update({ superseded_at: null, superseded_by: null })
        .eq('id', prior.id)
    }
    throw insertError
  }

  const created = fromRow(inserted)

  if (prior) {
    await fleetServiceClient
      .from('fleet_dt_shift_hour_overrides')
      .update({ superseded_by: created.id })
      .eq('id', prior.id)
  }

  await fleetServiceClient.from('fleet_dt_corrections').insert({
    business_id: params.businessId,
    entity_type: 'shift_hour_override',
    entity_id: params.shiftId,
    field: 'verified_hours',
    old_value: prior ? prior.verifiedHours : null,
    new_value: params.verifiedHours,
    reason: params.reason,
    actor_id: params.actorId,
  })

  audit.log({
    userId: params.actorId,
    email: params.actorEmail,
    action: 'shift_hour_override.apply',
    resource: 'fleet_dt_shift_hour_overrides',
    resourceId: created.id,
    before: prior,
    after: created,
    metadata: { shiftId: params.shiftId, sourceDocument: params.sourceDocument },
    source: 'admin',
  })

  return created
}
