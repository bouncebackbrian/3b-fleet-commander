/**
 * fleet/dumpTruck/weeklyTimesheets.ts — weekly recap, two-party sign-off
 *
 * Builds the driver's weekly hours recap (daily rows + escalations) and
 * records the insert-only fleet_dt_weekly_timesheets audit trail: the
 * driver reviews and signs first, then dispatch signs off on the driver-
 * confirmed week. "Latest row per role wins" for each side's current
 * status, same pattern as hoursConfirmations.ts, extended to two signers.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { getThreebId, getBusinessMeta, DumpTruckError } from './shared'
import { buildDriverHoursForRange } from './hours'
import { listDrivers } from './jobs'
import type { DailyHoursRow, RangeSummary, DateRange } from '@/lib/dumpTruck/hours'

export type WeeklyTimesheetRole = 'driver' | 'dispatch'
export type WeeklyTimesheetActionType = 'confirmed' | 'correction_requested' | 'approved' | 'sent_back'

export interface WeeklyTimesheetAction {
  id: string
  role: WeeklyTimesheetRole
  action: WeeklyTimesheetActionType
  signatureDocId: string | null
  note: string | null
  totalHoursAtAction: number | null
  regularHoursAtAction: number | null
  overtimeHoursAtAction: number | null
  createdBy: string
  createdByEmail: string | null
  createdAt: string
}

export interface WeeklyEscalation {
  workDate: string
  code: string
  message: string
}

export type WeeklyTimesheetStatus =
  | 'not_submitted' | 'correction_requested' | 'pending_dispatch' | 'sent_back' | 'approved'

export interface WeeklyTimesheet {
  weekStart: string
  weekEnd: string
  driverId: string
  shiftIds: string[]
  rows: DailyHoursRow[]
  summary: RangeSummary
  escalations: WeeklyEscalation[]
  driverAction: WeeklyTimesheetAction | null
  dispatchAction: WeeklyTimesheetAction | null
  status: WeeklyTimesheetStatus
  /** Every driver+dispatch action on record for this week, oldest first — the
   *  full audit trail (including any correction/send-back rounds and the
   *  notes attached to them). This is what the official Weekly Recap & Pay
   *  Report documents as "corrections made" — see reports/weeklyTimesheetPdf.ts. */
  history: WeeklyTimesheetAction[]
}

function fromRow(r: Record<string, unknown>): WeeklyTimesheetAction {
  return {
    id: r.id as string,
    role: r.role as WeeklyTimesheetRole,
    action: r.action as WeeklyTimesheetActionType,
    signatureDocId: (r.signature_doc_id as string) ?? null,
    note: (r.note as string) ?? null,
    totalHoursAtAction: r.total_hours_at_action != null ? Number(r.total_hours_at_action) : null,
    regularHoursAtAction: r.regular_hours_at_action != null ? Number(r.regular_hours_at_action) : null,
    overtimeHoursAtAction: r.overtime_hours_at_action != null ? Number(r.overtime_hours_at_action) : null,
    createdBy: r.created_by as string,
    createdByEmail: (r.created_by_email as string) ?? null,
    createdAt: r.created_at as string,
  }
}

function deriveStatus(driverAction: WeeklyTimesheetAction | null, dispatchAction: WeeklyTimesheetAction | null): WeeklyTimesheetStatus {
  if (!driverAction) return 'not_submitted'
  if (driverAction.action === 'correction_requested') return 'correction_requested'
  // driverAction.action === 'confirmed' from here on
  if (!dispatchAction || new Date(dispatchAction.createdAt).getTime() < new Date(driverAction.createdAt).getTime()) {
    return 'pending_dispatch'
  }
  return dispatchAction.action === 'approved' ? 'approved' : 'sent_back'
}

