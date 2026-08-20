/**
 * /api/fleet/dump-truck/breakdowns — "Truck Problem" workflow
 *
 * POST: driver reports a breakdown (any active member — recording physical
 * reality, same pattern as defect reporting).
 * GET: list breakdowns — own shift's (any member) or business-wide with
 * filters (dispatch/payroll/billing/admin — truck downtime analytics).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'
import { reportBreakdown, listBreakdownsForShift, listBreakdownsForBusiness, type ReportBreakdownInput } from '@/lib/fleet/dumpTruck/breakdowns'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    if (!body.truckId) return NextResponse.json({ error: 'truckId is required' }, { status: 400 })
    const input: ReportBreakdownInput = {
      shiftId: body.shiftId ?? null, truckId: body.truckId, jobId: body.jobId ?? null,
      category: body.category ?? null, canMove: body.canMove ?? null, safeLocation: body.safeLocation ?? null,
      notes: body.notes ?? null, lat: body.lat ?? null, lng: body.lng ?? null,
    }
    const breakdown = await reportBreakdown(auth.businessId, auth.userId, input, auth.email)
    return NextResponse.json({ breakdown })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/breakdowns] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const sp = request.nextUrl.searchParams
    const shiftId = sp.get('shiftId')
    if (shiftId) {
      const breakdowns = await listBreakdownsForShift(auth.businessId, shiftId)
      return NextResponse.json({ breakdowns })
    }

    const isManager = hasPortal(auth.portals, 'dispatch') || hasPortal(auth.portals, 'admin') || hasPortal(auth.portals, 'payroll') || hasPortal(auth.portals, 'billing')
    if (!isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const breakdowns = await listBreakdownsForBusiness(auth.businessId, {
      truckId: sp.get('truckId') ?? undefined,
      driverId: sp.get('driverId') ?? undefined,
      startDate: sp.get('startDate') ?? undefined,
      endDate: sp.get('endDate') ?? undefined,
    })
    return NextResponse.json({ breakdowns })
  } catch (err) {
    console.error('[api/fleet/dump-truck/breakdowns] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
