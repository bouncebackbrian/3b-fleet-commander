'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { KPI_CATALOG, CATEGORY_LABEL, CATEGORY_WEIGHT, currentMonthStr, previousMonth, type SqcdpCategory, type SqcdpStatus } from '@/lib/dumpTruck/sqcdp'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.55rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }
const btnStyle: React.CSSProperties = { padding: '.55rem .9rem', borderRadius: 10, background: 'var(--primary)', color: '#04140f', fontWeight: 800, fontSize: '.82rem' }
const btnSecondaryStyle: React.CSSProperties = { padding: '.55rem .9rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 700, fontSize: '.82rem' }

// Status colors reuse the app's existing tokens (dataviz skill: substitute your
// own design system's values, don't invent a parallel palette) — never color alone,
// every status also carries an icon + label.
const STATUS_COLOR: Record<SqcdpStatus, string> = {
  green: 'var(--success)', yellow: 'var(--warn)', red: 'var(--error)', no_data: 'var(--muted)',
}
const STATUS_ICON: Record<SqcdpStatus, string> = { green: '🟢', yellow: '🟡', red: '🔴', no_data: '⚪' }
const STATUS_LABEL: Record<SqcdpStatus, string> = { green: 'GREEN', yellow: 'YELLOW', red: 'RED', no_data: 'NO DATA' }

interface KpiResultDTO { kpiId: string; score: number | null; displayValue: string }
interface CategoryScoreDTO { score: number | null; status: SqcdpStatus; computableCount: number; totalCount: number }
interface ParetoRowDTO { cause: string; count: number; impact: number; impactUnit: string; rank: number; percent: number; cumulativePercent: number; top80: boolean }
interface SqcdpReviewDTO {
  month: string
  kpiResults: KpiResultDTO[]
  categoryScores: Record<SqcdpCategory, CategoryScoreDTO>
  overall: number | null
  safetyPareto: ParetoRowDTO[]
  deliveryPareto: ParetoRowDTO[]
}
interface TrendPointDTO { month: string; overall: number | null; categoryScores: Record<SqcdpCategory, number | null> }

interface DriverOption { userId: string; name: string; threebId: string | null }

type CorrectiveActionStatus = 'open' | 'in_progress' | 'blocked' | 'ready_to_verify' | 'closed'
interface CorrectiveActionDTO {
  id: string; month: string; sqcdpCategory: SqcdpCategory; sourceKpi: string | null; sourceParetoCause: string | null
  problemEn: string; problemEs: string | null; rootCause: string | null; actionEn: string; actionEs: string | null
  ownerId: string; supportPersonIds: string[]; priority: 'low' | 'medium' | 'high'; dueDate: string; status: CorrectiveActionStatus
  expectedResult: string | null; verificationMethod: string | null; evidence: string | null; verifiedBy: string | null; closeDate: string | null
}

const CATEGORIES: SqcdpCategory[] = ['safety', 'quality', 'cost', 'delivery', 'people']
const STATUS_FLOW: CorrectiveActionStatus[] = ['open', 'in_progress', 'blocked', 'ready_to_verify', 'closed']
const STATUS_FLOW_LABEL: Record<CorrectiveActionStatus, string> = {
  open: 'Open', in_progress: 'In Progress', blocked: 'Blocked', ready_to_verify: 'Ready to Verify', closed: 'Closed',
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/**
 * SQCDP Monthly Review (spec §14/§24) — Safety/Quality/Cost/Delivery/People
 * scorecard, trend, Safety+Delivery Pareto (the two categories with a real
 * data source today), and the corrective action register. Every KPI shows
 * either a real computed score or an explicit "not tracked yet" — never a
 * fabricated number (see sqcdpCompute.ts's module doc for exactly which
 * KPIs are real today and which formulas back them).
 */
export default function SqcdpReviewPage() {
  const [month, setMonth] = useState(currentMonthStr())
  const [review, setReview] = useState<SqcdpReviewDTO | null>(null)
  const [trend, setTrend] = useState<TrendPointDTO[]>([])
  const [actions, setActions] = useState<CorrectiveActionDTO[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showActionForm, setShowActionForm] = useState<{ category: SqcdpCategory; sourceKpi?: string; sourceCause?: string } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    Promise.all([
      fetch(`/api/fleet/dump-truck/admin/sqcdp?month=${month}&trendMonths=6`).then(r => r.json()),
      fetch(`/api/fleet/dump-truck/admin/corrective-actions?month=${month}`).then(r => r.json()),
      fetch('/api/fleet/dump-truck/drivers').then(r => r.json()),
    ]).then(([sqcdp, correctiveActions, driversRes]) => {
      if (sqcdp.error) { setLoadError(`Scorecard: ${sqcdp.error}`); return }
      setReview(sqcdp.review); setTrend(sqcdp.trend ?? [])
      setActions(correctiveActions.actions ?? [])
      setDrivers(driversRes.drivers ?? [])
    }).catch(err => {
      setLoadError(err instanceof Error ? err.message : 'Could not load this page — check your connection and try again')
    }).finally(() => setLoading(false))
  }, [month])
  useEffect(load, [load])

  const driverName = (id: string) => drivers.find(d => d.userId === id)?.name ?? '—'
  const kpiById = (id: string) => KPI_CATALOG.find(k => k.id === id)

  const updateActionStatus = async (id: string, status: CorrectiveActionStatus) => {
    try {
      const res = await fetch(`/api/fleet/dump-truck/admin/corrective-actions/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not update action')
      toast.success(`Marked ${STATUS_FLOW_LABEL[status]}`)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update action')
    }
  }

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>SQCDP Monthly Review</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>
          Safety 30% · Quality 20% · Cost 20% · Delivery 20% · People 10%. GREEN 90-100, YELLOW 80-89, RED below 80. Safety is the gate.{' '}
          <Link href="/admin/dump-truck" style={{ color: 'var(--primary)', fontWeight: 700 }}>← Back to Dump Truck Setup</Link>
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button style={btnSecondaryStyle} onClick={() => setMonth(previousMonth(month))}>← {monthLabel(previousMonth(month))}</button>
        <div style={{ fontWeight: 800, fontSize: '1rem', minWidth: 160, textAlign: 'center' }}>{monthLabel(month)}</div>
        <button style={btnSecondaryStyle} disabled={month >= currentMonthStr()} onClick={() => setMonth(nextMonth(month))}>
          {monthLabel(nextMonth(month))} →
        </button>
      </div>

      {loading && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Loading…</div>}

      {!loading && loadError && (
        <div style={{ ...cardStyle, border: '1px solid var(--error)', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
          <div style={{ fontWeight: 800, color: 'var(--error)' }}>Couldn&apos;t load this month&apos;s review</div>
          <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{loadError}</div>
          <button style={{ ...btnSecondaryStyle, alignSelf: 'flex-start' }} onClick={load}>Try again</button>
        </div>
      )}

      {!loading && !loadError && review && (
        <>
          <OverallCard overall={review.overall} categoryScores={review.categoryScores} />
          <TrendCard trend={trend} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {CATEGORIES.map(cat => (
              <CategoryCard
                key={cat} category={cat} score={review.categoryScores[cat]}
                kpiResults={review.kpiResults.filter(r => kpiById(r.kpiId)?.category === cat)}
                onRaiseAction={(kpiId) => setShowActionForm({ category: cat, sourceKpi: kpiId })}
              />
            ))}
          </div>

          <ParetoCard title="Safety Pareto" subtitle="Safety-critical / out-of-service defects, by category" rows={review.safetyPareto} unit="defects"
            onRaiseAction={cause => setShowActionForm({ category: 'safety', sourceCause: cause })} />
          <ParetoCard title="Delivery Pareto" subtitle="Delay minutes by reported reason" rows={review.deliveryPareto} unit="minutes"
            onRaiseAction={cause => setShowActionForm({ category: 'delivery', sourceCause: cause })} />
          <EmptyParetoCard title="Quality Pareto" reason="No document-error or destination-accuracy tracking source yet." />
          <EmptyParetoCard title="Cost Pareto" reason="No billing/revenue or expense-category tracking source yet." />
          <EmptyParetoCard title="People Pareto" reason="No training/communication tracking source yet." />

          <CorrectiveActionsCard
            actions={actions} drivers={drivers} month={month} driverName={driverName}
            onStatusChange={updateActionStatus} onCreated={load}
            showForm={showActionForm} onOpenForm={setShowActionForm} onCloseForm={() => setShowActionForm(null)}
          />

          <div style={cardStyle}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.5rem' }}>Incentive Preview</h2>
            <p style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
              Not implemented — no incentive rules/results engine exists yet (spec §12/§13). Driver compensation today is the
              hourly/per-mile pay policy on the Dump Truck Setup page, unrelated to SQCDP scoring.
            </p>
          </div>
        </>
      )}

      <ToastContainer />
    </div>
  )
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function OverallCard({ overall, categoryScores }: { overall: number | null; categoryScores: Record<SqcdpCategory, CategoryScoreDTO> }) {
  const status = overall == null ? 'no_data' : overall >= 90 ? 'green' : overall >= 80 ? 'yellow' : 'red'
  const safetyRed = categoryScores.safety.status === 'red'
  return (
    <div style={{ ...cardStyle, border: `2px solid ${STATUS_COLOR[status as SqcdpStatus]}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const }}>Fleet SQCDP Score</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: '2.4rem', fontWeight: 900 }}>{overall != null ? overall.toFixed(1) : '—'}</span>
            <span style={{ fontWeight: 800, color: STATUS_COLOR[status as SqcdpStatus] }}>{STATUS_ICON[status as SqcdpStatus]} {STATUS_LABEL[status as SqcdpStatus]}</span>
          </div>
        </div>
        {safetyRed && (
          <div style={{ padding: '.6rem .9rem', borderRadius: 10, background: 'rgba(220,38,38,.1)', border: '1px solid var(--error)', color: 'var(--error)', fontWeight: 700, fontSize: '.8rem', maxWidth: 320 }}>
            🚨 Safety is RED — this is the gate. Review Safety Pareto and open a corrective action before anything else.
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => (
          <div key={cat} style={{ fontSize: '.82rem' }}>
            <span style={{ color: 'var(--muted)' }}>{CATEGORY_LABEL[cat].en} ({Math.round(CATEGORY_WEIGHT[cat] * 100)}%)</span>{' '}
            <span style={{ fontWeight: 800, color: STATUS_COLOR[categoryScores[cat].status] }}>
              {STATUS_ICON[categoryScores[cat].status]} {categoryScores[cat].score != null ? categoryScores[cat].score!.toFixed(0) : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TrendCard({ trend }: { trend: TrendPointDTO[] }) {
  if (trend.length === 0) return null
  const w = 100 / trend.length
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.25rem' }}>Overall Trend</h2>
      <p style={{ color: 'var(--muted)', fontSize: '.78rem', marginBottom: '.75rem' }}>Fleet SQCDP score, last {trend.length} months. Green/yellow/red bands mark the same 90/80 thresholds as the scorecard.</p>
      <div style={{ position: 'relative', height: 140, borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(40,192,72,.12) 0%, rgba(40,192,72,.12) 10%, rgba(245,194,0,.12) 10%, rgba(245,194,0,.12) 20%, rgba(232,64,0,.12) 20%, rgba(232,64,0,.12) 100%)' }} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {trend.length > 1 && (
            <polyline
              fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke"
              points={trend.map((p, i) => `${i * w + w / 2},${p.overall != null ? 100 - p.overall : 100}`).join(' ')}
            />
          )}
          {trend.map((p, i) => p.overall != null && (
            <circle key={p.month} cx={i * w + w / 2} cy={100 - p.overall} r="1.6" fill="var(--primary)" />
          ))}
        </svg>
      </div>
      <div style={{ display: 'flex', marginTop: 6 }}>
        {trend.map(p => (
          <div key={p.month} style={{ flex: 1, textAlign: 'center', fontSize: '.68rem', color: 'var(--muted)' }}>
            {p.month.slice(5)}<br /><strong style={{ color: 'var(--text)' }}>{p.overall != null ? p.overall.toFixed(0) : '—'}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function CategoryCard({ category, score, kpiResults, onRaiseAction }: {
  category: SqcdpCategory; score: CategoryScoreDTO; kpiResults: KpiResultDTO[]; onRaiseAction: (kpiId: string) => void
}) {
  return (
    <div style={{ ...cardStyle, borderLeft: `4px solid ${STATUS_COLOR[score.status]}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>{CATEGORY_LABEL[category].en} / {CATEGORY_LABEL[category].es}</h3>
        <span style={{ fontWeight: 900, color: STATUS_COLOR[score.status] }}>{STATUS_ICON[score.status]} {score.score != null ? score.score.toFixed(0) : '—'}</span>
      </div>
      <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: '.6rem' }}>
        {score.computableCount} of {score.totalCount} KPIs tracked
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {kpiResults.map(r => {
          const def = KPI_CATALOG.find(k => k.id === r.kpiId)
          if (!def) return null
          const kpiStatus: SqcdpStatus = r.score == null ? 'no_data' : r.score >= 90 ? 'green' : r.score >= 80 ? 'yellow' : 'red'
          return (
            <div key={r.kpiId} style={{ fontSize: '.78rem', display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{def.nameEn}</div>
                <div style={{ color: 'var(--muted)' }}>{r.displayValue} · target {def.target}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ color: STATUS_COLOR[kpiStatus] }}>{STATUS_ICON[kpiStatus]}</span>
                {(kpiStatus === 'red') && (
                  <button onClick={() => onRaiseAction(r.kpiId)} title="Raise a corrective action" style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '.72rem' }}>+ Action</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ParetoCard({ title, subtitle, rows, unit, onRaiseAction }: {
  title: string; subtitle: string; rows: ParetoRowDTO[]; unit: string; onRaiseAction: (cause: string) => void
}) {
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.15rem' }}>{title}</h2>
      <p style={{ color: 'var(--muted)', fontSize: '.78rem', marginBottom: '.85rem' }}>{subtitle}</p>
      {rows.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No events this month.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(row => (
          <div key={row.cause}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: 3 }}>
              <span style={{ fontWeight: row.top80 ? 800 : 600 }}>
                #{row.rank} {row.cause.charAt(0).toUpperCase() + row.cause.slice(1)}
                {row.top80 && <span style={{ marginLeft: 6, fontSize: '.68rem', color: 'var(--warn)', fontWeight: 800 }}>TOP 80%</span>}
              </span>
              <span style={{ color: 'var(--muted)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                {row.impact} {unit} ({row.percent}%, cum. {row.cumulativePercent}%)
                <button onClick={() => onRaiseAction(row.cause)} title="Raise a corrective action" style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '.72rem' }}>+ Action</button>
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${row.percent}%`, borderRadius: 4, background: row.top80 ? 'var(--primary)' : 'var(--muted)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyParetoCard({ title, reason }: { title: string; reason: string }) {
  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.4rem' }}>{title}</h2>
      <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>{reason}</div>
    </div>
  )
}

function CorrectiveActionsCard({ actions, drivers, month, driverName, onStatusChange, onCreated, showForm, onOpenForm, onCloseForm }: {
  actions: CorrectiveActionDTO[]; drivers: DriverOption[]; month: string; driverName: (id: string) => string
  onStatusChange: (id: string, status: CorrectiveActionStatus) => void; onCreated: () => void
  showForm: { category: SqcdpCategory; sourceKpi?: string; sourceCause?: string } | null
  onOpenForm: (v: { category: SqcdpCategory }) => void; onCloseForm: () => void
}) {
  const overdue = actions.filter(a => a.status !== 'closed' && a.dueDate < new Date().toISOString().slice(0, 10))

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
          Corrective Action Register {overdue.length > 0 && <span style={{ color: 'var(--error)' }}>({overdue.length} overdue)</span>}
        </h2>
        <button style={btnStyle} onClick={() => onOpenForm({ category: 'safety' })}>+ New Action</button>
      </div>

      {showForm && (
        <NewActionForm month={month} drivers={drivers} initial={showForm} onClose={onCloseForm} onCreated={() => { onCloseForm(); onCreated() }} />
      )}

      {actions.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No corrective actions this month.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: showForm ? 12 : 0 }}>
        {actions.map(a => (
          <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: '.78rem', textTransform: 'uppercase' as const, color: 'var(--muted)' }}>{CATEGORY_LABEL[a.sqcdpCategory].en}</span>
                {' · '}<span style={{ fontWeight: 700 }}>{a.problemEn}</span>
              </div>
              <span style={{ fontSize: '.72rem', color: a.dueDate < new Date().toISOString().slice(0, 10) && a.status !== 'closed' ? 'var(--error)' : 'var(--muted)', fontWeight: 700 }}>
                Due {a.dueDate}
              </span>
            </div>
            <div style={{ fontSize: '.82rem', margin: '.4rem 0' }}>{a.actionEn}</div>
            <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', fontSize: '.78rem', color: 'var(--muted)' }}>
              <span>Owner: <strong style={{ color: 'var(--text)' }}>{driverName(a.ownerId)}</strong></span>
              <span>Priority: <strong style={{ color: 'var(--text)' }}>{a.priority}</strong></span>
              {a.sourceKpi && <span>Source: <strong style={{ color: 'var(--text)' }}>{a.sourceKpi}</strong></span>}
              {a.sourceParetoCause && <span>Cause: <strong style={{ color: 'var(--text)' }}>{a.sourceParetoCause}</strong></span>}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {STATUS_FLOW.map(s => (
                <button
                  key={s} onClick={() => onStatusChange(a.id, s)} disabled={a.status === s}
                  style={{
                    padding: '.3rem .6rem', borderRadius: 8, fontSize: '.72rem', fontWeight: 700,
                    background: a.status === s ? 'var(--primary)' : 'var(--surface-2)', color: a.status === s ? '#04140f' : 'var(--text)',
                    border: '1px solid var(--border)', opacity: a.status === s ? 1 : .85,
                  }}
                >
                  {STATUS_FLOW_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function NewActionForm({ month, drivers, initial, onClose, onCreated }: {
  month: string; drivers: DriverOption[]; initial: { category: SqcdpCategory; sourceKpi?: string; sourceCause?: string }
  onClose: () => void; onCreated: () => void
}) {
  const [category, setCategory] = useState<SqcdpCategory>(initial.category)
  const [problemEn, setProblemEn] = useState(initial.sourceCause ? `Recurring cause: ${initial.sourceCause}` : '')
  const [actionEn, setActionEn] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!problemEn.trim() || !actionEn.trim() || !ownerId || !dueDate) { toast.error('Problem, action, owner, and due date are required'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/admin/corrective-actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month, sqcdpCategory: category, problemEn, actionEn, ownerId, priority, dueDate,
          sourceKpi: initial.sourceKpi ?? null, sourceParetoCause: initial.sourceCause ?? null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not create action')
      toast.success('Corrective action created')
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create action')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--primary)', borderRadius: 10, padding: '1rem', marginBottom: '.75rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        <label style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)' }}>
          Category
          <select style={{ ...inputStyle, width: '100%', marginTop: 4 }} value={category} onChange={e => setCategory(e.target.value as SqcdpCategory)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c].en}</option>)}
          </select>
        </label>
        <label style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)' }}>
          Owner (one named person — required)
          <select style={{ ...inputStyle, width: '100%', marginTop: 4 }} value={ownerId} onChange={e => setOwnerId(e.target.value)}>
            <option value="">Select…</option>
            {drivers.map(d => <option key={d.userId} value={d.userId}>{d.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)' }}>
          Priority
          <select style={{ ...inputStyle, width: '100%', marginTop: 4 }} value={priority} onChange={e => setPriority(e.target.value as 'low' | 'medium' | 'high')}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
        </label>
        <label style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)' }}>
          Due Date
          <input type="date" style={{ ...inputStyle, width: '100%', marginTop: 4 }} value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </label>
      </div>
      <label style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)' }}>
        Problem
        <textarea style={{ ...inputStyle, width: '100%', marginTop: 4, minHeight: 50 }} value={problemEn} onChange={e => setProblemEn(e.target.value)} />
      </label>
      <label style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)' }}>
        Corrective Action
        <textarea style={{ ...inputStyle, width: '100%', marginTop: 4, minHeight: 50 }} value={actionEn} onChange={e => setActionEn(e.target.value)} />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ ...btnStyle, opacity: busy ? .6 : 1 }} disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Create Action'}</button>
        <button style={btnSecondaryStyle} onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
