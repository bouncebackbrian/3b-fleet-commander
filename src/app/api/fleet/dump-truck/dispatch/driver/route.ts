/**
 * GET /api/fleet/dump-truck/dispatch/driver — the signed-in driver's own
 * upcoming published dispatches (today or later — never hidden until
 * morning-of, per spec).
 */
import { NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { listDispatchesForDriver, getDispatchStopsWithSite } from '@/lib/fleet/dumpTruck/dispatch'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const dispatches = await listDispatchesForDriver(auth.businessId, auth.userId)
    const withStops = await Promise.all(dispatches.map(async d => ({ ...d, stops: await getDispatchStopsWithSite(d.id) })))
    return NextResponse.json({ dispatches: withStops })
  } catch (err) {
    console.error('[api/fleet/dump-truck/dispatch/driver] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
