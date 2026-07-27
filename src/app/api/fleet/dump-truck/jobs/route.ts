/**
 * /api/fleet/dump-truck/jobs — list + create dispatch jobs
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canWrite } from '@/lib/fleet-auth-guard'
import { listJobs, createJob } from '@/lib/fleet/dumpTruck/jobs'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const jobs = await listJobs(auth.businessId)
    return NextResponse.json({ jobs })
  } catch (err) {
    console.error('[api/fleet/dump-truck/jobs] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWrite(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json()
    if (!body.jobNumber) return NextResponse.json({ error: 'jobNumber is required' }, { status: 400 })

    const job = await createJob(auth.businessId, body, auth.userId, auth.email)
    return NextResponse.json({ job }, { status: 201 })
  } catch (err) {
    console.error('[api/fleet/dump-truck/jobs] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
