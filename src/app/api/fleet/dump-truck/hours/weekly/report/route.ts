/**
 * GET /api/fleet/dump-truck/hours/weekly/report — the official Weekly Recap
 * & Pay Report (PDF): daily hours breakdown, escalations flagged that week,
 * the full driver-then-dispatch sign-off history (every correction round
 * documented with its note), and both signature images.
 *
 * Query params: weekStart, weekEnd (YYYY-MM-DD), driverId (required for
 * dispatch/admin viewing another driver's week; a driver always gets their
 * own regardless of this param).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { buildWeeklyTimesheet } from '@/lib/fleet/dumpTruck/weeklyTimesheets'
import { getThreebId } from '@/lib/fleet/dumpTruck/shared'
import { getBusinessProfile, getBusinessLogoForPdf } from '@/lib/fleet/business'
import { fleetServiceClient } from '@/lib/fleet-service-client'
import { renderWeeklyTimesheetPdf, type WeeklyTimesheetSignature } from '@/lib/reports/pdf'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

const SIGNATURES_BUCKET = 'fleet-dt-documents'

async function fetchProfileName(userId: string | null): Promise<string> {
  if (!userId) return '—'
  const { data } = await fleetServiceClient.from('profiles').select('full_name').eq('id', userId).maybeSingle()
  return data?.full_name || '—'
}

async function fetchSignature(docId: string | null, signedBy: string, signedAt: string | null): Promise<WeeklyTimesheetSignature | null> {
  if (!docId || !signedAt) return null
  const { data: doc } = await fleetServiceClient.from('fleet_dt_documents').select('storage_path').eq('id', docId).maybeSingle()
  if (!doc) return null
  const { data, error } = await fleetServiceClient.storage.from(SIGNATURES_BUCKET).download(doc.storage_path)
  if (error || !data) return null
  return { imageBytes: Buffer.from(await data.arrayBuffer()), signedBy, signedAt: new Date(signedAt).toLocaleString() }
}

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const weekStart = request.nextUrl.searchParams.get('weekStart')
  const weekEnd = request.nextUrl.searchParams.get('weekEnd')
  const requestedDriverId = request.nextUrl.searchParams.get('driverId')
  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: 'weekStart and weekEnd (YYYY-MM-DD) are required' }, { status: 400 })
  }

  let driverId = auth.userId
  if (requestedDriverId && requestedDriverId !== auth.userId) {
    if (!canManage(auth.portals, 'dispatch') && !canManage(auth.portals, 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    driverId = requestedDriverId
  }

  try {
    const timesheet = await buildWeeklyTimesheet(auth.businessId, driverId, weekStart, weekEnd)

    const [profile, logo, driverName, driverThreebId, driverSigName, dispatchSigName] = await Promise.all([
      getBusinessProfile(auth.businessId),
      getBusinessLogoForPdf(auth.businessId),
      fetchProfileName(driverId),
      getThreebId(driverId),
      fetchProfileName(timesheet.driverAction?.createdBy ?? null),
      fetchProfileName(timesheet.dispatchAction?.createdBy ?? null),
    ])

    const isDriverConfirmed = timesheet.driverAction?.action === 'confirmed'
    const isDispatchApproved = timesheet.dispatchAction?.action === 'approved'
    const [driverSignature, dispatchSignature] = await Promise.all([
      isDriverConfirmed ? fetchSignature(timesheet.driverAction!.signatureDocId, driverSigName, timesheet.driverAction!.createdAt) : Promise.resolve(null),
      isDispatchApproved ? fetchSignature(timesheet.dispatchAction!.signatureDocId, dispatchSigName, timesheet.dispatchAction!.createdAt) : Promise.resolve(null),
    ])

    const dailyBreakdown = {
      headers: ['Date', 'Truck', 'Total Hrs', 'Paid Hrs', 'Reg', 'OT', 'Loads', 'Miles', 'Est. Gross ($)'],
      rows: timesheet.rows.map(r => [
        r.workDate, r.truckUnit ?? '—', r.totalShiftHours, r.paidHours, r.regularHours, r.overtimeHours,
        r.loadsCompleted, r.shiftMiles ?? '', r.estimatedGrossEarnings.toFixed(2),
      ]),
    }

    const escalations = timesheet.escalations.map(e => `${e.workDate} — ${e.message}`)

    const history = timesheet.history.map(h => ({
      label: h.role === 'driver' ? 'Driver' : 'Dispatch',
      action: h.action,
      note: h.note,
      at: new Date(h.createdAt).toLocaleString(),
    }))

    const stats = [
      { label: 'Days Worked', value: String(timesheet.summary.daysWorked) },
      { label: 'Regular Hrs', value: timesheet.summary.totalRegularHours.toFixed(2) },
      { label: 'Overtime Hrs', value: timesheet.summary.totalOvertimeHours.toFixed(2) },
      { label: 'Loads', value: String(timesheet.summary.totalLoads) },
      { label: 'Miles', value: String(timesheet.summary.totalMiles) },
      { label: 'Est. Gross Pay', value: `$${timesheet.summary.estimatedGrossEarnings.toFixed(2)}` },
    ]

    const pdf = await renderWeeklyTimesheetPdf({
      logoBytes: logo?.bytes ?? null,
      logoFormat: logo?.format,
      businessName: profile?.name ?? 'Fleet Commander',
      threeBBizId: profile?.threeBBizId ?? null,
      driverName, driverThreebId,
      weekStart: timesheet.weekStart, weekEnd: timesheet.weekEnd,
      status: timesheet.status.replace(/_/g, ' '),
      stats, dailyBreakdown, escalations, history,
      driverSignature, dispatchSignature,
      disclaimers: [
        'All earnings figures are ESTIMATES ONLY, calculated from a single hourly-rate + daily/weekly-overtime policy.',
        'This is the official weekly recap and pay report on file — corrections and both parties’ sign-off are documented above.',
      ],
    })

    const filename = `weekly-recap-${driverId}-${timesheet.weekStart}`
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/hours/weekly/report] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
