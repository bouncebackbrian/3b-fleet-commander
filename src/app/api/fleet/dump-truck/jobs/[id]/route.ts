/**
 * PATCH /api/fleet/dump-truck/jobs/[id] — driver-editable job fields
 *
 * Only material, pickupSiteId, dumpSiteId can be changed here — dispatch
 * frequently changes these verbally mid-shift and the driver needs to
 * correct the record themselves. Open to any active business member (not
 * gated by canManage), same as site GPS pinning — the driver is recording
 * physical reality, not editing dispatch-ticket business fields.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { updateJobDriverFields } from '@/lib/fleet/dumpTruck/jobs'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const body = await request.json()
    const input: { material?: string | null; pickupSiteId?: string | null; dumpSiteId?: string | null } = {}
    if ('material' in body) input.material = body.material
    if ('pickupSiteId' in body) input.pickupSiteId = body.pickupSiteId
    if ('dumpSiteId' in body) input.dumpSiteId = body.dumpSiteId

    const job = await updateJobDriverFields(auth.businessId, id, input, auth.userId, auth.email)
    return NextResponse.json({ job })
  } catch (err) {
    console.error('[api/fleet/dump-truck/jobs/[id]] PATCH error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: message === 'Job not found' ? 404 : 500 })
  }
}
