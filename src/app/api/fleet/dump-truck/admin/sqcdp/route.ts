/**
 * GET /api/fleet/dump-truck/admin/sqcdp — SQCDP monthly review (spec §14/§24)
 *
 * Query params:
 *   month = YYYY-MM (defaults to current month)
 *   trendMonths = number of months of trend to include (default 6, max 12)
 *
 * Dispatcher+ only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { computeSqcdpMonth, computeSqcdpTrend } from '@/lib/fleet/dumpTruck/sqcdpCompute'
import { currentMonthStr } from '@/lib/dumpTruck/sqcdp'

export const dynamic = 'force-dynamic'

const MONTH_RE = /^\d{4}-\d{2}$/

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch') && !canManage(auth.portals, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const month = request.nextUrl.searchParams.get('month') ?? currentMonthStr()
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })

  const trendMonthsParam = Number(request.nextUrl.searchParams.get('trendMonths') ?? '6')
  const trendMonths = Number.isFinite(trendMonthsParam) ? Math.min(12, Math.max(1, trendMonthsParam)) : 6

  try {
    const [review, trend] = await Promise.all([
      computeSqcdpMonth(auth.businessId, month),
      computeSqcdpTrend(auth.businessId, month, trendMonths),
    ])
    return NextResponse.json({ review, trend })
  } catch (err) {
    console.error('[api/fleet/dump-truck/admin/sqcdp] GET error:', err)
    // TEMPORARY (2026-08-14): surfacing the real error to diagnose a live blank-page
    // report — this is an admin-only, single-tenant-owner route, so leaking a message
    // string here is a reasonable tradeoff for a few minutes of live debugging.
    // Revert to a generic message once the root cause is found and fixed.
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    return NextResponse.json({ error: 'Internal server error', detail }, { status: 500 })
  }
}