/** Every action on record for one driver's week, oldest first — the full audit trail (all correction/send-back rounds included). */
export async function getWeeklyActionsHistory(
  businessId: string, driverId: string, weekStart: string,
): Promise<WeeklyTimesheetAction[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_weekly_timesheets')
    .select('*')
    .eq('business_id', businessId)
    .eq('driver_id', driverId)
    .eq('week_start', weekStart)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

/** Latest driver-role and dispatch-role rows for one driver's week (or nulls if neither side has acted), derived from the full history. */
function latestByRole(history: WeeklyTimesheetAction[]): { driverAction: WeeklyTimesheetAction | null; dispatchAction: WeeklyTimesheetAction | null } {
  let driverAction: WeeklyTimesheetAction | null = null
  let dispatchAction: WeeklyTimesheetAction | null = null
  for (const a of history) {
    if (a.role === 'driver') driverAction = a
    if (a.role === 'dispatch') dispatchAction = a
  }
  return { driverAction, dispatchAction }
}

/** Escalations flagged from the week's own data — per-day integrity warnings, an open daily correction, and truck-problem reports touching the week's shifts. */
async function buildEscalations(businessId: string, shiftIds: string[], rows: DailyHoursRow[]): Promise<WeeklyEscalation[]> {
  const escalations: WeeklyEscalation[] = []
  for (const row of rows) {
    for (const w of row.integrityWarnings) {
      escalations.push({ workDate: row.workDate, code: w.code, message: w.message })
    }
    if (row.exceptionStatus === 'correction_requested') {
      escalations.push({ workDate: row.workDate, code: 'daily_correction_pending', message: `A correction was requested on ${row.workDate}'s hours and hasn't been resolved yet.` })
    }
  }

  if (shiftIds.length > 0) {
    const { data: breakdowns, error } = await fleetServiceClient
      .from('fleet_dt_breakdowns')
      .select('shift_id, started_at, ended_at, resolution, category')
      .eq('business_id', businessId)
      .in('shift_id', shiftIds)
    if (error) throw error
    for (const b of breakdowns ?? []) {
      const workDate = (b.started_at as string).slice(0, 10)
      const label = (b.category as string | null)?.replace(/_/g, ' ') ?? 'Truck problem'
      escalations.push({
        workDate, code: 'truck_problem',
        message: b.ended_at
          ? `Truck problem reported (${label}), resolved as ${(b.resolution as string | null) ?? 'unspecified'}.`
          : `Truck problem reported (${label}) and still unresolved.`,
      })
    }
  }

  escalations.sort((a, b) => a.workDate.localeCompare(b.workDate))
  return escalations
}

export async function buildWeeklyTimesheet(businessId: string, driverId: string, weekStart: string, weekEnd: string): Promise<WeeklyTimesheet> {
  const range: DateRange = { start: weekStart, end: weekEnd }
  const [{ rows, summary }, history] = await Promise.all([
    buildDriverHoursForRange(businessId, driverId, range),
    getWeeklyActionsHistory(businessId, driverId, weekStart),
  ])
  const shiftIds = rows.map(r => r.shiftId)
  const escalations = await buildEscalations(businessId, shiftIds, rows)
  const { driverAction, dispatchAction } = latestByRole(history)

  return {
    weekStart, weekEnd, driverId, shiftIds, rows, summary, escalations,
    driverAction, dispatchAction, history,
    status: deriveStatus(driverAction, dispatchAction),
  }
}

async function insertAction(input: {
  businessId: string; driverId: string; weekStart: string; weekEnd: string
  role: WeeklyTimesheetRole; action: WeeklyTimesheetActionType
  signatureDocId: string | null; note: string | null
  totalHours: number | null; regularHours: number | null; overtimeHours: number | null
  shiftIds: string[]; escalations: WeeklyEscalation[]
  createdBy: string; email: string | null
}): Promise<WeeklyTimesheetAction> {
  const [driverThreebId, businessMeta] = await Promise.all([getThreebId(input.driverId), getBusinessMeta(input.businessId)])

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_weekly_timesheets')
    .insert({
      business_id: input.businessId, business_threeb_id: businessMeta.threebBizId,
      driver_id: input.driverId, driver_threeb_id: driverThreebId,
      week_start: input.weekStart, week_end: input.weekEnd,
      role: input.role, action: input.action,
      signature_doc_id: input.signatureDocId, note: input.note,
      total_hours_at_action: input.totalHours, regular_hours_at_action: input.regularHours, overtime_hours_at_action: input.overtimeHours,
      escalations_snapshot: input.escalations, shift_ids: input.shiftIds,
      created_by: input.createdBy, created_by_email: input.email,
    })
    .select('*')
    .single()
  if (error) throw error
  const action = fromRow(data)
  audit.log({
    userId: input.createdBy, email: input.email, action: `dump_truck.weekly_timesheet.${input.action}`,
    resource: 'fleet_dt_weekly_timesheets', resourceId: action.id, after: action, source: 'api',
  })
  return action
}

async function assertOwnWeek(businessId: string, driverId: string, weekStart: string, weekEnd: string) {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_shifts')
    .select('id')
    .eq('business_id', businessId).eq('driver_id', driverId)
    .gte('clock_in_at', `${weekStart}T00:00:00Z`).lte('clock_in_at', `${weekEnd}T23:59:59.999Z`)
  if (error) throw error
  if (!data || data.length === 0) throw new DumpTruckError('No shifts found for that driver/week', 404)
}

export async function confirmWeeklyTimesheet(
  businessId: string, driverId: string, weekStart: string, weekEnd: string,
  signatureDocId: string, userId: string, email: string | null,
): Promise<WeeklyTimesheetAction> {
  await assertOwnWeek(businessId, driverId, weekStart, weekEnd)
  const timesheet = await buildWeeklyTimesheet(businessId, driverId, weekStart, weekEnd)
  return insertAction({
    businessId, driverId, weekStart, weekEnd, role: 'driver', action: 'confirmed',
    signatureDocId, note: null,
    totalHours: timesheet.summary.totalRegularHours + timesheet.summary.totalOvertimeHours,
    regularHours: timesheet.summary.totalRegularHours, overtimeHours: timesheet.summary.totalOvertimeHours,
    shiftIds: timesheet.shiftIds, escalations: timesheet.escalations,
    createdBy: userId, email,
  })
}

export async function requestWeeklyCorrection(
  businessId: string, driverId: string, weekStart: string, weekEnd: string,
  note: string, userId: string, email: string | null,
): Promise<WeeklyTimesheetAction> {
  if (!note?.trim()) throw new DumpTruckError('A note explaining what needs correcting is required', 400)
  await assertOwnWeek(businessId, driverId, weekStart, weekEnd)
  const timesheet = await buildWeeklyTimesheet(businessId, driverId, weekStart, weekEnd)
  return insertAction({
    businessId, driverId, weekStart, weekEnd, role: 'driver', action: 'correction_requested',
    signatureDocId: null, note: note.trim(),
    totalHours: timesheet.summary.totalRegularHours + timesheet.summary.totalOvertimeHours,
    regularHours: timesheet.summary.totalRegularHours, overtimeHours: timesheet.summary.totalOvertimeHours,
    shiftIds: timesheet.shiftIds, escalations: timesheet.escalations,
    createdBy: userId, email,
  })
}

export async function approveWeeklyTimesheet(
  businessId: string, driverId: string, weekStart: string, weekEnd: string,
  signatureDocId: string, userId: string, email: string | null,
): Promise<WeeklyTimesheetAction> {
  const timesheet = await buildWeeklyTimesheet(businessId, driverId, weekStart, weekEnd)
  if (timesheet.status !== 'pending_dispatch') {
    throw new DumpTruckError('The driver has not confirmed this week yet — nothing to approve', 409)
  }
  return insertAction({
    businessId, driverId, weekStart, weekEnd, role: 'dispatch', action: 'approved',
    signatureDocId, note: null,
    totalHours: timesheet.summary.totalRegularHours + timesheet.summary.totalOvertimeHours,
    regularHours: timesheet.summary.totalRegularHours, overtimeHours: timesheet.summary.totalOvertimeHours,
    shiftIds: timesheet.shiftIds, escalations: timesheet.escalations,
    createdBy: userId, email,
  })
}

export async function sendBackWeeklyTimesheet(
  businessId: string, driverId: string, weekStart: string, weekEnd: string,
  note: string, userId: string, email: string | null,
): Promise<WeeklyTimesheetAction> {
  if (!note?.trim()) throw new DumpTruckError('A note explaining why the week is being sent back is required', 400)
  const timesheet = await buildWeeklyTimesheet(businessId, driverId, weekStart, weekEnd)
  return insertAction({
    businessId, driverId, weekStart, weekEnd, role: 'dispatch', action: 'sent_back',
    signatureDocId: null, note: note.trim(),
    totalHours: timesheet.summary.totalRegularHours + timesheet.summary.totalOvertimeHours,
    regularHours: timesheet.summary.totalRegularHours, overtimeHours: timesheet.summary.totalOvertimeHours,
    shiftIds: timesheet.shiftIds, escalations: timesheet.escalations,
    createdBy: userId, email,
  })
}

/** Every active driver's timesheet status for one week — dispatch's "who still needs to sign / who's waiting on me" queue. */
export async function listWeeklyTimesheetsForBusiness(businessId: string, weekStart: string, weekEnd: string): Promise<WeeklyTimesheet[]> {
  const drivers = await listDrivers(businessId)
  const results: WeeklyTimesheet[] = []
  for (const driver of drivers) {
    const timesheet = await buildWeeklyTimesheet(businessId, driver.userId, weekStart, weekEnd)
    if (timesheet.rows.length === 0) continue
    results.push(timesheet)
  }
  return results
}
