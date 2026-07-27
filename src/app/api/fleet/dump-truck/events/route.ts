/**
 * POST /api/fleet/dump-truck/events — record any operational event
 *
 * Single write path for the whole primary sequence plus parallel actions
 * (break/delay/fuel-stop/note). Idempotent: retried offline events with the
 * same idempotencyKey return the original row rather than erroring.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { recordEvent } from '@/lib/fleet/dumpTruck/events'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const required = ['id', 'idempotencyKey', 'shiftId', 'eventType', 'deviceCapturedAt', 'effectiveAt', 'geo']
    for (const field of required) {
      if (body[field] === undefined) return NextResponse.json({ error: `${field} is required` }, { status: 400 })
    }

    const result = await recordEvent(auth.businessId, auth.userId, auth.email, body)
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/events] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
