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
import { buildDetailCsv, buildSummaryCsv, buildDetailTable, buildSummaryTable, recordExportAudit } from '@/lib/fleet/dumpTruck/exports'
import { getDriverBusinessMeta } from '@/lib/fleet/dumpTruck/shared'
import { getPayrollPayment } from '@/lib/fleet/dumpTruck/payroll'
import { renderReportTablePdf } from '@/lib/reports/pdf'

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

    if (format === 'pdf') {
      const table = exportType === 'summary' ? buildSummaryTable(summary, fullMeta) : buildDetailTable(rows, fullMeta)
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

    const csv = exportType === 'summary' ? buildSummaryCsv(summary, fullMeta) : buildDetailCsv(rows, fullMeta)
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
