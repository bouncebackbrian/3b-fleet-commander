/**
 * GET /api/fleet/dump-truck/admin/kpis — per-truck / per-driver KPI rollup
 *
 * Query params:
 *   range = current_week | previous_week | current_pay_period | previous_pay_period | custom
 *   from, to = YYYY-MM-DD (required when range=custom)
 *
 * Same range semantics as /admin/hours (Monday–Sunday weeks). Dispatcher+ only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { resolveRange, type RangeType } from '@/lib/dumpTruck/hours'
import { buildFleetKpisForRange } from '@/lib/fleet/dumpTruck/fleetKpis'

export const dynamic = 'force-dynamic'

const VALID_RANGES: RangeType[] = ['current_week', 'previous_week', 'current_pay_period', 'previous_pay_period', 'custom']

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
    const result = await buildFleetKpisForRange(auth.businessId, range)
    return NextResponse.json({ ...result, rangeType })
  } catch (err) {
    console.error('[api/fleet/dump-truck/admin/kpis] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
