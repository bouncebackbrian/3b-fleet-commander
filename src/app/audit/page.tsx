'use client'
import { useState, useEffect } from 'react'
import TopBar from '@/components/layout/TopBar'
import LoadBadge from '@/components/ui/LoadBadge'
import KpiCard from '@/components/ui/KpiCard'
import { supabase } from '@/lib/supabase'
import { SAMPLE_LOADS } from '@/lib/store'
import type { Load, MoveType, LoadStatus } from '@/types'

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtM = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inp: React.CSSProperties = { width: '100%', padding: '.8rem 1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', outline: 'none', fontSize: 'var(--text-sm)' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDB(r: any): Load {
  return {
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
  }
}

type VerifyForm = { paidMiles: string; settlementPay: string; notes: string }

export default function Audit() {
  const [loads, setLoads] = useState<Load[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Load | null>(null)
  const [form, setForm] = useState<VerifyForm>({ paidMiles: '', settlementPay: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!supabase) { setLoads(SAMPLE_LOADS); setLoading(false); return }
    supabase.from('loads').select('*').order('date', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setLoads(data.map(fromDB))
        setLoading(false)
      })
  }, [])

  function openVerify(l: Load) {
    setSelected(l)
    setForm({ paidMiles: l.paidMiles.toString(), settlementPay: l.settlementPay.toString(), notes: l.notes || '' })
  }
  function closePanel() { setSelected(null) }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSaving(true)
    const patch = {
      paid_miles: Number(form.paidMiles) || 0,
      settlement_pay: Number(form.settlementPay) || 0,
      notes: form.notes || null,
      settlement_verified: true,
      updated_at: new Date().toISOString(),
    }
    if (!supabase) {
      setLoads(ls => ls.map(l => l.id === selected.id
        ? { ...l, paidMiles: patch.paid_miles, settlementPay: patch.settlement_pay, notes: form.notes || undefined, settlementVerified: true }
        : l))
      setSaving(false); closePanel(); return
    }
    const { data, error } = await supabase.from('loads').update(patch).eq('id', selected.id).select().single()
    if (!error && data) setLoads(ls => ls.map(l => l.id === selected.id ? fromDB(data) : l))
    setSaving(false); closePanel()
  }

  async function toggleVerified(l: Load) {
    const next = !l.settlementVerified
    if (!supabase) {
      setLoads(ls => ls.map(x => x.id === l.id ? { ...x, settlementVerified: next } : x))
      return
    }
    const { data, error } = await supabase.from('loads')
      .update({ settlement_verified: next, updated_at: new Date().toISOString() })
      .eq('id', l.id).select().single()
    if (!error && data) setLoads(ls => ls.map(x => x.id === l.id ? fromDB(data) : x))
  }

  const unverified = loads.filter(l => !l.settlementVerified)
  const totalGap = loads.reduce((a, l) => a + Math.max(l.dispatchMiles * l.cpmRate - l.settlementPay, 0), 0)
  const totalMissing = loads.reduce((a, l) => a + Math.max(l.actualMiles - l.paidMiles, 0), 0)
  const disputed = loads.filter(l => Math.max(l.dispatchMiles * l.cpmRate - l.settlementPay, 0) > 0)

  // live calc for open panel
  const liveExpected = selected ? selected.dispatchMiles * selected.cpmRate : 0
  const liveGap = selected ? Math.max(liveExpected - (Number(form.settlementPay) || 0), 0) : 0
  const liveMissing = selected ? Math.max(selected.actualMiles - (Number(form.paidMiles) || 0), 0) : 0

  return (
    <>
      <TopBar title="Settlement Audit" module="mis" subtitle="Verify every check — miles in, miles paid, money owed" />
      <main style={{ padding: '1.4rem', display: 'grid', gap: '1.4rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(210px,100%),1fr))', gap: '1rem' }}>
          <KpiCard label="Unverified loads" value={unverified.length.toString()} color={unverified.length > 0 ? 'warn' : undefined} />
          <KpiCard label="Missing miles" value={fmt(totalMissing)} color={totalMissing > 0 ? 'error' : undefined} note="Actual − paid" />
          <KpiCard label="Total pay gap" value={fmtM(totalGap)} color={totalGap > 0 ? 'error' : undefined} note="Expected − settlement" />
          <KpiCard label="Disputed loads" value={disputed.length.toString()} color={disputed.length > 0 ? 'warn' : undefined} />
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'auto', boxShadow: 'var(--shadow-sm)' }}>
          {loading
            ? <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading loads…</div>
            : loads.length === 0
              ? <div style={{ padding: '2.5rem', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>No loads yet. Add loads in the Load Log first.</div>
              : (
                <table>
                  <thead>
                    <tr>{['Date', 'Load #', 'Trailer', 'Disp mi', 'Actual mi', 'Paid mi', 'Missing', 'Expected', 'Settlement', 'Gap', 'Verified', ''].map(h => (
                      <th key={h} style={{ padding: '.85rem 1rem', fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>{loads.map(l => {
                    const expected = l.dispatchMiles * l.cpmRate
                    const gap = Math.max(expected - l.settlementPay, 0)
                    const missing = Math.max(l.actualMiles - l.paidMiles, 0)
                    return (
                      <tr key={l.id} onClick={() => openVerify(l)}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-xs)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{l.date}</td>
                        <td style={{ padding: '.85rem 1rem', fontWeight: 700, fontSize: 'var(--text-sm)' }}>{l.loadNumber}</td>
                        <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{l.trailer || '—'}</td>
                        <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)' }}>{fmt(l.dispatchMiles)}</td>
                        <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)' }}>{l.actualMiles > 0 ? fmt(l.actualMiles) : '—'}</td>
                        <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)' }}>{l.paidMiles > 0 ? fmt(l.paidMiles) : '—'}</td>
                        <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)', color: missing > 0 ? 'var(--error)' : 'var(--success)' }}>
                          {missing > 0 ? fmt(missing) : '✓'}
                        </td>
                        <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)' }}>{fmtM(expected)}</td>
                        <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)' }}>{l.settlementPay > 0 ? fmtM(l.settlementPay) : '—'}</td>
                        <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)', color: gap > 0 ? 'var(--error)' : 'var(--success)' }}>
                          {gap > 0 ? fmtM(gap) : '✓'}
                        </td>
                        <td style={{ padding: '.85rem 1rem' }}>
                          <LoadBadge label={l.settlementVerified ? 'Verified' : 'Pending'} color={l.settlementVerified ? 'success' : 'muted'} />
                        </td>
                        <td style={{ padding: '.85rem 1rem' }}>
                          <button onClick={e => { e.stopPropagation(); toggleVerified(l) }}
                            style={{ padding: '.3rem .7rem', borderRadius: 8, border: '1px solid var(--border)', color: l.settlementVerified ? 'var(--success)' : 'var(--muted)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                            {l.settlementVerified ? 'Unmark' : 'Verify'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              )}
        </div>

        {/* Verify slide-out */}
        {selected && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }} onClick={closePanel}>
            <div style={{ flex: 1, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(3px)' }} />
            <div onClick={e => e.stopPropagation()}
              style={{ width: 'min(440px,100vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', height: '100%', overflow: 'auto', padding: '1.8rem', display: 'grid', gap: '1rem', alignContent: 'start', boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Verify settlement</h2>
                <button onClick={closePanel} style={{ fontSize: '1.2rem', color: 'var(--muted)', lineHeight: 1 }}>x</button>
              </div>

              {/* Load summary */}
              <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '1rem', border: '1px solid var(--border)', display: 'grid', gap: '.4rem' }}>
                <div style={{ fontWeight: 700 }}>{selected.loadNumber} &middot; {selected.date}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{selected.origin} &rarr; {selected.destination}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{selected.moveType} &middot; {fmt(selected.dispatchMiles)} dispatch mi &middot; CPM ${selected.cpmRate}</div>
              </div>

              {/* Live gap calc */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, background: 'var(--surface-2)', borderRadius: 12, padding: '1rem', border: '1px solid var(--border)' }}>
                {([
                  ['Expected', fmtM(liveExpected), 'var(--primary)'],
                  ['Gap', fmtM(liveGap), liveGap > 0 ? 'var(--error)' : 'var(--success)'],
                  ['Missing mi', fmt(liveMissing), liveMissing > 0 ? 'var(--warn)' : 'var(--muted)'],
                ] as [string, string, string][]).map(([label, value, color]) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleVerify} style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={lbl}>Paid miles (from settlement)</label>
                  <input value={form.paidMiles} onChange={e => setForm(f => ({ ...f, paidMiles: e.target.value }))} type="number" step="1" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Settlement pay $</label>
                  <input value={form.settlementPay} onChange={e => setForm(f => ({ ...f, settlementPay: e.target.value }))} type="number" step="0.01" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Dispute notes</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                    style={{ ...inp, resize: 'vertical' }} placeholder="e.g. Missing 47 miles — contacting Trev" />
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={closePanel}
                    style={{ padding: '.8rem 1.4rem', borderRadius: 12, background: 'var(--surface-off)', border: '1px solid var(--border)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={saving}
                    style={{ padding: '.8rem 1.8rem', borderRadius: 12, background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', opacity: saving ? .6 : 1 }}>
                    {saving ? 'Saving…' : 'Save & verify'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
