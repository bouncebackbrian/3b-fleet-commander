'use client'
import { useState, useEffect } from 'react'
import TopBar from '@/components/layout/TopBar'
import LoadBadge from '@/components/ui/LoadBadge'
import KpiCard from '@/components/ui/KpiCard'
import { SAMPLE_LOADS } from '@/lib/store'
import type { Load, LoadStatus } from '@/types'

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtM = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inp: React.CSSProperties = { width: '100%', padding: '.8rem 1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', outline: 'none', fontSize: 'var(--text-sm)' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }


type Verdict = 'SHORT' | 'PAID' | 'OVERPAID' | 'MISSING DATA'
function verdict(l: Load): Verdict {
  if (!l.settlementPay && !l.paidMiles) return 'MISSING DATA'
  const expected = l.dispatchMiles * l.cpmRate
  const gap = expected - l.settlementPay
  if (gap > 1) return 'SHORT'
  if (gap < -1) return 'OVERPAID'
  return 'PAID'
}
const verdictColor: Record<Verdict, string> = { SHORT: 'error', PAID: 'success', OVERPAID: 'primary', 'MISSING DATA': 'warn' }

function buildDisputeScript(l: Load): string {
  const expected = l.dispatchMiles * l.cpmRate
  const gap = expected - l.settlementPay
  const missingMi = Math.max(l.actualMiles - l.paidMiles, 0)
  return `Hi Trev,

Reviewing load #${l.loadNumber} (${l.date}):
- Route: ${l.origin} → ${l.destination}
- Dispatch miles: ${l.dispatchMiles} mi @ $${l.cpmRate}/mi = ${fmtM(expected)} expected
- Settlement received: ${fmtM(l.settlementPay)}
- Gap: ${fmtM(gap)}${missingMi > 0 ? `\n- Missing miles: ${fmt(missingMi)} (actual ${fmt(l.actualMiles)} vs paid ${fmt(l.paidMiles)})` : ''}

Can you verify and advise on the difference?

Thanks`
}

