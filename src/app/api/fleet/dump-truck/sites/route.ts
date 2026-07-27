/**
 * /api/fleet/dump-truck/sites — list + create yards/pickup/dump sites
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canWrite } from '@/lib/fleet-auth-guard'
import { listSites, createSite } from '@/lib/fleet/dumpTruck/sites'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const includeGateInfo = canWrite(auth.role)
    const sites = await listSites(auth.businessId, { includeGateInfo })
    return NextResponse.json({ sites })
  } catch (err) {
    console.error('[api/fleet/dump-truck/sites] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    if (!body.name || !body.siteType) return NextResponse.json({ error: 'name and siteType are required' }, { status: 400 })

    const site = await createSite(auth.businessId, body, auth.userId, auth.email)
    return NextResponse.json({ site }, { status: 201 })
  } catch (err) {
    console.error('[api/fleet/dump-truck/sites] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
