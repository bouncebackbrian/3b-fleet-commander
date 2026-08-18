/**
 * fleet/dumpTruck/exports.ts — Driver Personal Records CSV + PDF (spec §10)
 *
 * Each report's column list is factored into its own `xColumns()` function
 * so the CSV builder and the PDF table builder share one definition —
 * `format=pdf` on the export routes never risks drifting out of sync with
 * the CSV.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { buildCsv, toTableMatrix, type CsvColumn } from '@/lib/dumpTruck/csv'
import { buildReportHeaderLines } from '@/lib/reports/branding'
import type { DailyHoursRow, RangeSummary, RangeType, DateRange } from '@/lib/dumpTruck/hours'

interface ExportMeta {
  driverName: string
  threebId: string | null
  businessName: string
  threebBizId: string | null
  generatedAt: string
  rangeType: RangeType
  range: DateRange
  /** This pay period's disbursement record, if dispatch has entered one (src/lib/fleet/dumpTruck/payroll.ts). */
  checkNumber?: string | null
  amountPaid?: number | null
  paidAt?: string | null
}

export interface ReportTable {
  title: string
  metaLine: string
  disclaimers: string[]
  headers: string[]
  body: (string | number)[][]
}

function detailColumns(meta: ExportMeta): CsvColumn<DailyHoursRow>[] {
  return [
    { header: 'Driver Name', value: () => meta.driverName },
    { header: '3B ID', value: () => meta.threebId ?? '' },
    { header: 'Business Name', value: () => meta.businessName },
    { header: '3B Business ID', value: () => meta.threebBizId ?? '' },
    { header: 'Work Date', value: r => r.workDate },
    { header: 'Shift ID', value: r => r.shiftId },
    { header: 'Clock In (UTC)', value: r => r.clockInAt ?? '' },
    { header: 'Clock Out (UTC)', value: r => r.clockOutAt ?? '' },
    { header: 'Total Shift Hours (Payroll — Verified Override if Present)', value: r => r.totalShiftHours },
    { header: 'Raw Calculated Hours (Clock + Manual Travel, Pre-Override)', value: r => r.rawCalculatedHours },
    { header: 'Verified Override Applied', value: r => r.verifiedHoursOverride ? 'Yes' : 'No' },
    { header: 'Verified Override Reason', value: r => r.verifiedHoursOverride?.reason ?? '' },
    { header: 'Verified Override Source Document', value: r => r.verifiedHoursOverride?.sourceDocument ?? '' },
    { header: 'Regular Hours', value: r => r.regularHours },
    { header: 'Overtime Hours', value: r => r.overtimeHours },
    { header: 'Double-Time Hours', value: r => r.doubleTimeHours },
    { header: 'Paid Break Hours', value: r => r.paidBreakHours },
    { header: 'Unpaid Break Hours', value: r => r.unpaidBreakHours },
    { header: 'Pre-Trip Hours', value: r => r.pretripHours },
    { header: 'Post-Trip Hours', value: r => r.posttripHours },
    { header: 'On-Duty Not Driving Hours', value: r => r.onDutyNotDrivingHours },
    { header: 'Empty Driving Hours', value: r => r.emptyDrivingHours },
    { header: 'Loaded Driving Hours', value: r => r.loadedDrivingHours },
    { header: 'Loading/Waiting Hours', value: r => r.loadingWaitingHours },
    { header: 'Unloading/Waiting Hours', value: r => r.unloadingWaitingHours },
    { header: 'Fueling Hours', value: r => r.fuelingHours },
    { header: 'Delay Hours (Total)', value: r => r.delayHours },
    { header: 'Traffic Delay Hours', value: r => r.trafficDelayHours },
    { header: 'Mechanical Delay Hours', value: r => r.mechanicalDelayHours },
    { header: 'Admin/Drug-Test Delay Hours', value: r => r.adminDelayHours },
    { header: 'Other Delay Hours', value: r => r.otherDelayHours },
    { header: 'Vehicle Custody Hours', value: r => r.vehicleCustodyHours },
    { header: 'Manual Yard Travel Hours (Driver-Entered, Not GPS-Measured)', value: r => r.manualYardTravelHours },
    { header: 'Truck/Unit', value: r => r.truckUnit ?? '' },
    { header: 'Trailer', value: r => r.trailerUnit ?? '' },
    { header: 'Jobs Worked', value: r => r.jobsWorked },
    { header: 'Customers Worked', value: r => r.customersWorked },
    { header: 'Brokers Worked', value: r => r.brokersWorked },
    { header: 'Loads Completed', value: r => r.loadsCompleted },
    { header: 'Quantity/Tons Hauled', value: r => r.quantityHauled },
    { header: 'Starting Odometer', value: r => r.startOdometer ?? '' },
    { header: 'Ending Odometer', value: r => r.endOdometer ?? '' },
    { header: 'Shift Miles', value: r => r.shiftMiles ?? '' },
    { header: 'Estimated Earnings — Hourly or Per-Mile (Estimated — Not Payroll-Approved)', value: r => r.hourlyEstimatedEarnings },
    { header: 'Estimated Gross Earnings (Estimated — Not Payroll-Approved)', value: r => r.estimatedGrossEarnings },
    { header: 'Payroll-Approved Gross Earnings', value: r => r.payrollApprovedGrossEarnings ?? 'N/A — payroll approval not implemented' },
    { header: 'Submission Status', value: r => r.submissionStatus },
    { header: 'Payroll Approval Status', value: () => 'not_implemented' },
    { header: 'Exception/Correction Status', value: r => r.exceptionStatus },
  ]
}

