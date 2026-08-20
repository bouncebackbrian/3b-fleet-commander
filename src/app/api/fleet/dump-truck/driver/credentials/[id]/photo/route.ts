/** POST /api/fleet/dump-truck/driver/credentials/[id]/photo — front or back scan for one credential. */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { uploadCredentialPhoto } from '@/lib/fleet/dumpTruck/driverCredentials'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const form = await request.formData()
    const file = form.get('file')
    const side = form.get('side')
    if (!(file instanceof File) || (side !== 'front' && side !== 'back')) {
      return NextResponse.json({ error: 'file is required and side must be "front" or "back"' }, { status: 400 })
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    const credential = await uploadCredentialPhoto(auth.businessId, id, side, file.name, file.type, bytes, auth.userId, auth.email)
    return NextResponse.json({ credential })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/driver/credentials/[id]/photo] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
