/**
 * /api/fleet/equipment/[id]/service-records — maintenance/service history for one truck/trailer
 *
 * GET  — list, readable by Admin or Dispatch portal (any level)
 * POST — add a record, requires manage-level Admin portal access
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, hasPortal, canManage } from '@/lib/fleet-auth-guard'
import { listServiceRecords, createServiceRecord } from '@/lib/fleet/equipment'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPortal(auth.portals, 'admin') && !hasPortal(auth.portals, 'dispatch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const records = await listServiceRecords(auth.businessId, id)
    return NextResponse.json({ records })
  } catch (err) {
    console.error('[api/fleet/equipment/[id]/service-records] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const body = await request.json()
    if (!body.serviceType || !body.performedAt) {
      return NextResponse.json({ error: 'serviceType and performedAt are required' }, { status: 400 })
    }
    const record = await createServiceRecord(auth.businessId, id, body, auth.userId, auth.email)
    return NextResponse.json({ record }, { status: 201 })
  } catch (err) {
    console.error('[api/fleet/equipment/[id]/service-records] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
