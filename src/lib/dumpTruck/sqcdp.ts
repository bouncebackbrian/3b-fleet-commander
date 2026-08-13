/**
 * sqcdp.ts — SQCDP KPI catalog + scoring math (spec §14, per the uploaded
 * "SQCDP KPI & Monthly Review Playbook").
 *
 * Pure only — no DB, no fetch. The catalog is a static, versioned-in-git
 * table (not an admin-editable DB table) because the playbook already
 * defines the exact KPI list; a dynamic KPI-definition editor is out of
 * scope for this build. Each entry's `computable` flag is the honest
 * boundary: most Quality/Cost/People sub-KPIs need data this app doesn't
 * capture yet (billing, incident-preventability classification, training
 * records) — those score as "no data" rather than a fabricated number, per
 * spec §20 "No opaque AI score" and this app's own never-fabricate-data rule.
 */

export type SqcdpCategory = 'safety' | 'quality' | 'cost' | 'delivery' | 'people'
export type KpiRole = 'driver' | 'dispatch'
export type KpiDirection = 'higher_is_better' | 'lower_is_better'

export interface KpiDefinition {
  id: string
  category: SqcdpCategory
  role: KpiRole
  nameEn: string
  nameEs: string
  descriptionEn: string
  descriptionEs: string
  target: string
  direction: KpiDirection
  /** Whether fleetKpiCompute.ts (server layer) has a real formula wired to
   *  existing data for this KPI yet. */
  computable: boolean
}

export const CATEGORY_WEIGHT: Record<SqcdpCategory, number> = {
  safety: 0.30, quality: 0.20, cost: 0.20, delivery: 0.20, people: 0.10,
}

export const CATEGORY_LABEL: Record<SqcdpCategory, { en: string; es: string }> = {
  safety: { en: 'Safety', es: 'Seguridad' },
  quality: { en: 'Quality', es: 'Calidad' },
  cost: { en: 'Cost', es: 'Costo' },
  delivery: { en: 'Delivery', es: 'Entrega' },
  people: { en: 'People', es: 'Personas' },
}

