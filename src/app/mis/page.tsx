'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import { supabase } from '@/lib/supabase'
import { SAMPLE_LOADS, SAMPLE_FUEL, calcMetrics } from '@/lib/store'
import { loadSettings, DEFAULT_SETTINGS, type AppSettings } from '@/lib/settings'
import type { Load, MoveType, LoadStatus, FuelEntry } from '@/types'

type Period = 'week' | 'month' | 'all'

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt   = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })
const fmtM  = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtH  = (h: number) => h < 1 ? `${Math.round(h * 60)}m` : `${h.toFixed(1)}h`
const pct   = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0

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

function filterPeriod<T extends { date?: string; createdAt?: string }>(items: T[], p: Period): T[] {
  if (p === 'all') return items
  const now = new Date()
  const start = p === 'week'
    ? (() => { const d = new Date(now); d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1)); d.setHours(0,0,0,0); return d })()
    : new Date(now.getFullYear(), now.getMonth(), 1)
  return items.filter(i => new Date(i.date || i.createdAt || '') >= start)
}

// ─── load ROI ─────────────────────────────────────────────────────────────────
type LoadROI = {
  load: Load
  estDriveHrs: number
  totalHrs: number
  grossPay: number
  fuelCost: number
  netPay: number
  netPerHour: number
  netPerMile: number
  verdict: 'strong' | 'ok' | 'thin' | 'loss'
  verdictLabel: string
  verdictColor: string
}

function calcROI(l: Load, cfg: AppSettings): LoadROI {
  const miles      = l.dispatchMiles
  const estDriveHrs = miles / 58
  const totalHrs   = estDriveHrs + l.waitHours + (l.detentionHours || 0)
  const grossPay   = l.settlementPay > 0 ? l.settlementPay : miles * l.cpmRate
  const fuelCost   = l.fuelCost > 0 ? l.fuelCost : (miles / cfg.mpg) * cfg.fuelPrice
  const netPay     = grossPay - fuelCost
  const netPerHour = totalHrs > 0 ? netPay / totalHrs : 0
  const netPerMile = miles > 0 ? netPay / miles : 0

  let verdict: LoadROI['verdict'], verdictLabel: string, verdictColor: string
  if (netPerHour >= 50)      { verdict = 'strong'; verdictLabel = '💪 Strong';    verdictColor = 'var(--success)' }
  else if (netPerHour >= 30) { verdict = 'ok';     verdictLabel = '✅ Worth It';   verdictColor = '#4ac4ff' }
  else if (netPerHour >= 15) { verdict = 'thin';   verdictLabel = '⚠ Thin';       verdictColor = 'var(--warn)' }
  else                       { verdict = 'loss';   verdictLabel = '🚫 Not Worth It'; verdictColor = 'var(--error)' }

  return { load: l, estDriveHrs, totalHrs, grossPay, fuelCost, netPay, netPerHour, netPerMile, verdict, verdictLabel, verdictColor }
}

// ─── stat box ─────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, color, size = 'md' }: { label: string; value: string; sub?: string; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  const fs = size === 'lg' ? '1.8rem' : size === 'md' ? '1.3rem' : '1rem'
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      <div style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: fs, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: color || 'var(--text)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '.65rem', color: 'var(--faint)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

