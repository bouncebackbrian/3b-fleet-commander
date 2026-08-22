/**
 * POST /api/fleet/dump-truck/hours/weekly/send-back — dispatch sends a
 * driver-confirmed week back instead of approving it. Body: `driverId`,
 * `weekStart`, `weekEnd`, `note`. Dispatcher+ only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { sendBackWeeklyTimesheet } from '@/lib/fleet/dumpTruck/weeklyTimesheets'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    const { driverId, weekStart, weekEnd, note } = body
    if (typeof driverId !== 'string' || typeof weekStart !== 'string' || typeof weekEnd !== 'string' || typeof note !== 'string') {
      return NextResponse.json({ error: 'driverId, weekStart, weekEnd, and note are required' }, { status: 400 })
    }
    const action = await sendBackWeeklyTimesheet(auth.businessId, driverId, weekStart, weekEnd, note, auth.userId, auth.email)
    return NextResponse.json({ action }, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/hours/weekly/send-back] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
