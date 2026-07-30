/**
 * /api/fleet/dump-truck/defects
 * POST — driver quick defect report (standalone, not tied to an inspection)
 * GET  — admin/dispatch "Open Defects" panel listing
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { reportQuickDefect, listDefects } from '@/lib/fleet/dumpTruck/incidents'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const defects = await listDefects(auth.businessId)
    return NextResponse.json({ defects })
  } catch (err) {
    console.error('[api/fleet/dump-truck/defects] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    if (!body.truckId || !body.description || !body.severity) {
      return NextResponse.json({ error: 'truckId, description, severity are required' }, { status: 400 })
    }
    const result = await reportQuickDefect(auth.businessId, auth.userId, auth.email, body)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/defects] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
