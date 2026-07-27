/**
 * GET /api/fleet/dump-truck/equipment — active trucks/trailers for this business
 */

import { NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { listDumpTruckEquipment } from '@/lib/fleet/dumpTruck/equipment'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const equipment = await listDumpTruckEquipment(auth.businessId)
    return NextResponse.json(equipment)
  } catch (err) {
    console.error('[api/fleet/dump-truck/equipment] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
