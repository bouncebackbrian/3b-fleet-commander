/**
 * fleet/dumpTruck/sqcdpCompute.ts — computes real KPI values for the SQCDP
 * monthly review (spec §14) from data that already exists in the app.
 *
 * No new source-of-truth data: fans out to buildBusinessHoursForRange,
 * buildFuelSummaryForBusiness, listDefects/listDefectDispositions,
 * fleet_dt_load_cycles, and fleet_dt_events (delay reason buckets), all
 * already used elsewhere. A KPI whose formula needs data this app doesn't
 * capture yet (billing, incident-preventability classification, training
 * records, customer-issue tracking) is left out of this file entirely —
 * sqcdpMonth() below fills those in as { score: null, displayValue: 'Not
 * tracked yet' } from the catalog, never a fabricated number.
 *
 * Scoring convention (documented once, applied consistently):
 *   - Ratio/percentage KPIs: the raw achieved percentage IS the score
 *     (capped at 100) — status thresholds (green>=90/yellow>=80) apply to
 *     that raw percentage directly, never rescaled against the KPI's
 *     display target.
 *   - "vs prior period" KPIs (fuel efficiency, avoidable delay): score =
 *     (better-direction ratio of current to prior) * 100, capped at 100;
 *     100 when there's no prior-period baseline to compare against.
 *   - Fixed-numeric-target KPIs (safety response time): 100 at/under
 *     target, falling off proportionally as actual exceeds it
 *     (targetVarianceScore).
 */

import { fleetServiceClient } from '@/lib/fleet-service-client'
import { buildBusinessHoursForRange } from './adminHours'
import { buildFuelSummaryForBusiness } from './adminFuel'
import { listDefects, listDefectDispositions } from './incidents'
import { listCorrectiveActions } from './correctiveActions'
import {
  KPI_CATALOG, type KpiResult, type SqcdpCategory, type CategoryScoreResult,
  categoryScore, overallScore, monthRange, previousMonth, ratioScore, targetVarianceScore,
  buildPareto, type ParetoRow, type MonthRange,
} from '@/lib/dumpTruck/sqcdp'
import { groupRecurringIssues, type RecurringIssueDefect } from '@/lib/dumpTruck/recurringIssues'
import { bucketDelaySecondsByReason, type TimedEvent, type RangeSummary } from '@/lib/dumpTruck/hours'

function withinRange(iso: string, range: MonthRange): boolean {
  const d = iso.slice(0, 10)
  return d >= range.start && d <= range.end
}

async function computePretripPosttripCompletion(businessId: string, range: MonthRange): Promise<KpiResult> {
  const { data: shifts } = await fleetServiceClient
    .from('fleet_dt_shifts').select('id').eq('business_id', businessId)
    .gte('clock_in_at', `${range.start}T00:00:00Z`).lte('clock_in_at', `${range.end}T23:59:59.999Z`)
  const shiftIds = (shifts ?? []).map(s => s.id)
  if (shiftIds.length === 0) return { kpiId: 'safety.pretrip_posttrip_completion', score: null, displayValue: 'No shifts' }

  const required = shiftIds.length * 2
  const { data: inspections } = await fleetServiceClient
    .from('fleet_dt_inspections').select('id')
    .in('shift_id', shiftIds).in('inspection_type', ['pretrip', 'posttrip']).eq('status', 'completed')
  const completed = inspections?.length ?? 0
  return { kpiId: 'safety.pretrip_posttrip_completion', score: ratioScore(completed, required), displayValue: `${completed}/${required}` }
}

async function computeDefectEscalationAndResponseTime(
  businessId: string, range: MonthRange,
): Promise<{ escalation: KpiResult; responseTime: KpiResult }> {
  const allDefects = await listDefects(businessId)
  const relevant = allDefects.filter(d =>
    (d.severity === 'safety_critical' || d.severity === 'out_of_service') && withinRange(d.createdAt, range))

  if (relevant.length === 0) {
    return {
      escalation: { kpiId: 'safety.defect_escalation', score: null, displayValue: 'No safety-critical defects this month' },
      responseTime: { kpiId: 'safety.response_time', score: null, displayValue: 'No safety-critical defects this month' },
    }
  }

  let escalated = 0
  const responseMinutes: number[] = []
  for (const d of relevant) {
    const dispositions = await listDefectDispositions(businessId, d.id)
    if (dispositions.length > 0) {
      escalated++
      responseMinutes.push(Math.max(0, (new Date(dispositions[0].createdAt).getTime() - new Date(d.createdAt).getTime()) / 60000))
    }
  }
  const avgResponse = responseMinutes.length > 0 ? responseMinutes.reduce((a, b) => a + b, 0) / responseMinutes.length : null

  return {
    escalation: { kpiId: 'safety.defect_escalation', score: ratioScore(escalated, relevant.length), displayValue: `${escalated}/${relevant.length}` },
    responseTime: {
      kpiId: 'safety.response_time',
      score: avgResponse != null ? targetVarianceScore(avgResponse, 60) : null,
      displayValue: avgResponse != null ? `${Math.round(avgResponse)} min avg` : 'No dispositions recorded yet',
    },
  }
}

