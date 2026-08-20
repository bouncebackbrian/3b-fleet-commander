/** POST /api/fleet/dump-truck/driver/credentials/[id]/verify — dispatch/admin marks a credential verified/pending/unverified after checking it against the photo. Not driver self-service. */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { verifyDriverCredential, type VerificationStatus } from '@/lib/fleet/dumpTruck/driverCredentials'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

const VALID: VerificationStatus[] = ['unverified', 'pending', 'verified']

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch') && !canManage(auth.portals, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    if (!VALID.includes(body.status)) return NextResponse.json({ error: `status must be one of ${VALID.join(', ')}` }, { status: 400 })
    const credential = await verifyDriverCredential(auth.businessId, id, body.status, auth.userId, auth.email)
    return NextResponse.json({ credential })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/driver/credentials/[id]/verify] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
