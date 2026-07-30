/**
 * PATCH /api/fleet/dump-truck/defects/[id] — acknowledge/resolve/defer and/or
 * assign a defect (dispatch/admin only). Resolving stamps resolved_at, which
 * is the downtime end for the admin panel's duration display. Assigning
 * ("sent to Big O Tires", "towed by ABC Towing") doesn't require a status
 * change — either or both of status/assignedTo may be provided.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { resolveDefect } from '@/lib/fleet/dumpTruck/incidents'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch') && !canManage(auth.portals, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    if (body.status !== undefined && !['acknowledged', 'resolved', 'deferred'].includes(body.status)) {
      return NextResponse.json({ error: 'status must be acknowledged, resolved, or deferred' }, { status: 400 })
    }
    if (body.status === undefined && body.assignedTo === undefined) {
      return NextResponse.json({ error: 'status or assignedTo is required' }, { status: 400 })
    }

    const defect = await resolveDefect(auth.businessId, id, {
      status: body.status, resolutionNotes: body.resolutionNotes ?? undefined, assignedTo: body.assignedTo ?? undefined,
    }, auth.userId, auth.email)
    return NextResponse.json({ defect })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/defects/[id]] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
