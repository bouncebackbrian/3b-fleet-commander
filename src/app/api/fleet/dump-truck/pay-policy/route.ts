/**
 * /api/fleet/dump-truck/pay-policy — minimal hourly + daily-OT policy (owner/admin only to write)
 *
 * See src/lib/dumpTruck/hours.ts module doc — not the full multi-rate-type
 * payroll engine, just the single-rate estimate the driver hours portal uses.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { getPayPolicy, upsertPayPolicy } from '@/lib/fleet/dumpTruck/payPolicy'

export const dynamic = 'force-dynamic'

function isBusinessAdmin(role: string): boolean {
  return role === 'owner' || role === 'admin'
}

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const policy = await getPayPolicy(auth.businessId)
    return NextResponse.json({ policy })
  } catch (err) {
    console.error('[api/fleet/dump-truck/pay-policy] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isBusinessAdmin(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    if (body.baseHourlyRate == null || body.dailyOtThresholdHours == null || body.otMultiplier == null) {
      return NextResponse.json({ error: 'baseHourlyRate, dailyOtThresholdHours, otMultiplier are required' }, { status: 400 })
    }
    await upsertPayPolicy(auth.businessId, body, auth.userId, auth.email)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/fleet/dump-truck/pay-policy] PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