export const KPI_CATALOG: KpiDefinition[] = [
  // ── Safety (30%) ────────────────────────────────────────────────────────
  {
    id: 'safety.preventable_incidents', category: 'safety', role: 'driver',
    nameEn: 'Preventable Incidents', nameEs: 'Incidentes Prevenibles',
    descriptionEn: 'Verified preventable incidents per month.', descriptionEs: 'Incidentes prevenibles verificados por mes.',
    target: '0', direction: 'lower_is_better', computable: false,
  },
  {
    id: 'safety.pretrip_posttrip_completion', category: 'safety', role: 'driver',
    nameEn: 'Pre/Post-Trip Completion', nameEs: 'Inspecciones Antes/Después del Viaje',
    descriptionEn: 'Completed required inspections / required inspections.', descriptionEs: 'Inspecciones completadas / requeridas.',
    target: '100%', direction: 'higher_is_better', computable: true,
  },
  {
    id: 'safety.defect_escalation', category: 'safety', role: 'driver',
    nameEn: 'Defect Escalation', nameEs: 'Escalación de Defectos',
    descriptionEn: 'Safety-critical/out-of-service defects with a dispatch disposition recorded.', descriptionEs: 'Defectos críticos con disposición de despacho registrada.',
    target: '100%', direction: 'higher_is_better', computable: true,
  },
  {
    id: 'safety.response_time', category: 'safety', role: 'dispatch',
    nameEn: 'Safety Response Time', nameEs: 'Tiempo de Respuesta de Seguridad',
    descriptionEn: 'Time from defect report to first dispatch disposition.', descriptionEs: 'Tiempo desde el reporte del defecto hasta la primera disposición.',
    target: '< 60 min', direction: 'lower_is_better', computable: true,
  },
  {
    id: 'safety.action_closure', category: 'safety', role: 'dispatch',
    nameEn: 'Safety Action Closure', nameEs: 'Cierre de Acciones de Seguridad',
    descriptionEn: 'Safety corrective actions closed with evidence by due date.', descriptionEs: 'Acciones de seguridad cerradas con evidencia antes de la fecha.',
    target: '>= 95%', direction: 'higher_is_better', computable: true,
  },

  // ── Quality (20%) ───────────────────────────────────────────────────────
  {
    id: 'quality.document_completeness', category: 'quality', role: 'driver',
    nameEn: 'Document Completeness', nameEs: 'Documentación Completa',
    descriptionEn: 'Load cycles with a ticket captured / total load cycles.', descriptionEs: 'Ciclos de carga con boleto / total de ciclos.',
    target: '>= 98%', direction: 'higher_is_better', computable: true,
  },
  {
    id: 'quality.load_destination_accuracy', category: 'quality', role: 'driver',
    nameEn: 'Load/Destination Accuracy', nameEs: 'Exactitud de Carga/Destino',
    descriptionEn: 'Correct load delivered to correct destination/spec.', descriptionEs: 'Carga correcta entregada al destino correcto.',
    target: '100%', direction: 'higher_is_better', computable: false,
  },
  {
    id: 'quality.billing_ready_cycle', category: 'quality', role: 'dispatch',
    nameEn: 'Billing-Ready Cycle', nameEs: 'Ciclo Listo para Facturar',
    descriptionEn: 'Completed jobs billing-ready within target window.', descriptionEs: 'Trabajos completados listos para facturar a tiempo.',
    target: '>= 95%', direction: 'higher_is_better', computable: false,
  },
  {
    id: 'quality.dispatch_order_accuracy', category: 'quality', role: 'dispatch',
    nameEn: 'Dispatch Order Accuracy', nameEs: 'Exactitud de Despacho',
    descriptionEn: 'Assignments without wrong site/customer/truck/rate data.', descriptionEs: 'Asignaciones sin datos incorrectos.',
    target: '>= 99%', direction: 'higher_is_better', computable: false,
  },
  {
    id: 'quality.customer_issues', category: 'quality', role: 'driver',
    nameEn: 'Customer Issues', nameEs: 'Problemas de Cliente',
    descriptionEn: 'Verified quality complaints caused by preventable process errors.', descriptionEs: 'Quejas verificadas por errores de proceso prevenibles.',
    target: '0', direction: 'lower_is_better', computable: false,
  },

  // ── Cost (20%) ──────────────────────────────────────────────────────────
  {
    id: 'cost.fuel_efficiency', category: 'cost', role: 'driver',
    nameEn: 'Fuel Efficiency', nameEs: 'Eficiencia de Combustible',
    descriptionEn: 'Fleet-average MPG vs prior-period baseline.', descriptionEs: 'MPG promedio de flota vs línea base del período anterior.',
    target: 'At/above baseline', direction: 'higher_is_better', computable: true,
  },
  {
    id: 'cost.truck_contribution_margin', category: 'cost', role: 'dispatch',
    nameEn: 'Truck Contribution Margin', nameEs: 'Margen de Contribución del Camión',
    descriptionEn: '(Revenue - tracked direct cost) / revenue.', descriptionEs: '(Ingreso - costo directo) / ingreso.',
    target: 'Target set', direction: 'higher_is_better', computable: false,
  },
  {
    id: 'cost.revenue_capture', category: 'cost', role: 'dispatch',
    nameEn: 'Revenue Capture', nameEs: 'Captura de Ingreso',
    descriptionEn: 'Completed billable work recorded vs expected work.', descriptionEs: 'Trabajo facturable completado registrado vs esperado.',
    target: '100%', direction: 'higher_is_better', computable: false,
  },
  {
    id: 'cost.preventable_damage', category: 'cost', role: 'driver',
    nameEn: 'Preventable Damage Cost', nameEs: 'Costo de Daño Prevenible',
    descriptionEn: 'Verified preventable damage cost.', descriptionEs: 'Costo de daño prevenible verificado.',
    target: '$0', direction: 'lower_is_better', computable: false,
  },
  {
    id: 'cost.expense_documentation', category: 'cost', role: 'driver',
    nameEn: 'Expense Documentation', nameEs: 'Documentación de Gasto',
    descriptionEn: 'Expenses with receipt, truck, and job coding.', descriptionEs: 'Gastos con recibo, camión y código de trabajo.',
    target: '100%', direction: 'higher_is_better', computable: false,
  },

  // ── Delivery (20%) ──────────────────────────────────────────────────────
  {
    id: 'delivery.status_updates', category: 'delivery', role: 'driver',
    nameEn: 'Status Updates', nameEs: 'Actualizaciones de Estado',
    descriptionEn: 'Required arrive/depart/load/unload events captured.', descriptionEs: 'Eventos requeridos de llegada/salida/carga capturados.',
    target: '>= 98%', direction: 'higher_is_better', computable: true,
  },
  {
    id: 'delivery.avoidable_delay', category: 'delivery', role: 'driver',
    nameEn: 'Avoidable Delay', nameEs: 'Retraso Evitable',
    descriptionEn: 'Driver- or dispatch-controlled delay minutes, month over month.', descriptionEs: 'Minutos de retraso controlable por conductor o despacho.',
    target: 'Downtrend', direction: 'lower_is_better', computable: true,
  },
  {
    id: 'delivery.truck_utilization', category: 'delivery', role: 'dispatch',
    nameEn: 'Truck Utilization', nameEs: 'Utilización de Camión',
    descriptionEn: 'Vehicle custody hours / clocked shift hours.', descriptionEs: 'Horas de custodia del vehículo / horas de turno.',
    target: '>= 85%', direction: 'higher_is_better', computable: true,
  },
  {
    id: 'delivery.on_time_arrival', category: 'delivery', role: 'driver',
    nameEn: 'On-Time Arrival', nameEs: 'Llegada a Tiempo',
    descriptionEn: 'Eligible jobs arriving within agreed tolerance.', descriptionEs: 'Trabajos elegibles que llegan dentro de la tolerancia acordada.',
    target: '>= 95%', direction: 'higher_is_better', computable: false,
  },
  {
    id: 'delivery.on_time_dispatch', category: 'delivery', role: 'dispatch',
    nameEn: 'On-Time Dispatch', nameEs: 'Despacho a Tiempo',
    descriptionEn: 'Assignments issued early enough to support the plan.', descriptionEs: 'Asignaciones emitidas con suficiente anticipación.',
    target: '>= 95%', direction: 'higher_is_better', computable: false,
  },

  // ── People (10%) ────────────────────────────────────────────────────────
  {
    id: 'people.attendance_reliability', category: 'people', role: 'driver',
    nameEn: 'Attendance/Reliability', nameEs: 'Asistencia/Confiabilidad',
    descriptionEn: 'Days worked this month.', descriptionEs: 'Días trabajados este mes.',
    target: 'Target set', direction: 'higher_is_better', computable: true,
  },
  {
    id: 'people.action_owner_closure', category: 'people', role: 'dispatch',
    nameEn: 'Action-Owner Closure', nameEs: 'Cierre de Acciones del Responsable',
    descriptionEn: 'Assigned corrective actions closed by due date with evidence.', descriptionEs: 'Acciones correctivas cerradas a tiempo con evidencia.',
    target: '>= 95%', direction: 'higher_is_better', computable: true,
  },
  {
    id: 'people.training_completion', category: 'people', role: 'driver',
    nameEn: 'Training Completion', nameEs: 'Capacitación Completada',
    descriptionEn: 'Assigned training completed by due date.', descriptionEs: 'Capacitación asignada completada a tiempo.',
    target: '100%', direction: 'higher_is_better', computable: false,
  },
  {
    id: 'people.communication_quality', category: 'people', role: 'driver',
    nameEn: 'Communication Quality', nameEs: 'Calidad de Comunicación',
    descriptionEn: 'Required operational updates timely and usable.', descriptionEs: 'Actualizaciones operativas oportunas y útiles.',
    target: '>= 95%', direction: 'higher_is_better', computable: false,
  },
  {
    id: 'people.recognition_improvement', category: 'people', role: 'dispatch',
    nameEn: 'Recognition/Improvement', nameEs: 'Reconocimiento/Mejora',
    descriptionEn: 'Documented useful improvements or recognition.', descriptionEs: 'Mejoras o reconocimientos documentados.',
    target: 'Tracked monthly', direction: 'higher_is_better', computable: false,
  },
]

