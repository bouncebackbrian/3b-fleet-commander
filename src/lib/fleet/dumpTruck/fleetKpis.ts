/**
 * fleet/dumpTruck/fleetKpis.ts — per-truck / per-driver KPI rollup, with
 * fleet-wide ("team") figures surfaced separately.
 *
 * No new queries or tables: fans out to the same builders the existing
 * admin Hours and Fuel panels already use (buildBusinessHoursForRange,
 * buildFuelSummaryForBusiness) and the same defects list the Hector report
 * and Recurring Issues page read (listDefects), then regroups those results
 * by truck and by driver. A defect category counts as a "team" issue (see
 * isTeamIssue) once it spans more than one truck or has been reported by
 * more than one driver — otherwise it's that truck's or that driver's own
 * issue, not a fleet-wide pattern.
 */

import { buildRangeSummary, type DateRange, type DailyHoursRow, type RangeSummary } from '@/lib/dumpTruck/hours'
import { groupRecurringIssues, isTeamIssue, type RecurringIssueDefect, type RecurringIssueGroup } from '@/lib/dumpTruck/recurringIssues'
import { buildBusinessHoursForRange } from './adminHours'
import { buildFuelSummaryForBusiness } from './adminFuel'
import { listDumpTruckEquipment } from './equipment'
import { listDefects } from './incidents'
import { listExpenses } from './expenses'
import { computeRevenueForRange } from './revenue'
import type { DriverHoursRow } from './exports'

export interface TruckFuelSummary {
  totalGallons: number
  totalCost: number
  totalMiles: number
  avgMpg: number | null
}

export interface TruckPnl {
  revenue: number
  /** Non-fuel operating expenses coded to this truck (fleet_dt_expenses, excluding category='fuel'). */
  expenseCost: number
  fuelCost: number
  /** Estimated wage cost — sum of hourly/per-mile pay estimate for shifts on this truck (see hours.ts). */
  wageCost: number
  /** revenue - expenseCost - fuelCost - wageCost. Null when no job assigned to this truck has a price set. */
  contribution: number | null
  contributionMarginPct: number | null
  priced: boolean
}

export interface TruckKpiRow {
  truckId: string
  unitNumber: string
  hours: RangeSummary
  fuel: TruckFuelSummary | null
  issueGroups: RecurringIssueGroup[]
  openDefectCount: number
  pnl: TruckPnl
}

export interface DriverKpiRow {
  driverId: string
  driverName: string
  hours: RangeSummary
  issueGroups: RecurringIssueGroup[]
}

export interface TeamKpiSummary {
  hours: RangeSummary
  fuel: { totalGallons: number; totalCost: number; totalMiles: number; fleetAvgMpg: number | null }
  /** Defect categories that span more than one truck or more than one driver — see isTeamIssue. */
  teamIssues: RecurringIssueGroup[]
}

export interface FleetKpiResult {
  range: DateRange
  team: TeamKpiSummary
  byTruck: TruckKpiRow[]
  byDriver: DriverKpiRow[]
}

function withinRange(iso: string, range: DateRange): boolean {
  const d = iso.slice(0, 10)
  return d >= range.start && d <= range.end
}

export async function buildFleetKpisForRange(businessId: string, range: DateRange): Promise<FleetKpiResult> {
  const [{ rows, driverSummaries, businessSummary }, fuel, equipment, defectRows, revenueRows, expenseRows] = await Promise.all([
    buildBusinessHoursForRange(businessId, range),
    buildFuelSummaryForBusiness(businessId, { from: range.start, to: range.end }),
    listDumpTruckEquipment(businessId),
    listDefects(businessId),
    computeRevenueForRange(businessId, range),
    listExpenses(businessId, { from: range.start, to: range.end }),
  ])

  const revenueByTruck = new Map<string, { revenue: number; priced: boolean }>()
  for (const r of revenueRows) {
    if (!r.truckId) continue
    const existing = revenueByTruck.get(r.truckId) ?? { revenue: 0, priced: false }
    revenueByTruck.set(r.truckId, { revenue: existing.revenue + r.revenue, priced: existing.priced || r.priced })
  }
  const nonFuelExpensesByTruck = new Map<string, number>()
  for (const e of expenseRows) {
    if (!e.truckId || e.category === 'fuel' || e.approvalStatus === 'rejected') continue
    nonFuelExpensesByTruck.set(e.truckId, (nonFuelExpensesByTruck.get(e.truckId) ?? 0) + e.amount)
  }

  const rangedDefects: RecurringIssueDefect[] = defectRows
    .filter(d => withinRange(d.createdAt, range))
    .map(d => ({
      id: d.id, truckId: d.truckId, description: d.description, severity: d.severity,
      status: d.status, createdAt: d.createdAt, reportedBy: d.reportedBy,
    }))

  const byTruck: TruckKpiRow[] = equipment.trucks
    .map(truck => {
      const truckRows: DailyHoursRow[] = rows.filter((r: DriverHoursRow) => r.truckUnit === truck.unitNumber)
      const truckFuel = fuel.vehicles.find(v => v.vehicleId === truck.id) ?? null
      const truckDefects = rangedDefects.filter(d => d.truckId === truck.id)
      const issueGroups = groupRecurringIssues(truckDefects)
      const hours = buildRangeSummary(truckRows)

      const rev = revenueByTruck.get(truck.id) ?? { revenue: 0, priced: false }
      const fuelCost = truckFuel?.totalCost ?? 0
      const expenseCost = nonFuelExpensesByTruck.get(truck.id) ?? 0
      const wageCost = hours.estimatedGrossEarnings
      const contribution = rev.priced ? rev.revenue - fuelCost - expenseCost - wageCost : null
      const contributionMarginPct = rev.priced && rev.revenue > 0 ? Math.round((contribution! / rev.revenue) * 1000) / 10 : null

      return {
        truckId: truck.id,
        unitNumber: truck.unitNumber,
        hours,
        fuel: truckFuel
          ? { totalGallons: truckFuel.totalGallons, totalCost: truckFuel.totalCost, totalMiles: truckFuel.totalMiles, avgMpg: truckFuel.avgMpg }
          : null,
        issueGroups,
        openDefectCount: issueGroups.reduce((sum, g) => sum + g.openCount, 0),
        pnl: { revenue: rev.revenue, expenseCost, fuelCost, wageCost, contribution, contributionMarginPct, priced: rev.priced },
      }
    })
    .filter(t => t.hours.daysWorked > 0 || (t.fuel && t.fuel.totalGallons > 0) || t.issueGroups.length > 0)

  const byDriver: DriverKpiRow[] = driverSummaries.map(s => {
    const driverDefects = rangedDefects.filter(d => d.reportedBy === s.driverId)
    return {
      driverId: s.driverId,
      driverName: s.driverName,
      hours: s,
      issueGroups: groupRecurringIssues(driverDefects),
    }
  })

  const teamIssues = groupRecurringIssues(rangedDefects).filter(isTeamIssue)

  return {
    range,
    team: {
      hours: businessSummary,
      fuel: { totalGallons: fuel.totalGallons, totalCost: fuel.totalCost, totalMiles: fuel.totalMiles, fleetAvgMpg: fuel.fleetAvgMpg },
      teamIssues,
    },
    byTruck,
    byDriver,
  }
}
