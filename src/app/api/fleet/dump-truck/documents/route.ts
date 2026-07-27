/**
 * POST /api/fleet/dump-truck/documents — upload a photo/ticket/receipt (multipart/form-data)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { uploadDocument } from '@/lib/fleet/dumpTruck/documents'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await request.formData()
    const file = form.get('file')
    const docType = form.get('docType')
    if (!(file instanceof File) || typeof docType !== 'string') {
      return NextResponse.json({ error: 'file and docType are required' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const shiftId = form.get('shiftId')
    const lat = form.get('lat')
    const lng = form.get('lng')

    const result = await uploadDocument({
      businessId: auth.businessId,
      shiftId: typeof shiftId === 'string' ? shiftId : null,
      docType,
      linkedEntityType: typeof form.get('linkedEntityType') === 'string' ? String(form.get('linkedEntityType')) : null,
      linkedEntityId: typeof form.get('linkedEntityId') === 'string' ? String(form.get('linkedEntityId')) : null,
      fileName: file.name,
      mimeType: file.type,
      bytes,
      capturedAt: typeof form.get('capturedAt') === 'string' ? String(form.get('capturedAt')) : null,
      lat: typeof lat === 'string' ? Number(lat) : null,
      lng: typeof lng === 'string' ? Number(lng) : null,
    }, auth.userId, auth.email)

    return NextResponse.json(result, { status: result.duplicateOf ? 200 : 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/documents] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
