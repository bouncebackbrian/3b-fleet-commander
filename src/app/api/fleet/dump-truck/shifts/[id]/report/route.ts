/**
 * GET /api/fleet/dump-truck/shifts/[id]/report — End of Shift Report (PDF)
 *
 * A driver may only download their own shift's report; dispatch/admin
 * (manage-level "dispatch" portal) may download any driver's.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { fleetServiceClient } from '@/lib/fleet-service-client'
import { buildShiftReport } from '@/lib/fleet/dumpTruck/shiftReport'
import { getBusinessLogoForPdf } from '@/lib/fleet/business'
import { renderSummaryReportPdf } from '@/lib/reports/pdf'

export const dynamic = 'force-dynamic'

const DISCLAIMERS = [
  'All hours/earnings figures are ESTIMATES ONLY, calculated from a single hourly-rate + daily-overtime policy.',
  'They are NOT payroll-approved wages. Approved company payroll records control if values differ.',
]

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params

    const { data: shift, error: shiftError } = await fleetServiceClient
      .from('fleet_dt_shifts')
      .select('id, driver_id')
      .eq('id', id)
      .eq('business_id', auth.businessId)
      .maybeSingle()
    if (shiftError) throw shiftError
    if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
    if (shift.driver_id !== auth.userId && !canManage(auth.portals, 'dispatch')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [report, logo] = await Promise.all([
      buildShiftReport(auth.businessId, id),
      getBusinessLogoForPdf(auth.businessId),
    ])
    const h = report.hours

    const pdf = await renderSummaryReportPdf({
      logoBytes: logo?.bytes ?? null,
      logoFormat: logo?.format,
      businessName: report.businessName,
      threeBBizId: report.threebBizId,
      title: 'End of Shift Report',
      subtitleLines: [
        `Driver: ${report.driverName}  •  Date: ${report.workDate}  •  Truck: ${h.truckUnit ?? '—'}${h.trailerUnit ? ` / Trailer: ${h.trailerUnit}` : ''}`,
        `Clock In: ${h.clockInAt ?? '—'}  •  Clock Out: ${h.clockOutAt ?? '—'}  •  Status: ${h.submissionStatus}`,
        h.jobsWorked ? `Jobs: ${h.jobsWorked}` : 'Jobs: —',
      ],
      disclaimers: DISCLAIMERS,
      stats: [
        { label: 'Total Hours', value: h.totalShiftHours.toFixed(2) },
        { label: 'Regular Hours', value: h.regularHours.toFixed(2) },
        { label: 'Overtime Hours', value: h.overtimeHours.toFixed(2) },
        { label: 'Loads Completed', value: String(h.loadsCompleted) },
        { label: 'Quantity Hauled', value: h.quantityHauled ? h.quantityHauled.toFixed(2) : '—' },
        { label: 'Shift Miles', value: h.shiftMiles != null ? String(h.shiftMiles) : '—' },
        { label: 'Delay Hours', value: h.delayHours.toFixed(2) },
        { label: 'Est. Earnings', value: `$${h.estimatedGrossEarnings.toFixed(2)}` },
      ],
      sections: [
        {
          title: 'Time Log',
          headers: ['Time', 'Event', 'Notes'],
          rows: report.timeline.map(e => [new Date(e.time).toLocaleString(), e.label, e.notes ?? '']),
        },
        {
          title: 'Truck Issues Reported',
          headers: ['Reported', 'Severity', 'Description', 'Status', 'Resolved'],
          rows: report.defects.map(d => [
            new Date(d.createdAt).toLocaleString(), d.severity, d.description, d.status,
            d.resolvedAt ? new Date(d.resolvedAt).toLocaleString() : '',
          ]),
        },
      ],
    })

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="shift-report-${report.workDate}-${h.truckUnit ?? id.slice(0, 8)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[api/fleet/dump-truck/shifts/[id]/report] GET error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: message === 'Shift not found' ? 404 : 500 })
  }
}