const DETAIL_DISCLAIMERS = [
  'All earnings figures are ESTIMATES ONLY, calculated from a single hourly-rate + daily-overtime policy.',
  'They are NOT payroll-approved wages. Approved company payroll records control if values differ.',
]

export function buildDetailCsv(rows: DailyHoursRow[], meta: ExportMeta): string {
  const header = buildReportHeaderLines({
    businessName: meta.businessName, threeBBizId: meta.threebBizId,
    title: `Driver Personal Records (Detail) — ${meta.driverName}${meta.threebId ? ` (${meta.threebId})` : ''}`,
    generatedAt: meta.generatedAt, rangeLabel: `Range: ${meta.rangeType} (${meta.range.start} to ${meta.range.end})`,
    disclaimers: DETAIL_DISCLAIMERS,
  })
  return header + buildCsv(rows, detailColumns(meta))
}

export function buildDetailTable(rows: DailyHoursRow[], meta: ExportMeta): ReportTable {
  const { headers, body } = toTableMatrix(rows, detailColumns(meta))
  return {
    title: `Driver Personal Records (Detail) — ${meta.driverName}${meta.threebId ? ` (${meta.threebId})` : ''}`,
    metaLine: `Generated: ${meta.generatedAt}  Range: ${meta.rangeType} (${meta.range.start} to ${meta.range.end})`,
    disclaimers: DETAIL_DISCLAIMERS, headers, body,
  }
}

function summaryColumns(meta: ExportMeta): CsvColumn<RangeSummary>[] {
  return [
    { header: 'Driver Name', value: () => meta.driverName },
    { header: '3B ID', value: () => meta.threebId ?? '' },
    { header: 'Business Name', value: () => meta.businessName },
    { header: '3B Business ID', value: () => meta.threebBizId ?? '' },
    { header: 'Range Type', value: () => meta.rangeType },
    { header: 'Range Start', value: () => meta.range.start },
    { header: 'Range End', value: () => meta.range.end },
    { header: 'Days/Shifts Worked', value: r => r.daysWorked },
    { header: 'Total Regular Hours', value: r => r.totalRegularHours },
    { header: 'Total Overtime Hours', value: r => r.totalOvertimeHours },
    { header: 'Total Double-Time Hours', value: r => r.totalDoubleTimeHours },
    { header: 'Total Drive Hours', value: r => r.totalDriveHours },
    { header: 'Total Vehicle Custody Hours', value: r => r.totalCustodyHours },
    { header: 'Total Loads', value: r => r.totalLoads },
    { header: 'Total Quantity/Tons', value: r => r.totalQuantity },
    { header: 'Total Miles', value: r => r.totalMiles },
    { header: 'Total Fueling Hours', value: r => r.totalFuelingHours },
    { header: 'Total Traffic Delay Hours', value: r => r.totalTrafficDelayHours },
    { header: 'Total Mechanical Delay Hours', value: r => r.totalMechanicalDelayHours },
    { header: 'Total Other Delay Hours', value: r => r.totalOtherDelayHours },
    { header: 'Estimated Gross Earnings (Estimated — Not Payroll-Approved)', value: r => r.estimatedGrossEarnings },
    { header: 'Payroll-Approved Gross Earnings', value: r => r.payrollApprovedGrossEarnings ?? 'N/A — payroll approval not implemented' },
    { header: 'Check Number', value: () => meta.checkNumber ?? '' },
    { header: 'Amount Paid', value: () => meta.amountPaid ?? '' },
    { header: 'Paid Date', value: () => meta.paidAt ?? '' },
  ]
}

