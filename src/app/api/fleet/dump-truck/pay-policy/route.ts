/**
 * /api/fleet/dump-truck/pay-policy — hourly + daily-OT, or per-mile, policy
 *
 * GET/PUT without driverId act on the business default. With ?driverId=
 * (GET) or body.driverId (PUT), act on that driver's override — see
 * src/lib/fleet/dumpTruck/payPolicy.ts for the resolution order.
 * Owner/admin (manage-level Admin portal) only to write.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { getPayPolicy, getPayPolicyForDriver, upsertPayPolicy, deletePayPolicyOverride } from '@/lib/fleet/dumpTruck/payPolicy'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const driverId = request.nextUrl.searchParams.get('driverId')

  try {
    const policy = driverId
      ? await getPayPolicyForDriver(auth.businessId, driverId)
      : await getPayPolicy(auth.businessId)
    return NextResponse.json({ policy })
  } catch (err) {
    console.error('[api/fleet/dump-truck/pay-policy] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    if (body.baseHourlyRate == null || body.dailyOtThresholdHours == null || body.otMultiplier == null) {
      return NextResponse.json({ error: 'baseHourlyRate, dailyOtThresholdHours, otMultiplier are required' }, { status: 400 })
    }
    if (body.payType === 'per_mile' && body.ratePerMile == null) {
      return NextResponse.json({ error: 'ratePerMile is required when payType is per_mile' }, { status: 400 })
    }
    await upsertPayPolicy(auth.businessId, body, auth.userId, auth.email, body.driverId ?? null)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/fleet/dump-truck/pay-policy] PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const driverId = request.nextUrl.searchParams.get('driverId')
  if (!driverId) return NextResponse.json({ error: 'driverId is required' }, { status: 400 })

  try {
    await deletePayPolicyOverride(auth.businessId, driverId, auth.userId, auth.email)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/fleet/dump-truck/pay-policy] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
