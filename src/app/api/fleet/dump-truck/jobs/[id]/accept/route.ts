/**
 * POST /api/fleet/dump-truck/jobs/[id]/accept — dispatch accepts a broker-proposed deal
 *
 * One action: picks driver/truck/trailer, job goes 'proposed' -> 'scheduled'.
 * Manage-level Dispatch portal access required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { acceptJob } from '@/lib/fleet/dumpTruck/jobs'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const body = await request.json()
    if (!body.driverId || !body.truckId) {
      return NextResponse.json({ error: 'driverId and truckId are required' }, { status: 400 })
    }

    const job = await acceptJob(auth.businessId, id, body.driverId, body.truckId, body.trailerId ?? null, auth.userId, auth.email)
    return NextResponse.json({ job })
  } catch (err) {
    console.error('[api/fleet/dump-truck/jobs/[id]/accept] POST error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message === 'Job not found' ? 404 : message === 'Job is not awaiting acceptance' ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
