/**
 * /api/fleet/equipment/[id]/documents — registration/insurance/other truck photos
 *
 * GET readable by Admin or Dispatch (any level); POST requires manage-level Admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, hasPortal, canManage } from '@/lib/fleet-auth-guard'
import { listEquipmentDocuments, uploadEquipmentDocument, type EquipmentDocType } from '@/lib/fleet/equipment'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

const VALID_DOC_TYPES: EquipmentDocType[] = ['registration', 'insurance', 'other']

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPortal(auth.portals, 'admin') && !hasPortal(auth.portals, 'dispatch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const documents = await listEquipmentDocuments(auth.businessId, id)
    return NextResponse.json({ documents })
  } catch (err) {
    console.error('[api/fleet/equipment/[id]/documents] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const form = await request.formData()
    const file = form.get('file')
    const docType = form.get('docType')
    if (!(file instanceof File) || typeof docType !== 'string' || !VALID_DOC_TYPES.includes(docType as EquipmentDocType)) {
      return NextResponse.json({ error: `file is required and docType must be one of ${VALID_DOC_TYPES.join(', ')}` }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const result = await uploadEquipmentDocument(
      auth.businessId, id, docType as EquipmentDocType, file.name, file.type, bytes, auth.userId, auth.email,
    )
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/equipment/[id]/documents] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
