/**
 * POST /api/fleet/dump-truck/dispatch/[id]/publish — creates/links the real
 * fleet_dt_jobs row and opens the driver's acknowledgement. Blocks with a
 * 422 listing exactly which critical fields (date, driver, truck, first
 * location, required arrival) are still missing/unconfirmed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { publishDispatch } from '@/lib/fleet/dumpTruck/dispatch'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const result = await publishDispatch(auth.businessId, id, auth.userId, auth.email)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/dispatch/[id]/publish] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
