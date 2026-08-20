/** PATCH /api/fleet/dump-truck/driver/credentials/[id] — driver corrects their own credential, or dispatch/admin corrects it on their behalf. RLS also enforces ownership. */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { updateDriverCredential, type UpdateCredentialInput } from '@/lib/fleet/dumpTruck/driverCredentials'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const body = await request.json()
    const input: UpdateCredentialInput = {}
    for (const key of ['label', 'number', 'issuingState', 'class', 'endorsements', 'restrictions', 'issueDate', 'expiryDate', 'active'] as const) {
      if (body[key] !== undefined) input[key] = body[key]
    }
    const credential = await updateDriverCredential(auth.businessId, id, input, auth.userId, auth.email)
    return NextResponse.json({ credential })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/driver/credentials/[id]] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
