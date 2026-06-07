/**
 * /api/fleet/fuel — List + Create
 *
 * GET  /api/fleet/fuel   → list fuel entries
 * POST /api/fleet/fuel   → create fuel entry
 */

import { NextRequest, NextResponse }      from 'next/server'
import { requireFleetAuth, canWrite }     from '@/lib/fleet-auth-guard'
import { getFuelEntries, createFuelEntry } from '@/lib/fleet/fuel'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const entries = await getFuelEntries(auth.userId)
    return NextResponse.json({ entries })
  } catch (err) {
    console.error('[api/fleet/fuel] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    if (!body.date || !body.location || !body.fuelType || body.gallons == null || body.totalCost == null) {
      return NextResponse.json({ error: 'date, location, fuelType, gallons, totalCost are required' }, { status: 400 })
    }
    const entry = await createFuelEntry(body, auth.userId, auth.email)
    return NextResponse.json({ entry }, { status: 201 })
  } catch (err) {
    console.error('[api/fleet/fuel] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
