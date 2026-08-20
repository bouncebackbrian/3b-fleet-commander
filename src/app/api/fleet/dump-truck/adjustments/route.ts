/**
 * /api/fleet/dump-truck/adjustments — management time adjustments
 *
 * POST: create — payroll/billing/admin/owner manage-level only (spec:
 * drivers may not approve their own pay; dispatch does not get payroll
 * approval rights automatically).
 * GET: list — own (any member, transparency) via ?shiftId=, or business-wide
 * with filters (payroll/billing/admin/dispatch view).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage, hasPortal, type PortalGrants } from '@/lib/fleet-auth-guard'
import { createAdjustment, listAdjustmentsForShift, listAdjustmentsForBusiness, type CreateAdjustmentInput } from '@/lib/fleet/dumpTruck/adjustments'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

function canManagePayrollOrBilling(portals: PortalGrants): boolean {
  return canManage(portals, 'payroll') || canManage(portals, 'billing') || canManage(portals, 'admin')
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManagePayrollOrBilling(auth.portals)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
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
    const adjustment = await createAdjustment(auth.businessId, input, auth.userId, auth.email)
    return NextResponse.json({ adjustment })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/adjustments] POST error:', err)
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
      const adjustments = await listAdjustmentsForShift(auth.businessId, shiftId)
      return NextResponse.json({ adjustments })
    }

    const isManager = hasPortal(auth.portals, 'payroll') || hasPortal(auth.portals, 'billing') || hasPortal(auth.portals, 'admin') || hasPortal(auth.portals, 'dispatch')
    if (!isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const adjustments = await listAdjustmentsForBusiness(auth.businessId, {
      driverId: sp.get('driverId') ?? undefined, truckId: sp.get('truckId') ?? undefined, jobId: sp.get('jobId') ?? undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      category: (sp.get('category') as any) ?? undefined,
      startDate: sp.get('startDate') ?? undefined, endDate: sp.get('endDate') ?? undefined,
    })
    return NextResponse.json({ adjustments })
  } catch (err) {
    console.error('[api/fleet/dump-truck/adjustments] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
