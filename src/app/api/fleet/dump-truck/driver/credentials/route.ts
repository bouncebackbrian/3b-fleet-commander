/**
 * /api/fleet/dump-truck/driver/credentials — multi-credential driver identity
 *
 * GET: the caller's own credentials, or (?driverId=) any driver's for
 * dispatch/admin review. POST: the caller adds a credential to their own
 * profile — self-service, same pattern as other driver-entered records.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'
import { listDriverCredentials, createDriverCredential, type CreateCredentialInput } from '@/lib/fleet/dumpTruck/driverCredentials'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requestedDriverId = request.nextUrl.searchParams.get('driverId')
  if (requestedDriverId && requestedDriverId !== auth.userId) {
    const isManager = hasPortal(auth.portals, 'dispatch') || hasPortal(auth.portals, 'admin')
    if (!isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const credentials = await listDriverCredentials(auth.businessId, requestedDriverId ?? auth.userId)
    return NextResponse.json({ credentials })
  } catch (err) {
    console.error('[api/fleet/dump-truck/driver/credentials] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    if (!body.credentialType) return NextResponse.json({ error: 'credentialType is required' }, { status: 400 })
    const input: CreateCredentialInput = {
      credentialType: body.credentialType, label: body.label ?? null, number: body.number ?? null,
      issuingState: body.issuingState ?? null, class: body.class ?? null,
      endorsements: body.endorsements ?? [], restrictions: body.restrictions ?? [],
      issueDate: body.issueDate ?? null, expiryDate: body.expiryDate ?? null,
    }
    const credential = await createDriverCredential(auth.businessId, auth.userId, input, auth.userId, auth.email)
    return NextResponse.json({ credential }, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/driver/credentials] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
