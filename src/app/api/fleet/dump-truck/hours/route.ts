/**
 * GET /api/fleet/dump-truck/hours — driver weekly-hours portal data (spec §10)
 *
 * Query params:
 *   range = current_week | previous_week | current_pay_period | previous_pay_period | custom
 *   from, to = YYYY-MM-DD (required when range=custom)
 *
 * Driver-facing contract: hours and operational records only. Dollar rates,
 * payroll payments, check data, payroll approvals and company pay-policy
 * details are intentionally withheld from this endpoint and remain Admin-only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { resolveRange, type RangeType } from '@/lib/dumpTruck/hours'
import { buildDriverHoursForRange } from '@/lib/fleet/dumpTruck/hours'
import { getLatestConfirmationsForShifts } from '@/lib/fleet/dumpTruck/hoursConfirmations'

export const dynamic = 'force-dynamic'

const VALID_RANGES: RangeType[] = ['current_week', 'previous_week', 'current_pay_period', 'previous_pay_period', 'custom']

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rangeParam = request.nextUrl.searchParams.get('range') ?? 'current_week'
  if (!VALID_RANGES.includes(rangeParam as RangeType)) {
    return NextResponse.json({ error: `range must be one of ${VALID_RANGES.join(', ')}` }, { status: 400 })
  }
  const rangeType = rangeParam as RangeType

  const from = request.nextUrl.searchParams.get('from')
  const to = request.nextUrl.searchParams.get('to')
  if (rangeType === 'custom' && (!from || !to)) {
    return NextResponse.json({ error: 'from and to are required when range=custom' }, { status: 400 })
  }

  try {
    const range = resolveRange(rangeType, new Date(), from && to ? { start: from, end: to } : undefined)
    const result = await buildDriverHoursForRange(auth.businessId, auth.userId, range)
    const confirmations = await getLatestConfirmationsForShifts(auth.businessId, result.rows.map(r => r.shiftId))

    const rows = result.rows.map(r => ({
      workDate: r.workDate,
      shiftId: r.shiftId,
      clockInAt: r.clockInAt,
      clockOutAt: r.clockOutAt,
      totalShiftHours: r.totalShiftHours,
      rawCalculatedHours: r.rawCalculatedHours,
      verifiedHoursOverride: r.verifiedHoursOverride,
      paidHours: r.paidHours,
      nonPaidOperationalHours: r.nonPaidOperationalHours,
      pendingPayableHours: r.pendingPayableHours,
      customerBillableHours: r.customerBillableHours,
      additionalWorkHours: Math.max(0, r.paidHours - r.customerBillableHours),
      nonBilledOperationalHours: r.nonBilledOperationalHours,
      pendingBillableHours: r.pendingBillableHours,
      regularHours: r.regularHours,
      overtimeHours: r.overtimeHours,
      pretripHours: r.pretripHours,
      posttripHours: r.posttripHours,
      onDutyNotDrivingHours: r.onDutyNotDrivingHours,
      emptyDrivingHours: r.emptyDrivingHours,
      loadedDrivingHours: r.loadedDrivingHours,
      loadingWaitingHours: r.loadingWaitingHours,
      unloadingWaitingHours: r.unloadingWaitingHours,
      fuelingHours: r.fuelingHours,
      delayHours: r.delayHours,
      unpaidBreakHours: r.unpaidBreakHours,
      vehicleCustodyHours: r.vehicleCustodyHours,
      truckUnit: r.truckUnit,
      jobsWorked: r.jobsWorked,
      customersWorked: r.customersWorked,
      loadsCompleted: r.loadsCompleted,
      quantityHauled: r.quantityHauled,
      startOdometer: r.startOdometer,
      endOdometer: r.endOdometer,
      shiftMiles: r.shiftMiles,
      submissionStatus: r.submissionStatus,
      exceptionStatus: r.exceptionStatus,
      integrityWarnings: r.integrityWarnings,
      confirmation: confirmations[r.shiftId]
        ? { status: confirmations[r.shiftId].status, createdAt: confirmations[r.shiftId].createdAt, correctionNote: confirmations[r.shiftId].correctionNote }
        : null,
    }))

    const summary = {
      daysWorked: result.summary.daysWorked,
      grossPayHours: result.summary.totalPaidHours,
      totalPaidHours: result.summary.totalPaidHours,
      totalRegularHours: result.summary.totalRegularHours,
      totalOvertimeHours: result.summary.totalOvertimeHours,
      totalCustomerBillableHours: result.summary.totalCustomerBillableHours,
      totalAdditionalWorkHours: Math.max(0, result.summary.totalPaidHours - result.summary.totalCustomerBillableHours),
      totalNonPaidOperationalHours: result.summary.totalNonPaidOperationalHours,
      totalPendingPayableHours: result.summary.totalPendingPayableHours,
      totalNonBilledOperationalHours: result.summary.totalNonBilledOperationalHours,
      totalPendingBillableHours: result.summary.totalPendingBillableHours,
      totalDriveHours: result.summary.totalDriveHours,
      totalCustodyHours: result.summary.totalCustodyHours,
      totalLoads: result.summary.totalLoads,
      totalQuantity: result.summary.totalQuantity,
      totalMiles: result.summary.totalMiles,
    }

    return NextResponse.json({ range, rangeType, rows, summary })
  } catch (err) {
    console.error('[api/fleet/dump-truck/hours] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