async function computeLoadCycleKpis(businessId: string, range: MonthRange): Promise<{ documentCompleteness: KpiResult; statusUpdates: KpiResult }> {
  const { data } = await fleetServiceClient
    .from('fleet_dt_load_cycles')
    .select('ticket_captured_at, pickup_arrive_event_id, pickup_depart_event_id, loading_started_event_id, loading_completed_event_id, dump_arrive_event_id, dump_depart_event_id, unloading_started_event_id, unloading_completed_event_id')
    .eq('business_id', businessId)
    .gte('created_at', `${range.start}T00:00:00Z`).lte('created_at', `${range.end}T23:59:59.999Z`)
  const rows = data ?? []
  if (rows.length === 0) {
    return {
      documentCompleteness: { kpiId: 'quality.document_completeness', score: null, displayValue: 'No load cycles this month' },
      statusUpdates: { kpiId: 'delivery.status_updates', score: null, displayValue: 'No load cycles this month' },
    }
  }
  const withTicket = rows.filter(r => r.ticket_captured_at != null).length
  const fullyClosed = rows.filter(r => [
    r.pickup_arrive_event_id, r.pickup_depart_event_id, r.loading_started_event_id, r.loading_completed_event_id,
    r.dump_arrive_event_id, r.dump_depart_event_id, r.unloading_started_event_id, r.unloading_completed_event_id,
  ].every(v => v != null)).length

  return {
    documentCompleteness: { kpiId: 'quality.document_completeness', score: ratioScore(withTicket, rows.length), displayValue: `${withTicket}/${rows.length}` },
    statusUpdates: { kpiId: 'delivery.status_updates', score: ratioScore(fullyClosed, rows.length), displayValue: `${fullyClosed}/${rows.length}` },
  }
}

async function computeFuelEfficiency(businessId: string, range: MonthRange, priorRange: MonthRange): Promise<KpiResult> {
  const [current, prior] = await Promise.all([
    buildFuelSummaryForBusiness(businessId, { from: range.start, to: range.end }),
    buildFuelSummaryForBusiness(businessId, { from: priorRange.start, to: priorRange.end }),
  ])
  if (current.fleetAvgMpg == null) return { kpiId: 'cost.fuel_efficiency', score: null, displayValue: 'No fuel entries this month' }
  if (prior.fleetAvgMpg == null) return { kpiId: 'cost.fuel_efficiency', score: 100, displayValue: `${current.fleetAvgMpg} MPG (no prior baseline)` }
  const score = Math.round(Math.min(100, (current.fleetAvgMpg / prior.fleetAvgMpg) * 100) * 10) / 10
  return { kpiId: 'cost.fuel_efficiency', score, displayValue: `${current.fleetAvgMpg} MPG (prior: ${prior.fleetAvgMpg})` }
}

async function computeAvoidableDelay(businessId: string, range: MonthRange, priorRange: MonthRange): Promise<KpiResult> {
  const [current, prior] = await Promise.all([
    buildBusinessHoursForRange(businessId, range),
    buildBusinessHoursForRange(businessId, priorRange),
  ])
  const currentDelay = current.businessSummary.totalTrafficDelayHours + current.businessSummary.totalMechanicalDelayHours + current.businessSummary.totalOtherDelayHours
  const priorDelay = prior.businessSummary.totalTrafficDelayHours + prior.businessSummary.totalMechanicalDelayHours + prior.businessSummary.totalOtherDelayHours

  if (current.businessSummary.daysWorked === 0) return { kpiId: 'delivery.avoidable_delay', score: null, displayValue: 'No shifts this month' }
  if (prior.businessSummary.daysWorked === 0 || priorDelay === 0) {
    return { kpiId: 'delivery.avoidable_delay', score: currentDelay === 0 ? 100 : null, displayValue: `${currentDelay.toFixed(1)}h (no prior baseline)` }
  }
  const score = currentDelay === 0 ? 100 : Math.round(Math.min(100, (priorDelay / currentDelay) * 100) * 10) / 10
  return { kpiId: 'delivery.avoidable_delay', score, displayValue: `${currentDelay.toFixed(1)}h (prior: ${priorDelay.toFixed(1)}h)` }
}

