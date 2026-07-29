/**
 * GET /api/fleet/dump-truck/drivers — drivers available for job assignment (dispatcher+ only)
 */

import { NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { listDrivers } from '@/lib/fleet/dumpTruck/jobs'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const drivers = await listDrivers(auth.businessId)
    return NextResponse.json({ drivers })
  } catch (err) {
    console.error('[api/fleet/dump-truck/drivers] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
