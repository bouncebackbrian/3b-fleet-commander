/**
 * GET /api/fleet/dump-truck/hours/weekly — one driver's weekly timesheet recap
 *
 * Query params:
 *   weekStart, weekEnd = YYYY-MM-DD (required — a Monday..Sunday pair; the
 *     driver/dispatch UI derives these from getWeekRange client-side)
 *   driverId = required for dispatch viewing another driver's week; ignored
 *     (forced to the caller) for a driver viewing their own.
 *
 * A driver may only ever fetch their own week. Dispatch-level portal access
 * may fetch any driver's week — this is the same data the "pending
 * approvals" queue reads per-driver.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { buildWeeklyTimesheet } from '@/lib/fleet/dumpTruck/weeklyTimesheets'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const weekStart = request.nextUrl.searchParams.get('weekStart')
  const weekEnd = request.nextUrl.searchParams.get('weekEnd')
  const requestedDriverId = request.nextUrl.searchParams.get('driverId')
  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: 'weekStart and weekEnd (YYYY-MM-DD) are required' }, { status: 400 })
  }

  let driverId = auth.userId
  if (requestedDriverId && requestedDriverId !== auth.userId) {
    if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    driverId = requestedDriverId
  }

  try {
    const timesheet = await buildWeeklyTimesheet(auth.businessId, driverId, weekStart, weekEnd)
    return NextResponse.json({ timesheet })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/hours/weekly] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
