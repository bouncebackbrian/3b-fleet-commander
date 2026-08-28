import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'
import { closeShiftForAssetShutdown } from '@/lib/fleet/dumpTruck/shutdownCloseout'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth || !hasPortal(auth.portals, 'driver')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    if (!body.shiftId || !body.effectiveAt || !body.deviceCapturedAt || !body.geo) {
      return NextResponse.json({ error: 'shiftId, effectiveAt, deviceCapturedAt and geo are required' }, { status: 400 })
    }

    const result = await closeShiftForAssetShutdown(auth.businessId, auth.userId, auth.email, {
      shiftId: body.shiftId,
      effectiveAt: body.effectiveAt,
      deviceCapturedAt: body.deviceCapturedAt,
      timezone: body.timezone ?? null,
      utcOffsetMinutes: body.utcOffsetMinutes ?? null,
      geo: body.geo,
      odometer: body.odometer ?? null,
      releaseNote: typeof body.releaseNote === 'string' ? body.releaseNote : null,
    })

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/shifts/shutdown-closeout] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
