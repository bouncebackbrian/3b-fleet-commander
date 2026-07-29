/**
 * /api/fleet/dump-truck/broker/jobs — Broker Desk (Broker portal)
 *
 * GET  — list jobs with a broker on file (view-level Broker portal access)
 * PATCH — update broker name / rate fields on one job (manage-level required)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, hasPortal, canManage } from '@/lib/fleet-auth-guard'
import { listBrokerJobs, updateJobBrokerFields } from '@/lib/fleet/dumpTruck/jobs'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPortal(auth.portals, 'broker')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const jobs = await listBrokerJobs(auth.businessId)
    return NextResponse.json({ jobs })
  } catch (err) {
    console.error('[api/fleet/dump-truck/broker/jobs] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'broker')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    if (!body.jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })

    const job = await updateJobBrokerFields(auth.businessId, body.jobId, {
      brokerName: body.brokerName,
      pricePerHour: body.pricePerHour,
      pricePerTon: body.pricePerTon,
      fuelSurcharge: body.fuelSurcharge,
      materialCost: body.materialCost,
    }, auth.userId, auth.email)
    return NextResponse.json({ job })
  } catch (err) {
    console.error('[api/fleet/dump-truck/broker/jobs] PATCH error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: message === 'Job not found' ? 404 : 500 })
  }
}
