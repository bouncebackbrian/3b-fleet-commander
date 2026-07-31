/**
 * GET /api/fleet/dump-truck/hours/log — the signed-in driver's own full
 * event timeline (every timestamp — clock in/out, arrivals, loads, delays,
 * etc.), for a given date or range. Unlike the live driver cockpit's Full
 * Log (today's active shift only), this works for any past/submitted day —
 * see /driver/hours "View Timestamps".
 *
 * Query params: from, to = YYYY-MM-DD (both optional — default no bound).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { listBusinessEventLog } from '@/lib/fleet/dumpTruck/adminLogs'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const from = request.nextUrl.searchParams.get('from')
  const to = request.nextUrl.searchParams.get('to')

  try {
    const entries = await listBusinessEventLog(auth.businessId, { driverId: auth.userId, from, to, limit: 500 })
    return NextResponse.json({ entries })
  } catch (err) {
    console.error('[api/fleet/dump-truck/hours/log] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
