/**
 * GET /api/fleet/dump-truck/admin/hours/weekly-approvals — dispatch's queue
 * of every active driver's weekly timesheet status for one week (who's
 * waiting on dispatch, who hasn't submitted, who's already approved).
 *
 * Query params: weekStart, weekEnd = YYYY-MM-DD. Dispatcher+ only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { listWeeklyTimesheetsForBusiness } from '@/lib/fleet/dumpTruck/weeklyTimesheets'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const weekStart = request.nextUrl.searchParams.get('weekStart')
  const weekEnd = request.nextUrl.searchParams.get('weekEnd')
  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: 'weekStart and weekEnd (YYYY-MM-DD) are required' }, { status: 400 })
  }

  try {
    const timesheets = await listWeeklyTimesheetsForBusiness(auth.businessId, weekStart, weekEnd)
    return NextResponse.json({ timesheets })
  } catch (err) {
    console.error('[api/fleet/dump-truck/admin/hours/weekly-approvals] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
