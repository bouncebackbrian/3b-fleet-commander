/**
 * /api/fleet/dump-truck/brokers — broker contact directory
 *
 * GET  — any active business member
 * POST — manage-level on the Dispatch, Broker, or Admin portal (whoever is
 *        entering a deal should be able to add a broker on the fly)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { listBrokers, createBroker } from '@/lib/fleet/dumpTruck/brokers'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const brokers = await listBrokers(auth.businessId)
    return NextResponse.json({ brokers })
  } catch (err) {
    console.error('[api/fleet/dump-truck/brokers] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const allowed = canManage(auth.portals, 'dispatch') || canManage(auth.portals, 'broker') || canManage(auth.portals, 'admin')
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    if (!body.name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const broker = await createBroker(auth.businessId, {
      name: body.name,
      contactName: body.contactName,
      phone: body.phone,
      email: body.email,
      notes: body.notes,
    }, auth.userId, auth.email)
    return NextResponse.json({ broker }, { status: 201 })
  } catch (err) {
    console.error('[api/fleet/dump-truck/brokers] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
