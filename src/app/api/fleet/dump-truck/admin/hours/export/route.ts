/**
 * GET /api/fleet/dump-truck/admin/hours/export — dispatch payroll CSV (all drivers)
 *
 * Query params:
 *   range = current_week | previous_week | current_pay_period | previous_pay_period | custom
 *   from, to = YYYY-MM-DD (required when range=custom)
 *   driverId = filter to one driver (optional — default all)
 *   type = detail | summary (default detail)
 *
 * Week is Monday–Sunday. Dispatcher+ only. Writes one audit row per driver
 * included (fleet_dt_driver_record_exports), same as the driver's own export.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { resolveRange, type RangeType } from '@/lib/dumpTruck/hours'
import { buildBusinessHoursForRange } from '@/lib/fleet/dumpTruck/adminHours'
import { buildAdminPayrollDetailCsv, buildAdminPayrollSummaryCsv, recordExportAudit } from '@/lib/fleet/dumpTruck/exports'
import { getBusinessMeta } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

const VALID_RANGES: RangeType[] = ['current_week', 'previous_week', 'current_pay_period', 'previous_pay_period', 'custom']

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rangeParam = request.nextUrl.searchParams.get('range') ?? 'current_week'
  const exportType = request.nextUrl.searchParams.get('type') === 'summary' ? 'summary' : 'detail'
  if (!VALID_RANGES.includes(rangeParam as RangeType)) {
    return NextResponse.json({ error: `range must be one of ${VALID_RANGES.join(', ')}` }, { status: 400 })
  }
  const rangeType = rangeParam as RangeType

  const from = request.nextUrl.searchParams.get('from')
  const to = request.nextUrl.searchParams.get('to')
  if (rangeType === 'custom' && (!from || !to)) {
    return NextResponse.json({ error: 'from and to are required when range=custom' }, { status: 400 })
  }
  const driverId = request.nextUrl.searchParams.get('driverId')

  try {
    const range = resolveRange(rangeType, new Date(), from && to ? { start: from, end: to } : undefined)
    const [{ rows, driverSummaries }, businessMeta] = await Promise.all([
      buildBusinessHoursForRange(auth.businessId, range, driverId || null),
      getBusinessMeta(auth.businessId),
    ])

    const generatedAt = new Date().toISOString()
    const meta = { ...businessMeta, generatedAt, rangeType, range }
    const csv = exportType === 'summary'
      ? buildAdminPayrollSummaryCsv(driverSummaries, meta)
      : buildAdminPayrollDetailCsv(rows, meta)

    // Audit trail: one row per driver actually included in the export.
    await Promise.all(
      driverSummaries.map(s => recordExportAudit({
        businessId: auth.businessId, driverId: s.driverId, exportType, rangeType, range,
        rowCount: exportType === 'summary' ? 1 : rows.filter(r => r.driverId === s.driverId).length,
      })),
    )

    const filename = `dispatch-payroll-hours-${exportType}-${range.start}-to-${range.end}.csv`
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[api/fleet/dump-truck/admin/hours/export] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
