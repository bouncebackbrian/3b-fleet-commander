/**
 * GET /api/fleet/dump-truck/context — Driver Mode bootstrap
 */

import { NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { getDriverContext } from '@/lib/fleet/dumpTruck/context'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const context = await getDriverContext(auth.businessId, auth.userId)
    return NextResponse.json({ context })
  } catch (err) {
    console.error('[api/fleet/dump-truck/context] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
