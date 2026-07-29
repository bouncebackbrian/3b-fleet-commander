/**
 * GET /api/fleet/dump-truck/pay-policy/drivers — every driver + their effective pay policy
 *
 * Joins listDrivers() with listPayPolicyOverrides() so the admin pay-policy
 * panel can show every driver alongside whether they're on the business
 * default or have their own hourly/per-mile override. Manage-level Admin
 * portal only.
 */

import { NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { listDrivers } from '@/lib/fleet/dumpTruck/jobs'
import { listPayPolicyOverrides } from '@/lib/fleet/dumpTruck/payPolicy'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const [drivers, overrides] = await Promise.all([
      listDrivers(auth.businessId),
      listPayPolicyOverrides(auth.businessId),
    ])
    const overrideByDriverId = new Map(overrides.map(o => [o.driverId, o]))
    const result = drivers.map(d => ({ ...d, override: overrideByDriverId.get(d.userId) ?? null }))
    return NextResponse.json({ drivers: result })
  } catch (err) {
    console.error('[api/fleet/dump-truck/pay-policy/drivers] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
