/**
 * GET /api/fleet/dump-truck/load-cycles?shiftId= — list load cycles for a shift
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { listLoadCyclesForShift } from '@/lib/fleet/dumpTruck/loadCycles'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const shiftId = request.nextUrl.searchParams.get('shiftId')
  if (!shiftId) return NextResponse.json({ error: 'shiftId is required' }, { status: 400 })

  try {
    const loadCycles = await listLoadCyclesForShift(auth.businessId, shiftId)
    return NextResponse.json({ loadCycles })
  } catch (err) {
    console.error('[api/fleet/dump-truck/load-cycles] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
