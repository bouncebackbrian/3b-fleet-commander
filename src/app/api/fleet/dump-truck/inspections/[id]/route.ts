/**
 * PATCH /api/fleet/dump-truck/inspections/[id] — submit checklist items and complete
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { completeInspection } from '@/lib/fleet/dumpTruck/inspections'
import { syncShiftReportFromInspection } from '@/lib/fleet/dumpTruck/shiftReports'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const body = await request.json()
    if (!Array.isArray(body.items) || !body.completionEvent) {
      return NextResponse.json({ error: 'items[] and completionEvent are required' }, { status: 400 })
    }
    if (body.inspectionType !== 'pretrip' && body.inspectionType !== 'posttrip') {
      return NextResponse.json({ error: 'inspectionType must be pretrip or posttrip' }, { status: 400 })
    }

    const result = await completeInspection(auth.businessId, auth.userId, auth.email, {
      inspectionId: id,
      items: body.items,
      odometer: body.odometer ?? null,
      fuelLevel: body.fuelLevel ?? null,
      driverSignature: body.driverSignature ?? null,
      overrideReason: body.overrideReason ?? null,
      completionEvent: body.completionEvent,
    })

    const report = await syncShiftReportFromInspection({
      businessId: auth.businessId,
      driverId: auth.userId,
      inspectionId: id,
      inspectionType: body.inspectionType,
      dayNeeds: Array.isArray(body.dayNeeds) ? body.dayNeeds : [],
      driverDayNote: typeof body.driverDayNote === 'string' ? body.driverDayNote : null,
    })

    return NextResponse.json({ ...result, report })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/inspections/[id]] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