const SUMMARY_DISCLAIMERS = ['Estimated earnings only — not a pay stub or final wage statement.']

export function buildSummaryCsv(summary: RangeSummary, meta: ExportMeta): string {
  const header = buildReportHeaderLines({
    businessName: meta.businessName, threeBBizId: meta.threebBizId,
    title: `Driver Personal Records (Weekly Summary) — ${meta.driverName}${meta.threebId ? ` (${meta.threebId})` : ''}`,
    generatedAt: meta.generatedAt, rangeLabel: `Range: ${meta.rangeType} (${meta.range.start} to ${meta.range.end})`,
    disclaimers: SUMMARY_DISCLAIMERS,
  })
  return header + buildCsv([summary], summaryColumns(meta))
}

// ── Dispatch/admin payroll export — all drivers, one CSV (spec follow-up) ────

export interface AdminPayrollMeta {
  businessName: string
  threebBizId: string | null
  generatedAt: string
  rangeType: RangeType
  range: DateRange
}

export interface DriverHoursRow extends DailyHoursRow {
  driverId: string
  driverName: string
  threebId: string | null
}

function adminDetailColumns(meta: AdminPayrollMeta): CsvColumn<DriverHoursRow>[] {
  return [
    { header: 'Business Name', value: () => meta.businessName },
    { header: '3B Business ID', value: () => meta.threebBizId ?? '' },
    { header: 'Driver Name', value: r => r.driverName },
    { header: '3B ID', value: r => r.threebId ?? '' },
    { header: 'Work Date', value: r => r.workDate },
    { header: 'Shift ID', value: r => r.shiftId },
    { header: 'Clock In (UTC)', value: r => r.clockInAt ?? '' },
    { header: 'Clock Out (UTC)', value: r => r.clockOutAt ?? '' },
    { header: 'Total Shift Hours (Payroll — Verified Override if Present)', value: r => r.totalShiftHours },
    { header: 'Raw Calculated Hours (Clock + Manual Travel, Pre-Override)', value: r => r.rawCalculatedHours },
    { header: 'Verified Override Applied', value: r => r.verifiedHoursOverride ? 'Yes' : 'No' },
    { header: 'Verified Override Reason', value: r => r.verifiedHoursOverride?.reason ?? '' },
    { header: 'Verified Override Source Document', value: r => r.verifiedHoursOverride?.sourceDocument ?? '' },
    { header: 'Regular Hours', value: r => r.regularHours },
    { header: 'Overtime Hours', value: r => r.overtimeHours },
    { header: 'Double-Time Hours', value: r => r.doubleTimeHours },
    { header: 'Paid Break Hours', value: r => r.paidBreakHours },
    { header: 'Unpaid Break Hours', value: r => r.unpaidBreakHours },
    { header: 'Pre-Trip Hours', value: r => r.pretripHours },
    { header: 'Post-Trip Hours', value: r => r.posttripHours },
    { header: 'On-Duty Not Driving Hours', value: r => r.onDutyNotDrivingHours },
    { header: 'Empty Driving Hours', value: r => r.emptyDrivingHours },
    { header: 'Loaded Driving Hours', value: r => r.loadedDrivingHours },
    { header: 'Loading/Waiting Hours', value: r => r.loadingWaitingHours },
    { header: 'Unloading/Waiting Hours', value: r => r.unloadingWaitingHours },
    { header: 'Fueling Hours', value: r => r.fuelingHours },
    { header: 'Delay Hours (Total)', value: r => r.delayHours },
    { header: 'Traffic Delay Hours', value: r => r.trafficDelayHours },
    { header: 'Mechanical Delay Hours', value: r => r.mechanicalDelayHours },
    { header: 'Admin/Drug-Test Delay Hours', value: r => r.adminDelayHours },
    { header: 'Other Delay Hours', value: r => r.otherDelayHours },
    { header: 'Vehicle Custody Hours', value: r => r.vehicleCustodyHours },
    { header: 'Manual Yard Travel Hours (Driver-Entered, Not GPS-Measured)', value: r => r.manualYardTravelHours },
    { header: 'Truck/Unit', value: r => r.truckUnit ?? '' },
    { header: 'Trailer', value: r => r.trailerUnit ?? '' },
    { header: 'Jobs Worked', value: r => r.jobsWorked },
    { header: 'Customers Worked', value: r => r.customersWorked },
    { header: 'Brokers Worked', value: r => r.brokersWorked },
    { header: 'Loads Completed', value: r => r.loadsCompleted },
    { header: 'Quantity/Tons Hauled', value: r => r.quantityHauled },
    { header: 'Starting Odometer', value: r => r.startOdometer ?? '' },
    { header: 'Ending Odometer', value: r => r.endOdometer ?? '' },
    { header: 'Shift Miles', value: r => r.shiftMiles ?? '' },
    { header: 'Estimated Earnings — Hourly or Per-Mile (Estimated — Not Payroll-Approved)', value: r => r.hourlyEstimatedEarnings },
    { header: 'Estimated Gross Earnings (Estimated — Not Payroll-Approved)', value: r => r.estimatedGrossEarnings },
    { header: 'Submission Status', value: r => r.submissionStatus },
    { header: 'Exception/Correction Status', value: r => r.exceptionStatus },
  ]
}

