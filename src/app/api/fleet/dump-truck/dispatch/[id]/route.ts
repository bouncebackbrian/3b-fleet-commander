/**
 * /api/fleet/dump-truck/dispatch/[id] — one dispatch's detail / edit
 *
 * GET: dispatch/admin view+, or the assigned driver (their own published
 * dispatch only — RLS also enforces this).
 * PATCH: edits a draft directly, or (if already published) revises it —
 * dispatch/admin manage-level only. Pass `reason` when revising a published
 * dispatch (required — it's recorded in the version history).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage, hasPortal } from '@/lib/fleet-auth-guard'
import { getDispatch, updateDispatchDraft, reviseDispatch, type DraftPatch } from '@/lib/fleet/dumpTruck/dispatch'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const result = await getDispatch(auth.businessId, id)
    if (!result) return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })

    const isManager = hasPortal(auth.portals, 'dispatch') || hasPortal(auth.portals, 'admin')
    const isOwnDriver = result.dispatch.driverId === auth.userId && result.dispatch.status === 'published'
    if (!isManager && !isOwnDriver) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/fleet/dump-truck/dispatch/[id]] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const body = await request.json()
    const existing = await getDispatch(auth.businessId, id)
    if (!existing) return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 })

    const { reason, ...patchBody } = body
    const patch = patchBody as DraftPatch

    const dispatch = existing.dispatch.status === 'published'
      ? await reviseDispatch(auth.businessId, id, patch, reason || 'Dispatch updated', auth.userId, auth.email)
      : await updateDispatchDraft(auth.businessId, id, patch, auth.userId, auth.email)

    return NextResponse.json({ dispatch })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/dispatch/[id]] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
