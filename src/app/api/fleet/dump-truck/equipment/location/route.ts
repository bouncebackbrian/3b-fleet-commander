/**
 * POST /api/fleet/dump-truck/equipment/location — driver pings live truck GPS
 *
 * Open to any active business member (same "record physical reality"
 * rationale as site GPS pinning / driver job-field edits), but the caller
 * must have an open shift on the exact truck they're posting a position
 * for — otherwise a driver could spoof another truck's location.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { getOpenShift } from '@/lib/fleet/dumpTruck/shifts'
import { updateEquipmentLocation } from '@/lib/fleet/equipment'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { equipmentId, lat, lng } = body
    if (!equipmentId || typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'equipmentId, lat, lng are required' }, { status: 400 })
    }

    const shift = await getOpenShift(auth.userId)
    if (!shift || shift.truckId !== equipmentId) {
      return NextResponse.json({ error: 'No open shift on this truck' }, { status: 403 })
    }

    await updateEquipmentLocation(auth.businessId, equipmentId, lat, lng)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/fleet/dump-truck/equipment/location] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
