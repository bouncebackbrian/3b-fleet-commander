/**
 * PATCH /api/fleet/dump-truck/admin/corrective-actions/[id] — update status,
 * owner, due date, evidence, or verification. Dispatch/admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { updateCorrectiveAction, type CorrectiveActionStatus } from '@/lib/fleet/dumpTruck/correctiveActions'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

const VALID_STATUSES: CorrectiveActionStatus[] = ['open', 'in_progress', 'blocked', 'ready_to_verify', 'closed']

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch') && !canManage(auth.portals, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` }, { status: 400 })
    }

    const action = await updateCorrectiveAction(auth.businessId, id, {
      status: body.status, ownerId: body.ownerId, dueDate: body.dueDate,
      evidence: body.evidence, verificationMethod: body.verificationMethod, verifiedBy: body.verifiedBy,
    }, auth.userId, auth.email)
    return NextResponse.json({ action })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/admin/corrective-actions/[id]] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
