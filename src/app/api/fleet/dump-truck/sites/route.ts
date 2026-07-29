/**
 * /api/fleet/dump-truck/sites — list + create yards/pickup/dump sites
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { listSites, createSite } from '@/lib/fleet/dumpTruck/sites'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const includeGateInfo = canManage(auth.portals, 'dispatch')
    const sites = await listSites(auth.businessId, { includeGateInfo })
    return NextResponse.json({ sites })
  } catch (err) {
    console.error('[api/fleet/dump-truck/sites] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Open to any active business member, not just canManage() roles — a driver
// who ends up at a new pickup/dump site with nothing on file yet needs to
// be able to add it themselves rather than wait on dispatch (same reasoning
// as the location-pin endpoint). Every field here can already be created by
// an admin/dispatcher through the same function; this is a permission
// change, not a new capability.
export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