export function buildAdminPayrollDetailCsv(rows: DriverHoursRow[], meta: AdminPayrollMeta): string {
  const header = buildReportHeaderLines({
    businessName: meta.businessName, threeBBizId: meta.threebBizId,
    title: 'Dispatch Payroll Hours Export (Detail, All Drivers)',
    generatedAt: meta.generatedAt, rangeLabel: `Range: ${meta.rangeType} (${meta.range.start} to ${meta.range.end}) — week is Monday–Sunday`,
    disclaimers: DETAIL_DISCLAIMERS,
  })
  return header + buildCsv(rows, adminDetailColumns(meta))
}

export function buildAdminPayrollDetailTable(rows: DriverHoursRow[], meta: AdminPayrollMeta): ReportTable {
  const { headers, body } = toTableMatrix(rows, adminDetailColumns(meta))
  return {
    title: 'Dispatch Payroll Hours Export (Detail, All Drivers)',
    metaLine: `Generated: ${meta.generatedAt}  Range: ${meta.rangeType} (${meta.range.start} to ${meta.range.end}) — week is Monday–Sunday`,
    disclaimers: DETAIL_DISCLAIMERS, headers, body,
  }
}

export interface DriverRangeSummary extends RangeSummary {
  driverId: string
  driverName: string
  threebId: string | null
  checkNumber?: string | null
  amountPaid?: number | null
  paidAt?: string | null
}

