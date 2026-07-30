/**
 * GET /api/fleet/dump-truck/documents/[id] — short-lived signed URL for a
 * private document (defect/incident photos, tickets, etc.) — used by the
 * admin Open Defects panel to view attached photos.
 */

import { NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { getSignedDocumentUrl } from '@/lib/fleet/dumpTruck/documents'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const url = await getSignedDocumentUrl(auth.businessId, id)
    if (!url) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    return NextResponse.json({ url })
  } catch (err) {
    console.error('[api/fleet/dump-truck/documents/[id]] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
