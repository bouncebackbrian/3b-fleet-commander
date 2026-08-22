/**
 * POST /api/fleet/dump-truck/hours/weekly/correction — driver disputes a
 * week's recap instead of confirming it. Body: `weekStart`, `weekEnd`, `note`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { requestWeeklyCorrection } from '@/lib/fleet/dumpTruck/weeklyTimesheets'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { weekStart, weekEnd, note } = body
    if (typeof weekStart !== 'string' || typeof weekEnd !== 'string' || typeof note !== 'string') {
      return NextResponse.json({ error: 'weekStart, weekEnd, and note are required' }, { status: 400 })
    }
    const action = await requestWeeklyCorrection(auth.businessId, auth.userId, weekStart, weekEnd, note, auth.userId, auth.email)
    return NextResponse.json({ action }, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/hours/weekly/correction] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
