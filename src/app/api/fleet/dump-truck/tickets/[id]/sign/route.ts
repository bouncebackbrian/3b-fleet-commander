/**
 * POST /api/fleet/dump-truck/tickets/[id]/sign — attach a signature (multipart/form-data)
 *
 * Body: `signature` (image/png file), `role` ('company' | 'driver').
 * - role=driver: only the ticket's assigned driver may sign their own ticket.
 * - role=company: requires manage-level Dispatch (or Admin) portal access.
 * The signature is stored the same way any other document is (uploadDocument),
 * doc_type 'signature', linked to this ticket instance.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { uploadDocument } from '@/lib/fleet/dumpTruck/documents'
import { getTicketInstanceById, signTicket } from '@/lib/fleet/dumpTruck/ticketInstances'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const ticket = await getTicketInstanceById(auth.businessId, id)
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

    const form = await request.formData()
    const file = form.get('signature')
    const role = form.get('role')
    if (!(file instanceof File) || (role !== 'company' && role !== 'driver')) {
      return NextResponse.json({ error: 'signature file and role (company|driver) are required' }, { status: 400 })
    }

    if (role === 'driver' && ticket.driverId !== auth.userId) {
      return NextResponse.json({ error: 'Only the assigned driver can sign this ticket' }, { status: 403 })
    }
    if (role === 'company' && !canManage(auth.portals, 'dispatch') && !canManage(auth.portals, 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const doc = await uploadDocument({
      businessId: auth.businessId,
      shiftId: null,
      docType: 'signature',
      linkedEntityType: 'ticket_instance',
      linkedEntityId: ticket.id,
      fileName: `signature-${role}-${ticket.id}.png`,
      mimeType: file.type || 'image/png',
      bytes,
      capturedAt: new Date().toISOString(),
    }, auth.userId, auth.email)

    const updated = await signTicket(auth.businessId, ticket.id, role, doc.id, auth.userId, auth.email)
    return NextResponse.json({ ticket: updated })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/tickets/[id]/sign] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
