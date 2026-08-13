/**
 * /api/fleet/dump-truck/admin/expenses — dump-truck-scoped operating expenses (spec §9.1)
 * GET  — list, optional ?from=YYYY-MM-DD&to=YYYY-MM-DD&truckId=
 * POST — create
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireFleetAuth, canManage } from '@/lib/fleet-auth-guard'
import { createExpense, listExpenses, type ExpenseCategory } from '@/lib/fleet/dumpTruck/expenses'
import { DumpTruckError } from '@/lib/fleet/dumpTruck/shared'

export const dynamic = 'force-dynamic'

const VALID_CATEGORIES: ExpenseCategory[] = [
  'fuel', 'repairs', 'tires', 'tolls', 'parking', 'permit', 'wash', 'supplies', 'maintenance', 'reimbursement', 'other',
]

export async function GET(request: NextRequest) {
  const auth = await requireFleetAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const from = request.nextUrl.searchParams.get('from') ?? undefined
  const to = request.nextUrl.searchParams.get('to') ?? undefined
  const truckId = request.nextUrl.searchParams.get('truckId') ?? undefined

  try {
    const expenses = await listExpenses(auth.businessId, { from, to, truckId })
    return NextResponse.json({ expenses })
  } catch (err) {
    console.error('[api/fleet/dump-truck/admin/expenses] GET error:', err)
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
    if (!VALID_CATEGORIES.includes(body.category)) return NextResponse.json({ error: `category must be one of ${VALID_CATEGORIES.join(', ')}` }, { status: 400 })
    if (typeof body.amount !== 'number' || body.amount < 0) return NextResponse.json({ error: 'amount must be a non-negative number' }, { status: 400 })
    if (!body.occurredAt) return NextResponse.json({ error: 'occurredAt (YYYY-MM-DD) is required' }, { status: 400 })

    const expense = await createExpense(auth.businessId, {
      truckId: body.truckId ?? null, driverId: body.driverId ?? null, shiftId: body.shiftId ?? null, jobId: body.jobId ?? null,
      category: body.category, vendor: body.vendor ?? null, amount: body.amount, paymentMethod: body.paymentMethod ?? null,
      documentId: body.documentId ?? null, reimbursable: body.reimbursable ?? false, notes: body.notes ?? null, occurredAt: body.occurredAt,
    }, auth.userId, auth.email)
    return NextResponse.json({ expense }, { status: 201 })
  } catch (err) {
    if (err instanceof DumpTruckError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[api/fleet/dump-truck/admin/expenses] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
