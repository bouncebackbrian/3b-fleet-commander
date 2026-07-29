/**
 * PATCH /api/fleet/equipment/[id] — update a truck/trailer's record.
 * Manage-level Admin portal access required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { updateEquipment } from '@/lib/fleet/equipment'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const body = await request.json()
    const equipment = await updateEquipment(auth.businessId, id, body, auth.userId, auth.email)
    return NextResponse.json({ equipment })
  } catch (err) {
    console.error('[api/fleet/equipment/[id]] PATCH error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: message === 'Equipment not found' ? 404 : 500 })
  }
}
