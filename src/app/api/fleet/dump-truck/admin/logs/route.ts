/**
 * GET /api/fleet/dump-truck/admin/logs — dispatch/admin activity log across drivers
 *
 * Query params:
 *   driverId = filter to one driver (optional — default all)
 *   from, to = YYYY-MM-DD (optional — default no bound, capped by limit)
 *   limit = max rows (default 300, capped at 1000)
 *
 * Dispatcher+ only. Drivers use their own /driver/dump-truck timeline instead.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canWrite } from '@/lib/fleet-auth-guard'
import { listBusinessEventLog } from '@/lib/fleet/dumpTruck/adminLogs'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const driverId = request.nextUrl.searchParams.get('driverId')
  const from = request.nextUrl.searchParams.get('from')
  const to = request.nextUrl.searchParams.get('to')
  const limitParam = request.nextUrl.searchParams.get('limit')

  try {
    const entries = await listBusinessEventLog(auth.businessId, {
      driverId: driverId || null,
      from: from || null,
      to: to || null,
      limit: limitParam ? Number(limitParam) : undefined,
    })
    return NextResponse.json({ entries })
  } catch (err) {
    console.error('[api/fleet/dump-truck/admin/logs] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
