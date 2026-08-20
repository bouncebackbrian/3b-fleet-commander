/**
 * fleet/dumpTruck/adjustments.ts — management time adjustments (the single
 * payable/billable classification mechanism) + the aggregation that turns
 * operational records (breakdowns, return-to-yard, post-trip, adjustments)
 * into the ClassifiedSegment[] the pure timeClassification.ts split
 * function consumes.
 *
 * Corrections supersede, never mutate — same pattern as
 * fleet_dt_shift_hour_overrides (hourOverrides.ts). Every adjustment
 * requires a non-empty explanation (DB CHECK backs this up).
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { audit } from '@/lib/fleet/audit'
import { getThreebId, getBusinessMeta, DumpTruckError } from './shared'
import { getOpenBreakdownForShift, listBreakdownsForShift } from './breakdowns'
import {
  computeReturnToYardSeconds, computeOperationalTimeSplit, computeNonPaidTimeValue,
  type ClassifiedSegment, type ManagementAdjustmentCategory, type PayBillDecision, type OperationalTimeSplit,
} from '@/lib/dumpTruck/timeClassification'
import { buildCategoryTimeFromEvents, type TimedEvent } from '@/lib/dumpTruck/hours'

export interface TimeAdjustment {
  id: string
  businessId: string
  driverId: string
  driverThreebId: string | null
  shiftId: string | null
  truckId: string | null
  jobId: string | null
  breakdownId: string | null
  workDate: string
  startTime: string | null
  endTime: string | null
  durationMinutes: number
  category: ManagementAdjustmentCategory
  explanation: string
  driverPayable: PayBillDecision
  payableHours: number | null
  customerBillable: PayBillDecision
  billableHours: number | null
  attachmentDocIds: string[]
  supersededAt: string | null
  supersededBy: string | null
  enteredBy: string
  managerThreebId: string | null
  createdAt: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): TimeAdjustment {
  return {
    id: r.id, businessId: r.business_id, driverId: r.driver_id, driverThreebId: r.driver_threeb_id,
    shiftId: r.shift_id, truckId: r.truck_id, jobId: r.job_id, breakdownId: r.breakdown_id,
    workDate: r.work_date, startTime: r.start_time, endTime: r.end_time, durationMinutes: Number(r.duration_minutes),
    category: r.category, explanation: r.explanation,
    driverPayable: r.driver_payable, payableHours: r.payable_hours != null ? Number(r.payable_hours) : null,
    customerBillable: r.customer_billable, billableHours: r.billable_hours != null ? Number(r.billable_hours) : null,
    attachmentDocIds: r.attachment_doc_ids ?? [],
    supersededAt: r.superseded_at, supersededBy: r.superseded_by,
    enteredBy: r.entered_by, managerThreebId: r.manager_threeb_id, createdAt: r.created_at,
  }
}

export interface CreateAdjustmentInput {
  driverId: string
  shiftId: string | null
  truckId: string | null
  jobId: string | null
  breakdownId: string | null
  workDate: string
  startTime: string | null
  endTime: string | null
  durationMinutes: number
  category: ManagementAdjustmentCategory
  explanation: string
  driverPayable: PayBillDecision
  payableHours?: number | null
  customerBillable: PayBillDecision
  billableHours?: number | null
  attachmentDocIds?: string[]
}

/** Creates a new management time adjustment — the mandatory-explanation, never-silent classification decision. */
export async function createAdjustment(
  businessId: string, input: CreateAdjustmentInput, managerId: string, email: string | null,
): Promise<TimeAdjustment> {
  if (!input.explanation?.trim()) throw new DumpTruckError('Explanation is required', 400)
  if (input.category === 'other' && !input.explanation?.trim()) throw new DumpTruckError('Explanation is required when category is Other', 400)

  const [driverThreebId, managerThreebId, businessMeta] = await Promise.all([
    getThreebId(input.driverId), getThreebId(managerId), getBusinessMeta(businessId),
  ])

  // A breakdown may have at most one active classification — supersede any prior one first.
  if (input.breakdownId) {
    const { data: prior } = await fleetServiceClient
      .from('fleet_dt_time_adjustments').select('id').eq('breakdown_id', input.breakdownId).is('superseded_at', null).maybeSingle()
    if (prior) await supersedeRow(prior.id)
  }

  const { data, error } = await fleetServiceClient
    .from('fleet_dt_time_adjustments')
    .insert({
      business_id: businessId, business_threeb_id: businessMeta.threebBizId,
      driver_id: input.driverId, driver_threeb_id: driverThreebId,
      shift_id: input.shiftId, truck_id: input.truckId, job_id: input.jobId, breakdown_id: input.breakdownId,
      work_date: input.workDate, start_time: input.startTime, end_time: input.endTime, duration_minutes: input.durationMinutes,
      category: input.category, explanation: input.explanation.trim(),
      driver_payable: input.driverPayable, payable_hours: input.payableHours ?? null,
      customer_billable: input.customerBillable, billable_hours: input.billableHours ?? null,
      attachment_doc_ids: input.attachmentDocIds ?? [],
      entered_by: managerId, manager_threeb_id: managerThreebId,
    })
    .select('*')
    .single()
  if (error) throw error
  const adjustment = fromRow(data)
  audit.log({ userId: managerId, email, action: 'dump_truck.time_adjustment.create', resource: 'fleet_dt_time_adjustments', resourceId: adjustment.id, after: adjustment, source: 'admin' })
  return adjustment
}

