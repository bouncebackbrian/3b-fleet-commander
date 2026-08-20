/**
 * POST /api/fleet/dump-truck/hours/correction — driver disputes a day's
 * hours instead of confirming them. Records a correction_requested status
 * row (see fleet_dt_hours_confirmations) so /driver/hours can show "correction
 * pending" and let the driver resubmit once it's addressed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { requestHoursCorrection } from '@/lib/fleet/dumpTruck/hoursConfirmations'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { shiftId, workDate, note, totalHours } = body
    if (typeof shiftId !== 'string' || typeof workDate !== 'string' || typeof note !== 'string') {
      return NextResponse.json({ error: 'shiftId, workDate, and note are required' }, { status: 400 })
    }
    const confirmation = await requestHoursCorrection(
      auth.businessId, auth.userId, shiftId, workDate, note, typeof totalHours === 'number' ? totalHours : null, auth.email,
    )
    return NextResponse.json({ confirmation }, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/hours/correction] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
