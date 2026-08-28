/**
 * PATCH /api/fleet/dump-truck/missed-punch
 * Driver responses for the 2-hour missed-punch safeguard and next-shift review.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { respondStillWorking, respondNotWorking, resolveNextShiftReview } from '@/lib/fleet/dumpTruck/missedPunch'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    if (!body.reconciliationId) {
      return NextResponse.json({ error: 'reconciliationId is required' }, { status: 400 })
    }

    if (body.action === 'still_working') {
      const reconciliation = await respondStillWorking(auth.businessId, auth.userId, body.reconciliationId)
      return NextResponse.json({ reconciliation })
    }

    if (body.action === 'not_working') {
      const reconciliation = await respondNotWorking(auth.businessId, auth.userId, auth.email, body.reconciliationId)
      return NextResponse.json({ reconciliation })
    }

    if (body.action === 'confirm' || body.action === 'correct') {
      const reconciliation = await resolveNextShiftReview({
        businessId: auth.businessId,
        driverId: auth.userId,
        email: auth.email,
        reconciliationId: body.reconciliationId,
        action: body.action,
        correctedEndAt: body.correctedEndAt ?? null,
        note: body.note ?? null,
      })
      return NextResponse.json({ reconciliation })
    }

    return NextResponse.json({ error: 'action must be still_working, not_working, confirm, or correct' }, { status: 400 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/missed-punch] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
