/**
 * PATCH /api/fleet/dump-truck/admin/expenses/[id] — approve/reject an expense.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { updateExpenseApproval, type ExpenseApprovalStatus } from '@/lib/fleet/dumpTruck/expenses'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

const VALID_STATUSES: ExpenseApprovalStatus[] = ['pending', 'approved', 'rejected']

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(auth.portals, 'dispatch') && !canManage(auth.portals, 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    if (!VALID_STATUSES.includes(body.approvalStatus)) {
      return NextResponse.json({ error: `approvalStatus must be one of ${VALID_STATUSES.join(', ')}` }, { status: 400 })
    }
    const expense = await updateExpenseApproval(auth.businessId, id, { approvalStatus: body.approvalStatus }, auth.userId, auth.email)
    return NextResponse.json({ expense })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/admin/expenses/[id]] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
