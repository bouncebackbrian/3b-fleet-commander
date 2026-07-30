/**
 * /api/fleet/dump-truck/ticket-templates — list + upsert dispatch ticket templates
 * (per-broker field toggles + signoff requirements — see ticketTemplates.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { listTicketTemplates, upsertTicketTemplate, getOrCreateGenericTemplate } from '@/lib/fleet/dumpTruck/ticketTemplates'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await getOrCreateGenericTemplate(auth.businessId)
    const templates = await listTicketTemplates(auth.businessId)
    return NextResponse.json({ templates })
  } catch (err) {
    console.error('[api/fleet/dump-truck/ticket-templates] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch') && !canManage(auth.portals, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    if (!body.name || !Array.isArray(body.fieldKeys)) {
      return NextResponse.json({ error: 'name and fieldKeys are required' }, { status: 400 })
    }

    const template = await upsertTicketTemplate(auth.businessId, {
      brokerId: body.brokerId ?? null,
      name: body.name,
      fieldKeys: body.fieldKeys,
      requiresCompanySignoff: body.requiresCompanySignoff ?? true,
      requiresDriverSignature: body.requiresDriverSignature ?? true,
      referenceScanDocId: body.referenceScanDocId ?? null,
    }, auth.userId, auth.email)
    return NextResponse.json({ template })
  } catch (err) {
    console.error('[api/fleet/dump-truck/ticket-templates] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
