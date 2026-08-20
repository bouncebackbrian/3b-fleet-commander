/**
 * POST /api/fleet/dump-truck/dispatch/[id]/acknowledge — the assigned
 * driver acknowledges their current-version dispatch. Any active business
 * member may call this (not gated by canManage) — it's the driver
 * confirming their own assignment, same access pattern as other driver
 * self-service actions (site GPS pinning, job field edits).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { acknowledgeDispatch } from '@/lib/fleet/dumpTruck/dispatch'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const deviceMetadata = { userAgent: request.headers.get('user-agent') ?? null, at: new Date().toISOString(), ...body.deviceMetadata }
    const ack = await acknowledgeDispatch(auth.businessId, id, auth.userId, deviceMetadata)
    return NextResponse.json({ acknowledgement: ack })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/dispatch/[id]/acknowledge] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