function exportCSV(loads: Load[]) {
  const hdr = ['Date', 'Load #', 'Trailer', 'Dispatcher', 'Move', 'Disp mi', 'Actual mi', 'Paid mi', 'Missing mi', 'CPM', 'Expected', 'Settlement', 'Gap', 'Fuel', 'Net', 'Verdict', 'Verified']
  const rows = loads.map(l => {
    const expected = l.dispatchMiles * l.cpmRate
    const gap = Math.max(expected - l.settlementPay, 0)
    const missing = Math.max(l.actualMiles - l.paidMiles, 0)
    const net = l.settlementPay - l.fuelCost
    return [l.date, l.loadNumber, l.trailer || '', l.dispatcher, l.moveType,
      l.dispatchMiles, l.actualMiles, l.paidMiles, missing, l.cpmRate,
      expected.toFixed(2), l.settlementPay.toFixed(2), gap.toFixed(2),
      l.fuelCost.toFixed(2), net.toFixed(2), verdict(l), l.settlementVerified ? 'Yes' : 'No']
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  })
  const a = document.createElement('a')
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent([hdr.join(','), ...rows].join('\n'))
  a.download = `settlement-audit-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
}

type Filter = 'ALL' | 'SHORT' | 'MISSING DATA' | 'UNVERIFIED'
type VerifyForm = { paidMiles: string; settlementPay: string; notes: string }

export default function Audit() {
  const [loads, setLoads] = useState<Load[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('ALL')
  const [selected, setSelected] = useState<Load | null>(null)
  const [form, setForm] = useState<VerifyForm>({ paidMiles: '', settlementPay: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/fleet/loads')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        // API returns camelCase; add status default to satisfy Load type (not stored in DB)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setLoads((data?.loads ?? SAMPLE_LOADS).map((l: any) => ({ ...l, status: (l.status ?? 'Complete') as LoadStatus })))
        setLoading(false)
      })
      .catch(() => { setLoads(SAMPLE_LOADS); setLoading(false) })
  }, [])

  function openPanel(l: Load) {
    setSelected(l)
    setCopied(false)
    setForm({ paidMiles: l.paidMiles ? l.paidMiles.toString() : '', settlementPay: l.settlementPay ? l.settlementPay.toString() : '', notes: l.notes || '' })
  }
  function closePanel() { setSelected(null) }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSaving(true)
    const res = await fetch(`/api/fleet/loads/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paidMiles: Number(form.paidMiles) || 0,
        settlementPay: Number(form.settlementPay) || 0,
        notes: form.notes || null,
        settlementVerified: true,
      }),
    })
    if (res.ok) {
      const { load } = await res.json()
      setLoads(ls => ls.map(l => l.id === selected.id ? { ...load, status: (load.status ?? 'Complete') as LoadStatus } : l))
    }
    setSaving(false); closePanel()
  }

  async function toggleVerified(l: Load, e: React.MouseEvent) {
    e.stopPropagation()
    const next = !l.settlementVerified
    const res = await fetch(`/api/fleet/loads/${l.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settlementVerified: next }),
    })
    if (res.ok) {
      const { load } = await res.json()
      setLoads(ls => ls.map(x => x.id === l.id ? { ...load, status: (load.status ?? 'Complete') as LoadStatus } : x))
    }
  }

  function copyScript() {
    if (!selected) return
    navigator.clipboard.writeText(buildDisputeScript(selected))
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const filtered = loads.filter(l => {
    if (filter === 'SHORT') return verdict(l) === 'SHORT'
    if (filter === 'MISSING DATA') return verdict(l) === 'MISSING DATA'
    if (filter === 'UNVERIFIED') return !l.settlementVerified
    return true
  })

  const totals = {
    dispatchMiles: loads.reduce((a, l) => a + l.dispatchMiles, 0),
    expected: loads.reduce((a, l) => a + l.dispatchMiles * l.cpmRate, 0),
    settlement: loads.reduce((a, l) => a + l.settlementPay, 0),
    fuel: loads.reduce((a, l) => a + l.fuelCost, 0),
    gap: loads.reduce((a, l) => a + Math.max(l.dispatchMiles * l.cpmRate - l.settlementPay, 0), 0),
  }

  const shortCount = loads.filter(l => verdict(l) === 'SHORT').length
  const missingCount = loads.filter(l => verdict(l) === 'MISSING DATA').length
  const unverifiedCount = loads.filter(l => !l.settlementVerified).length

  // live calc for open panel
  const liveExpected = selected ? selected.dispatchMiles * selected.cpmRate : 0
  const liveGap = selected ? Math.max(liveExpected - (Number(form.settlementPay) || 0), 0) : 0
  const liveMissing = selected ? Math.max(selected.actualMiles - (Number(form.paidMiles) || 0), 0) : 0
  const liveNet = selected ? (Number(form.settlementPay) || 0) - selected.fuelCost : 0

  const FILTERS: { label: string; value: Filter; count?: number }[] = [
    { label: 'All', value: 'ALL', count: loads.length },
    { label: 'SHORT', value: 'SHORT', count: shortCount },
    { label: 'Missing data', value: 'MISSING DATA', count: missingCount },
    { label: 'Unverified', value: 'UNVERIFIED', count: unverifiedCount },
  ]

  return (
    <>
      <TopBar title="Settlement Audit" module="mis" subtitle="Verify every check — miles in, miles paid, money owed" />
      <main style={{ padding: '1.4rem', display: 'grid', gap: '1.4rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(210px,100%),1fr))', gap: '1rem' }}>
          <KpiCard label="Unverified loads" value={unverifiedCount.toString()} color={unverifiedCount > 0 ? 'warn' : undefined} />
          <KpiCard label="SHORT pays" value={shortCount.toString()} color={shortCount > 0 ? 'error' : undefined} />
          <KpiCard label="Total pay gap" value={fmtM(totals.gap)} color={totals.gap > 0 ? 'error' : undefined} note="Expected − settlement" />
          <KpiCard label="Net (settlement − fuel)" value={fmtM(totals.settlement - totals.fuel)} color="primary" />
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              style={{ padding: '.45rem .9rem', borderRadius: 10, fontSize: 'var(--text-xs)', fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer', background: filter === f.value ? 'var(--primary)' : 'var(--surface)', color: filter === f.value ? 'white' : 'var(--muted)', transition: '120ms' }}>
              {f.label}{f.count !== undefined ? ` (${f.count})` : ''}
            </button>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={() => exportCSV(loads)}
              style={{ padding: '.45rem .9rem', borderRadius: 10, fontSize: 'var(--text-xs)', fontWeight: 600, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)' }}>
              Export CSV
            </button>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'auto', boxShadow: 'var(--shadow-sm)' }}>
          {loading
            ? <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>
            : filtered.length === 0
              ? <div style={{ padding: '2.5rem', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>
                  {loads.length === 0 ? 'No loads yet — add some in the Load Log first.' : 'No loads match this filter.'}
                </div>
              : (
                <table>
                  <thead>
                    <tr>{['Date', 'Load #', 'Disp mi', 'Actual mi', 'Paid mi', 'Missing', 'Expected', 'Settlement', 'Gap', 'Fuel', 'Net', 'Verdict', 'Verified', ''].map(h => (
                      <th key={h} style={{ padding: '.85rem 1rem', fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {filtered.map(l => {
                      const expected = l.dispatchMiles * l.cpmRate
                      const gap = Math.max(expected - l.settlementPay, 0)
                      const missing = Math.max(l.actualMiles - l.paidMiles, 0)
                      const net = l.settlementPay - l.fuelCost
                      const v = verdict(l)
                      return (
                        <tr key={l.id} onClick={() => openPanel(l)}
                          style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-xs)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{l.date}</td>
                          <td style={{ padding: '.85rem 1rem', fontWeight: 700, fontSize: 'var(--text-sm)' }}>{l.loadNumber}</td>
                          <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)' }}>{fmt(l.dispatchMiles)}</td>
                          <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)', color: !l.actualMiles ? 'var(--warn)' : 'var(--text)' }}>{l.actualMiles ? fmt(l.actualMiles) : '—'}</td>
                          <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)', color: !l.paidMiles ? 'var(--warn)' : 'var(--text)' }}>{l.paidMiles ? fmt(l.paidMiles) : '—'}</td>
                          <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)', color: missing > 0 ? 'var(--error)' : 'var(--success)' }}>{missing > 0 ? fmt(missing) : '✓'}</td>
                          <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)' }}>{fmtM(expected)}</td>
                          <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)', color: !l.settlementPay ? 'var(--warn)' : 'var(--text)' }}>{l.settlementPay ? fmtM(l.settlementPay) : '—'}</td>
                          <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)', color: gap > 0 ? 'var(--error)' : 'var(--success)' }}>{gap > 0 ? fmtM(gap) : '✓'}</td>
                          <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)', color: l.fuelCost > 0 ? 'var(--warn)' : 'var(--faint)' }}>{l.fuelCost > 0 ? fmtM(l.fuelCost) : '—'}</td>
                          <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)', color: net < 0 ? 'var(--error)' : 'var(--text)' }}>{fmtM(net)}</td>
                          <td style={{ padding: '.85rem 1rem' }}><LoadBadge label={v} color={verdictColor[v]} /></td>
                          <td style={{ padding: '.85rem 1rem' }}><LoadBadge label={l.settlementVerified ? 'Verified' : 'Pending'} color={l.settlementVerified ? 'success' : 'muted'} /></td>
                          <td style={{ padding: '.85rem 1rem' }}>
                            <button onClick={e => toggleVerified(l, e)}
                              style={{ padding: '.3rem .7rem', borderRadius: 8, border: '1px solid var(--border)', color: l.settlementVerified ? 'var(--success)' : 'var(--muted)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                              {l.settlementVerified ? 'Unmark' : 'Verify'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {/* Totals row */}
                    <tr style={{ background: 'var(--surface-2)', borderTop: '2px solid var(--border)' }}>
                      <td colSpan={2} style={{ padding: '.85rem 1rem', fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase' }}>Totals ({filtered.length})</td>
                      <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)' }}>{fmt(filtered.reduce((a, l) => a + l.dispatchMiles, 0))}</td>
                      <td /><td /><td />
                      <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)' }}>{fmtM(filtered.reduce((a, l) => a + l.dispatchMiles * l.cpmRate, 0))}</td>
                      <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)' }}>{fmtM(filtered.reduce((a, l) => a + l.settlementPay, 0))}</td>
                      <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--error)' }}>{fmtM(filtered.reduce((a, l) => a + Math.max(l.dispatchMiles * l.cpmRate - l.settlementPay, 0), 0))}</td>
                      <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--warn)' }}>{fmtM(filtered.reduce((a, l) => a + l.fuelCost, 0))}</td>
                      <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)' }}>{fmtM(filtered.reduce((a, l) => a + l.settlementPay - l.fuelCost, 0))}</td>
                      <td colSpan={3} />
                    </tr>
                  </tbody>
                </table>
              )}
        </div>

        {/* Verify slide-out */}
        {selected && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }} onClick={closePanel}>
            <div style={{ flex: 1, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(3px)' }} />
            <div onClick={e => e.stopPropagation()}
              style={{ width: 'min(480px,100vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', height: '100%', overflow: 'auto', padding: '1.8rem', display: 'grid', gap: '1rem', alignContent: 'start', boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Verify settlement</h2>
                <button onClick={closePanel} style={{ fontSize: '1.2rem', color: 'var(--muted)', lineHeight: 1 }}>x</button>
              </div>

              {/* Load summary */}
              <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '1rem', border: '1px solid var(--border)', display: 'grid', gap: '.4rem' }}>
                <div style={{ fontWeight: 700 }}>{selected.loadNumber} &middot; {selected.date}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{selected.origin} &rarr; {selected.destination}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{selected.moveType} &middot; {fmt(selected.dispatchMiles)} dispatch mi &middot; CPM ${selected.cpmRate}</div>
                <div style={{ marginTop: 4 }}><LoadBadge label={verdict(selected)} color={verdictColor[verdict(selected)]} /></div>
              </div>

              {/* Full breakdown */}
              <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '1rem', border: '1px solid var(--border)', display: 'grid', gap: '.5rem' }}>
                {([
                  ['Dispatch miles', fmt(selected.dispatchMiles), false],
                  ['Actual (ELD) miles', selected.actualMiles ? fmt(selected.actualMiles) : 'NOT ENTERED', !selected.actualMiles],
                  ['Paid miles', selected.paidMiles ? fmt(selected.paidMiles) : 'NOT ENTERED', !selected.paidMiles],
                  ['Missing miles', fmt(Math.max(selected.actualMiles - selected.paidMiles, 0)), Math.max(selected.actualMiles - selected.paidMiles, 0) > 0],
                  ['Expected pay', fmtM(selected.dispatchMiles * selected.cpmRate), false],
                  ['Settlement pay', selected.settlementPay ? fmtM(selected.settlementPay) : 'NOT ENTERED', !selected.settlementPay],
                  ['Gap', fmtM(Math.max(selected.dispatchMiles * selected.cpmRate - selected.settlementPay, 0)), Math.max(selected.dispatchMiles * selected.cpmRate - selected.settlementPay, 0) > 0],
                  ['Fuel cost', fmtM(selected.fuelCost), false],
                  ['Net (settlement − fuel)', fmtM(selected.settlementPay - selected.fuelCost), selected.settlementPay - selected.fuelCost < 0],
                ] as [string, string, boolean][]).map(([label, value, highlight]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '.3rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
                    <strong style={{ fontSize: 'var(--text-sm)', fontVariantNumeric: 'tabular-nums', color: highlight ? 'var(--warn)' : 'var(--text)' }}>{value}</strong>
                  </div>
                ))}
              </div>

              {/* Live gap calc */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, background: 'var(--surface-2)', borderRadius: 12, padding: '1rem', border: '1px solid var(--border)' }}>
                {([
                  ['Expected', fmtM(liveExpected), 'var(--primary)'],
                  ['Gap', fmtM(liveGap), liveGap > 0 ? 'var(--error)' : 'var(--success)'],
                  ['Missing mi', fmt(liveMissing), liveMissing > 0 ? 'var(--warn)' : 'var(--muted)'],
                  ['Net', fmtM(liveNet), liveNet < 0 ? 'var(--error)' : 'var(--success)'],
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
                  <input value={form.paidMiles} onChange={e => setForm(f => ({ ...f, paidMiles: e.target.value }))} type="text" inputMode="numeric" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Settlement pay $</label>
                  <input value={form.settlementPay} onChange={e => setForm(f => ({ ...f, settlementPay: e.target.value }))} type="text" inputMode="decimal" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Dispute notes</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    style={{ ...inp, resize: 'vertical' }} placeholder="e.g. Missing 47 miles — contacting Trev" />
                </div>

                {/* Dispute script */}
                {verdict(selected) === 'SHORT' && (
                  <div style={{ background: 'rgba(209,99,167,.07)', border: '1px solid rgba(209,99,167,.2)', borderRadius: 12, padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--error)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Dispute script</span>
                      <button type="button" onClick={copyScript}
                        style={{ padding: '.3rem .7rem', borderRadius: 8, border: '1px solid var(--border)', fontSize: 'var(--text-xs)', fontWeight: 600, color: copied ? 'var(--success)' : 'var(--muted)', background: 'var(--surface)' }}>
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>{buildDisputeScript(selected)}</pre>
                  </div>
                )}

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
