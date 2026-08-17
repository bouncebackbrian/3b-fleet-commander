/**
 * /api/fleet/dump-truck/incidents
 * POST — driver incident quick action
 * GET  — admin/dispatch Safety panel listing
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { createIncident, listIncidents } from '@/lib/fleet/dumpTruck/incidents'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const incidents = await listIncidents(auth.businessId)
    return NextResponse.json({ incidents })
  } catch (err) {
    console.error('[api/fleet/dump-truck/incidents] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    if (!body.description || !body.incidentType || !body.occurredAt) {
      return NextResponse.json({ error: 'description, incidentType, occurredAt are required' }, { status: 400 })
    }
    const result = await createIncident(auth.businessId, auth.userId, auth.email, body)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/incidents] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
