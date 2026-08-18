/**
 * fleet/dumpTruck/hourOverrides.ts — verified paper-sheet / dispatcher hour
 * overrides (fleet_dt_shift_hour_overrides)
 *
 * See the migration doc comment for the "why": raw operational timestamps
 * (fleet_dt_shifts.clock_in_at/clock_out_at, fleet_dt_events) stay untouched
 * as the GPS/audit record. When a stronger source gives a different
 * authoritative hours total for a shift — a signed paper haul sheet, a
 * dispatcher-confirmed paid adjustment for a truck-down day — dispatch
 * records that total here instead. buildDriverHoursForRange (hours.ts)
 * picks up the active override automatically.
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

/** The currently-active (non-superseded) override for a shift, if any. */
export async function getActiveOverride(shiftId: string): Promise<ShiftHourOverride | null> {
  const { data } = await fleetServiceClient
    .from('fleet_dt_shift_hour_overrides')
    .select('id, shift_id, verified_hours, source_document, reason, created_by, created_at')
    .eq('shift_id', shiftId)
    .is('superseded_at', null)
    .maybeSingle()
  return data ? fromRow(data) : null
}

/** Full override history for a shift (most recent first), for the audit view. */
export async function listOverrideHistory(shiftId: string): Promise<ShiftHourOverride[]> {
  const { data } = await fleetServiceClient
    .from('fleet_dt_shift_hour_overrides')
    .select('id, shift_id, verified_hours, source_document, reason, created_by, created_at')
    .eq('shift_id', shiftId)
    .order('created_at', { ascending: false })
  return (data ?? []).map(fromRow)
}

/**
 * Records a verified-hours override for a shift, superseding any prior
 * active override (never mutates it — the old row is kept with
 * superseded_at/superseded_by set). Also writes a fleet_dt_corrections entry
 * so the reconciliation is visible in the same audit trail as timestamp
 * corrections, and the general fleet_audit_logs trail via audit.log().
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
  if (insertError) throw insertError
  const created = fromRow(inserted)

  if (prior) {
    await fleetServiceClient
      .from('fleet_dt_shift_hour_overrides')
      .update({ superseded_at: new Date().toISOString(), superseded_by: created.id })
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