// ─── miles bar ────────────────────────────────────────────────────────────────
function MilesBar({ label, value, max, color, note }: { label: string; value: number; max: number; color: string; note?: string }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)' }}>{label}</span>
        <span style={{ fontSize: '.72rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color }}>{fmt(value)} mi {note && <span style={{ fontSize: '.6rem', color: 'var(--faint)', fontWeight: 400 }}>{note}</span>}</span>
      </div>
      <div style={{ height: 10, background: 'var(--surface-off)', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${w}%`, background: color, borderRadius: 5, transition: 'width .6s cubic-bezier(.16,1,.3,1)', boxShadow: `0 0 8px ${color}50` }} />
      </div>
    </div>
  )
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
]

// ─── main ─────────────────────────────────────────────────────────────────────
export default function MIS() {
  const [loads,   setLoads]   = useState<Load[]>([])
  const [fuel,    setFuel]    = useState<FuelEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [cfg,     setCfg]     = useState<AppSettings>(DEFAULT_SETTINGS)
  const [period,  setPeriod]  = useState<Period>('month')

  useEffect(() => { setCfg(loadSettings()) }, [])

  useEffect(() => {
    if (!supabase) {
      setLoads(SAMPLE_LOADS); setFuel(SAMPLE_FUEL); setLoading(false); return
    }
    Promise.all([
      supabase.from('loads').select('*').order('date', { ascending: false }),
      supabase.from('fuel_entries').select('*').order('date', { ascending: false }),
    ]).then(([l, f]) => {
      if (!l.error && l.data) setLoads(l.data.map(loadFromDB))
      if (!f.error && f.data) setFuel(f.data.map(fuelFromDB))
      setLoading(false)
    })
  }, [])

  const fLoads = filterPeriod(loads, period)
  const fFuel  = filterPeriod(fuel,  period)
  const m      = calcMetrics(fLoads)

  const totalFuelCost = fFuel.reduce((a, f) => a + f.totalCost, 0)

  // ── Miles alignment ──────────────────────────────────────────────────────
  const dispatchMi  = m.dispatchMiles
  const actualMi    = m.actualMiles    // ELD miles entered
  const paidMi      = m.paidMiles      // settlement paid on

  const miGap_dispActual = actualMi  > 0 ? dispatchMi - actualMi  : null   // over/under-dispatch
  const miGap_actualPaid = actualMi  > 0 && paidMi > 0 ? actualMi - paidMi : null  // miles not paid
  const miGap_dispPaid   = paidMi   > 0 ? dispatchMi - paidMi : null

  const maxMi = Math.max(dispatchMi, actualMi || 0, paidMi || 0, 1)

  // ── Pay accuracy ─────────────────────────────────────────────────────────
  const expectedPay  = dispatchMi * cfg.cpmHigh
  const settledTotal = fLoads.reduce((a, l) => a + (l.settlementPay || 0), 0)
  const payGap       = settledTotal > 0 ? expectedPay - settledTotal : null
  const payAccuracy  = settledTotal > 0 ? pct(settledTotal, expectedPay) : null

  // ── Net / time ────────────────────────────────────────────────────────────
  const netEst     = expectedPay - totalFuelCost
  const netPerMile = dispatchMi > 0 ? netEst / dispatchMi : 0

  // ── Per-load ROI ─────────────────────────────────────────────────────────
  const rois = fLoads.map(l => calcROI(l, cfg)).sort((a, b) => b.netPerHour - a.netPerHour)

  const strongCount = rois.filter(r => r.verdict === 'strong').length
  const okCount     = rois.filter(r => r.verdict === 'ok').length
  const thinCount   = rois.filter(r => r.verdict === 'thin').length
  const lossCount   = rois.filter(r => r.verdict === 'loss').length

  // ── Total time spent ──────────────────────────────────────────────────────
  const totalDriveHrs  = fLoads.reduce((a, l) => a + l.dispatchMiles / 58, 0)
  const totalWaitHrs   = fLoads.reduce((a, l) => a + l.waitHours, 0)
  const totalTimeHrs   = totalDriveHrs + totalWaitHrs
  const netPerHrEst    = totalTimeHrs > 0 ? netEst / totalTimeHrs : 0

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ loads: fLoads, rois }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `3b-mis-${period}.json`; a.click()
  }

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  // ── Profitability color ───────────────────────────────────────────────────
  const profitPct   = expectedPay > 0 ? Math.round((netEst / expectedPay) * 100) : 0
  const profitColor = profitPct > 60 ? 'var(--success)' : profitPct > 35 ? 'var(--warn)' : 'var(--error)'

  return (
    <>
      <TopBar title="Mileage Intelligence" module="mis" subtitle={`${today} · ${fLoads.length} loads`} onExport={handleExport} />

      <main style={{ padding: '1.2rem', display: 'grid', gap: '1.2rem' }}>

        {/* Period + summary pill */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, gap: 2 }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                style={{ padding: '.4rem .9rem', borderRadius: 7, fontSize: 'var(--text-xs)', fontWeight: 700, border: 'none', cursor: 'pointer', background: period === p.key ? 'var(--surface-2)' : 'transparent', color: period === p.key ? 'var(--primary)' : 'var(--muted)', boxShadow: period === p.key ? '0 1px 4px rgba(0,0,0,.2)' : 'none', transition: 'all .15s' }}>
                {p.label}
              </button>
            ))}
          </div>
          {fLoads.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ padding: '.35rem .85rem', borderRadius: 8, background: `${profitColor}12`, border: `1px solid ${profitColor}30`, fontSize: '.75rem', fontWeight: 900, color: profitColor }}>
                {profitPct}% margin
              </div>
              <div style={{ padding: '.35rem .85rem', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '.75rem', fontWeight: 800, color: netPerHrEst >= 30 ? 'var(--success)' : netPerHrEst >= 15 ? 'var(--warn)' : 'var(--error)' }}>
                ${netPerHrEst.toFixed(0)}/hr effective
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--muted)' }}>Loading intelligence data…</div>
        ) : fLoads.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--muted)', display: 'grid', gap: '.75rem' }}>
            <div style={{ fontSize: '2.5rem' }}>📊</div>
            <div style={{ fontWeight: 800, color: 'var(--text)' }}>No loads in this period</div>
            <Link href="/loads" style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 'var(--text-sm)' }}>Add loads in the Load Log →</Link>
          </div>
        ) : (
          <>
            {/* ── SECTION 1: Miles Alignment ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.3rem 1.4rem', display: 'grid', gap: '1.1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 'var(--text-lg)' }}>Miles Alignment</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>Dispatched → Actual ELD → Paid by settlement</div>
                </div>
                {miGap_dispPaid != null && miGap_dispPaid > 0 && (
                  <div style={{ padding: '.35rem .85rem', borderRadius: 8, background: 'rgba(232,64,0,.08)', border: '1px solid rgba(232,64,0,.2)', fontSize: '.75rem', fontWeight: 800, color: 'var(--error)' }}>
                    ⚠ {fmt(miGap_dispPaid)} miles unaccounted
                  </div>
                )}
              </div>

              {/* Bars */}
              <div style={{ display: 'grid', gap: '.85rem' }}>
                <MilesBar label="Dispatched miles" value={dispatchMi} max={maxMi} color="var(--primary)" note="booked by broker" />
                {actualMi > 0
                  ? <MilesBar label="Actual ELD miles" value={actualMi} max={maxMi} color="#4ac4ff" note="from your ELD" />
                  : <div style={{ padding: '.6rem .9rem', borderRadius: 10, background: 'rgba(245,194,0,.06)', border: '1px solid rgba(245,194,0,.15)', fontSize: '.72rem', color: 'var(--warn)' }}>
                      ⚠ No ELD miles entered — add actual miles in the Load Log for full alignment tracking.
                    </div>
                }
                {paidMi > 0
                  ? <MilesBar label="Paid miles" value={paidMi} max={maxMi} color="var(--success)" note="settlement paid on" />
                  : <div style={{ padding: '.6rem .9rem', borderRadius: 10, background: 'rgba(245,194,0,.06)', border: '1px solid rgba(245,194,0,.15)', fontSize: '.72rem', color: 'var(--warn)' }}>
                      ⚠ No paid miles logged — enter settlement miles in Load Log to track discrepancies.
                    </div>
                }
              </div>

              {/* Gap callouts */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(180px,100%),1fr))', gap: '.7rem' }}>
                {miGap_dispActual != null && (
                  <div style={{ background: Math.abs(miGap_dispActual) > 10 ? 'rgba(232,64,0,.06)' : 'rgba(0,232,176,.04)', border: `1px solid ${Math.abs(miGap_dispActual) > 10 ? 'rgba(232,64,0,.15)' : 'rgba(0,232,176,.12)'}`, borderRadius: 12, padding: '.8rem 1rem' }}>
                    <div style={{ fontSize: '.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 5 }}>Dispatch vs ELD</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: Math.abs(miGap_dispActual) > 10 ? 'var(--error)' : 'var(--success)' }}>
                      {miGap_dispActual > 0 ? '+' : ''}{fmt(miGap_dispActual)} mi
                    </div>
                    <div style={{ fontSize: '.65rem', color: 'var(--faint)', marginTop: 2 }}>
                      {Math.abs(miGap_dispActual) <= 5 ? 'Within tolerance' : miGap_dispActual > 0 ? 'Broker over-booked' : 'You drove further than booked'}
                    </div>
                  </div>
                )}
                {miGap_actualPaid != null && (
                  <div style={{ background: miGap_actualPaid > 5 ? 'rgba(232,64,0,.06)' : 'rgba(0,232,176,.04)', border: `1px solid ${miGap_actualPaid > 5 ? 'rgba(232,64,0,.15)' : 'rgba(0,232,176,.12)'}`, borderRadius: 12, padding: '.8rem 1rem' }}>
                    <div style={{ fontSize: '.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 5 }}>ELD vs Paid</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: miGap_actualPaid > 5 ? 'var(--error)' : 'var(--success)' }}>
                      {fmt(miGap_actualPaid)} mi
                    </div>
                    <div style={{ fontSize: '.65rem', color: 'var(--faint)', marginTop: 2 }}>
                      {miGap_actualPaid > 5 ? `${fmtM(miGap_actualPaid * cfg.cpmHigh)} unpaid at your CPM` : 'Miles match settlement'}
                    </div>
                  </div>
                )}
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '.8rem 1rem' }}>
                  <div style={{ fontSize: '.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 5 }}>Avg miles/load</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{fLoads.length > 0 ? fmt(dispatchMi / fLoads.length) : '—'}</div>
                  <div style={{ fontSize: '.65rem', color: 'var(--faint)', marginTop: 2 }}>across {fLoads.length} loads</div>
                </div>
              </div>
            </div>

            {/* ── SECTION 2: Pay Accuracy ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.3rem 1.4rem', display: 'grid', gap: '1.1rem' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 'var(--text-lg)' }}>Pay Accuracy</div>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>What you should earn vs what you were actually paid</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(160px,100%),1fr))', gap: '.8rem' }}>
                <div style={{ background: 'rgba(0,232,176,.05)', border: '1px solid rgba(0,232,176,.15)', borderRadius: 14, padding: '1rem' }}>
                  <Stat label="Expected pay" value={fmtM(expectedPay)} sub={`${fmt(dispatchMi)} mi × $${cfg.cpmHigh.toFixed(3)}`} color="var(--primary)" size="md" />
                </div>
                <div style={{ background: settledTotal > 0 ? 'rgba(40,192,72,.05)' : 'rgba(245,194,0,.05)', border: `1px solid ${settledTotal > 0 ? 'rgba(40,192,72,.15)' : 'rgba(245,194,0,.15)'}`, borderRadius: 14, padding: '1rem' }}>
                  <Stat label="Settlement received" value={settledTotal > 0 ? fmtM(settledTotal) : '—'} sub={settledTotal === 0 ? 'Enter settlement pay in Load Log' : undefined} color={settledTotal > 0 ? 'var(--success)' : 'var(--warn)'} size="md" />
                </div>
                {payGap != null && (
                  <div style={{ background: payGap > 0 ? 'rgba(232,64,0,.06)' : 'rgba(40,192,72,.05)', border: `1px solid ${payGap > 0 ? 'rgba(232,64,0,.18)' : 'rgba(40,192,72,.15)'}`, borderRadius: 14, padding: '1rem' }}>
                    <Stat label={payGap > 0 ? 'Underpaid by' : 'Overpaid by'} value={fmtM(Math.abs(payGap))} sub={payGap > 0 ? 'Dispute this amount' : 'Positive variance'} color={payGap > 0 ? 'var(--error)' : 'var(--success)'} size="md" />
                  </div>
                )}
                {payAccuracy != null && (
                  <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1rem' }}>
                    <Stat label="Pay accuracy" value={`${payAccuracy}%`} sub={payAccuracy >= 98 ? 'Excellent' : payAccuracy >= 95 ? 'Good' : 'Dispute recommended'} color={payAccuracy >= 98 ? 'var(--success)' : payAccuracy >= 95 ? 'var(--warn)' : 'var(--error)'} size="md" />
                  </div>
                )}
              </div>

              {/* Pay accuracy bar */}
              {payAccuracy != null && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>Settlement accuracy</span>
                    <span style={{ fontSize: '.7rem', fontWeight: 800 }}>{payAccuracy}% of expected</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--surface-off)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, payAccuracy)}%`, background: payAccuracy >= 98 ? 'var(--success)' : payAccuracy >= 95 ? 'var(--warn)' : 'var(--error)', borderRadius: 4, transition: 'width .6s cubic-bezier(.16,1,.3,1)' }} />
                  </div>
                </div>
              )}
            </div>

            {/* ── SECTION 3: Time & Value ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.3rem 1.4rem', display: 'grid', gap: '1.1rem' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 'var(--text-lg)' }}>Time & Value</div>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>Your actual hourly rate — what your time is really worth</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(160px,100%),1fr))', gap: '.8rem' }}>
                {[
                  { label: 'Est. drive time',  value: fmtH(totalDriveHrs),                     sub: `${fmt(dispatchMi)} mi ÷ 58 mph`,           color: '' },
                  { label: 'Wait / detention', value: fmtH(totalWaitHrs),                      sub: 'logged across all loads',                   color: totalWaitHrs > 2 ? 'var(--warn)' : '' },
                  { label: 'Total time spent', value: fmtH(totalTimeHrs),                      sub: 'drive + wait',                              color: '' },
                  { label: 'Est. net pay',     value: fmtM(netEst),                            sub: 'after fuel, before other deductions',       color: netEst > 0 ? 'var(--success)' : 'var(--error)' },
                  { label: 'Net per mile',     value: `$${netPerMile.toFixed(3)}`,             sub: 'after fuel',                                color: netPerMile > 0.35 ? 'var(--success)' : netPerMile > 0.20 ? 'var(--warn)' : 'var(--error)' },
                  { label: 'Net per hour',     value: `$${netPerHrEst.toFixed(2)}/hr`,         sub: 'effective hourly rate',                     color: netPerHrEst >= 50 ? 'var(--success)' : netPerHrEst >= 30 ? 'var(--warn)' : 'var(--error)' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '.85rem' }}>
                    <Stat label={s.label} value={s.value} sub={s.sub} color={s.color || undefined} />
                  </div>
                ))}
              </div>

              {/* Wait cost callout */}
              {totalWaitHrs > 0 && (
                <div style={{ padding: '.75rem 1rem', borderRadius: 12, background: 'rgba(245,194,0,.06)', border: '1px solid rgba(245,194,0,.15)', fontSize: '.75rem', color: 'var(--warn)', lineHeight: 1.6 }}>
                  <strong>⏱ {fmtH(totalWaitHrs)} lost to waiting</strong> — at your effective rate of ${netPerHrEst.toFixed(0)}/hr, that&apos;s roughly <strong>{fmtM(totalWaitHrs * netPerHrEst)}</strong> in potential earnings. Document detention and bill it.
                </div>
              )}
            </div>

            {/* ── SECTION 4: Per-Load ROI ── */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.3rem 1.4rem', display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 'var(--text-lg)' }}>Load ROI — Was It Worth It?</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>Net per hour after fuel — the real score for each load</div>
                </div>
                {/* Verdict summary */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { count: strongCount, label: '💪 Strong', color: 'var(--success)', bg: 'rgba(40,192,72,.08)' },
                    { count: okCount,     label: '✅ OK',     color: '#4ac4ff',         bg: 'rgba(74,196,255,.08)' },
                    { count: thinCount,   label: '⚠ Thin',   color: 'var(--warn)',     bg: 'rgba(245,194,0,.08)' },
                    { count: lossCount,   label: '🚫 Bad',   color: 'var(--error)',    bg: 'rgba(232,64,0,.08)' },
                  ].filter(v => v.count > 0).map(v => (
                    <div key={v.label} style={{ padding: '.25rem .6rem', borderRadius: 6, background: v.bg, fontSize: '.65rem', fontWeight: 800, color: v.color }}>
                      {v.count} {v.label}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gap: '.55rem' }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 80px 80px 80px 90px', gap: '.5rem', padding: '.35rem .7rem', borderRadius: 8, background: 'var(--surface-2)' }}>
                  {['Load / Route', 'Miles', 'Drive', 'Gross', 'Fuel', 'Net/hr', 'Verdict'].map(h => (
                    <div key={h} style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>{h}</div>
                  ))}
                </div>

                {rois.map(r => (
                  <div key={r.load.id} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 80px 80px 80px 90px', gap: '.5rem', padding: '.6rem .7rem', borderRadius: 10, background: r.verdict === 'loss' ? 'rgba(232,64,0,.04)' : r.verdict === 'strong' ? 'rgba(40,192,72,.03)' : 'transparent', border: `1px solid ${r.verdict === 'loss' ? 'rgba(232,64,0,.12)' : r.verdict === 'strong' ? 'rgba(40,192,72,.1)' : 'var(--border)'}`, alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.load.loadNumber || '—'}
                      </div>
                      <div style={{ fontSize: '.62rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.load.origin} → {r.load.destination}
                      </div>
                      {r.load.waitHours > 0 && (
                        <div style={{ fontSize: '.58rem', color: 'var(--warn)', marginTop: 1 }}>⏱ +{r.load.waitHours.toFixed(1)}h wait</div>
                      )}
                    </div>
                    <div style={{ fontSize: '.75rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.load.dispatchMiles)}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtH(r.estDriveHrs)}</div>
                    <div style={{ fontSize: '.75rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--primary)' }}>{fmtM(r.grossPay)}</div>
                    <div style={{ fontSize: '.75rem', fontVariantNumeric: 'tabular-nums', color: 'var(--warn)' }}>{fmtM(r.fuelCost)}</div>
                    <div style={{ fontSize: '.82rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: r.verdictColor }}>${r.netPerHour.toFixed(0)}/hr</div>
                    <div style={{ fontSize: '.65rem', fontWeight: 800, color: r.verdictColor }}>{r.verdictLabel}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '.6rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '.68rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                💡 <strong>ROI thresholds:</strong> 💪 Strong = $50+/hr · ✅ Worth It = $30–50/hr · ⚠ Thin = $15–30/hr · 🚫 Not Worth It = under $15/hr. Drive time estimated at 58 mph avg. Enter actual settlement pay and fuel cost per load for precision.
              </div>
            </div>
          </>
        )}
      </main>
    </>
  )
}