function adminSummaryColumns(meta: AdminPayrollMeta): CsvColumn<DriverRangeSummary>[] {
  return [
    { header: 'Business Name', value: () => meta.businessName },
    { header: '3B Business ID', value: () => meta.threebBizId ?? '' },
    { header: 'Driver Name', value: r => r.driverName },
    { header: '3B ID', value: r => r.threebId ?? '' },
    { header: 'Days/Shifts Worked', value: r => r.daysWorked },
    { header: 'Total Regular Hours', value: r => r.totalRegularHours },
    { header: 'Total Overtime Hours', value: r => r.totalOvertimeHours },
    { header: 'Total Double-Time Hours', value: r => r.totalDoubleTimeHours },
    { header: 'Total Drive Hours', value: r => r.totalDriveHours },
    { header: 'Total Vehicle Custody Hours', value: r => r.totalCustodyHours },
    { header: 'Total Loads', value: r => r.totalLoads },
    { header: 'Total Quantity/Tons', value: r => r.totalQuantity },
    { header: 'Total Miles', value: r => r.totalMiles },
    { header: 'Total Fueling Hours', value: r => r.totalFuelingHours },
    { header: 'Total Traffic Delay Hours', value: r => r.totalTrafficDelayHours },
    { header: 'Total Mechanical Delay Hours', value: r => r.totalMechanicalDelayHours },
    { header: 'Total Other Delay Hours', value: r => r.totalOtherDelayHours },
    { header: 'Estimated Gross Earnings (Estimated — Not Payroll-Approved)', value: r => r.estimatedGrossEarnings },
    { header: 'Check Number', value: r => r.checkNumber ?? '' },
    { header: 'Amount Paid', value: r => r.amountPaid ?? '' },
    { header: 'Paid Date', value: r => r.paidAt ?? '' },
  ]
}

export function buildAdminPayrollSummaryCsv(rows: DriverRangeSummary[], meta: AdminPayrollMeta): string {
  const header = buildReportHeaderLines({
    businessName: meta.businessName, threeBBizId: meta.threebBizId,
    title: 'Dispatch Payroll Hours Export (Weekly Summary, All Drivers)',
    generatedAt: meta.generatedAt, rangeLabel: `Range: ${meta.rangeType} (${meta.range.start} to ${meta.range.end}) — week is Monday–Sunday`,
    disclaimers: SUMMARY_DISCLAIMERS,
  })
  return header + buildCsv(rows, adminSummaryColumns(meta))
}

export function buildAdminPayrollSummaryTable(rows: DriverRangeSummary[], meta: AdminPayrollMeta): ReportTable {
  const { headers, body } = toTableMatrix(rows, adminSummaryColumns(meta))
  return {
    title: 'Dispatch Payroll Hours Export (Weekly Summary, All Drivers)',
    metaLine: `Generated: ${meta.generatedAt}  Range: ${meta.rangeType} (${meta.range.start} to ${meta.range.end}) — week is Monday–Sunday`,
    disclaimers: SUMMARY_DISCLAIMERS, headers, body,
  }
}

// ── Truck issues (defects) section — appended to the weekly summary export ──

export interface DefectReportRow {
  reportedAt: string
  severity: string
  description: string
  status: string
  truckUnit: string | null
  resolvedAt: string | null
}

function defectColumns(): CsvColumn<DefectReportRow>[] {
  return [
    { header: 'Reported', value: r => r.reportedAt },
    { header: 'Truck', value: r => r.truckUnit ?? '' },
    { header: 'Severity', value: r => r.severity },
    { header: 'Description', value: r => r.description },
    { header: 'Status', value: r => r.status },
    { header: 'Resolved', value: r => r.resolvedAt ?? '' },
  ]
}

/** Appended as a second block below the main CSV — same file, not a separate download. */
export function buildDefectsCsvBlock(defects: DefectReportRow[], title = 'Truck Issues Reported'): string {
  if (defects.length === 0) return `\r\n${title}\r\nNone reported.\r\n`
  return `\r\n${title}\r\n` + buildCsv(defects, defectColumns())
}

export async function recordExportAudit(input: {
  businessId: string; driverId: string; exportType: 'detail' | 'summary'
  rangeType: RangeType; range: DateRange; rowCount: number
}): Promise<void> {
  await fleetServiceClient.from('fleet_dt_driver_record_exports').insert({
    business_id: input.businessId,
    driver_id: input.driverId,
    export_type: input.exportType,
    range_type: input.rangeType,
    range_start: input.range.start,
    range_end: input.range.end,
    row_count: input.rowCount,
  })
}
