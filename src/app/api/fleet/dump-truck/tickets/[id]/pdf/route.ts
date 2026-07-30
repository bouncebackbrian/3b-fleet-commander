/**
 * GET /api/fleet/dump-truck/tickets/[id]/pdf — signed URL to the completed
 * ticket's rendered PDF (only present once both required signatures are on
 * file — see ticketFinalize.ts).
 */

import { NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { fleetServiceClient } from '@/lib/fleet-service-client'
import { getTicketInstanceById } from '@/lib/fleet/dumpTruck/ticketInstances'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const ticket = await getTicketInstanceById(auth.businessId, id)
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    if (!ticket.pdfStoragePath) return NextResponse.json({ error: 'PDF not generated yet — both signatures are required first' }, { status: 404 })

    const { data, error } = await fleetServiceClient.storage
      .from('dispatch-tickets')
      .createSignedUrl(ticket.pdfStoragePath, 300)
    if (error || !data) return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 })

    return NextResponse.json({ url: data.signedUrl })
  } catch (err) {
    console.error('[api/fleet/dump-truck/tickets/[id]/pdf] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
