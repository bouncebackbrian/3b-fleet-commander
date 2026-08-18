/**
 * /api/fleet/dump-truck/hours/override — verified paper-sheet/dispatcher hour
 * override for one shift (fleet_dt_shift_hour_overrides)
 *
 * Dispatcher+ only. Raw operational timestamps are never touched — see
 * src/lib/fleet/dumpTruck/hourOverrides.ts module doc.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { applyShiftHourOverride, listOverrideHistory } from '@/lib/fleet/dumpTruck/hourOverrides'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const shiftId = request.nextUrl.searchParams.get('shiftId')
  if (!shiftId) return NextResponse.json({ error: 'shiftId is required' }, { status: 400 })

  try {
    const history = await listOverrideHistory(shiftId)
    return NextResponse.json({ history })
  } catch (err) {
    console.error('[api/fleet/dump-truck/hours/override] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    if (!body.shiftId || body.verifiedHours == null || !body.reason) {
      return NextResponse.json({ error: 'shiftId, verifiedHours, and reason are required' }, { status: 400 })
    }
    if (typeof body.verifiedHours !== 'number' || body.verifiedHours < 0) {
      return NextResponse.json({ error: 'verifiedHours must be a non-negative number' }, { status: 400 })
    }
    const override = await applyShiftHourOverride({
      businessId: auth.businessId,
      shiftId: body.shiftId,
      verifiedHours: body.verifiedHours,
      reason: body.reason,
      sourceDocument: body.sourceDocument ?? null,
      actorId: auth.userId,
      actorEmail: auth.email,
    })
    return NextResponse.json({ override })
  } catch (err) {
    console.error('[api/fleet/dump-truck/hours/override] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
