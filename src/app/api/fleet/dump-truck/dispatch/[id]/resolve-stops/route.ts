/**
 * POST /api/fleet/dump-truck/dispatch/[id]/resolve-stops — match each stop's
 * free-text location against real sites, or geocode it (spec §Location
 * Normalization). Returns the resolution for Hector to review/correct
 * before publishing — does not itself require the match to be high
 * confidence.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { resolveDispatchStops } from '@/lib/fleet/dumpTruck/dispatch'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const stops = await resolveDispatchStops(auth.businessId, id)
    return NextResponse.json({ stops })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/dispatch/[id]/resolve-stops] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
