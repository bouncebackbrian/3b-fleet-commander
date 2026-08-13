/**
 * fleet/dumpTruck/expenses.ts — dump-truck-scoped operating expenses (spec §9.1)
 *
 * Deliberately not the legacy `expenses` table (text business_id, keyed to
 * mission_id/load_number, no fleet_dt_* foreign keys) — that table is the
 * OTR system's own expense tracker and the wrong shape for a multi-tenant
 * truck/driver/job-scoped record. fleet_dt_fuel_entries remains the source
 * of truth for fuel; this covers everything else (repairs, tires, tolls, …).
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { DumpTruckError } from './shared'

export type ExpenseCategory =
  | 'fuel' | 'repairs' | 'tires' | 'tolls' | 'parking' | 'permit' | 'wash' | 'supplies' | 'maintenance' | 'reimbursement' | 'other'
export type ExpenseApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface ExpenseRow {
  id: string
  truckId: string | null
  driverId: string | null
  shiftId: string | null
  jobId: string | null
  category: ExpenseCategory
  vendor: string | null
  amount: number
  paymentMethod: string | null
  documentId: string | null
  reimbursable: boolean
  approvalStatus: ExpenseApprovalStatus
  approvedBy: string | null
  approvedAt: string | null
  notes: string | null
  occurredAt: string
  createdBy: string
  createdAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): ExpenseRow {
  return {
    id: r.id, truckId: r.truck_id, driverId: r.driver_id, shiftId: r.shift_id, jobId: r.job_id,
    category: r.category, vendor: r.vendor, amount: Number(r.amount), paymentMethod: r.payment_method,
    documentId: r.document_id, reimbursable: r.reimbursable, approvalStatus: r.approval_status,
    approvedBy: r.approved_by, approvedAt: r.approved_at, notes: r.notes, occurredAt: r.occurred_at,
    createdBy: r.created_by, createdAt: r.created_at,
  }
}

export interface CreateExpenseInput {
  truckId?: string | null
  driverId?: string | null
  shiftId?: string | null
  jobId?: string | null
  category: ExpenseCategory
  vendor?: string | null
  amount: number
  paymentMethod?: string | null
  documentId?: string | null
  reimbursable?: boolean
  notes?: string | null
  occurredAt: string // YYYY-MM-DD
}

export async function createExpense(businessId: string, input: CreateExpenseInput, actorId: string, email: string | null): Promise<ExpenseRow> {
  if (input.amount < 0) throw new DumpTruckError('amount must be >= 0', 400)
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_expenses')
    .insert({
      business_id: businessId, truck_id: input.truckId ?? null, driver_id: input.driverId ?? null,
      shift_id: input.shiftId ?? null, job_id: input.jobId ?? null, category: input.category,
      vendor: input.vendor ?? null, amount: input.amount, payment_method: input.paymentMethod ?? null,
      document_id: input.documentId ?? null, reimbursable: input.reimbursable ?? false, notes: input.notes ?? null,
      occurred_at: input.occurredAt, created_by: actorId,
    })
    .select('*')
    .single()
  if (error) throw error

  audit.log({ userId: actorId, email, action: 'dump_truck.expense.create', resource: 'fleet_dt_expenses', resourceId: data.id, metadata: { category: input.category, amount: input.amount } })
  return fromRow(data)
}

export async function listExpenses(businessId: string, opts: { from?: string; to?: string; truckId?: string } = {}): Promise<ExpenseRow[]> {
  let query = fleetServiceClient.from('fleet_dt_expenses').select('*').eq('business_id', businessId)
  if (opts.from) query = query.gte('occurred_at', opts.from)
  if (opts.to) query = query.lte('occurred_at', opts.to)
  if (opts.truckId) query = query.eq('truck_id', opts.truckId)
  const { data, error } = await query.order('occurred_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export interface UpdateExpenseApprovalInput {
  approvalStatus: ExpenseApprovalStatus
}

export async function updateExpenseApproval(
  businessId: string, expenseId: string, input: UpdateExpenseApprovalInput, actorId: string, email: string | null,
): Promise<ExpenseRow> {
  const patch: Record<string, unknown> = { approval_status: input.approvalStatus }
  if (input.approvalStatus === 'approved') { patch.approved_by = actorId; patch.approved_at = new Date().toISOString() }

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_expenses').update(patch).eq('id', expenseId).eq('business_id', businessId).select('*').single()
  if (error) throw error

  audit.log({ userId: actorId, email, action: `dump_truck.expense.${input.approvalStatus}`, resource: 'fleet_dt_expenses', resourceId: expenseId })
  return fromRow(data)
}
