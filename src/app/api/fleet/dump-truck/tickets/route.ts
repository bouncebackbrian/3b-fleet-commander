/**
 * GET /api/fleet/dump-truck/tickets?jobId=... — fetch the digital dispatch
 * ticket instance for a job (auto-created on job accept/create — see
 * ticketInstances.ts). Returns null ticket if none exists yet (e.g. a job
 * with no driver assigned).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth } from '@/lib/fleet-auth-guard'
import { getTicketInstanceByJob } from '@/lib/fleet/dumpTruck/ticketInstances'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jobId = request.nextUrl.searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })

  try {
    const ticket = await getTicketInstanceByJob(auth.businessId, jobId)
    return NextResponse.json({ ticket })
  } catch (err) {
    console.error('[api/fleet/dump-truck/tickets] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
