/**
 * GET /api/fleet/dump-truck/driver-tax/1099-filings/[filingId]/pdf —
 * signed URL to a generated 1099-NEC PDF. A 1099 contains another person's
 * TIN, so only an admin (any filing) or the filing's own driver can fetch it.
 */

import { NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { getFilingSignedUrl } from '@/lib/fleet/dumpTruck/driverTax'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ filingId: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { filingId } = await params
    const isAdmin = canManage(auth.portals, 'admin')
    const url = await getFilingSignedUrl(auth.businessId, filingId, isAdmin ? null : auth.userId)
    if (!url) return NextResponse.json({ error: 'Filing not found' }, { status: 404 })
    return NextResponse.json({ url })
  } catch (err) {
    console.error('[api/fleet/dump-truck/driver-tax/1099-filings/[filingId]/pdf] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
