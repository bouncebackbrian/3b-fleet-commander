/**
 * fleet/dumpTruck/shiftReport.ts — End of Shift Report
 *
 * One shift's full story for a downloadable PDF: hours breakdown (reuses
 * buildDriverHoursForRange so the numbers never drift from what the driver
 * sees on /driver/hours), the event timeline, and any truck issues (defects)
 * reported during that shift. Read-only assembly — no writes.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { buildDriverHoursForRange } from './hours'
import { listBusinessEventLog } from './adminLogs'
import { listDefectsForShifts, type DefectRow } from './incidents'
import { getDriverBusinessMeta } from './shared'
import { EVENT_LABELS } from '@/lib/dumpTruck/eventLabels'
import type { DailyHoursRow } from '@/lib/dumpTruck/hours'

export interface ShiftReportTimelineEntry {
  time: string // ISO
  label: string
  notes: string | null
}

export interface ShiftReportData {
  shiftId: string
  driverName: string
  businessName: string
  threebBizId: string | null
  workDate: string
  hours: DailyHoursRow
  timeline: ShiftReportTimelineEntry[]
  defects: DefectRow[]
}

function utcDateString(iso: string): string {
  return iso.slice(0, 10)
}

/** businessId is trusted from the caller's auth context — callers must confirm the shift belongs to it before calling. */
export async function buildShiftReport(businessId: string, shiftId: string): Promise<ShiftReportData> {
  const { data: shift, error } = await fleetServiceClient
    .from('fleet_dt_shifts')
    .select('id, driver_id, clock_in_at')
    .eq('id', shiftId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (error) throw error
  if (!shift) throw new Error('Shift not found')
  if (!shift.driver_id) throw new Error('Shift has no driver')

  const workDate = shift.clock_in_at ? utcDateString(shift.clock_in_at) : new Date().toISOString().slice(0, 10)

  const [{ rows }, meta, events, defects] = await Promise.all([
    buildDriverHoursForRange(businessId, shift.driver_id, { start: workDate, end: workDate }),
    getDriverBusinessMeta(businessId, shift.driver_id),
    listBusinessEventLog(businessId, { driverId: shift.driver_id, from: workDate, to: workDate, limit: 500 }),
    listDefectsForShifts(businessId, [shiftId]),
  ])

  const hours = rows.find(r => r.shiftId === shiftId)
  if (!hours) throw new Error('Could not compute hours for this shift')

  const timeline = events
    .filter(e => e.shiftId === shiftId)
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))
    .map(e => ({ time: e.effectiveAt, label: EVENT_LABELS[e.eventType] ?? e.eventType, notes: e.notes }))

  return {
    shiftId,
    driverName: meta.driverName,
    businessName: meta.businessName,
    threebBizId: meta.threebBizId,
    workDate,
    hours,
    timeline,
    defects,
  }
}
