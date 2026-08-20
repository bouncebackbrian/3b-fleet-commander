/** PATCH /api/fleet/dump-truck/adjustments/[id] — corrects an adjustment (supersede-then-insert, never mutates history). Same body shape as POST /adjustments. */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { reviseAdjustment, type CreateAdjustmentInput } from '@/lib/fleet/dumpTruck/adjustments'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'payroll') && !canManage(auth.portals, 'billing') && !canManage(auth.portals, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    if (!body.driverId || !body.workDate || body.durationMinutes == null || !body.category || !body.explanation) {
      return NextResponse.json({ error: 'driverId, workDate, durationMinutes, category, and explanation are required' }, { status: 400 })
    }
    const input: CreateAdjustmentInput = {
      driverId: body.driverId, shiftId: body.shiftId ?? null, truckId: body.truckId ?? null, jobId: body.jobId ?? null,
      breakdownId: body.breakdownId ?? null, workDate: body.workDate, startTime: body.startTime ?? null, endTime: body.endTime ?? null,
      durationMinutes: body.durationMinutes, category: body.category, explanation: body.explanation,
      driverPayable: body.driverPayable ?? 'pending', payableHours: body.payableHours ?? null,
      customerBillable: body.customerBillable ?? 'pending', billableHours: body.billableHours ?? null,
      attachmentDocIds: body.attachmentDocIds ?? [],
    }
    const adjustment = await reviseAdjustment(auth.businessId, id, input, auth.userId, auth.email)
    return NextResponse.json({ adjustment })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/adjustments/[id]] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
