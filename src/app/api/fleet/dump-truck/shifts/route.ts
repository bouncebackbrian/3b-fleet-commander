/**
 * POST /api/fleet/dump-truck/shifts — Clock in (creates the shift + clock_in event)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { clockIn } from '@/lib/fleet/dumpTruck/shifts'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    if (!body.truckId) return NextResponse.json({ error: 'truckId is required' }, { status: 400 })
    if (!body.deviceId) return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })
    if (!body.clockInEvent?.id || !body.clockInEvent?.idempotencyKey) {
      return NextResponse.json({ error: 'clockInEvent.id and idempotencyKey are required' }, { status: 400 })
    }

    const result = await clockIn(auth.businessId, auth.userId, auth.email, {
      truckId: body.truckId,
      trailerId: body.trailerId ?? null,
      startYardSiteId: body.startYardSiteId ?? null,
      deviceId: body.deviceId,
      deviceTimezone: body.deviceTimezone ?? null,
      clockInEvent: body.clockInEvent,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/shifts] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
