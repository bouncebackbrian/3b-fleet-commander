/**
 * /api/fleet/business/profile — business profile (name, DOT/MC/EIN, insurance)
 *
 * GET   — any active business member
 * PATCH — manage-level Admin portal access required
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { getBusinessProfile, updateBusinessProfile, getBusinessLogoSignedUrl } from '@/lib/fleet/business'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const profile = await getBusinessProfile(auth.businessId)
    const logoUrl = profile ? await getBusinessLogoSignedUrl(auth.businessId) : null
    return NextResponse.json({ profile, logoUrl })
  } catch (err) {
    console.error('[api/fleet/business/profile] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    const profile = await updateBusinessProfile(auth.businessId, {
      name: body.name,
      dotNumber: body.dotNumber,
      mcNumber: body.mcNumber,
      ein: body.ein,
      insuranceCarrier: body.insuranceCarrier,
      insurancePolicyNumber: body.insurancePolicyNumber,
      insuranceExpiry: body.insuranceExpiry,
      dispatchAlertEmail: body.dispatchAlertEmail,
    }, auth.userId, auth.email)
    return NextResponse.json({ profile })
  } catch (err) {
    console.error('[api/fleet/business/profile] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
