/**
 * fleet/dumpTruck/exports.ts — Driver Personal Records CSV (spec §10)
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { buildCsv, type CsvColumn } from '@/lib/dumpTruck/csv'
import type { DailyHoursRow, RangeSummary, RangeType, DateRange } from '@/lib/dumpTruck/hours'

interface ExportMeta {
  driverName: string
  threebId: string | null
  businessName: string
  threebBizId: string | null
  generatedAt: string
  rangeType: RangeType
  range: DateRange
}

export function buildDetailCsv(rows: DailyHoursRow[], meta: ExportMeta): string {
  const columns: CsvColumn<DailyHoursRow>[] = [
    { header: 'Driver Name', value: () => meta.driverName },
    { header: '3B ID', value: () => meta.threebId ?? '' },
    { header: 'Business Name', value: () => meta.businessName },
    { header: '3B Business ID', value: () => meta.threebBizId ?? '' },
    { header: 'Work Date', value: r => r.workDate },
    { header: 'Shift ID', value: r => r.shiftId },
    { header: 'Clock In (UTC)', value: r => r.clockInAt ?? '' },
    { header: 'Clock Out (UTC)', value: r => r.clockOutAt ?? '' },
    { header: 'Total Shift Hours', value: r => r.totalShiftHours },
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

  const header = `# 3B Fleet Commander — Driver Personal Records (Detail)\r\n` +
    `# Generated: ${meta.generatedAt}  Range: ${meta.rangeType} (${meta.range.start} to ${meta.range.end})\r\n` +
    `# All earnings figures are ESTIMATES ONLY, calculated from a single hourly-rate + daily-overtime policy.\r\n` +
    `# They are NOT payroll-approved wages. Approved company payroll records control if values differ.\r\n\r\n`

  return header + buildCsv(rows, columns)
}

export function buildSummaryCsv(summary: RangeSummary, meta: ExportMeta): string {
  const columns: CsvColumn<RangeSummary>[] = [
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
  ]

  const header = `# 3B Fleet Commander — Driver Personal Records (Weekly Summary)\r\n` +
    `# Generated: ${meta.generatedAt}  Range: ${meta.rangeType} (${meta.range.start} to ${meta.range.end})\r\n` +
    `# Estimated earnings only — not a pay stub or final wage statement.\r\n\r\n`

  return header + buildCsv([summary], columns)
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

export function buildAdminPayrollDetailCsv(rows: DriverHoursRow[], meta: AdminPayrollMeta): string {
  const columns: CsvColumn<DriverHoursRow>[] = [
    { header: 'Business Name', value: () => meta.businessName },
    { header: '3B Business ID', value: () => meta.threebBizId ?? '' },
    { header: 'Driver Name', value: r => r.driverName },
    { header: '3B ID', value: r => r.threebId ?? '' },
    { header: 'Work Date', value: r => r.workDate },
    { header: 'Shift ID', value: r => r.shiftId },
    { header: 'Clock In (UTC)', value: r => r.clockInAt ?? '' },
    { header: 'Clock Out (UTC)', value: r => r.clockOutAt ?? '' },
    { header: 'Total Shift Hours', value: r => r.totalShiftHours },
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

  const header = `# 3B Fleet Commander — Dispatch Payroll Hours Export (Detail, All Drivers)\r\n` +
    `# Generated: ${meta.generatedAt}  Range: ${meta.rangeType} (${meta.range.start} to ${meta.range.end}) — week is Monday–Sunday\r\n` +
    `# All earnings figures are ESTIMATES ONLY, calculated from a single hourly-rate + daily-overtime policy.\r\n` +
    `# They are NOT payroll-approved wages. Approved company payroll records control if values differ.\r\n\r\n`

  return header + buildCsv(rows, columns)
}

export interface DriverRangeSummary extends RangeSummary {
  driverId: string
  driverName: string
  threebId: string | null
}

export function buildAdminPayrollSummaryCsv(rows: DriverRangeSummary[], meta: AdminPayrollMeta): string {
  const columns: CsvColumn<DriverRangeSummary>[] = [
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
  ]

  const header = `# 3B Fleet Commander — Dispatch Payroll Hours Export (Weekly Summary, All Drivers)\r\n` +
    `# Generated: ${meta.generatedAt}  Range: ${meta.rangeType} (${meta.range.start} to ${meta.range.end}) — week is Monday–Sunday\r\n` +
    `# Estimated earnings only — not a pay stub or final wage statement.\r\n\r\n`

  return header + buildCsv(rows, columns)
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
