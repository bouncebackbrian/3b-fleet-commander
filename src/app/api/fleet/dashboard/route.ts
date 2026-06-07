/**
 * /api/fleet/dashboard — Aggregated stats
 *
 * GET /api/fleet/dashboard → returns aggregated metrics for the dashboard
 */

import { NextResponse }          from 'next/server'
import { requireFleetAuth }      from '@/lib/fleet-auth-guard'
import { getDashboardStats }     from '@/lib/fleet/dashboard'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const stats = await getDashboardStats(auth.userId)
    return NextResponse.json({ stats })
  } catch (err) {
    console.error('[api/fleet/dashboard] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
