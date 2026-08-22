/**
 * GET /api/fleet/dump-truck/admin/hours/weekly-report — payroll hours across
 * several pay weeks in one report (each week its own Monday–Sunday period,
 * broken out as its own row per driver — see buildWeeklyPayrollBreakdown).
 *
 * Query params:
 *   weeksBack = integer — the N most recent full weeks, ending with the
 *     current week. Mutually exclusive with from/to.
 *   from, to = YYYY-MM-DD — an overall span, auto-split into the full
 *     Monday–Sunday weeks that overlap it. Mutually exclusive with weeksBack.
 *   driverId = filter to one driver (optional — default all)
 *   format = csv | pdf (default csv)
 *
 * Dispatcher+ only. Capped at 26 weeks (~6 months) per report.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { splitIntoWeeks, lastNWeeks } from '@/lib/dumpTruck/hours'
import { buildWeeklyPayrollBreakdown } from '@/lib/fleet/dumpTruck/adminHours'
import { buildWeeklyPayrollBreakdownCsv, buildWeeklyPayrollBreakdownTable } from '@/lib/fleet/dumpTruck/exports'
import { getBusinessMeta } from '@/lib/fleet/dumpTruck/shared'
import { listPayrollPayments } from '@/lib/fleet/dumpTruck/payroll'
import { renderReportTablePdf } from '@/lib/reports/pdf'

export const dynamic = 'force-dynamic'

const MAX_WEEKS = 26

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const weeksBackParam = request.nextUrl.searchParams.get('weeksBack')
  const from = request.nextUrl.searchParams.get('from')
  const to = request.nextUrl.searchParams.get('to')
  const driverId = request.nextUrl.searchParams.get('driverId')
  const format = request.nextUrl.searchParams.get('format') === 'pdf' ? 'pdf' : 'csv'

  let weeks: ReturnType<typeof splitIntoWeeks>
  if (weeksBackParam) {
    const weeksBack = Number(weeksBackParam)
    if (!Number.isInteger(weeksBack) || weeksBack < 1) {
      return NextResponse.json({ error: 'weeksBack must be a positive integer' }, { status: 400 })
    }
    weeks = lastNWeeks(Math.min(weeksBack, MAX_WEEKS))
  } else if (from && to) {
    weeks = splitIntoWeeks({ start: from, end: to })
  } else {
    return NextResponse.json({ error: 'Provide either weeksBack, or both from and to (YYYY-MM-DD)' }, { status: 400 })
  }

  if (weeks.length === 0) {
    return NextResponse.json({ error: 'No weeks in the requested range' }, { status: 400 })
  }
  if (weeks.length > MAX_WEEKS) {
    return NextResponse.json({ error: `Requested range spans ${weeks.length} weeks — max is ${MAX_WEEKS}` }, { status: 400 })
  }

  try {
    const [{ rows }, businessMeta] = await Promise.all([
      buildWeeklyPayrollBreakdown(auth.businessId, weeks, driverId || null),
      getBusinessMeta(auth.businessId),
    ])

    // Attach each week's own payroll payment record (checkNumber/amountPaid/paidAt), if dispatch has entered one.
    const paymentsByWeek = await Promise.all(weeks.map(w => listPayrollPayments(auth.businessId, w)))
    const paymentLookup = new Map<string, { checkNumber: string | null; amountPaid: number | null; paidAt: string | null }>()
    weeks.forEach((w, i) => {
      for (const p of paymentsByWeek[i]) paymentLookup.set(`${w.start}|${p.driverId}`, p)
    })
    const rowsWithPayment = rows.map(r => {
      const p = paymentLookup.get(`${r.weekStart}|${r.driverId}`)
      return { ...r, checkNumber: p?.checkNumber ?? null, amountPaid: p?.amountPaid ?? null, paidAt: p?.paidAt ?? null }
    })

    const generatedAt = new Date().toISOString()
    const meta = {
      businessName: businessMeta.businessName, threebBizId: businessMeta.threebBizId, generatedAt,
      weekCount: weeks.length, overallStart: weeks[0].start, overallEnd: weeks[weeks.length - 1].end,
    }

    const filename = `weekly-payroll-breakdown-${meta.overallStart}-to-${meta.overallEnd}`

    if (format === 'pdf') {
      const table = buildWeeklyPayrollBreakdownTable(rowsWithPayment, meta)
      const pdf = await renderReportTablePdf(auth.businessId, businessMeta.businessName, businessMeta.threebBizId, table)
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}.pdf"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const csv = buildWeeklyPayrollBreakdownCsv(rowsWithPayment, meta)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[api/fleet/dump-truck/admin/hours/weekly-report] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
