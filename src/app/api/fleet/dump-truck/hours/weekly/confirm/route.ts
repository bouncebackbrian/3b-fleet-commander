/**
 * POST /api/fleet/dump-truck/hours/weekly/confirm — driver signs off that a
 * whole week's recap (daily hours + any flagged escalations) is correct.
 * multipart/form-data: `weekStart`, `weekEnd`, `signature` (image/png).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { uploadDocument } from '@/lib/fleet/dumpTruck/documents'
import { confirmWeeklyTimesheet } from '@/lib/fleet/dumpTruck/weeklyTimesheets'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await request.formData()
    const weekStart = form.get('weekStart')
    const weekEnd = form.get('weekEnd')
    const signature = form.get('signature')
    if (typeof weekStart !== 'string' || typeof weekEnd !== 'string' || !(signature instanceof File)) {
      return NextResponse.json({ error: 'weekStart, weekEnd, and signature are required' }, { status: 400 })
    }

    const sigBytes = Buffer.from(await signature.arrayBuffer())
    const sigDoc = await uploadDocument({
      businessId: auth.businessId, shiftId: null, docType: 'signature',
      linkedEntityType: 'weekly_timesheet', linkedEntityId: null,
      fileName: `weekly-timesheet-${auth.userId}-${weekStart}.png`, mimeType: signature.type || 'image/png',
      bytes: sigBytes, capturedAt: new Date().toISOString(),
    }, auth.userId, auth.email)

    const action = await confirmWeeklyTimesheet(auth.businessId, auth.userId, weekStart, weekEnd, sigDoc.id, auth.userId, auth.email)
    return NextResponse.json({ action }, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/hours/weekly/confirm] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