async function supersedeRow(id: string): Promise<void> {
  await fleetServiceClient.from('fleet_dt_time_adjustments').update({ superseded_at: new Date().toISOString() }).eq('id', id)
}

/** Corrects an existing adjustment — inserts a new row (full audit trail via createAdjustment's own insert) and marks the prior one superseded_by the new id. Never mutates the prior row's classification fields. */
export async function reviseAdjustment(
  businessId: string, priorId: string, input: CreateAdjustmentInput, managerId: string, email: string | null,
): Promise<TimeAdjustment> {
  const { data: prior } = await fleetServiceClient.from('fleet_dt_time_adjustments').select('id, business_id, breakdown_id').eq('id', priorId).maybeSingle()
  if (!prior || prior.business_id !== businessId) throw new DumpTruckError('Adjustment not found', 404)

  const next = await createAdjustment(businessId, { ...input, breakdownId: input.breakdownId ?? prior.breakdown_id }, managerId, email)
  await fleetServiceClient.from('fleet_dt_time_adjustments').update({ superseded_at: new Date().toISOString(), superseded_by: next.id }).eq('id', priorId)
  audit.log({ userId: managerId, email, action: 'dump_truck.time_adjustment.revise', resource: 'fleet_dt_time_adjustments', resourceId: next.id, before: prior, after: next, source: 'admin' })
  return next
}

