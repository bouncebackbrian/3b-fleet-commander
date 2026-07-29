/**
 * PATCH /api/fleet/dump-truck/sites/[id]/location — pin a site's GPS
 * coordinates from the caller's current position.
 *
 * Deliberately open to any active business member, not gated behind
 * canManage() like other site edits — a driver who physically finds a
 * remote site with no clean street address needs to record that fact
 * themselves, on site.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { updateSiteLocation } from '@/lib/fleet/dumpTruck/sites'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const body = await request.json()
    const lat = Number(body.lat)
    const lng = Number(body.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: 'lat and lng are required numbers' }, { status: 400 })
    }

    const site = await updateSiteLocation(auth.businessId, id, lat, lng, auth.userId, auth.email)
    return NextResponse.json({ site })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/sites/[id]/location] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
