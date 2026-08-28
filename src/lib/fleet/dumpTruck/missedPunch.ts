import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { DumpTruckError } from './shared'

const PROMPT_AFTER_MS = 2 * 60 * 60 * 1000
const RESPONSE_GRACE_MS = 10 * 60 * 1000

export interface ShiftReconciliation {
  id: string
  shiftId: string
  brokerJobId: string | null
  brokerEndAt: string
  promptedAt: string
  responseDeadlineAt: string
  status: 'pending' | 'confirmed_working' | 'auto_closed' | 'resolved'
  provisionalEndAt: string | null
  reviewRequired: boolean
  correctedEndAt: string | null
  driverNote: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): ShiftReconciliation {
  return {
    id: r.id, shiftId: r.shift_id, brokerJobId: r.broker_job_id,
    brokerEndAt: r.broker_end_at, promptedAt: r.prompted_at,
    responseDeadlineAt: r.response_deadline_at, status: r.status,
    provisionalEndAt: r.provisional_end_at, reviewRequired: r.review_required,
    correctedEndAt: r.corrected_end_at, driverNote: r.driver_note,
  }
}

async function latestBrokerEndForDriver(businessId: string, driverId: string, clockInAt: string): Promise<{ jobId: string; endAt: string } | null> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_jobs')
    .select('id, signed_out_at')
    .eq('business_id', businessId)
    .eq('driver_id', driverId)
    .not('signed_out_at', 'is', null)
    .gte('signed_out_at', clockInAt)
    .order('signed_out_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.signed_out_at ? { jobId: data.id, endAt: data.signed_out_at } : null
}

export async function evaluateMissedPunchSafeguard(
  businessId: string,
  driverId: string,
  shift: { id: string; clockInAt: string | null; clockOutAt: string | null },
  now = new Date(),
): Promise<ShiftReconciliation | null> {
  if (!shift.clockInAt || shift.clockOutAt) return null

  const { data: existing, error: existingError } = await fleetServiceClient
    .from('fleet_dt_shift_reconciliations').select('*').eq('shift_id', shift.id).maybeSingle()
  if (existingError) throw existingError

  if (existing) {
    const rec = fromRow(existing)
    // After a driver confirms they are still working, ask again two hours later.
    if (rec.status === 'confirmed_working' && now.getTime() >= new Date(rec.promptedAt).getTime() + PROMPT_AFTER_MS) {
      const deadline = new Date(now.getTime() + RESPONSE_GRACE_MS).toISOString()
      const { data, error } = await fleetServiceClient.from('fleet_dt_shift_reconciliations')
        .update({ status: 'pending', prompted_at: now.toISOString(), response_deadline_at: deadline })
        .eq('id', rec.id).select('*').single()
      if (error) throw error
      return fromRow(data)
    }
    if (rec.status === 'pending' && now.getTime() > new Date(rec.responseDeadlineAt).getTime()) {
      // Provisional auto-close: never edit an existing punch. Only fill a missing clock-out.
      const { error: shiftError } = await fleetServiceClient.from('fleet_dt_shifts')
        .update({ clock_out_at: rec.brokerEndAt, state: 'clocked_out' })
        .eq('id', shift.id).is('clock_out_at', null)
      if (shiftError) throw shiftError
      const { data, error } = await fleetServiceClient.from('fleet_dt_shift_reconciliations')
        .update({ status: 'auto_closed', provisional_end_at: rec.brokerEndAt, review_required: true })
        .eq('id', rec.id).select('*').single()
      if (error) throw error
      return fromRow(data)
    }
    return rec
  }

  const broker = await latestBrokerEndForDriver(businessId, driverId, shift.clockInAt)
  if (!broker) return null
  const brokerEndMs = new Date(broker.endAt).getTime()
  if (now.getTime() < brokerEndMs + PROMPT_AFTER_MS) return null

  const deadline = new Date(now.getTime() + RESPONSE_GRACE_MS).toISOString()
  const { data, error } = await fleetServiceClient.from('fleet_dt_shift_reconciliations').insert({
    business_id: businessId, driver_id: driverId, shift_id: shift.id, broker_job_id: broker.jobId,
    broker_end_at: broker.endAt, prompted_at: now.toISOString(), response_deadline_at: deadline,
  }).select('*').single()
  if (error) throw error
  return fromRow(data)
}

