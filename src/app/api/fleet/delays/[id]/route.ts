/**
 * /api/fleet/delays/[id] — Update + Delete
 */

import { NextRequest, NextResponse }          from 'next/server'
import { requireFleetAuth, canWrite }         from '@/lib/fleet-auth-guard'
import { updateDelay, deleteDelay }           from '@/lib/fleet/delays'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  try {
    const body = await req.json()
    const delay = await updateDelay(id, { dispatcherNotified: body.dispatcherNotified, proofSaved: body.proofSaved }, auth.userId, auth.email)
    return NextResponse.json({ delay })
  } catch (err) {
    console.error('[api/fleet/delays/[id]] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  try {
    await deleteDelay(id, auth.userId, auth.email)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/fleet/delays/[id]] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
