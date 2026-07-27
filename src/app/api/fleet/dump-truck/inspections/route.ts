/**
 * POST /api/fleet/dump-truck/inspections — start a pre-trip or post-trip inspection
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { startInspection } from '@/lib/fleet/dumpTruck/inspections'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    if (!body.shiftId || !body.inspectionType) {
      return NextResponse.json({ error: 'shiftId and inspectionType are required' }, { status: 400 })
    }
    const result = await startInspection(auth.businessId, auth.userId, auth.email, body)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/inspections] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