// ── Scoring ───────────────────────────────────────────────────────────────

export type SqcdpStatus = 'green' | 'yellow' | 'red' | 'no_data'

export function statusForScore(score: number | null): SqcdpStatus {
  if (score == null) return 'no_data'
  if (score >= 90) return 'green'
  if (score >= 80) return 'yellow'
  return 'red'
}

export interface KpiResult {
  kpiId: string
  /** 0-100, or null when the KPI has no data source yet — never fabricated. */
  score: number | null
  /** Human-readable measured value, e.g. "96.4%", "3 incidents", "—". */
  displayValue: string
}

export interface CategoryScoreResult {
  score: number | null
  status: SqcdpStatus
  computableCount: number
  totalCount: number
}

/** Category score = average of computable KPI scores, renormalized over only
 *  the KPIs with a real data source — never treats "no data" as 0 or 100. */
export function categoryScore(results: KpiResult[]): CategoryScoreResult {
  const computable = results.filter(r => r.score != null)
  const totalCount = results.length
  if (computable.length === 0) return { score: null, status: 'no_data', computableCount: 0, totalCount }
  const avg = computable.reduce((s, r) => s + (r.score as number), 0) / computable.length
  const score = Math.round(avg * 10) / 10
  return { score, status: statusForScore(score), computableCount: computable.length, totalCount }
}

