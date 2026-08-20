/** /api/fleet/dump-truck/dispatch/settings — business-level dispatch timing policy. */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { getDispatchSettings, updateDispatchSettings } from '@/lib/fleet/dumpTruck/dispatch'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const settings = await getDispatchSettings(auth.businessId)
    return NextResponse.json({ settings })
  } catch (err) {
    console.error('[api/fleet/dump-truck/dispatch/settings] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    const settings = await updateDispatchSettings(auth.businessId, body, auth.userId)
    return NextResponse.json({ settings })
  } catch (err) {
    console.error('[api/fleet/dump-truck/dispatch/settings] PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
