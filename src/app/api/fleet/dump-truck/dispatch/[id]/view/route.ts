/** POST /api/fleet/dump-truck/dispatch/[id]/view — marks the driver's current acknowledgement row as viewed (first render of the dispatch card). */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { markDispatchViewed } from '@/lib/fleet/dumpTruck/dispatch'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    await markDispatchViewed(auth.businessId, id, auth.userId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/fleet/dump-truck/dispatch/[id]/view] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
