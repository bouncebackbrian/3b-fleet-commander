/**
 * GET /api/fleet/dump-truck/admin/fuel — dispatch/admin fuel + MPG summary
 *
 * Query params:
 *   from, to = YYYY-MM-DD (optional — default all-time)
 *
 * Dispatcher+ only. Per-truck miles, gallons, cost, and blended MPG, plus
 * fleet-wide totals — powers the Fuel & MPG panel on /admin/dump-truck.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { buildFuelSummaryForBusiness } from '@/lib/fleet/dumpTruck/adminFuel'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const from = request.nextUrl.searchParams.get('from')
  const to = request.nextUrl.searchParams.get('to')

  try {
    const summary = await buildFuelSummaryForBusiness(auth.businessId, { from, to })
    return NextResponse.json(summary)
  } catch (err) {
    console.error('[api/fleet/dump-truck/admin/fuel] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
