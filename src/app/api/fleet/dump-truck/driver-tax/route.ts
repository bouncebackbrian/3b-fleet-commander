/**
 * GET /api/fleet/dump-truck/driver-tax — admin list of driver tax
 * classifications (W-2/1099, withholding %, whether a W-9 is on file).
 * Never includes TIN — see driverTax.ts.
 */

import { NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { listDriverTaxProfiles } from '@/lib/fleet/dumpTruck/driverTax'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const profiles = await listDriverTaxProfiles(auth.businessId)
    return NextResponse.json({ profiles })
  } catch (err) {
    console.error('[api/fleet/dump-truck/driver-tax] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
