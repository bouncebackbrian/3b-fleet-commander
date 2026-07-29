/**
 * /api/fleet/dump-truck/admin/payroll/payments — pay-period check#/amount-paid records
 *
 * GET  ?range=current_week|previous_week|custom&from&to — every driver's payment record for that week
 *      (view-level Dispatch portal access)
 * POST { driverId, range/from,to, checkNumber, amountPaid, paidAt, notes } — upsert one driver's record
 *      (manage-level Dispatch portal access)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, hasPortal, canManage } from '@/lib/fleet-auth-guard'
import { resolveRange, type RangeType } from '@/lib/dumpTruck/hours'
import { listPayrollPayments, upsertPayrollPayment } from '@/lib/fleet/dumpTruck/payroll'

export const dynamic = 'force-dynamic'

const VALID_RANGES: RangeType[] = ['current_week', 'previous_week', 'current_pay_period', 'previous_pay_period', 'custom']

function parseRange(searchParams: URLSearchParams): { rangeType: RangeType; range: { start: string; end: string } } | { error: string } {
  const rangeParam = searchParams.get('range') ?? 'current_week'
  if (!VALID_RANGES.includes(rangeParam as RangeType)) return { error: `range must be one of ${VALID_RANGES.join(', ')}` }
  const rangeType = rangeParam as RangeType
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (rangeType === 'custom' && (!from || !to)) return { error: 'from and to are required when range=custom' }
  const range = resolveRange(rangeType, new Date(), from && to ? { start: from, end: to } : undefined)
  return { rangeType, range }
}

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPortal(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = parseRange(request.nextUrl.searchParams)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const payments = await listPayrollPayments(auth.businessId, parsed.range)
    return NextResponse.json({ payments, range: parsed.range })
  } catch (err) {
    console.error('[api/fleet/dump-truck/admin/payroll/payments] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    if (!body.driverId) return NextResponse.json({ error: 'driverId is required' }, { status: 400 })

    const parsed = parseRange(new URLSearchParams({
      range: body.range ?? 'current_week',
      ...(body.from ? { from: body.from } : {}),
      ...(body.to ? { to: body.to } : {}),
    }))
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const payment = await upsertPayrollPayment(auth.businessId, body.driverId, parsed.range, {
      checkNumber: body.checkNumber,
      amountPaid: body.amountPaid != null ? Number(body.amountPaid) : null,
      paidAt: body.paidAt,
      notes: body.notes,
    }, auth.userId, auth.email)
    return NextResponse.json({ payment })
  } catch (err) {
    console.error('[api/fleet/dump-truck/admin/payroll/payments] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
