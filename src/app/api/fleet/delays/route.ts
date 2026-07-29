/**
 * /api/fleet/delays — List + Create
 */

import { NextRequest, NextResponse }    from 'next/server'
import { requireFleetAuth, canManage }  from '@/lib/fleet-auth-guard'
import { getDelays, createDelay }       from '@/lib/fleet/delays'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const delays = await getDelays(auth.userId)
    return NextResponse.json({ delays })
  } catch (err) {
    console.error('[api/fleet/delays] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    if (!body.loadNumber || !body.delayType || !body.location || body.totalHours == null || !body.billable) {
      return NextResponse.json({ error: 'loadNumber, delayType, location, totalHours, billable are required' }, { status: 400 })
    }
    const delay = await createDelay(body, auth.userId, auth.email)
    return NextResponse.json({ delay }, { status: 201 })
  } catch (err) {
    console.error('[api/fleet/delays] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
