/** GET /api/fleet/dump-truck/breakdowns/open?shiftId= — the driver's current unresolved breakdown, if any (drives the "truck is down" UI state). */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { getOpenBreakdownForShift } from '@/lib/fleet/dumpTruck/breakdowns'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const shiftId = request.nextUrl.searchParams.get('shiftId')
  if (!shiftId) return NextResponse.json({ error: 'shiftId is required' }, { status: 400 })

  try {
    const breakdown = await getOpenBreakdownForShift(auth.businessId, shiftId)
    return NextResponse.json({ breakdown })
  } catch (err) {
    console.error('[api/fleet/dump-truck/breakdowns/open] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