export async function respondStillWorking(businessId: string, driverId: string, reconciliationId: string): Promise<ShiftReconciliation> {
  const now = new Date().toISOString()
  const { data, error } = await fleetServiceClient.from('fleet_dt_shift_reconciliations')
    .update({ status: 'confirmed_working', prompted_at: now, response_deadline_at: new Date(Date.now() + RESPONSE_GRACE_MS).toISOString() })
    .eq('id', reconciliationId).eq('business_id', businessId).eq('driver_id', driverId).eq('status', 'pending')
    .select('*').single()
  if (error) throw error
  return fromRow(data)
}

export async function getPendingNextShiftReview(businessId: string, driverId: string): Promise<ShiftReconciliation | null> {
  const { data, error } = await fleetServiceClient.from('fleet_dt_shift_reconciliations')
    .select('*').eq('business_id', businessId).eq('driver_id', driverId).eq('review_required', true)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

export async function requireNoPendingNextShiftReview(businessId: string, driverId: string): Promise<void> {
  const pending = await getPendingNextShiftReview(businessId, driverId)
  if (pending) throw new DumpTruckError(`RECONCILIATION_REQUIRED:${pending.id}`, 409)
}

export async function resolveNextShiftReview(input: {
  businessId: string; driverId: string; email: string | null; reconciliationId: string
  action: 'confirm' | 'correct'; correctedEndAt?: string | null; note?: string | null
}): Promise<ShiftReconciliation> {
  const { data: rec, error: recError } = await fleetServiceClient.from('fleet_dt_shift_reconciliations')
    .select('*').eq('id', input.reconciliationId).eq('business_id', input.businessId).eq('driver_id', input.driverId).single()
  if (recError) throw recError
  if (!rec.review_required) return fromRow(rec)

  const finalEnd = input.action === 'correct' ? input.correctedEndAt : rec.provisional_end_at
  if (!finalEnd) throw new DumpTruckError('Corrected end time is required', 400)

  const brokerEndMs = new Date(rec.broker_end_at).getTime()
  const finalEndMs = new Date(finalEnd).getTime()
  const extraMinutes = Math.max(0, (finalEndMs - brokerEndMs) / 60000)
  if (extraMinutes > 30 && !input.note?.trim()) {
    throw new DumpTruckError('A note is required when paid time exceeds the broker sheet by more than 30 minutes', 400)
  }

  // Use the existing verified-hours override mechanism rather than rewriting event history.
  const { data: shift, error: shiftError } = await fleetServiceClient.from('fleet_dt_shifts')
    .select('clock_in_at').eq('id', rec.shift_id).single()
  if (shiftError) throw shiftError
  const verifiedHours = Math.max(0, (finalEndMs - new Date(shift.clock_in_at).getTime()) / 3600000)

  const { data: prior } = await fleetServiceClient.from('fleet_dt_shift_hour_overrides')
    .select('id').eq('shift_id', rec.shift_id).is('superseded_at', null).maybeSingle()
  if (prior) await fleetServiceClient.from('fleet_dt_shift_hour_overrides').update({ superseded_at: new Date().toISOString() }).eq('id', prior.id)

  const { error: overrideError } = await fleetServiceClient.from('fleet_dt_shift_hour_overrides').insert({
    business_id: input.businessId, driver_id: input.driverId, shift_id: rec.shift_id,
    verified_hours: Math.round(verifiedHours * 100) / 100,
    reason: input.note?.trim() || 'Confirmed provisional broker-sheet end after missed punch',
    entered_by: input.driverId,
  })
  if (overrideError) throw overrideError

  const { data, error } = await fleetServiceClient.from('fleet_dt_shift_reconciliations').update({
    status: 'resolved', review_required: false, corrected_end_at: finalEnd,
    driver_note: input.note?.trim() || null, reviewed_at: new Date().toISOString(), reviewed_by: input.driverId,
  }).eq('id', rec.id).select('*').single()
  if (error) throw error

  audit.log({ userId: input.driverId, email: input.email, action: 'dump_truck.missed_punch.reconcile', resource: 'fleet_dt_shift_reconciliations', resourceId: rec.id, before: rec, after: data, source: 'driver' })
  return fromRow(data)
}
