import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'
import { closeShiftForAssetTransfer } from '@/lib/fleet/dumpTruck/assetTransferCloseout'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth || !hasPortal(auth.portals, 'driver')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    if (!body.shiftId || !body.effectiveAt || !body.deviceCapturedAt || !body.geo || body.odometer == null || !body.transferReason) {
      return NextResponse.json({ error: 'shiftId, effectiveAt, deviceCapturedAt, geo, odometer and transferReason are required' }, { status: 400 })
    }

    const result = await closeShiftForAssetTransfer(auth.businessId, auth.userId, auth.email, {
      shiftId: body.shiftId,
      effectiveAt: body.effectiveAt,
      deviceCapturedAt: body.deviceCapturedAt,
      timezone: body.timezone ?? null,
      utcOffsetMinutes: body.utcOffsetMinutes ?? null,
      geo: body.geo,
      odometer: Number(body.odometer),
      transferReason: String(body.transferReason),
      transferCondition: typeof body.transferCondition === 'string' ? body.transferCondition : null,
      receivingUserId: typeof body.receivingUserId === 'string' ? body.receivingUserId : null,
      receivingName: typeof body.receivingName === 'string' ? body.receivingName : null,
    })

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/shifts/asset-transfer-closeout] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
