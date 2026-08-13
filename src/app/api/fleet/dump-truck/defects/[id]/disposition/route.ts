/**
 * POST /api/fleet/dump-truck/defects/[id]/disposition — the seven dispatch
 * defect-review actions from spec §5.1 (acknowledge, request_details,
 * assign_maintenance, place_on_hold, mark_operable, resolve, reopen).
 * Dispatch/admin only. Every call is written to the append-only
 * fleet_dt_defect_dispositions audit trail; place_on_hold/mark_operable also
 * flip the truck's hold state in fleet_equipment.
 *
 * GET returns the disposition history for one defect.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { recordDefectDisposition, listDefectDispositions } from '@/lib/fleet/dumpTruck/incidents'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'
import type { DefectDispositionAction } from '@/lib/dumpTruck/defectDisposition'

export const dynamic = 'force-dynamic'

const VALID_ACTIONS: DefectDispositionAction[] = [
  'acknowledge', 'request_details', 'assign_maintenance', 'place_on_hold', 'mark_operable', 'resolve', 'reopen', 'defer',
]

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch') && !canManage(auth.portals, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    if (!VALID_ACTIONS.includes(body.action)) {
      return NextResponse.json({ error: `action must be one of ${VALID_ACTIONS.join(', ')}` }, { status: 400 })
    }

    const result = await recordDefectDisposition(auth.businessId, id, {
      action: body.action, reason: body.reason ?? null, instruction: body.instruction ?? null,
      assignedTo: body.assignedTo ?? undefined,
    }, auth.userId, auth.email)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/defects/[id]/disposition] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const dispositions = await listDefectDispositions(auth.businessId, id)
    return NextResponse.json({ dispositions })
  } catch (err) {
    console.error('[api/fleet/dump-truck/defects/[id]/disposition] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
