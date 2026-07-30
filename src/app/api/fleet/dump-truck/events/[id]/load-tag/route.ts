/**
 * PATCH /api/fleet/dump-truck/events/[id]/load-tag — attach a load-tag
 * photo's OCR result to a specific timeline event's device_metadata.
 * The photo itself is uploaded separately via /api/fleet/dump-truck/documents
 * (linkedEntityType 'event', linkedEntityId this event's id) — this just
 * records the OCR read + links the resulting document id.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { attachLoadTagToEvent } from '@/lib/fleet/dumpTruck/events'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const body = await request.json()
    if (!body.documentId) return NextResponse.json({ error: 'documentId is required' }, { status: 400 })

    await attachLoadTagToEvent(auth.businessId, id, body.documentId, {
      ticketNumber: body.ticketNumber ?? null,
      netWeightTons: body.netWeightTons ?? null,
      grossWeightLb: body.grossWeightLb ?? null,
      tareWeightLb: body.tareWeightLb ?? null,
      material: body.material ?? null,
      date: body.date ?? null,
      time: body.time ?? null,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/events/[id]/load-tag] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
