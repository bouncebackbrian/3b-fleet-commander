/**
 * /api/fleet/dump-truck/driver/documents — CDL front/back + medical card photos
 *
 * Always scoped to the caller's own driver identity (auth.userId) as the
 * linkedEntityId — never client-controllable, so a driver can only attach
 * documents to their own profile, never another driver's.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { listDriverDocuments, uploadDriverDocument, type DriverDocType } from '@/lib/fleet/dumpTruck/driverCompliance'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

const VALID_DOC_TYPES: DriverDocType[] = ['cdl_front', 'cdl_back', 'medical_card']

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const documents = await listDriverDocuments(auth.businessId, auth.userId)
    return NextResponse.json({ documents })
  } catch (err) {
    console.error('[api/fleet/dump-truck/driver/documents] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await request.formData()
    const file = form.get('file')
    const docType = form.get('docType')
    if (!(file instanceof File) || typeof docType !== 'string' || !VALID_DOC_TYPES.includes(docType as DriverDocType)) {
      return NextResponse.json({ error: `file is required and docType must be one of ${VALID_DOC_TYPES.join(', ')}` }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const result = await uploadDriverDocument(
      auth.businessId, auth.userId, docType as DriverDocType, file.name, file.type, bytes, auth.userId, auth.email,
    )
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/driver/documents] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
