/**
 * GET /api/fleet/dump-truck/hours/export — Driver Personal Records CSV/PDF (spec §10)
 *
 * Query params:
 *   range = current_week | previous_week | current_pay_period | previous_pay_period | custom
 *   from, to = YYYY-MM-DD (required when range=custom)
 *   type = detail | summary  (default detail)
 *   format = csv | pdf  (default csv — unchanged for every existing caller)
 *
 * Driver may only export their own records. Every export writes an audit
 * row to fleet_dt_driver_record_exports (driver, tenant, range, row count,
 * timestamp) before the file is returned.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { resolveRange, type RangeType } from '@/lib/dumpTruck/hours'
import { buildDriverHoursForRange } from '@/lib/fleet/dumpTruck/hours'
import {
  buildDetailCsv, buildSummaryCsv, buildDetailTable, recordExportAudit,
  buildDefectsCsvBlock, type DefectReportRow,
} from '@/lib/fleet/dumpTruck/exports'
import { getDriverBusinessMeta } from '@/lib/fleet/dumpTruck/shared'
import { getPayrollPayment } from '@/lib/fleet/dumpTruck/payroll'
import { listDefectsForShifts } from '@/lib/fleet/dumpTruck/incidents'
import { fleetServiceClient } from '@/lib/fleet-service-client'
import { renderReportTablePdf, renderSummaryReportPdf } from '@/lib/reports/pdf'
import { getBusinessLogoForPdf } from '@/lib/fleet/business'

export const dynamic = 'force-dynamic'

const VALID_RANGES: RangeType[] = ['current_week', 'previous_week', 'current_pay_period', 'previous_pay_period', 'custom']

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rangeParam = request.nextUrl.searchParams.get('range') ?? 'current_week'
  const exportType = request.nextUrl.searchParams.get('type') === 'summary' ? 'summary' : 'detail'
  const format = request.nextUrl.searchParams.get('format') === 'pdf' ? 'pdf' : 'csv'
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
    const [{ rows, summary }, meta, payment] = await Promise.all([
      buildDriverHoursForRange(auth.businessId, auth.userId, range),
      getDriverBusinessMeta(auth.businessId, auth.userId),
      getPayrollPayment(auth.businessId, auth.userId, range),
    ])

    const generatedAt = new Date().toISOString()
    const fullMeta = {
      ...meta, generatedAt, rangeType, range,
      checkNumber: payment?.checkNumber, amountPaid: payment?.amountPaid, paidAt: payment?.paidAt,
    }

    await recordExportAudit({
      businessId: auth.businessId, driverId: auth.userId, exportType,
      rangeType, range, rowCount: exportType === 'summary' ? 1 : rows.length,
    })

    const filename = `dump-truck-hours-${exportType}-${range.start}-to-${range.end}`

    // The "Weekly Summary" export doubles as the end-of-week report — truck
    // issues reported during the week's shifts are folded in here so dispatch/
    // payroll see them alongside the hours, not in a separate download.
    let defectRows: DefectReportRow[] = []
    if (exportType === 'summary') {
      const shiftIds = rows.map(r => r.shiftId)
      const defects = await listDefectsForShifts(auth.businessId, shiftIds)
      const truckIds = [...new Set(defects.map(d => d.truckId).filter(Boolean))]
      const { data: equipment } = truckIds.length
        ? await fleetServiceClient.from('fleet_equipment').select('id, unit_number').in('id', truckIds)
        : { data: [] as { id: string; unit_number: string }[] }
      const unitByTruckId = new Map((equipment ?? []).map(e => [e.id, e.unit_number]))
      defectRows = defects.map(d => ({
        reportedAt: d.createdAt,
        severity: d.severity,
        description: d.description,
        status: d.status,
        truckUnit: unitByTruckId.get(d.truckId) ?? null,
        resolvedAt: d.resolvedAt,
      }))
    }

    if (format === 'pdf') {
      if (exportType === 'summary') {
        const logo = await getBusinessLogoForPdf(auth.businessId)
        const additionalPaidOperationalHours = Math.max(0, summary.totalPaidHours - summary.totalCustomerBillableHours)
        const pdf = await renderSummaryReportPdf({
          logoBytes: logo?.bytes ?? null,
          logoFormat: logo?.format,
          businessName: meta.businessName,
          threeBBizId: meta.threebBizId,
          title: 'End of Week Report',
          subtitleLines: [
            `Driver: ${meta.driverName}${meta.threebId ? ` (${meta.threebId})` : ''}`,
            `Range: ${rangeType} (${range.start} to ${range.end})`,
          ],
          disclaimers: [
            'Estimated earnings only — not a pay stub or final wage statement.',
            'Broker/Customer Hours show the customer-billable portion of the shift. Additional Paid Operational Hours are payable driver time outside the broker sheet, including assigned driving or other company-directed truck work. Broker billing does not determine driver pay.',
            ...(summary.totalPendingPayableHours > 0 || summary.totalNonPaidOperationalHours > 0
              ? ['Regular + Overtime Hours are based on Paid Hours. Only time explicitly pending management review or classified non-payable is excluded from paid totals.']
              : []),
          ],
          stats: [
            { label: 'Days Worked', value: String(summary.daysWorked) },
            { label: 'Paid Hours', value: summary.totalPaidHours.toFixed(2) },
            { label: 'Broker/Customer Hrs', value: summary.totalCustomerBillableHours.toFixed(2) },
            { label: 'Additional Paid Operational Hrs', value: additionalPaidOperationalHours.toFixed(2) },
            { label: 'Regular Hours', value: summary.totalRegularHours.toFixed(2) },
            { label: 'Overtime Hours', value: summary.totalOvertimeHours.toFixed(2) },
            ...(summary.totalPendingPayableHours > 0 ? [{ label: 'Pending Review Hrs', value: summary.totalPendingPayableHours.toFixed(2) }] : []),
            ...(summary.totalNonPaidOperationalHours > 0 ? [{ label: 'Non-Paid Operational Hrs', value: summary.totalNonPaidOperationalHours.toFixed(2) }] : []),
            { label: 'Drive Hours', value: summary.totalDriveHours.toFixed(2) },
            { label: 'Loads', value: String(summary.totalLoads) },
            { label: 'Miles', value: String(summary.totalMiles) },
            { label: 'Delay Hours', value: (summary.totalTrafficDelayHours + summary.totalMechanicalDelayHours + summary.totalOtherDelayHours).toFixed(2) },
            { label: 'Est. Earnings', value: `$${summary.estimatedGrossEarnings.toFixed(2)}` },
          ],
          sections: [
            {
              title: 'Daily Breakdown',
              headers: ['Date', 'Truck', 'Total Hrs', 'Broker Hrs', 'Paid Hrs', 'Extra Paid', 'Reg', 'OT', 'Loads', 'Status'],
              rows: rows.map(r => {
                const additionalPaid = Math.max(0, r.paidHours - r.customerBillableHours)
                return [
                  r.workDate, r.truckUnit ?? '—', r.totalShiftHours.toFixed(2), r.customerBillableHours.toFixed(2),
                  r.paidHours.toFixed(2), additionalPaid.toFixed(2), r.regularHours.toFixed(2),
                  r.overtimeHours.toFixed(2), r.loadsCompleted, r.submissionStatus,
                ]
              }),
            },
            {
              title: 'Truck Issues Reported',
              headers: ['Reported', 'Truck', 'Severity', 'Description', 'Status', 'Resolved'],
              rows: defectRows.map(d => [
                new Date(d.reportedAt).toLocaleString(), d.truckUnit ?? '', d.severity, d.description, d.status,
                d.resolvedAt ? new Date(d.resolvedAt).toLocaleString() : '',
              ]),
            },
          ],
        })
        return new NextResponse(new Uint8Array(pdf), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}.pdf"`,
            'Cache-Control': 'no-store',
          },
        })
      }

      const table = buildDetailTable(rows, fullMeta)
      const pdf = await renderReportTablePdf(auth.businessId, meta.businessName, meta.threebBizId, table)
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}.pdf"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const csv = exportType === 'summary'
      ? buildSummaryCsv(summary, fullMeta) + buildDefectsCsvBlock(defectRows)
      : buildDetailCsv(rows, fullMeta)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[api/fleet/dump-truck/hours/export] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
