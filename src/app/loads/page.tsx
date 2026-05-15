'use client'
import { useState, useEffect } from 'react'
import TopBar from '@/components/layout/TopBar'
import LoadBadge from '@/components/ui/LoadBadge'
import KpiCard from '@/components/ui/KpiCard'
import { supabase } from '@/lib/supabase'
import { SAMPLE_LOADS, classify, calcMetrics } from '@/lib/store'
import { loadSettings } from '@/lib/settings'
import Attachments from '@/components/ui/Attachments'
import type { Load, MoveType, LoadStatus } from '@/types'

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtM = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MOVES: MoveType[] = ['Loaded', 'Relay / Drop', 'Drop & Hook', 'Yard Move', 'Deadhead', 'Personal']

type F = {
  date: string; loadNumber: string; bolRef: string; dispatcher: string; broker: string
  trailer: string; moveType: MoveType; origin: string; destination: string
  dispatchMiles: string; actualMiles: string; deadheadMiles: string; paidMiles: string
  cpmRate: string; fuelCost: string; waitHours: string; detentionHours: string
  detentionPay: string; settlementPay: string; notes: string
}
const BLANK: F = {
  date: '', loadNumber: '', bolRef: '', dispatcher: 'Trev', broker: '', trailer: '',
  moveType: 'Loaded', origin: '', destination: '',
  dispatchMiles: '', actualMiles: '', deadheadMiles: '', paidMiles: '',
  cpmRate: '0.55', fuelCost: '', waitHours: '', detentionHours: '', detentionPay: '',
  settlementPay: '', notes: '',
}

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
function toDB(f: F) {
  const n = (k: keyof F) => Number(f[k]) || 0
  return {
    date: f.date, load_number: f.loadNumber, bol_ref: f.bolRef || null,
    dispatcher: f.dispatcher, broker: f.broker || null, trailer: f.trailer || null,
    move_type: f.moveType, origin: f.origin, destination: f.destination,
    dispatch_miles: n('dispatchMiles'), actual_miles: n('actualMiles'),
    deadhead_miles: n('deadheadMiles'), paid_miles: n('paidMiles'),
    cpm_rate: n('cpmRate') || 0.55, fuel_cost: n('fuelCost'),
    wait_hours: n('waitHours'), detention_hours: n('detentionHours'),
    detention_pay: n('detentionPay'), settlement_pay: n('settlementPay'),
    notes: f.notes || null, updated_at: new Date().toISOString(),
  }
}
function toForm(l: Load): F {
  return {
    date: l.date, loadNumber: l.loadNumber, bolRef: l.bolRef || '', dispatcher: l.dispatcher,
    broker: l.broker || '', trailer: l.trailer || '', moveType: l.moveType,
    origin: l.origin, destination: l.destination,
    dispatchMiles: l.dispatchMiles.toString(), actualMiles: l.actualMiles.toString(),
    deadheadMiles: l.deadheadMiles.toString(), paidMiles: l.paidMiles.toString(),
    cpmRate: l.cpmRate.toString(), fuelCost: l.fuelCost.toString(),
    waitHours: l.waitHours.toString(), detentionHours: l.detentionHours.toString(),
    detentionPay: l.detentionPay.toString(), settlementPay: l.settlementPay.toString(),
    notes: l.notes || '',
  }
}
function exportCSV(loads: Load[]) {
  const hdr = ['Date','Load #','BOL','Dispatcher','Broker','Trailer','Move','Origin','Destination',
    'Disp mi','Actual mi','DH mi','Paid mi','CPM','Fuel $','Wait h','Det h','Det pay','Settlement','Notes']
  const rows = loads.map(l =>
    [l.date,l.loadNumber,l.bolRef||'',l.dispatcher,l.broker||'',l.trailer||'',l.moveType,
     l.origin,l.destination,l.dispatchMiles,l.actualMiles,l.deadheadMiles,l.paidMiles,
     l.cpmRate,l.fuelCost,l.waitHours,l.detentionHours,l.detentionPay,l.settlementPay,l.notes||'']
    .map(v => `"${String(v).replace(/"/g,'""')}"`)
    .join(',')
  )
  const a = document.createElement('a')
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent([hdr.join(','),...rows].join('\n'))
  a.download = `loads-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
}

const inp: React.CSSProperties = { width:'100%', padding:'.8rem 1rem', borderRadius:12, border:'1px solid var(--border)', background:'var(--surface-2)', outline:'none', fontSize:'var(--text-sm)' }
const lbl: React.CSSProperties = { display:'block', fontSize:'var(--text-xs)', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }

export default function Loads() {
  const [loads, setLoads] = useState<Load[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<F>(BLANK)
  const [panelOpen, setPanelOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Load | null>(null)

  useEffect(() => {
    if (!supabase) { setLoads(SAMPLE_LOADS); setLoading(false); return }
    supabase.from('loads').select('*').order('date', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setLoads(data.map(fromDB))
        setLoading(false)
      })
  }, [])

  const m = calcMetrics(loads)
  const set = (k: keyof F, v: string) => setForm(f => ({ ...f, [k]: v }))
  const n = (k: keyof F) => Number(form[k]) || 0
  const estPay = n('dispatchMiles') * (n('cpmRate') || 0.55)
  const net = estPay - n('fuelCost')
  const unpaid = Math.max(n('actualMiles') - n('paidMiles'), 0)
  const payGap = Math.max(estPay - n('settlementPay'), 0)

  function openAdd() {
    const cfg = loadSettings()
    setForm({ ...BLANK, dispatcher: cfg.dispatcher || BLANK.dispatcher, cpmRate: cfg.defaultCpm.toString() })
    setEditId(null); setPanelOpen(true)
  }
  function openEdit(l: Load) { setForm(toForm(l)); setEditId(l.id); setPanelOpen(true) }
  function closePanel() { setPanelOpen(false); setEditId(null); setForm(BLANK) }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    if (!supabase) {
      if (editId) {
        setLoads(ls => ls.map(l => l.id === editId ? { ...l, ...toForm(l), ...fromDB({ ...toDB(form), id: editId, created_at: l.createdAt, updated_at: new Date().toISOString() }) } : l))
      } else {
        const id = Math.random().toString(36).slice(2)
        setLoads(ls => [fromDB({ ...toDB(form), id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }), ...ls])
      }
      setSaving(false); closePanel(); return
    }
    if (editId) {
      const { data, error } = await supabase.from('loads').update(toDB(form)).eq('id', editId).select().single()
      if (!error && data) setLoads(ls => ls.map(l => l.id === editId ? fromDB(data) : l))
    } else {
      const { data, error } = await supabase.from('loads').insert(toDB(form)).select().single()
      if (!error && data) setLoads(ls => [fromDB(data), ...ls])
    }
    setSaving(false); closePanel()
  }

  async function handleDelete(load: Load) {
    if (!supabase) { setLoads(ls => ls.filter(l => l.id !== load.id)); setDeleteTarget(null); return }
    const { error } = await supabase.from('loads').delete().eq('id', load.id)
    if (!error) setLoads(ls => ls.filter(l => l.id !== load.id))
    setDeleteTarget(null)
  }

  const fi = (k: keyof F, label: string, type = 'text', step?: string) => (
    <div key={k}>
      <label style={lbl}>{label}</label>
      <input value={form[k]} onChange={e => set(k, e.target.value)} type={type} step={step} style={inp} />
    </div>
  )

  return (
    <>
      <TopBar title="Load Log" module="mis"
        subtitle={loading ? 'Loading…' : `${loads.length} loads · ${fmt(m.dispatchMiles)} dispatch mi · est. ${fmtM(m.estPay)}`} />
      <main style={{ padding: '1.4rem', display: 'grid', gap: '1.4rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(200px,100%),1fr))', gap: '1rem' }}>
          <KpiCard label="Total loads" value={loads.length.toString()} />
          <KpiCard label="Dispatch miles" value={fmt(m.dispatchMiles)} />
          <KpiCard label="Est. pay @ .55" value={fmtM(m.estPay)} color="primary" />
          <KpiCard label="Total fuel" value={fmtM(m.fuel)} color={m.fuel > 0 ? 'warn' : undefined} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>All loads</h2>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => exportCSV(loads)}
              style={{ padding: '.7rem 1.2rem', borderRadius: 12, background: 'var(--surface-off)', border: '1px solid var(--border)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
              Export CSV
            </button>
            <button onClick={openAdd}
              style={{ padding: '.7rem 1.2rem', borderRadius: 12, background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
              + Add load
            </button>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'auto', boxShadow: 'var(--shadow-sm)' }}>
          {loading
            ? <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading loads…</div>
            : (
              <table>
                <thead>
                  <tr>{['Date','Load #','Trailer','Move','Origin','Destination','Disp. mi','Est. pay','Fuel','Wait h','Grade',''].map(h => (
                    <th key={h} style={{ padding: '.85rem 1rem', fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>{loads.map(l => {
                  const c = classify(l)
                  return (
                    <tr key={l.id} onClick={() => openEdit(l)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-xs)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{l.date}</td>
                      <td style={{ padding: '.85rem 1rem', fontWeight: 700, fontSize: 'var(--text-sm)' }}>{l.loadNumber}</td>
                      <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{l.trailer || '—'}</td>
                      <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-xs)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{l.moveType}</td>
                      <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-sm)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.origin}</td>
                      <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-sm)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.destination}</td>
                      <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)' }}>{fmt(l.dispatchMiles)}</td>
                      <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--primary)' }}>{fmtM(l.dispatchMiles * l.cpmRate)}</td>
                      <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)', color: l.fuelCost > 0 ? 'var(--warn)' : 'var(--faint)' }}>{l.fuelCost > 0 ? fmtM(l.fuelCost) : '—'}</td>
                      <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)' }}>{l.waitHours || '—'}</td>
                      <td style={{ padding: '.85rem 1rem' }}><LoadBadge label={c.label} color={c.color} /></td>
                      <td style={{ padding: '.85rem 1rem' }}>
                        <button onClick={e => { e.stopPropagation(); setDeleteTarget(l) }}
                          style={{ padding: '.3rem .6rem', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 'var(--text-xs)' }}>
                          x
                        </button>
                      </td>
                    </tr>
                  )
                })}</tbody>
              </table>
            )}
        </div>

        {/* Slide-out panel */}
        {panelOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }} onClick={closePanel}>
            <div style={{ flex: 1, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(3px)' }} />
            <div onClick={e => e.stopPropagation()}
              style={{ width: 'min(520px,100vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', height: '100%', overflow: 'auto', padding: '1.8rem', display: 'grid', gap: '1rem', alignContent: 'start', boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>{editId ? 'Edit load' : 'Add new load'}</h2>
                <button onClick={closePanel} style={{ fontSize: '1.2rem', color: 'var(--muted)', lineHeight: 1 }}>x</button>
              </div>

              {/* Live calc bar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, background: 'var(--surface-2)', borderRadius: 12, padding: '1rem', border: '1px solid var(--border)' }}>
                {([
                  ['Est. pay', fmtM(estPay), 'var(--primary)'],
                  ['Net (−fuel)', fmtM(net), net >= 0 ? 'var(--success)' : 'var(--error)'],
                  ['Unpaid mi', fmt(unpaid), unpaid > 0 ? 'var(--warn)' : 'var(--muted)'],
                  ['Pay gap', fmtM(payGap), payGap > 0 ? 'var(--warn)' : 'var(--muted)'],
                ] as [string, string, string][]).map(([label, value, color]) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {fi('date','Date','date')} {fi('loadNumber','Load #')}
                {fi('bolRef','BOL / Ref')} {fi('dispatcher','Dispatcher')}
                {fi('broker','Broker')} {fi('trailer','Trailer #')}
                {fi('origin','Origin')} {fi('destination','Destination')}
                {fi('dispatchMiles','Dispatch miles','number')} {fi('actualMiles','Actual (ELD) miles','number')}
                {fi('deadheadMiles','Deadhead miles','number')} {fi('paidMiles','Paid miles','number')}
                {fi('cpmRate','CPM rate','number','0.01')} {fi('fuelCost','Fuel cost $','number','0.01')}
                {fi('waitHours','Wait hours','number','0.01')} {fi('detentionHours','Detention hours','number','0.01')}
                {fi('detentionPay','Detention pay $','number','0.01')} {fi('settlementPay','Settlement pay $','number','0.01')}
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={lbl}>Move type</label>
                  <select value={form.moveType} onChange={e => set('moveType', e.target.value)} style={inp}>
                    {MOVES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={lbl}>Notes</label>
                  <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                    style={{ ...inp, resize: 'vertical' }} />
                </div>
                {editId && (
                  <div style={{ gridColumn: '1/-1', padding: '1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    <Attachments entityType="load" entityId={editId} />
                  </div>
                )}
                <div style={{ gridColumn: '1/-1', display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button type="button" onClick={closePanel}
                    style={{ padding: '.8rem 1.4rem', borderRadius: 12, background: 'var(--surface-off)', border: '1px solid var(--border)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={saving}
                    style={{ padding: '.8rem 1.8rem', borderRadius: 12, background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', opacity: saving ? .6 : 1 }}>
                    {saving ? 'Saving…' : editId ? 'Update load' : 'Save load'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete confirm */}
        {deleteTarget && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', zIndex: 60, display: 'grid', placeItems: 'center', padding: '1rem' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '2rem', maxWidth: 400, width: '100%', textAlign: 'center' }}>
              <h3 style={{ fontWeight: 800, marginBottom: '.5rem' }}>Delete load?</h3>
              <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', marginBottom: '1.5rem' }}>
                Load #{deleteTarget.loadNumber} &middot; {deleteTarget.date}<br />This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={() => setDeleteTarget(null)}
                  style={{ padding: '.8rem 1.4rem', borderRadius: 12, background: 'var(--surface-off)', border: '1px solid var(--border)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                  Cancel
                </button>
                <button onClick={() => handleDelete(deleteTarget)}
                  style={{ padding: '.8rem 1.8rem', borderRadius: 12, background: 'var(--error)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
