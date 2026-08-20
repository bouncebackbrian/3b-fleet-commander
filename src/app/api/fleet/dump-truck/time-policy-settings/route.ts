/** /api/fleet/dump-truck/time-policy-settings — business-level return-to-yard/post-trip pay+bill inclusion toggles. */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { getTimePolicySettings, updateTimePolicySettings } from '@/lib/fleet/dumpTruck/adjustments'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const settings = await getTimePolicySettings(auth.businessId)
    return NextResponse.json({ settings })
  } catch (err) {
    console.error('[api/fleet/dump-truck/time-policy-settings] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'payroll') && !canManage(auth.portals, 'billing') && !canManage(auth.portals, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await request.json()
    const settings = await updateTimePolicySettings(auth.businessId, body, auth.userId)
    return NextResponse.json({ settings })
  } catch (err) {
    console.error('[api/fleet/dump-truck/time-policy-settings] PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
