/**
 * /api/fleet/dump-truck/admin/corrective-actions — SQCDP corrective action register (spec §22)
 * GET  — list, optional ?month=YYYY-MM&status=open|in_progress|blocked|ready_to_verify|closed
 * POST — create (requires ownerId — one named owner, never "everyone")
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { createCorrectiveAction, listCorrectiveActions, type CorrectiveActionStatus } from '@/lib/fleet/dumpTruck/correctiveActions'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'
import type { SqcdpCategory } from '@/lib/dumpTruck/sqcdp'

export const dynamic = 'force-dynamic'

const VALID_STATUSES: CorrectiveActionStatus[] = ['open', 'in_progress', 'blocked', 'ready_to_verify', 'closed']
const VALID_CATEGORIES: SqcdpCategory[] = ['safety', 'quality', 'cost', 'delivery', 'people']

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = request.nextUrl.searchParams.get('month') ?? undefined
  const status = request.nextUrl.searchParams.get('status') as CorrectiveActionStatus | null

  try {
    const actions = await listCorrectiveActions(auth.businessId, { month, status: status ?? undefined })
    return NextResponse.json({ actions })
  } catch (err) {
    console.error('[api/fleet/dump-truck/admin/corrective-actions] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch') && !canManage(auth.portals, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) return NextResponse.json({ error: 'month (YYYY-MM) is required' }, { status: 400 })
    if (!VALID_CATEGORIES.includes(body.sqcdpCategory)) return NextResponse.json({ error: `sqcdpCategory must be one of ${VALID_CATEGORIES.join(', ')}` }, { status: 400 })
    if (!body.problemEn || !body.actionEn) return NextResponse.json({ error: 'problemEn and actionEn are required' }, { status: 400 })
    if (!body.ownerId) return NextResponse.json({ error: 'ownerId is required — one named owner, never "everyone"' }, { status: 400 })
    if (!body.dueDate) return NextResponse.json({ error: 'dueDate is required' }, { status: 400 })

    const action = await createCorrectiveAction(auth.businessId, {
      month: body.month, sqcdpCategory: body.sqcdpCategory, sourceKpi: body.sourceKpi ?? null, sourceParetoCause: body.sourceParetoCause ?? null,
      problemEn: body.problemEn, problemEs: body.problemEs ?? null, rootCause: body.rootCause ?? null,
      actionEn: body.actionEn, actionEs: body.actionEs ?? null,
      ownerId: body.ownerId, supportPersonIds: body.supportPersonIds ?? [], priority: body.priority ?? 'medium',
      dueDate: body.dueDate, expectedResult: body.expectedResult ?? null, verificationMethod: body.verificationMethod ?? null,
    }, auth.userId, auth.email)
    return NextResponse.json({ action }, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/admin/corrective-actions] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
