/**
 * POST /api/fleet/dump-truck/shifts/[id]/submit — Submit the day
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { submitShift } from '@/lib/fleet/dumpTruck/shifts'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const body = await request.json()
    if (!body.event?.id || !body.event?.idempotencyKey) {
      return NextResponse.json({ error: 'event.id and idempotencyKey are required' }, { status: 400 })
    }

    const shift = await submitShift(id, auth.businessId, auth.userId, auth.email, body.event)
    return NextResponse.json({ shift })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/shifts/[id]/submit] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
