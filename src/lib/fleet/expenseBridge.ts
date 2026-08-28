export type ExpenseOwnerScope = 'driver' | 'company' | 'shared_operational'
export type ExpensePaidByScope = 'driver' | 'company' | 'third_party' | 'unknown'
export type ExpenseSyncStatus = 'pending' | 'synced' | 'ignored' | 'error'

export interface FleetExpenseBridgeInput {
  sourceSystem: 'fleet_commander'
  sourceTable: string
  sourceRecordId: string
  sourceEventType?: string | null
  businessId?: string | null
  userId?: string | null
  mode?: string | null
  ownerScope: ExpenseOwnerScope
  paidByScope: ExpensePaidByScope
  reimbursable?: boolean
  category: string
  amount: number
  occurredAt: string
  vendor?: string | null
  paymentMethod?: string | null
  documentId?: string | null
  notes?: string | null
  taxClassification?: string | null
  businessPurpose?: string | null
  deductibleCandidate?: boolean
  truckId?: string | null
  driverId?: string | null
  shiftId?: string | null
  jobId?: string | null
}

/**
 * Rules shared by Fleet Commander and 3B Expense Tracker.
 *
 * 1. Operational source tables stay authoritative.
 * 2. The bridge stores a normalized pointer, not a second raw expense.
 * 3. sourceSystem + sourceTable + sourceRecordId is the dedupe key.
 * 4. paidByScope controls whose cash flow is affected.
 * 5. ownerScope controls whose historical record can retain the item.
 * 6. reimbursable means a driver-paid company expense can appear in both
 *    personal reimbursement tracking and company operations without being
 *    counted twice as two separate purchases.
 * 7. Tax classification is evidence/category support, not an automatic tax ruling.
 */
export function normalizeFleetExpenseBridge(input: FleetExpenseBridgeInput) {
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error('Expense amount must be a non-negative number')
  }

  const reimbursementStatus = input.reimbursable ? 'pending' : 'not_applicable'

  return {
    business_id: input.businessId ?? null,
    user_id: input.userId ?? null,
    mode: input.mode ?? null,
    source_system: input.sourceSystem,
    source_table: input.sourceTable,
    source_record_id: input.sourceRecordId,
    source_event_type: input.sourceEventType ?? null,
    owner_scope: input.ownerScope,
    paid_by_scope: input.paidByScope,
    reimbursable: input.reimbursable ?? false,
    reimbursement_status: reimbursementStatus,
    category: input.category,
    amount: input.amount,
    occurred_at: input.occurredAt,
    vendor: input.vendor ?? null,
    payment_method: input.paymentMethod ?? null,
    document_id: input.documentId ?? null,
    notes: input.notes ?? null,
    tax_classification: input.taxClassification ?? null,
    business_purpose: input.businessPurpose ?? null,
    deductible_candidate: input.deductibleCandidate ?? false,
    truck_id: input.truckId ?? null,
    driver_id: input.driverId ?? null,
    shift_id: input.shiftId ?? null,
    job_id: input.jobId ?? null,
    expense_tracker_status: 'pending' as ExpenseSyncStatus,
  }
}

export function classifyExpenseOwnership(opts: {
  paidBy: ExpensePaidByScope
  isCompanyRequired: boolean
  isPersonalBusinessExpense?: boolean
}): ExpenseOwnerScope {
  if (opts.isPersonalBusinessExpense && opts.paidBy === 'driver') return 'driver'
  if (opts.isCompanyRequired && opts.paidBy === 'driver') return 'shared_operational'
  if (opts.isCompanyRequired) return 'company'
  return opts.paidBy === 'driver' ? 'driver' : 'company'
}
