/**
 * /api/fleet/equipment — full equipment (trucks/trailers) registry
 *
 * GET  — list, readable by Admin or Dispatch portal (any level)
 * POST — create, requires manage-level Admin portal access
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, hasPortal, canManage } from '@/lib/fleet-auth-guard'
import { listEquipment, createEquipment } from '@/lib/fleet/equipment'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPortal(auth.portals, 'admin') && !hasPortal(auth.portals, 'dispatch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const equipment = await listEquipment(auth.businessId)
    return NextResponse.json({ equipment })
  } catch (err) {
    console.error('[api/fleet/equipment] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    if (!body.unitNumber || !body.equipmentType) {
      return NextResponse.json({ error: 'unitNumber and equipmentType are required' }, { status: 400 })
    }
    const equipment = await createEquipment(auth.businessId, body, auth.userId, auth.email)
    return NextResponse.json({ equipment }, { status: 201 })
  } catch (err) {
    console.error('[api/fleet/equipment] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
