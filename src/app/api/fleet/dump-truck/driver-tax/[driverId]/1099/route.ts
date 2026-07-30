/**
 * /api/fleet/dump-truck/driver-tax/[driverId]/1099
 * GET  — list generated Form 1099-NEC filings for this driver (admin or self)
 * POST — admin generates a new filing for a given tax year
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { listFilings, generate1099 } from '@/lib/fleet/dumpTruck/driverTax'
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
    const filings = await listFilings(auth.businessId, driverId)
    return NextResponse.json({ filings })
  } catch (err) {
    console.error('[api/fleet/dump-truck/driver-tax/[driverId]/1099] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ driverId: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { driverId } = await params
    const body = await request.json()
    const taxYear = Number(body.taxYear)
    if (!taxYear || taxYear < 2020 || taxYear > 2100) {
      return NextResponse.json({ error: 'A valid taxYear is required' }, { status: 400 })
    }

    const filing = await generate1099(auth.businessId, driverId, taxYear, body.driverDisplayName ?? 'Driver', auth.userId, auth.email)
    return NextResponse.json({ filing })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/driver-tax/[driverId]/1099] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
