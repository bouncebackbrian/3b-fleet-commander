'use client'
import { useState, useEffect } from 'react'
import TopBar from '@/components/layout/TopBar'
import KpiCard from '@/components/ui/KpiCard'
import LoadBadge from '@/components/ui/LoadBadge'
import RedFlag from '@/components/ui/RedFlag'
import { supabase } from '@/lib/supabase'
import { SAMPLE_LOADS, SAMPLE_DELAYS, SAMPLE_FUEL, classify, calcMetrics } from '@/lib/store'
import { loadSettings, DEFAULT_SETTINGS, type AppSettings } from '@/lib/settings'
import type { Load, MoveType, LoadStatus, DelayEntry, FuelEntry } from '@/types'

type Period = 'today' | 'week' | 'month' | 'all'

const fmt  = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtM = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadFromDB = (r: any): Load => ({
  id: r.id, date: r.date, loadNumber: r.load_number, bolRef: r.bol_ref ?? undefined,
  dispatcher: r.dispatcher, broker: r.broker ?? undefined, trailer: r.trailer ?? undefined,
  moveType: r.move_type as MoveType, origin: r.origin, destination: r.destination,
  status: 'Complete' as LoadStatus,
  dispatchMiles: Number(r.dispatch_miles) || 0, actualMiles: Number(r.actual_miles) || 0,
  deadheadMiles: Number(r.deadhead_miles) || 0, paidMiles: Number(r.paid_miles) || 0,
  cpmRate: Number(r.cpm_rate) || 0.55, fuelCost: Number(r.fuel_cost) || 0,
  waitHours: Number(r.wait_hours) || 0, detentionHours: Number(r.detention_hours) || 0,
  detentionPay: Number(r.detention_pay) || 0, settlementPay: Number(r.settlement_pay) || 0,
  notes: r.notes ?? undefined, proofSaved: Boolean(r.proof_saved),
  settlementVerified: Boolean(r.settlement_verified),
  createdAt: r.created_at, updatedAt: r.updated_at,
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delayFromDB = (r: any): DelayEntry => ({
  id: r.id, loadNumber: r.load_number, trailer: r.trailer ?? undefined,
  delayType: r.delay_type, location: r.location,
  totalHours: Number(r.total_hours) || 0,
  billable: r.billable as 'Yes' | 'No' | 'Review',
  detentionRate: r.detention_rate ? Number(r.detention_rate) : undefined,
  potentialPay: Number(r.potential_pay) || 0,
  dispatcherNotified: Boolean(r.dispatcher_notified),
  proofSaved: Boolean(r.proof_saved),
  notes: r.notes ?? undefined, createdAt: r.created_at,
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fuelFromDB = (r: any): FuelEntry => ({
  id: r.id, date: r.date, location: r.location,
  fuelType: r.fuel_type as FuelEntry['fuelType'],
  gallons: Number(r.gallons) || 0,
  pricePerGal: r.price_per_gal ? Number(r.price_per_gal) : undefined,
  totalCost: Number(r.total_cost) || 0,
  loadNumber: r.load_number ?? undefined,
  receiptSaved: Boolean(r.receipt_saved),
  notes: r.notes ?? undefined, createdAt: r.created_at,
})

function filterByPeriod<T extends { date?: string; createdAt?: string }>(items: T[], period: Period): T[] {
  if (period === 'all') return items
  const now = new Date()
  if (period === 'today') {
    const today = now.toISOString().slice(0, 10)
    return items.filter(i => (i.date || i.createdAt?.slice(0, 10)) === today)
  }
  if (period === 'week') {
    const day = now.getDay()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
    weekStart.setHours(0, 0, 0, 0)
    return items.filter(i => new Date(i.date || i.createdAt || '') >= weekStart)
  }
  if (period === 'month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    return items.filter(i => new Date(i.date || i.createdAt || '') >= monthStart)
  }
  return items
}

const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all',   label: 'All time' },
]

export default function MIS() {
  const [loads,   setLoads]   = useState<Load[]>([])
  const [delays,  setDelays]  = useState<DelayEntry[]>([])
  const [fuel,    setFuel]    = useState<FuelEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [cfg,     setCfg]     = useState<AppSettings>(DEFAULT_SETTINGS)
  const [period,  setPeriod]  = useState<Period>('week')

  useEffect(() => {
    setCfg(loadSettings())
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoads(SAMPLE_LOADS); setDelays(SAMPLE_DELAYS); setFuel(SAMPLE_FUEL)
      setLoading(false); return
    }
    Promise.all([
      supabase.from('loads').select('*').order('date', { ascending: false }),
      supabase.from('delays').select('*').order('created_at', { ascending: false }),
      supabase.from('fuel_entries').select('*').order('date', { ascending: false }),
    ]).then(([l, d, f]) => {
      if (!l.error && l.data) setLoads(l.data.map(loadFromDB))
      if (!d.error && d.data) setDelays(d.data.map(delayFromDB))
      if (!f.error && f.data) setFuel(f.data.map(fuelFromDB))
      setLoading(false)
    })
  }, [])

  const filteredLoads  = filterByPeriod(loads,  period)
  const filteredFuel   = filterByPeriod(fuel,   period)
  const filteredDelays = filterByPeriod(delays, period)

  const m         = calcMetrics(filteredLoads)
  const totalFuel = filteredFuel.reduce((a, f) => a + f.totalCost, 0)
  const today     = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const flags = [
    ...filteredLoads.filter(l => !l.actualMiles).map(l => `Load ${l.loadNumber}: actual ELD miles not entered — cannot verify settlement.`),
    ...filteredLoads.filter(l => l.waitHours > 0 && !l.detentionPay).map(l => `Load ${l.loadNumber}: ${l.waitHours.toFixed(2)}h wait — detention not documented.`),
    ...filteredDelays.filter(d => d.billable === 'Review').map(d => `Load ${d.loadNumber} — "${d.delayType}" billable status needs a decision.`),
    ...filteredFuel.filter(f => !f.receiptSaved && f.totalCost > 0).map(f => `Fuel at ${f.location}: receipt not saved.`),
    ...filteredLoads.filter(l => !l.settlementVerified && l.settlementPay === 0).map(l => `Load ${l.loadNumber}: settlement not verified.`),
  ]

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ loads, delays, fuel }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = '3b-fleet-export.json'; a.click()
  }

  const profitPct = m.estPay > 0 ? Math.round(((m.estPay - totalFuel) / m.estPay) * 100) : 0
  const profitColor = profitPct > 60 ? 'var(--success)' : profitPct > 35 ? 'var(--warn)' : 'var(--error)'

  return (
    <>
      <TopBar title="Mileage Intelligence" module="mis"
        subtitle={`${today} · ${m.totalLoads} loads${cfg.dispatcher ? ` · ${cfg.dispatcher}` : ''}`}
        onExport={handleExport} />

      <main style={{ padding: '1.4rem', display: 'grid', gap: '1.4rem' }}>

        {/* Period selector */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PERIOD_LABELS.map(({ key, label }) => (
              <button key={key} onClick={() => setPeriod(key)}
                style={{ padding: '.45rem 1rem', borderRadius: 10, border: `1px solid ${period === key ? 'var(--primary)' : 'var(--border)'}`, background: period === key ? 'rgba(0,232,176,.1)' : 'none', color: period === key ? 'var(--primary)' : 'var(--muted)', fontWeight: period === key ? 700 : 500, fontSize: 'var(--text-xs)', cursor: 'pointer', transition: 'all .15s' }}>
                {label}
              </button>
            ))}
          </div>
          {/* Profit summary chip */}
          {m.totalLoads > 0 && (
            <div style={{ padding: '.4rem .9rem', borderRadius: 10, background: `${profitColor}12`, border: `1px solid ${profitColor}30`, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: '.65rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>Net margin</span>
              <span style={{ fontSize: '.9rem', fontWeight: 900, color: profitColor }}>{profitPct}%</span>
            </div>
          )}
        </div>

        {/* KPI grid */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(200px,100%),1fr))', gap: '.9rem' }}>
          <KpiCard label="Dispatch miles"    value={fmt(m.dispatchMiles)}                          note="All booked moves" />
          <KpiCard label="Actual miles"      value={m.actualMiles ? fmt(m.actualMiles) : '—'}      note="Enter ELD miles"          color={m.actualMiles ? undefined : 'warn'} />
          <KpiCard label="Paid miles"        value={m.paidMiles   ? fmt(m.paidMiles)   : '—'}      note="Settlement baseline"      color={m.paidMiles ? undefined : 'warn'} />
          <KpiCard label={`Est. pay @ $${cfg.cpmHigh.toFixed(3)}`} value={fmtM(m.estPay)}         note="Dispatch × CPM"           color="primary" />
          <KpiCard label="Fuel cost"         value={fmtM(totalFuel)}                               note="From fuel log"            color={totalFuel > 0 ? 'warn' : undefined} />
          <KpiCard label="Net (est.)"        value={fmtM(m.estPay - totalFuel)}                    note="Before deductions"        color="success" />
          <KpiCard label="Wait hours"        value={m.waitHours.toFixed(2) + 'h'}                  note="Total drag"               color={m.waitHours > 1 ? 'warn' : undefined} />
          <KpiCard label="Unpaid miles"      value={fmt(m.unpaidMiles)}                            note="Actual − paid"            color={m.unpaidMiles > 25 ? 'error' : undefined} />
        </section>

        {/* Profit bar */}
        {m.totalLoads > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '1rem 1.2rem', display: 'grid', gap: '.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Profitability — {period === 'all' ? 'all time' : period}</span>
              <span style={{ fontSize: '1rem', fontWeight: 900, color: profitColor }}>{profitPct}%</span>
            </div>
            <div style={{ height: 10, background: 'var(--surface-off)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, profitPct))}%`, background: profitColor, borderRadius: 5, transition: 'width .5s cubic-bezier(.16,1,.3,1)', boxShadow: `0 0 8px ${profitColor}50` }} />
            </div>
            <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>
              Net {fmtM(m.estPay - totalFuel)} on {fmtM(m.estPay)} gross · Fuel {fmtM(totalFuel)} · {m.totalLoads} loads
            </div>
          </div>
        )}

        {/* Main content: load table + right panel */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: '1.2rem', alignItems: 'start' }}>

          {/* Load log */}
          <div style={{ display: 'grid', gap: '.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Load log</h2>
              <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{filteredLoads.length} loads</span>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'auto', boxShadow: 'var(--shadow-sm)' }}>
              {loading
                ? <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>
                : filteredLoads.length === 0
                  ? <div style={{ padding: '2.5rem', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>No loads in this period — add one in the Load Log.</div>
                  : (
                    <table>
                      <thead>
                        <tr>
                          {['Load #', 'Move', 'Origin → Dest.', 'Disp. mi', 'Est. pay', 'Fuel', 'Wait h', 'Grade'].map(h => (
                            <th key={h} style={{ padding: '.85rem 1rem', fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLoads.map(l => {
                          const c = classify(l)
                          return (
                            <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '.85rem 1rem', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                                {l.loadNumber}
                                {l.trailer && <div style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 'var(--text-xs)' }}>{l.trailer}</div>}
                              </td>
                              <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-xs)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{l.moveType}</td>
                              <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-sm)', maxWidth: 200 }}>
                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.origin}</div>
                                <div style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>→ {l.destination}</div>
                              </td>
                              <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)' }}>{fmt(l.dispatchMiles)}</td>
                              <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--primary)' }}>{fmtM(l.dispatchMiles * l.cpmRate)}</td>
                              <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)', color: l.fuelCost > 0 ? 'var(--warn)' : 'var(--faint)' }}>{l.fuelCost > 0 ? fmtM(l.fuelCost) : '—'}</td>
                              <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)', color: l.waitHours > 1 ? 'var(--warn)' : 'var(--text)' }}>{l.waitHours || '—'}</td>
                              <td style={{ padding: '.85rem 1rem' }}><LoadBadge label={c.label} color={c.color} /></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'grid', gap: '1rem' }}>

            {/* Red flags */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.2rem', display: 'grid', gap: '.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Red flags</h2>
                {flags.length > 0 && <span style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--error)', padding: '.2rem .5rem', borderRadius: 5, background: 'rgba(232,64,0,.1)' }}>{flags.length}</span>}
              </div>
              {loading
                ? <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading…</p>
                : flags.length === 0
                  ? <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>✅ No flags — all clear.</p>
                  : flags.map((f, i) => <RedFlag key={i} message={f} />)}
            </div>

            {/* Pay analysis */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.2rem', display: 'grid', gap: '.8rem' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Pay analysis</h2>
              {[
                [`@ $${cfg.cpmLow.toFixed(3)} CPM`,   fmtM(m.dispatchMiles * cfg.cpmLow),                    'var(--text)'],
                [`@ $${cfg.cpmHigh.toFixed(3)} CPM`,  fmtM(m.dispatchMiles * cfg.cpmHigh),                   'var(--primary)'],
                ['Fuel (fuel log)',                    '− ' + fmtM(totalFuel),                                'var(--warn)'],
                [`Net @ $${cfg.cpmHigh.toFixed(3)}`,  fmtM(m.dispatchMiles * cfg.cpmHigh - totalFuel),       m.dispatchMiles * cfg.cpmHigh - totalFuel > 0 ? 'var(--success)' : 'var(--error)'],
              ].map(([l, v, col]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '.8rem', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{l}</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)', color: col }}>{v}</strong>
                </div>
              ))}
            </div>

            {/* Delays */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.2rem', display: 'grid', gap: '.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Delays</h2>
                {filteredDelays.length > 0 && <span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>{filteredDelays.length} entries</span>}
              </div>
              {loading
                ? <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading…</p>
                : filteredDelays.length === 0
                  ? <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>No delays in this period.</p>
                  : filteredDelays.slice(0, 5).map(d => (
                    <div key={d.id} style={{ paddingBottom: '.7rem', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 'var(--text-sm)' }}>{d.delayType}</strong>
                        <LoadBadge label={d.billable} color={d.billable === 'Review' ? 'warn' : d.billable === 'Yes' ? 'error' : 'muted'} />
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 3 }}>Load {d.loadNumber} · {d.totalHours ? d.totalHours + 'h' : 'TBD'}</div>
                      {d.notes && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--faint)', marginTop: 2 }}>{d.notes}</div>}
                    </div>
                  ))}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
