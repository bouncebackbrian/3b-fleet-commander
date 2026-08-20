/**
 * POST /api/fleet/dump-truck/hours/confirm — driver signs off that a day's
 * hours are correct (multipart/form-data).
 *
 * Body: `shiftId`, `workDate`, `signature` (image/png, required),
 * `sheetPhoto` (image, optional — a photo of a signed paper timesheet),
 * `totalHours` (number, optional — snapshot of what was confirmed).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { uploadDocument } from '@/lib/fleet/dumpTruck/documents'
import { confirmDailyHours } from '@/lib/fleet/dumpTruck/hoursConfirmations'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await request.formData()
    const shiftId = form.get('shiftId')
    const workDate = form.get('workDate')
    const signature = form.get('signature')
    const sheetPhoto = form.get('sheetPhoto')
    const totalHoursRaw = form.get('totalHours')

    if (typeof shiftId !== 'string' || typeof workDate !== 'string' || !(signature instanceof File)) {
      return NextResponse.json({ error: 'shiftId, workDate, and signature are required' }, { status: 400 })
    }

    const sigBytes = Buffer.from(await signature.arrayBuffer())
    const sigDoc = await uploadDocument({
      businessId: auth.businessId, shiftId, docType: 'signature',
      linkedEntityType: 'shift', linkedEntityId: shiftId,
      fileName: `hours-confirmation-${shiftId}.png`, mimeType: signature.type || 'image/png',
      bytes: sigBytes, capturedAt: new Date().toISOString(),
    }, auth.userId, auth.email)

    let sheetPhotoDocId: string | null = null
    if (sheetPhoto instanceof File) {
      const photoBytes = Buffer.from(await sheetPhoto.arrayBuffer())
      const photoDoc = await uploadDocument({
        businessId: auth.businessId, shiftId, docType: 'hours_sheet_scan',
        linkedEntityType: 'shift', linkedEntityId: shiftId,
        fileName: `hours-sheet-${shiftId}.jpg`, mimeType: sheetPhoto.type || 'image/jpeg',
        bytes: photoBytes, capturedAt: new Date().toISOString(),
      }, auth.userId, auth.email)
      sheetPhotoDocId = photoDoc.id
    }

    const totalHours = typeof totalHoursRaw === 'string' && totalHoursRaw !== '' ? Number(totalHoursRaw) : null

    const confirmation = await confirmDailyHours(
      auth.businessId, auth.userId, shiftId, workDate, sigDoc.id, sheetPhotoDocId, totalHours, auth.email,
    )
    return NextResponse.json({ confirmation }, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/hours/confirm] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
