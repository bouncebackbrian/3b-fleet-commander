/**
 * /api/fleet/dump-truck/dispatch — dispatch board list + draft creation
 *
 * GET: the management dispatch board (dispatch/admin view+). Optional
 * ?status=draft|published|cancelled filter.
 * POST: create a draft (from an AI parse result or manual entry) —
 * dispatch/admin manage-level only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage, hasPortal } from '@/lib/fleet-auth-guard'
import { createDispatchDraft, listDispatches, type CreateDispatchInput, type DispatchStopInput } from '@/lib/fleet/dumpTruck/dispatch'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPortal(auth.portals, 'dispatch') && !hasPortal(auth.portals, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const status = request.nextUrl.searchParams.get('status') as 'draft' | 'published' | 'cancelled' | null
    const dispatches = await listDispatches(auth.businessId, status ? { status } : {})
    return NextResponse.json({ dispatches })
  } catch (err) {
    console.error('[api/fleet/dump-truck/dispatch] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    if (!body.source || !Array.isArray(body.stops)) {
      return NextResponse.json({ error: 'source and stops[] are required' }, { status: 400 })
    }
    const stops: DispatchStopInput[] = body.stops.map((s: DispatchStopInput) => ({
      stopType: s.stopType, rawLocationText: s.rawLocationText, material: s.material ?? null, notes: s.notes ?? null,
    }))
    const input: CreateDispatchInput = { ...body, stops }
    const dispatch = await createDispatchDraft(auth.businessId, input, auth.userId, auth.email)
    return NextResponse.json({ dispatch })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/dispatch] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
