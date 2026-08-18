/**
 * /api/fleet/dump-truck/driver/compliance — CDL + medical card structured fields
 *
 * Always scoped to the caller's own driver identity (auth.userId) — a driver
 * can only read/write their own compliance record, never another driver's.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { getDriverCompliance, upsertDriverCompliance } from '@/lib/fleet/dumpTruck/driverCompliance'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const compliance = await getDriverCompliance(auth.userId)
    return NextResponse.json({ compliance })
  } catch (err) {
    console.error('[api/fleet/dump-truck/driver/compliance] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    await upsertDriverCompliance(auth.userId, {
      cdlNumber: body.cdlNumber !== undefined ? (body.cdlNumber || null) : undefined,
      cdlState: body.cdlState !== undefined ? (body.cdlState || null) : undefined,
      cdlClass: body.cdlClass !== undefined ? (body.cdlClass || null) : undefined,
      cdlExpiry: body.cdlExpiry !== undefined ? (body.cdlExpiry || null) : undefined,
      medicalExpiry: body.medicalExpiry !== undefined ? (body.medicalExpiry || null) : undefined,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/fleet/dump-truck/driver/compliance] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
