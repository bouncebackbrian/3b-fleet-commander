/**
 * POST /api/fleet/dump-truck/hours/weekly/approve — dispatch signs off on a
 * driver-confirmed week. Approval is rejected if the live totals changed
 * after the driver's signature; the driver must review/sign the new totals.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { uploadDocument } from '@/lib/fleet/dumpTruck/documents'
import { approveWeeklyTimesheet, buildWeeklyTimesheet } from '@/lib/fleet/dumpTruck/weeklyTimesheets'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

const same = (a: number | null, b: number) => a != null && Math.abs(a - b) < 0.005

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch') && !canManage(auth.portals, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const form = await request.formData()
    const driverId = form.get('driverId')
    const weekStart = form.get('weekStart')
    const weekEnd = form.get('weekEnd')
    const signature = form.get('signature')
    if (typeof driverId !== 'string' || typeof weekStart !== 'string' || typeof weekEnd !== 'string' || !(signature instanceof File)) {
      return NextResponse.json({ error: 'driverId, weekStart, weekEnd, and signature are required' }, { status: 400 })
    }

    const timesheet = await buildWeeklyTimesheet(auth.businessId, driverId, weekStart, weekEnd)
    const driverAction = timesheet.driverAction
    const liveTotal = timesheet.summary.totalRegularHours + timesheet.summary.totalOvertimeHours
    if (!driverAction || driverAction.action !== 'confirmed') throw new DumpTruckError('Driver must sign the week before dispatch approval', 409)
    if (!same(driverAction.totalHoursAtAction, liveTotal) || !same(driverAction.regularHoursAtAction, timesheet.summary.totalRegularHours) || !same(driverAction.overtimeHoursAtAction, timesheet.summary.totalOvertimeHours)) {
      throw new DumpTruckError('Hours changed after the driver signed. Driver re-confirmation is required before dispatch can approve.', 409)
    }

    const sigBytes = Buffer.from(await signature.arrayBuffer())
    const sigDoc = await uploadDocument({
      businessId: auth.businessId, shiftId: null, docType: 'signature',
      linkedEntityType: 'weekly_timesheet', linkedEntityId: null,
      fileName: `weekly-timesheet-approval-${driverId}-${weekStart}.png`, mimeType: signature.type || 'image/png',
      bytes: sigBytes, capturedAt: new Date().toISOString(),
    }, auth.userId, auth.email)

    const action = await approveWeeklyTimesheet(auth.businessId, driverId, weekStart, weekEnd, sigDoc.id, auth.userId, auth.email)
    return NextResponse.json({ action }, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/hours/weekly/approve] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