export async function listAdjustmentsForShift(businessId: string, shiftId: string, opts: { includeSuperseded?: boolean } = {}): Promise<TimeAdjustment[]> {
  let q = fleetServiceClient.from('fleet_dt_time_adjustments').select('*').eq('business_id', businessId).eq('shift_id', shiftId)
  if (!opts.includeSuperseded) q = q.is('superseded_at', null)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export interface AdjustmentFilters {
  driverId?: string
  truckId?: string
  jobId?: string
  category?: ManagementAdjustmentCategory
  startDate?: string
  endDate?: string
}

export async function listAdjustmentsForBusiness(businessId: string, filters: AdjustmentFilters = {}): Promise<TimeAdjustment[]> {
  let q = fleetServiceClient.from('fleet_dt_time_adjustments').select('*').eq('business_id', businessId).is('superseded_at', null)
  if (filters.driverId) q = q.eq('driver_id', filters.driverId)
  if (filters.truckId) q = q.eq('truck_id', filters.truckId)
  if (filters.jobId) q = q.eq('job_id', filters.jobId)
  if (filters.category) q = q.eq('category', filters.category)
  if (filters.startDate) q = q.gte('work_date', filters.startDate)
  if (filters.endDate) q = q.lte('work_date', filters.endDate)
  const { data, error } = await q.order('work_date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

/** Full version history for one adjustment lineage (audit view) — walks the superseded_by chain backward from a given row's breakdown/shift+category. */
export async function listAdjustmentHistoryForBreakdown(businessId: string, breakdownId: string): Promise<TimeAdjustment[]> {
  const { data, error } = await fleetServiceClient
    .from('fleet_dt_time_adjustments').select('*').eq('business_id', businessId).eq('breakdown_id', breakdownId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

// ── Time policy settings ────────────────────────────────────────────────

export interface TimePolicySettings {
  businessId: string
  includeReturnToYardInPay: boolean
  includeReturnToYardInBilling: boolean
  includePosttripInPay: boolean
  includePosttripInBilling: boolean
  defaultReferenceHourlyRate: number | null
}

export async function getTimePolicySettings(businessId: string): Promise<TimePolicySettings> {
  const { data: existing } = await fleetServiceClient.from('fleet_dt_time_policy_settings').select('*').eq('business_id', businessId).maybeSingle()
  if (existing) {
    return {
      businessId, includeReturnToYardInPay: existing.include_return_to_yard_in_pay, includeReturnToYardInBilling: existing.include_return_to_yard_in_billing,
      includePosttripInPay: existing.include_posttrip_in_pay, includePosttripInBilling: existing.include_posttrip_in_billing,
      defaultReferenceHourlyRate: existing.default_reference_hourly_rate != null ? Number(existing.default_reference_hourly_rate) : null,
    }
  }
  const { data, error } = await fleetServiceClient.from('fleet_dt_time_policy_settings').insert({ business_id: businessId }).select('*').single()
  if (error) throw error
  return {
    businessId, includeReturnToYardInPay: data.include_return_to_yard_in_pay, includeReturnToYardInBilling: data.include_return_to_yard_in_billing,
    includePosttripInPay: data.include_posttrip_in_pay, includePosttripInBilling: data.include_posttrip_in_billing,
    defaultReferenceHourlyRate: data.default_reference_hourly_rate != null ? Number(data.default_reference_hourly_rate) : null,
  }
}

export async function updateTimePolicySettings(businessId: string, patch: Partial<Omit<TimePolicySettings, 'businessId'>>, userId: string): Promise<TimePolicySettings> {
  await getTimePolicySettings(businessId)
  const dbPatch: Record<string, unknown> = { updated_by: userId }
  if (patch.includeReturnToYardInPay !== undefined) dbPatch.include_return_to_yard_in_pay = patch.includeReturnToYardInPay
  if (patch.includeReturnToYardInBilling !== undefined) dbPatch.include_return_to_yard_in_billing = patch.includeReturnToYardInBilling
  if (patch.includePosttripInPay !== undefined) dbPatch.include_posttrip_in_pay = patch.includePosttripInPay
  if (patch.includePosttripInBilling !== undefined) dbPatch.include_posttrip_in_billing = patch.includePosttripInBilling
  if (patch.defaultReferenceHourlyRate !== undefined) dbPatch.default_reference_hourly_rate = patch.defaultReferenceHourlyRate
  const { data, error } = await fleetServiceClient.from('fleet_dt_time_policy_settings').update(dbPatch).eq('business_id', businessId).select('*').single()
  if (error) throw error
  return {
    businessId, includeReturnToYardInPay: data.include_return_to_yard_in_pay, includeReturnToYardInBilling: data.include_return_to_yard_in_billing,
    includePosttripInPay: data.include_posttrip_in_pay, includePosttripInBilling: data.include_posttrip_in_billing,
    defaultReferenceHourlyRate: data.default_reference_hourly_rate != null ? Number(data.default_reference_hourly_rate) : null,
  }
}

// ── Aggregation: operational records -> ClassifiedSegment[] -> split ───────

/**
 * Builds the classified-segment list for one shift: breakdowns (classified
 * by their linked adjustment if one exists, else the spec's stated default
 * — payable PENDING, billable NO), return-to-yard and post-trip (classified
 * by an explicit adjustment for that shift+category if one exists, else the
 * business's default policy toggle), and any other freeform adjustments
 * recorded against the shift. Never mutates anything — read-only.
 */
export async function buildClassifiedSegmentsForShift(
  businessId: string, shiftId: string, events: TimedEvent[],
): Promise<ClassifiedSegment[]> {
  const [adjustments, breakdowns, settings] = await Promise.all([
    listAdjustmentsForShift(businessId, shiftId),
    listBreakdownsForShift(businessId, shiftId),
    getTimePolicySettings(businessId),
  ])

  const segments: ClassifiedSegment[] = []
  const consumedCategories = new Set<string>()

  // Breakdowns — always their own segment, one per resolved breakdown.
  for (const b of breakdowns) {
    if (!b.endedAt) continue // still open — not yet a completed duration to classify
    const hours = Math.max(0, (new Date(b.endedAt).getTime() - new Date(b.startedAt).getTime()) / 3600000)
    const linkedAdjustment = adjustments.find(a => a.breakdownId === b.id)
    segments.push({
      category: 'breakdown_roadside',
      hours,
      driverPayable: linkedAdjustment?.driverPayable ?? 'pending',
      customerBillable: linkedAdjustment?.customerBillable ?? 'no',
      payableHoursOverride: linkedAdjustment?.payableHours ?? null,
      billableHoursOverride: linkedAdjustment?.billableHours ?? null,
    })
  }

  // Return-to-yard — explicit adjustment for this shift wins; otherwise the business default policy.
  const returnAdjustment = adjustments.find(a => a.category === 'return_to_yard' && !a.breakdownId)
  const returnSeconds = computeReturnToYardSeconds(events)
  if (returnSeconds != null && returnSeconds > 0) {
    consumedCategories.add('return_to_yard')
    segments.push({
      category: 'return_to_yard',
      hours: returnSeconds / 3600,
      driverPayable: returnAdjustment?.driverPayable ?? (settings.includeReturnToYardInPay ? 'yes' : 'no'),
      customerBillable: returnAdjustment?.customerBillable ?? (settings.includeReturnToYardInBilling ? 'yes' : 'no'),
      payableHoursOverride: returnAdjustment?.payableHours ?? null,
      billableHoursOverride: returnAdjustment?.billableHours ?? null,
    })
  }

  // Post-trip — same pattern.
  const posttripAdjustment = adjustments.find(a => a.category === 'posttrip' && !a.breakdownId)
  const posttripSeconds = buildCategoryTimeFromEvents(events).posttripSeconds
  if (posttripSeconds > 0) {
    consumedCategories.add('posttrip')
    segments.push({
      category: 'posttrip',
      hours: posttripSeconds / 3600,
      driverPayable: posttripAdjustment?.driverPayable ?? (settings.includePosttripInPay ? 'yes' : 'no'),
      customerBillable: posttripAdjustment?.customerBillable ?? (settings.includePosttripInBilling ? 'yes' : 'no'),
      payableHoursOverride: posttripAdjustment?.payableHours ?? null,
      billableHoursOverride: posttripAdjustment?.billableHours ?? null,
    })
  }

  // Any other freeform adjustment for this shift not already represented above.
  for (const a of adjustments) {
    if (a.breakdownId) continue // already folded into its breakdown segment
    if ((a.category === 'return_to_yard' || a.category === 'posttrip') && consumedCategories.has(a.category)) continue
    segments.push({
      category: a.category,
      hours: a.durationMinutes / 60,
      driverPayable: a.driverPayable,
      customerBillable: a.customerBillable,
      payableHoursOverride: a.payableHours,
      billableHoursOverride: a.billableHours,
    })
  }

  return segments
}

export interface DriverTimeSummary extends OperationalTimeSplit {
  nonPaidTimeValue: number
  openBreakdown: boolean
}

/** Convenience wrapper for the driver hours view — one shift's full split + opportunity-cost figure. */
export async function buildDriverTimeSummaryForShift(
  businessId: string, shiftId: string, events: TimedEvent[], totalOperationalHours: number, referenceHourlyRate: number,
): Promise<DriverTimeSummary> {
  const [segments, openBreakdown] = await Promise.all([
    buildClassifiedSegmentsForShift(businessId, shiftId, events),
    getOpenBreakdownForShift(businessId, shiftId),
  ])
  const split = computeOperationalTimeSplit(totalOperationalHours, segments)
  return { ...split, nonPaidTimeValue: computeNonPaidTimeValue(split.nonPaidOperationalHours, referenceHourlyRate), openBreakdown: !!openBreakdown }
}