function computeTruckUtilization(businessSummary: RangeSummary): KpiResult {
  const clockedHours = businessSummary.totalRegularHours + businessSummary.totalOvertimeHours
  if (clockedHours === 0) return { kpiId: 'delivery.truck_utilization', score: null, displayValue: 'No shifts this month' }
  const utilization = (businessSummary.totalCustodyHours / clockedHours) * 100
  return { kpiId: 'delivery.truck_utilization', score: Math.round(Math.min(100, utilization) * 10) / 10, displayValue: `${utilization.toFixed(1)}%` }
}

function businessDaysInRange(range: MonthRange): number {
  let count = 0
  const d = new Date(`${range.start}T00:00:00Z`)
  const end = new Date(`${range.end}T00:00:00Z`)
  while (d <= end) {
    const day = d.getUTCDay()
    if (day !== 0 && day !== 6) count++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return count
}

function computeAttendanceReliability(range: MonthRange, driverSummaries: { daysWorked: number }[]): KpiResult {
  if (driverSummaries.length === 0) return { kpiId: 'people.attendance_reliability', score: null, displayValue: 'No drivers active this month' }
  const businessDays = businessDaysInRange(range)
  if (businessDays === 0) return { kpiId: 'people.attendance_reliability', score: null, displayValue: '—' }
  const avgDaysWorked = driverSummaries.reduce((s, d) => s + d.daysWorked, 0) / driverSummaries.length
  return {
    kpiId: 'people.attendance_reliability',
    score: Math.round(Math.min(100, (avgDaysWorked / businessDays) * 100) * 10) / 10,
    displayValue: `${avgDaysWorked.toFixed(1)}/${businessDays} weekdays avg`,
  }
}

async function computeActionClosure(businessId: string, range: MonthRange, category?: SqcdpCategory): Promise<KpiResult> {
  const kpiId = category ? 'safety.action_closure' : 'people.action_owner_closure'
  const actions = await listCorrectiveActions(businessId, {})
  const due = actions.filter(a => withinRange(a.dueDate, range) && (!category || a.sqcdpCategory === category))
  if (due.length === 0) return { kpiId, score: null, displayValue: 'No actions due this month' }
  const closedOnTime = due.filter(a => a.status === 'closed' && a.closeDate != null && a.closeDate <= a.dueDate).length
  return { kpiId, score: ratioScore(closedOnTime, due.length), displayValue: `${closedOnTime}/${due.length}` }
}

async function computeDelayParetoBuckets(businessId: string, range: MonthRange): Promise<Record<string, number>> {
  const { data: shifts } = await fleetServiceClient.from('fleet_dt_shifts').select('id').eq('business_id', businessId)
  const shiftIds = (shifts ?? []).map(s => s.id)
  if (shiftIds.length === 0) return {}
  const { data: events } = await fleetServiceClient
    .from('fleet_dt_events').select('event_type, effective_at, notes')
    .in('shift_id', shiftIds).in('event_type', ['delay_started', 'delay_ended'])
    .gte('effective_at', `${range.start}T00:00:00Z`).lte('effective_at', `${range.end}T23:59:59.999Z`)
    .order('effective_at', { ascending: true })
  const timed: TimedEvent[] = (events ?? []).map(e => ({ eventType: e.event_type, effectiveAt: e.effective_at, notes: e.notes }))
  return bucketDelaySecondsByReason(timed)
}

export interface SqcdpMonthlyResult {
  month: string
  range: MonthRange
  kpiResults: KpiResult[]
  categoryScores: Record<SqcdpCategory, CategoryScoreResult>
  overall: number | null
  safetyPareto: ParetoRow[]
  deliveryPareto: ParetoRow[]
}

export async function computeSqcdpMonth(businessId: string, month: string): Promise<SqcdpMonthlyResult> {
  const range = monthRange(month)
  const priorRange = monthRange(previousMonth(month))

  const [hoursResult, defectsRaw] = await Promise.all([
    buildBusinessHoursForRange(businessId, range),
    listDefects(businessId),
  ])

  const [pretripPosttrip, defectStuff, loadCycleStuff, fuelEfficiency, avoidableDelay, safetyActionClosure, peopleActionClosure] = await Promise.all([
    computePretripPosttripCompletion(businessId, range),
    computeDefectEscalationAndResponseTime(businessId, range),
    computeLoadCycleKpis(businessId, range),
    computeFuelEfficiency(businessId, range, priorRange),
    computeAvoidableDelay(businessId, range, priorRange),
    computeActionClosure(businessId, range, 'safety'),
    computeActionClosure(businessId, range),
  ])

  const truckUtilization = computeTruckUtilization(hoursResult.businessSummary)
  const attendance = computeAttendanceReliability(range, hoursResult.driverSummaries)

  const kpiResults: KpiResult[] = [
    pretripPosttrip, defectStuff.escalation, defectStuff.responseTime, safetyActionClosure,
    loadCycleStuff.documentCompleteness, loadCycleStuff.statusUpdates,
    fuelEfficiency, avoidableDelay, truckUtilization, attendance, peopleActionClosure,
  ]

  const computedIds = new Set(kpiResults.map(r => r.kpiId))
  for (const def of KPI_CATALOG) {
    if (!computedIds.has(def.id)) kpiResults.push({ kpiId: def.id, score: null, displayValue: 'Not tracked yet' })
  }

  const categoryScores = {} as Record<SqcdpCategory, CategoryScoreResult>
  for (const cat of ['safety', 'quality', 'cost', 'delivery', 'people'] as SqcdpCategory[]) {
    const catKpiIds = new Set(KPI_CATALOG.filter(k => k.category === cat).map(k => k.id))
    categoryScores[cat] = categoryScore(kpiResults.filter(r => catKpiIds.has(r.kpiId)))
  }

  const overall = overallScore({
    safety: categoryScores.safety.score, quality: categoryScores.quality.score, cost: categoryScores.cost.score,
    delivery: categoryScores.delivery.score, people: categoryScores.people.score,
  })

  const relevantDefects: RecurringIssueDefect[] = defectsRaw
    .filter(d => (d.severity === 'safety_critical' || d.severity === 'out_of_service') && withinRange(d.createdAt, range))
    .map(d => ({ id: d.id, truckId: d.truckId, description: d.description, severity: d.severity, status: d.status, createdAt: d.createdAt, reportedBy: d.reportedBy }))
  const safetyGroups = groupRecurringIssues(relevantDefects)
  const safetyPareto = buildPareto(safetyGroups.map(g => ({ cause: g.category, count: g.totalCount, impact: g.totalCount, impactUnit: 'defects' })))

  const delayBuckets = await computeDelayParetoBuckets(businessId, range)
  const deliveryPareto = buildPareto(
    Object.entries(delayBuckets).map(([reason, seconds]) => ({ cause: reason, count: 1, impact: Math.round(seconds / 60), impactUnit: 'minutes' })),
  )

  return { month, range, kpiResults, categoryScores, overall, safetyPareto, deliveryPareto }
}

export interface SqcdpTrendPoint {
  month: string
  overall: number | null
  categoryScores: Record<SqcdpCategory, number | null>
}

/** Reuses computeSqcdpMonth per month rather than a separate lighter path —
 *  simplest-correct for this fleet's data volume; revisit if trend windows
 *  longer than 12 months become slow. */
export async function computeSqcdpTrend(businessId: string, latestMonth: string, monthsBack: number): Promise<SqcdpTrendPoint[]> {
  const months: string[] = [latestMonth]
  for (let i = 1; i < monthsBack; i++) months.unshift(previousMonth(months[0]))

  const results = await Promise.all(months.map(m => computeSqcdpMonth(businessId, m)))
  return results.map(r => ({
    month: r.month,
    overall: r.overall,
    categoryScores: {
      safety: r.categoryScores.safety.score, quality: r.categoryScores.quality.score, cost: r.categoryScores.cost.score,
      delivery: r.categoryScores.delivery.score, people: r.categoryScores.people.score,
    },
  }))
}
