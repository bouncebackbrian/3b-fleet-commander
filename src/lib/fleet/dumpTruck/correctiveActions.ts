/**
 * fleet/dumpTruck/correctiveActions.ts — SQCDP corrective action register (spec §22)
 *
 * "Never assign to everyone" — owner_id is required and always one person;
 * support_person_ids is a separate, explicitly-not-accountable list.
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { DumpTruckError } from './shared'
import type { SqcdpCategory } from '@/lib/dumpTruck/sqcdp'

export type CorrectiveActionStatus = 'open' | 'in_progress' | 'blocked' | 'ready_to_verify' | 'closed'
export type CorrectiveActionPriority = 'low' | 'medium' | 'high'

export interface CorrectiveActionRow {
  id: string
  month: string // YYYY-MM-DD (first of month)
  sqcdpCategory: SqcdpCategory
  sourceKpi: string | null
  sourceParetoCause: string | null
  problemEn: string
  problemEs: string | null
  rootCause: string | null
  actionEn: string
  actionEs: string | null
  ownerId: string
  supportPersonIds: string[]
  priority: CorrectiveActionPriority
  dueDate: string
  status: CorrectiveActionStatus
  expectedResult: string | null
  verificationMethod: string | null
  evidence: string | null
  verifiedBy: string | null
  closeDate: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): CorrectiveActionRow {
  return {
    id: r.id, month: r.month, sqcdpCategory: r.sqcdp_category, sourceKpi: r.source_kpi, sourceParetoCause: r.source_pareto_cause,
    problemEn: r.problem_en, problemEs: r.problem_es, rootCause: r.root_cause, actionEn: r.action_en, actionEs: r.action_es,
    ownerId: r.owner_id, supportPersonIds: r.support_person_ids ?? [], priority: r.priority, dueDate: r.due_date, status: r.status,
    expectedResult: r.expected_result, verificationMethod: r.verification_method, evidence: r.evidence, verifiedBy: r.verified_by,
    closeDate: r.close_date, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

export interface CreateCorrectiveActionInput {
  month: string
  sqcdpCategory: SqcdpCategory
  sourceKpi?: string | null
  sourceParetoCause?: string | null
  problemEn: string
  problemEs?: string | null
  rootCause?: string | null
  actionEn: string
  actionEs?: string | null
  ownerId: string
  supportPersonIds?: string[]
  priority?: CorrectiveActionPriority
  dueDate: string
  expectedResult?: string | null
  verificationMethod?: string | null
}

export async function createCorrectiveAction(
  businessId: string, input: CreateCorrectiveActionInput, actorId: string, email: string | null,
): Promise<CorrectiveActionRow> {
  if (!input.ownerId) throw new DumpTruckError('An action must have one named owner — never "everyone"', 400)
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_corrective_actions')
    .insert({
      business_id: businessId, month: `${input.month}-01`, sqcdp_category: input.sqcdpCategory,
      source_kpi: input.sourceKpi ?? null, source_pareto_cause: input.sourceParetoCause ?? null,
      problem_en: input.problemEn, problem_es: input.problemEs ?? null, root_cause: input.rootCause ?? null,
      action_en: input.actionEn, action_es: input.actionEs ?? null,
      owner_id: input.ownerId, support_person_ids: input.supportPersonIds ?? [],
      priority: input.priority ?? 'medium', due_date: input.dueDate,
      expected_result: input.expectedResult ?? null, verification_method: input.verificationMethod ?? null,
      created_by: actorId,
    })
    .select('*')
    .single()
  if (error) throw error

  audit.log({ userId: actorId, email, action: 'dump_truck.corrective_action.create', resource: 'fleet_dt_corrective_actions', resourceId: data.id, metadata: { category: input.sqcdpCategory } })
  return fromRow(data)
}

export async function listCorrectiveActions(businessId: string, opts: { month?: string; status?: CorrectiveActionStatus } = {}): Promise<CorrectiveActionRow[]> {
  let query = fleetServiceClient.from('fleet_dt_corrective_actions').select('*').eq('business_id', businessId)
  if (opts.month) query = query.eq('month', `${opts.month}-01`)
  if (opts.status) query = query.eq('status', opts.status)
  const { data, error } = await query.order('due_date', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export interface UpdateCorrectiveActionInput {
  status?: CorrectiveActionStatus
  ownerId?: string
  dueDate?: string
  evidence?: string | null
  verificationMethod?: string | null
  verifiedBy?: string | null
}

export async function updateCorrectiveAction(
  businessId: string, actionId: string, input: UpdateCorrectiveActionInput, actorId: string, email: string | null,
): Promise<CorrectiveActionRow> {
  const patch: Record<string, unknown> = {}
  if (input.status) {
    patch.status = input.status
    if (input.status === 'closed') { patch.close_date = new Date().toISOString().slice(0, 10) }
  }
  if (input.ownerId !== undefined) {
    if (!input.ownerId) throw new DumpTruckError('An action must have one named owner — never "everyone"', 400)
    patch.owner_id = input.ownerId
  }
  if (input.dueDate !== undefined) patch.due_date = input.dueDate
  if (input.evidence !== undefined) patch.evidence = input.evidence
  if (input.verificationMethod !== undefined) patch.verification_method = input.verificationMethod
  if (input.verifiedBy !== undefined) patch.verified_by = input.verifiedBy

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_corrective_actions')
    .update(patch)
    .eq('id', actionId)
    .eq('business_id', businessId)
    .select('*')
    .single()
  if (error) throw error

  audit.log({ userId: actorId, email, action: 'dump_truck.corrective_action.update', resource: 'fleet_dt_corrective_actions', resourceId: actionId, metadata: { status: input.status } })
  return fromRow(data)
}
