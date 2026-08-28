/**
 * POST /api/fleet/dump-truck/hours/driver-correction
 * Driver submits corrected start/end times for a completed shift.
 * Raw clock events remain untouched. A verified-hours override plus an
 * insert-only confirmation/audit record documents the correction.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { getShiftById } from '@/lib/fleet/dumpTruck/shifts'
import { applyShiftHourOverride } from '@/lib/fleet/dumpTruck/hourOverrides'
import { confirmDailyHours } from '@/lib/fleet/dumpTruck/hoursConfirmations'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { shiftId, workDate, correctedStartAt, correctedEndAt, note } = body
    if (![shiftId, workDate, correctedStartAt, correctedEndAt, note].every(v => typeof v === 'string' && v.trim())) {
      return NextResponse.json({ error: 'shiftId, workDate, correctedStartAt, correctedEndAt, and note are required' }, { status: 400 })
    }

    const shift = await getShiftById(shiftId)
    if (!shift || shift.businessId !== auth.businessId || shift.driverId !== auth.userId) throw new DumpTruckError('Shift not found', 404)

    const startMs = new Date(correctedStartAt).getTime()
    const endMs = new Date(correctedEndAt).getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) throw new DumpTruckError('Corrected end time must be after corrected start time', 400)
    const verifiedHours = Math.round(((endMs - startMs) / 3600000) * 100) / 100
    if (verifiedHours > 24) throw new DumpTruckError('Corrected shift cannot exceed 24 hours', 400)

    const sourceDocument = `Driver correction: ${correctedStartAt} → ${correctedEndAt}`
    const reason = `Driver time correction — ${note.trim()}`
    const override = await applyShiftHourOverride({
      businessId: auth.businessId,
      shiftId,
      verifiedHours,
      reason,
      sourceDocument,
      actorId: auth.userId,
      actorEmail: auth.email,
      source: 'driver',
    })

    const confirmation = await confirmDailyHours(
      auth.businessId,
      auth.userId,
      shiftId,
      workDate,
      null,
      null,
      verifiedHours,
      auth.email,
    )

    return NextResponse.json({ override, confirmation, verifiedHours }, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/hours/driver-correction] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
