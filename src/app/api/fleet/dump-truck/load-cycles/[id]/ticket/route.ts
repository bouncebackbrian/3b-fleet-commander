/**
 * PATCH /api/fleet/dump-truck/load-cycles/[id]/ticket — attach a scale/delivery ticket
 * (multipart/form-data: file, ticketType, ticketNumber)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { attachLoadTicket, type TicketType } from '@/lib/fleet/dumpTruck/loadCycles'
import { uploadDocument } from '@/lib/fleet/dumpTruck/documents'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const form = await request.formData()
    const file = form.get('file')
    const ticketType = form.get('ticketType')
    if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 })
    if (ticketType !== 'scale' && ticketType !== 'delivery') {
      return NextResponse.json({ error: 'ticketType must be "scale" or "delivery"' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const shiftId = form.get('shiftId')
    const upload = await uploadDocument({
      businessId: auth.businessId,
      shiftId: typeof shiftId === 'string' ? shiftId : null,
      docType: ticketType === 'scale' ? 'scale_ticket' : 'delivery_ticket',
      linkedEntityType: 'load_cycle',
      linkedEntityId: id,
      fileName: file.name,
      mimeType: file.type,
      bytes,
      capturedAt: new Date().toISOString(),
    }, auth.userId, auth.email)

    const ticketNumber = form.get('ticketNumber')
    const weightTonsRaw = form.get('weightTons')
    const weightTons = typeof weightTonsRaw === 'string' && weightTonsRaw !== '' ? Number(weightTonsRaw) : null
    if (weightTons != null && !Number.isFinite(weightTons)) {
      return NextResponse.json({ error: 'weightTons must be a number' }, { status: 400 })
    }
    const ticketCapturedAt = form.get('ticketCapturedAt')
    await attachLoadTicket(
      auth.businessId, id, ticketType as TicketType, upload.id,
      typeof ticketNumber === 'string' && ticketNumber ? ticketNumber : null,
      weightTons,
      typeof ticketCapturedAt === 'string' && ticketCapturedAt ? ticketCapturedAt : null,
      auth.userId, auth.email,
    )

    return NextResponse.json({ docId: upload.id })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/load-cycles/[id]/ticket] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
