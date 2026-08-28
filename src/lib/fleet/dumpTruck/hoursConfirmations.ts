/**
 * fleet/dumpTruck/hoursConfirmations.ts — driver sign-off/submission on a day's hours
 *
 * Insert-only per-shift audit trail. The latest row per shift_id is the
 * current status; prior confirmations/correction requests are never erased.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { getThreebId, getBusinessMeta, DumpTruckError } from './shared'
import { getShiftById } from './shifts'

export interface HoursConfirmation {
  id: string
  shiftId: string
  driverId: string
  workDate: string
  status: 'confirmed' | 'correction_requested'
  signatureDocId: string | null
  sheetPhotoDocId: string | null
  correctionNote: string | null
  totalHoursAtConfirmation: number | null
  createdAt: string
}

function fromRow(row: Record<string, unknown>): HoursConfirmation {
  return {
    id: row.id as string,
    shiftId: row.shift_id as string,
    driverId: row.driver_id as string,
    workDate: row.work_date as string,
    status: row.status as HoursConfirmation['status'],
    signatureDocId: (row.signature_doc_id as string) ?? null,
    sheetPhotoDocId: (row.sheet_photo_doc_id as string) ?? null,
    correctionNote: (row.correction_note as string) ?? null,
    totalHoursAtConfirmation: row.total_hours_at_confirmation != null ? Number(row.total_hours_at_confirmation) : null,
    createdAt: row.created_at as string,
  }
}

async function assertOwnShift(businessId: string, driverId: string, shiftId: string) {
  const shift = await getShiftById(shiftId)
  if (!shift || shift.businessId !== businessId || shift.driverId !== driverId) throw new DumpTruckError('Shift not found', 404)
  return shift
}

export async function confirmDailyHours(
  businessId: string, driverId: string, shiftId: string, workDate: string,
  signatureDocId: string | null, sheetPhotoDocId: string | null, totalHours: number | null,
  email: string | null,
): Promise<HoursConfirmation> {
  await assertOwnShift(businessId, driverId, shiftId)
  const [driverThreebId, businessMeta] = await Promise.all([getThreebId(driverId), getBusinessMeta(businessId)])
  const { data, error } = await fleetServiceClient.from('fleet_dt_hours_confirmations').insert({
    business_id: businessId, business_threeb_id: businessMeta.threebBizId,
    driver_id: driverId, driver_threeb_id: driverThreebId,
    shift_id: shiftId, work_date: workDate, status: 'confirmed',
    signature_doc_id: signatureDocId, sheet_photo_doc_id: sheetPhotoDocId,
    total_hours_at_confirmation: totalHours,
    created_by: driverId, created_by_email: email,
  }).select('*').single()
  if (error) throw error
  const confirmation = fromRow(data)
  audit.log({ userId: driverId, email, action: 'dump_truck.hours_confirmation.confirm', resource: 'fleet_dt_hours_confirmations', resourceId: confirmation.id, after: confirmation, source: 'api' })
  return confirmation
}

export async function requestHoursCorrection(
  businessId: string, driverId: string, shiftId: string, workDate: string,
  correctionNote: string, totalHours: number | null, email: string | null,
): Promise<HoursConfirmation> {
  if (!correctionNote?.trim()) throw new DumpTruckError('A note explaining what needs correcting is required', 400)
  await assertOwnShift(businessId, driverId, shiftId)
  const [driverThreebId, businessMeta] = await Promise.all([getThreebId(driverId), getBusinessMeta(businessId)])
  const { data, error } = await fleetServiceClient.from('fleet_dt_hours_confirmations').insert({
    business_id: businessId, business_threeb_id: businessMeta.threebBizId,
    driver_id: driverId, driver_threeb_id: driverThreebId,
    shift_id: shiftId, work_date: workDate, status: 'correction_requested',
    correction_note: correctionNote.trim(), total_hours_at_confirmation: totalHours,
    created_by: driverId, created_by_email: email,
  }).select('*').single()
  if (error) throw error
  const confirmation = fromRow(data)
  audit.log({ userId: driverId, email, action: 'dump_truck.hours_confirmation.correction_requested', resource: 'fleet_dt_hours_confirmations', resourceId: confirmation.id, after: confirmation, source: 'api' })
  return confirmation
}

export async function getLatestConfirmationsForShifts(
  businessId: string, shiftIds: string[],
): Promise<Record<string, HoursConfirmation>> {
  if (shiftIds.length === 0) return {}
  const { data, error } = await fleetServiceClient.from('fleet_dt_hours_confirmations')
    .select('*').eq('business_id', businessId).in('shift_id', shiftIds).order('created_at', { ascending: false })
  if (error) throw error
  const latest: Record<string, HoursConfirmation> = {}
  for (const row of data ?? []) {
    const c = fromRow(row)
    if (!latest[c.shiftId]) latest[c.shiftId] = c
  }
  return latest
}
