/**
 * /api/fleet/loads — List + Create
 *
 * GET  /api/fleet/loads        → list loads for authenticated user
 * POST /api/fleet/loads        → create a new load
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { getLoads, createLoad }       from '@/lib/fleet/loads'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const loads = await getLoads(auth.userId)
    return NextResponse.json({ loads })
  } catch (err) {
    console.error('[api/fleet/loads] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    if (!body.date) return NextResponse.json({ error: 'date is required' }, { status: 400 })

    const load = await createLoad(body, auth.userId, auth.email)
    return NextResponse.json({ load }, { status: 201 })
  } catch (err) {
    console.error('[api/fleet/loads] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
