/** POST /api/fleet/dump-truck/dispatch/[id]/assign — direct driver/truck/trailer assignment (Hector's picker, overriding the AI/default match). */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { assignDispatchDriverTruck } from '@/lib/fleet/dumpTruck/dispatch'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const body = await request.json()
    const dispatch = await assignDispatchDriverTruck(
      auth.businessId, id, body.driverId ?? null, body.truckId ?? null, body.trailerId ?? null, auth.userId, auth.email,
    )
    return NextResponse.json({ dispatch })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/dispatch/[id]/assign] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