/** Overall SQCDP = S(30%)+Q(20%)+C(20%)+D(20%)+P(10%), renormalized over
 *  only categories that produced a score this period. Safety is still the
 *  gate for display purposes — see the UI layer, not this function. */
export function overallScore(categoryScores: Partial<Record<SqcdpCategory, number | null>>): number | null {
  let weightedSum = 0
  let weightUsed = 0
  for (const cat of Object.keys(CATEGORY_WEIGHT) as SqcdpCategory[]) {
    const score = categoryScores[cat]
    if (score == null) continue
    weightedSum += score * CATEGORY_WEIGHT[cat]
    weightUsed += CATEGORY_WEIGHT[cat]
  }
  if (weightUsed === 0) return null
  return Math.round((weightedSum / weightUsed) * 10) / 10
}

// ── Pareto ────────────────────────────────────────────────────────────────

export interface ParetoCauseInput {
  cause: string
  causeEs?: string
  count: number
  impact: number
  impactUnit: string
}

export interface ParetoRow extends ParetoCauseInput {
  rank: number
  percent: number
  cumulativePercent: number
  /** True for the causes making up roughly the first 80% of total impact
   *  (spec §21) — the "vital few" a corrective action should target first. */
  top80: boolean
}

// ── Month helpers ────────────────────────────────────────────────────────
// SQCDP is monthly, not part of the weekly payroll range picker in hours.ts
// — kept separate rather than overloading that module's RangeType.

export interface MonthRange {
  start: string // YYYY-MM-DD, inclusive
  end: string   // YYYY-MM-DD, inclusive
}

/** month is 'YYYY-MM'. */
export function monthRange(month: string): MonthRange {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 0)) // day 0 of next month = last day of this month
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1)) // m is 1-indexed; -2 goes back one month from m-1
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function currentMonthStr(reference: Date = new Date()): string {
  return `${reference.getUTCFullYear()}-${String(reference.getUTCMonth() + 1).padStart(2, '0')}`
}

/** actual/target expressed as a direct percentage score, capped at 100 —
 *  used for higher-is-better ratio KPIs (e.g. completion rate). */
export function ratioScore(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round(Math.min(100, (numerator / denominator) * 100) * 10) / 10
}

/** For lower-is-better KPIs with a numeric target (minutes, hours, dollars):
 *  100 at/under target, falling proportionally as actual exceeds it. */
export function targetVarianceScore(actual: number, target: number): number {
  if (actual <= 0) return 100
  if (target <= 0) return actual === 0 ? 100 : 0
  return Math.round(Math.min(100, (target / actual) * 100) * 10) / 10
}

export function buildPareto(causes: ParetoCauseInput[]): ParetoRow[] {
  const total = causes.reduce((s, c) => s + c.impact, 0)
  const sorted = [...causes].sort((a, b) => b.impact - a.impact)
  let cumulative = 0
  return sorted.map((c, i) => {
    const percent = total > 0 ? (c.impact / total) * 100 : 0
    const cumulativeBefore = cumulative
    cumulative += percent
    return {
      ...c, rank: i + 1,
      percent: Math.round(percent * 10) / 10,
      cumulativePercent: Math.round(cumulative * 10) / 10,
      top80: cumulativeBefore < 80,
    }
  })
}
