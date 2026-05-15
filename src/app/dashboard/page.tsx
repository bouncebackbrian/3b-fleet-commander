'use client'
import { useState, useEffect } from 'react'
import TopBar from '@/components/layout/TopBar'
import KpiCard from '@/components/ui/KpiCard'
import LoadBadge from '@/components/ui/LoadBadge'
import RedFlag from '@/components/ui/RedFlag'
import { supabase } from '@/lib/supabase'
import { SAMPLE_LOADS, SAMPLE_DELAYS, SAMPLE_FUEL, classify, calcMetrics } from '@/lib/store'
import type { Load, MoveType, LoadStatus, DelayEntry, FuelEntry } from '@/types'

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
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

export default function Dashboard() {
  const [loads, setLoads] = useState<Load[]>([])
  const [delays, setDelays] = useState<DelayEntry[]>([])
  const [fuel, setFuel] = useState<FuelEntry[]>([])
  const [loading, setLoading] = useState(true)

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

  const m = calcMetrics(loads)
  const totalFuel = fuel.reduce((a, f) => a + f.totalCost, 0)

  const flags = [
    ...loads.filter(l => !l.actualMiles).map(l => `Load ${l.loadNumber}: actual ELD miles not entered — cannot verify settlement.`),
    ...loads.filter(l => l.waitHours > 0 && !l.detentionPay).map(l => `Load ${l.loadNumber}: ${l.waitHours.toFixed(2)}h wait — detention not documented.`),
    ...delays.filter(d => d.billable === 'Review').map(d => `Load ${d.loadNumber} — "${d.delayType}" billable status needs a decision.`),
    ...fuel.filter(f => !f.receiptSaved && f.totalCost > 0).map(f => `Fuel at ${f.location}: receipt not saved.`),
    ...loads.filter(l => !l.settlementVerified && l.settlementPay === 0).map(l => `Load ${l.loadNumber}: settlement not verified.`),
  ]

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ loads, delays, fuel }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = '3b-fleet-export.json'; a.click()
  }

  return (
    <>
      <TopBar title="Fleet Dashboard" module="mis"
        subtitle={loading ? 'Loading…' : `${today} · ${m.totalLoads} loads · Dispatcher: Trev`}
        onExport={handleExport} />
      <main style={{ padding: '1.4rem', display: 'grid', gap: '1.4rem' }}>
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(210px,100%),1fr))', gap: '1rem' }}>
          <KpiCard label="Dispatch miles" value={fmt(m.dispatchMiles)} note="All booked moves" />
          <KpiCard label="Actual miles" value={m.actualMiles ? fmt(m.actualMiles) : '—'} note="Enter ELD miles" color={m.actualMiles ? undefined : 'warn'} />
          <KpiCard label="Paid miles" value={m.paidMiles ? fmt(m.paidMiles) : '—'} note="Settlement baseline" color={m.paidMiles ? undefined : 'warn'} />
          <KpiCard label="Est. pay @ .55" value={fmtM(m.estPay)} note="Dispatch × CPM" color="primary" />
          <KpiCard label="Fuel cost" value={fmtM(totalFuel)} note="From fuel log" color={totalFuel > 0 ? 'warn' : undefined} />
          <KpiCard label="Net (est.)" value={fmtM(m.estPay - totalFuel)} note="Before deductions" color="success" />
          <KpiCard label="Wait hours" value={m.waitHours.toFixed(2) + 'h'} note="Total drag" color={m.waitHours > 1 ? 'warn' : undefined} />
          <KpiCard label="Unpaid miles" value={fmt(m.unpaidMiles)} note="Actual − paid" color={m.unpaidMiles > 25 ? 'error' : undefined} />
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.4rem', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Load log</h2>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'auto', boxShadow: 'var(--shadow-sm)' }}>
              {loading
                ? <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>
                : loads.length === 0
                  ? <div style={{ padding: '2.5rem', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>No loads yet — add one in the Load Log.</div>
                  : (
                    <table>
                      <thead>
                        <tr>{['Load #', 'Move', 'Origin → Dest.', 'Disp. mi', 'Est. pay', 'Fuel', 'Wait h', 'Grade'].map(h => (
                          <th key={h} style={{ padding: '.85rem 1rem', fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>{loads.map(l => {
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
                              <div style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>&rarr; {l.destination}</div>
                            </td>
                            <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)' }}>{fmt(l.dispatchMiles)}</td>
                            <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--primary)' }}>{fmtM(l.dispatchMiles * l.cpmRate)}</td>
                            <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)', color: l.fuelCost > 0 ? 'var(--warn)' : 'var(--faint)' }}>{l.fuelCost > 0 ? fmtM(l.fuelCost) : '—'}</td>
                            <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)', color: l.waitHours > 1 ? 'var(--warn)' : 'var(--text)' }}>{l.waitHours || '—'}</td>
                            <td style={{ padding: '.85rem 1rem' }}><LoadBadge label={c.label} color={c.color} /></td>
                          </tr>
                        )
                      })}</tbody>
                    </table>
                  )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.2rem', display: 'grid', gap: '.9rem' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Red flags</h2>
              {loading
                ? <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading…</p>
                : flags.length === 0
                  ? <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>No flags — all clear.</p>
                  : flags.map((f, i) => <RedFlag key={i} message={f} />)}
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.2rem', display: 'grid', gap: '.8rem' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Pay analysis</h2>
              {[
                ['@ $0.50 CPM', fmtM(m.dispatchMiles * 0.50)],
                ['@ $0.55 CPM', fmtM(m.dispatchMiles * 0.55)],
                ['Fuel (fuel log)', '− ' + fmtM(totalFuel)],
                ['Net @ .55', fmtM(m.dispatchMiles * 0.55 - totalFuel)],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '.8rem', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{l}</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)' }}>{v}</strong>
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.2rem', display: 'grid', gap: '.75rem' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Delays</h2>
              {loading
                ? <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading…</p>
                : delays.length === 0
                  ? <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>No delays logged.</p>
                  : delays.slice(0, 5).map(d => (
                    <div key={d.id} style={{ paddingBottom: '.75rem', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 'var(--text-sm)' }}>{d.delayType}</strong>
                        <LoadBadge label={d.billable} color={d.billable === 'Review' ? 'warn' : d.billable === 'Yes' ? 'error' : 'muted'} />
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 3 }}>Load {d.loadNumber} &middot; {d.totalHours ? d.totalHours + 'h' : 'TBD'}</div>
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
