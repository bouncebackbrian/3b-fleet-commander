/** GET /api/fleet/dump-truck/driver-tax/me/1099 — the signed-in driver's own generated 1099-NEC filings. */

import { NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { listFilings } from '@/lib/fleet/dumpTruck/driverTax'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const filings = await listFilings(auth.businessId, auth.userId)
    return NextResponse.json({ filings })
  } catch (err) {
    console.error('[api/fleet/dump-truck/driver-tax/me/1099] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
