/** POST /api/fleet/dump-truck/breakdowns/[id]/resolve — RESUME WORK / RETURN TO YARD / TOWED / END DAY. */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { resolveBreakdown, type BreakdownResolution } from '@/lib/fleet/dumpTruck/breakdowns'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

const VALID: BreakdownResolution[] = ['resumed', 'returned_to_yard', 'towed', 'ended_day']

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const body = await request.json()
    if (!VALID.includes(body.resolution)) return NextResponse.json({ error: `resolution must be one of ${VALID.join(', ')}` }, { status: 400 })
    const breakdown = await resolveBreakdown(auth.businessId, id, body.resolution, auth.userId, auth.email)
    return NextResponse.json({ breakdown })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/breakdowns/[id]/resolve] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
