/**
 * /api/fleet/dump-truck/driver-tax/[driverId]
 * GET   — the driver themselves, or an admin, can fetch the full profile (incl. TIN)
 * PATCH — admin-only: sets classification (w2/1099) + withholding %
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { getDriverTaxProfile, updateDriverClassification } from '@/lib/fleet/dumpTruck/driverTax'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ driverId: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { driverId } = await params
  if (driverId !== auth.userId && !canManage(auth.portals, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const profile = await getDriverTaxProfile(auth.businessId, driverId)
    return NextResponse.json({ profile })
  } catch (err) {
    console.error('[api/fleet/dump-truck/driver-tax/[driverId]] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ driverId: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { driverId } = await params
    const body = await request.json()
    if (!['w2', '1099'].includes(body.classification)) {
      return NextResponse.json({ error: 'classification must be w2 or 1099' }, { status: 400 })
    }

    const profile = await updateDriverClassification(auth.businessId, driverId, {
      classification: body.classification, withholdingPercent: body.withholdingPercent ?? null,
    }, auth.userId, auth.email)
    return NextResponse.json({ profile })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/driver-tax/[driverId]] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
