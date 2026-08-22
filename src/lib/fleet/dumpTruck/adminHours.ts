/**
 * fleet/dumpTruck/adminHours.ts — dispatch/admin payroll hours across drivers
 *
 * Loops the existing per-driver hours builder (buildDriverHoursForRange) over
 * every active driver in the business, attaching driverName/threebId to each
 * row/summary. No new aggregation logic — just a business-wide fan-out over
 * the same pure builders the driver-facing /driver/hours portal already uses,
 * so payroll rules (Mon–Sun week, single hourly-rate + daily-OT estimate)
 * stay identical between the driver view and the dispatch view.
 */

import { sumRangeSummaries, type DateRange, type DailyHoursRow, type RangeSummary } from '@/lib/dumpTruck/hours'
import { buildDriverHoursForRange, type RevenueShareApplied } from './hours'
import { listDrivers, type DriverOption } from './jobs'
import type { DriverHoursRow, DriverRangeSummary, WeeklyDriverSummary } from './exports'

export interface BusinessHoursResult {
  rows: DriverHoursRow[]
  driverSummaries: (DriverRangeSummary & { revenueShareApplied: RevenueShareApplied | null })[]
  businessSummary: RangeSummary
}

export async function buildBusinessHoursForRange(
  businessId: string, range: DateRange, driverId?: string | null,
): Promise<BusinessHoursResult> {
  const allDrivers = await listDrivers(businessId)
  const drivers: DriverOption[] = driverId ? allDrivers.filter(d => d.userId === driverId) : allDrivers

  const rows: DriverHoursRow[] = []
  const driverSummaries: (DriverRangeSummary & { revenueShareApplied: RevenueShareApplied | null })[] = []

  for (const driver of drivers) {
    const { rows: driverRows, summary, revenueShareApplied } = await buildDriverHoursForRange(businessId, driver.userId, range)
    if (driverRows.length === 0) continue
    rows.push(...driverRows.map((r: DailyHoursRow) => ({ ...r, driverId: driver.userId, driverName: driver.name, threebId: driver.threebId })))
    driverSummaries.push({ ...summary, driverId: driver.userId, driverName: driver.name, threebId: driver.threebId, revenueShareApplied })
  }

  rows.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.driverName.localeCompare(b.driverName))
  driverSummaries.sort((a, b) => a.driverName.localeCompare(b.driverName))

  // Sums each driver's already-computed summary (not re-derived from raw rows) so a
  // revenue-share-adjusted driver total isn't silently lost from the business total.
  const businessSummary = sumRangeSummaries(driverSummaries)

  return { rows, driverSummaries, businessSummary }
}

/**
 * One payroll report covering several pay weeks — a driver's (or every
 * driver's) week-by-week breakdown, one row per driver per week, so a
 * dispatcher can pull e.g. the last 4 pay periods in a single export
 * instead of downloading four separate weekly reports. Each week reuses
 * buildBusinessHoursForRange exactly as the single-week panel does, so the
 * per-week numbers here always match what that week's own report would show.
 */
export async function buildWeeklyPayrollBreakdown(
  businessId: string, weeks: DateRange[], driverId?: string | null,
): Promise<{ rows: WeeklyDriverSummary[] }> {
  const rows: WeeklyDriverSummary[] = []
  for (const week of weeks) {
    const { driverSummaries } = await buildBusinessHoursForRange(businessId, week, driverId ?? null)
    for (const s of driverSummaries) {
      rows.push({ ...s, weekStart: week.start, weekEnd: week.end })
    }
  }
  return { rows }
}
