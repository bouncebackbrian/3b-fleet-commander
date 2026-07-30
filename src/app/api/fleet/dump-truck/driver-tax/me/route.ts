/**
 * GET /api/fleet/dump-truck/driver-tax/me — the signed-in driver's own tax
 * profile (full detail, including their own TIN — this is always allowed
 * for your own record).
 */

import { NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { getDriverTaxProfile } from '@/lib/fleet/dumpTruck/driverTax'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const profile = await getDriverTaxProfile(auth.businessId, auth.userId)
    return NextResponse.json({ profile })
  } catch (err) {
    console.error('[api/fleet/dump-truck/driver-tax/me] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
