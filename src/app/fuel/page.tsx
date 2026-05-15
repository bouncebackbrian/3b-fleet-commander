'use client'
import { useState, useEffect } from 'react'
import TopBar from '@/components/layout/TopBar'
import KpiCard from '@/components/ui/KpiCard'
import LoadBadge from '@/components/ui/LoadBadge'
import { supabase } from '@/lib/supabase'
import { SAMPLE_FUEL } from '@/lib/store'
import type { FuelEntry } from '@/types'

const fmtM = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inp: React.CSSProperties = { width: '100%', padding: '.8rem 1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', outline: 'none', fontSize: 'var(--text-sm)' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDB(r: any): FuelEntry {
  return {
    id: r.id, date: r.date, location: r.location,
    fuelType: r.fuel_type as FuelEntry['fuelType'],
    gallons: Number(r.gallons) || 0,
    pricePerGal: r.price_per_gal ? Number(r.price_per_gal) : undefined,
    totalCost: Number(r.total_cost) || 0,
    loadNumber: r.load_number ?? undefined,
    receiptSaved: Boolean(r.receipt_saved),
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  }
}

type F = { date: string; location: string; fuelType: FuelEntry['fuelType']; gallons: string; pricePerGal: string; totalCost: string; loadNumber: string; notes: string }
const BLANK: F = { date: '', location: '', fuelType: 'Tractor', gallons: '', pricePerGal: '', totalCost: '', loadNumber: '', notes: '' }

export default function Fuel() {
  const [entries, setEntries] = useState<FuelEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<F>(BLANK)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FuelEntry | null>(null)

  useEffect(() => {
    if (!supabase) { setEntries(SAMPLE_FUEL); setLoading(false); return }
    supabase.from('fuel_entries').select('*').order('date', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setEntries(data.map(fromDB))
        setLoading(false)
      })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const gallons = Number(form.gallons) || 0
    const ppg = Number(form.pricePerGal) || 0
    const total = Number(form.totalCost) || (gallons * ppg)
    const payload = {
      date: form.date,
      location: form.location,
      fuel_type: form.fuelType,
      gallons,
      price_per_gal: ppg || null,
      total_cost: total,
      load_number: form.loadNumber || null,
      notes: form.notes || null,
    }
    if (!supabase) {
      const entry: FuelEntry = fromDB({ ...payload, id: Math.random().toString(36).slice(2), receipt_saved: false, created_at: new Date().toISOString() })
      setEntries(es => [entry, ...es])
      setSaving(false); setForm(BLANK); return
    }
    const { data, error } = await supabase.from('fuel_entries').insert(payload).select().single()
    if (!error && data) setEntries(es => [fromDB(data), ...es])
    setSaving(false); setForm(BLANK)
  }

  async function handleDelete(entry: FuelEntry) {
    if (!supabase) { setEntries(es => es.filter(e => e.id !== entry.id)); setDeleteTarget(null); return }
    const { error } = await supabase.from('fuel_entries').delete().eq('id', entry.id)
    if (!error) setEntries(es => es.filter(e => e.id !== entry.id))
    setDeleteTarget(null)
  }

  async function toggleReceipt(entry: FuelEntry) {
    const next = !entry.receiptSaved
    if (!supabase) { setEntries(es => es.map(e => e.id === entry.id ? { ...e, receiptSaved: next } : e)); return }
    const { data, error } = await supabase.from('fuel_entries').update({ receipt_saved: next }).eq('id', entry.id).select().single()
    if (!error && data) setEntries(es => es.map(e => e.id === entry.id ? fromDB(data) : e))
  }

  const totalCost = entries.reduce((a, e) => a + (e.totalCost || 0), 0)
  const reefer = entries.filter(e => e.fuelType === 'Reefer').reduce((a, e) => a + (e.totalCost || 0), 0)
  const tractor = entries.filter(e => e.fuelType === 'Tractor').reduce((a, e) => a + (e.totalCost || 0), 0)
  const set = (k: keyof F, v: string) => setForm(f => ({ ...f, [k]: v }))

  // auto-calc total when gallons + ppg change
  const liveTotal = (Number(form.gallons) || 0) * (Number(form.pricePerGal) || 0)

  return (
    <>
      <TopBar title="Fuel Log" module="ops" subtitle="Track every gallon — tractor, reefer, and DEF" />
      <main style={{ padding: '1.4rem', display: 'grid', gap: '1.4rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(200px,100%),1fr))', gap: '1rem' }}>
          <KpiCard label="Total fuel cost" value={fmtM(totalCost)} color={totalCost > 0 ? 'warn' : undefined} />
          <KpiCard label="Tractor fuel" value={fmtM(tractor)} />
          <KpiCard label="Reefer fuel" value={fmtM(reefer)} />
          <KpiCard label="Fuel entries" value={entries.length.toString()} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.4rem', alignItems: 'start' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'auto' }}>
            {loading
              ? <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>
              : (
                <table>
                  <thead>
                    <tr>{['Date', 'Location', 'Type', 'Gallons', '$/gal', 'Total', 'Load #', 'Receipt', ''].map(h => (
                      <th key={h} style={{ padding: '.85rem 1rem', fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>{entries.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-xs)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{e.date}</td>
                      <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-sm)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.location}</td>
                      <td style={{ padding: '.85rem 1rem' }}><LoadBadge label={e.fuelType} color={e.fuelType === 'Reefer' ? 'primary' : e.fuelType === 'DEF' ? 'muted' : 'warn'} /></td>
                      <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)' }}>{e.gallons.toFixed(3)}</td>
                      <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{e.pricePerGal ? fmtM(e.pricePerGal) : '—'}</td>
                      <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--warn)' }}>{fmtM(e.totalCost)}</td>
                      <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{e.loadNumber || '—'}</td>
                      <td style={{ padding: '.85rem 1rem' }}>
                        <button onClick={() => toggleReceipt(e)}
                          style={{ fontSize: 'var(--text-xs)', color: e.receiptSaved ? 'var(--success)' : 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          {e.receiptSaved ? 'Saved' : 'Missing — tap'}
                        </button>
                      </td>
                      <td style={{ padding: '.85rem 1rem' }}>
                        <button onClick={() => setDeleteTarget(e)}
                          style={{ padding: '.3rem .6rem', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 'var(--text-xs)' }}>
                          x
                        </button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
          </div>

          <form onSubmit={handleSave} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.5rem', display: 'grid', gap: '1rem' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Add fuel entry</h2>
            {([['date', 'Date', 'date'], ['location', 'Location', 'text'], ['gallons', 'Gallons', 'number'], ['pricePerGal', 'Price/gal', 'number']] as [keyof F, string, string][]).map(([k, label, type]) => (
              <div key={k}>
                <label style={lbl}>{label}</label>
                <input value={form[k]} onChange={e => set(k, e.target.value)} type={type} step={type === 'number' ? 'any' : undefined} style={inp} />
              </div>
            ))}
            <div>
              <label style={lbl}>Total cost $</label>
              <input
                value={form.totalCost}
                onChange={e => set('totalCost', e.target.value)}
                placeholder={liveTotal > 0 ? liveTotal.toFixed(2) : ''}
                type="number" step="0.01" style={inp} />
              {liveTotal > 0 && !form.totalCost && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 4 }}>
                  Auto: {fmtM(liveTotal)} — override if receipt differs
                </div>
              )}
            </div>
            {([['loadNumber', 'Load # (optional)', 'text']] as [keyof F, string, string][]).map(([k, label, type]) => (
              <div key={k}>
                <label style={lbl}>{label}</label>
                <input value={form[k]} onChange={e => set(k, e.target.value)} type={type} style={inp} />
              </div>
            ))}
            <div>
              <label style={lbl}>Fuel type</label>
              <select value={form.fuelType} onChange={e => set('fuelType', e.target.value)} style={inp}>
                <option>Tractor</option><option>Reefer</option><option>DEF</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
            </div>
            <button type="submit" disabled={saving}
              style={{ padding: '.9rem', borderRadius: 12, background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', opacity: saving ? .6 : 1 }}>
              {saving ? 'Saving…' : 'Save fuel entry'}
            </button>
          </form>
        </div>

        {deleteTarget && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', zIndex: 60, display: 'grid', placeItems: 'center', padding: '1rem' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '2rem', maxWidth: 400, width: '100%', textAlign: 'center' }}>
              <h3 style={{ fontWeight: 800, marginBottom: '.5rem' }}>Delete fuel entry?</h3>
              <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', marginBottom: '1.5rem' }}>
                {deleteTarget.fuelType} &middot; {deleteTarget.date} &middot; {fmtM(deleteTarget.totalCost)}<br />This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={() => setDeleteTarget(null)}
                  style={{ padding: '.8rem 1.4rem', borderRadius: 12, background: 'var(--surface-off)', border: '1px solid var(--border)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>Cancel</button>
                <button onClick={() => handleDelete(deleteTarget)}
                  style={{ padding: '.8rem 1.8rem', borderRadius: 12, background: 'var(--error)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)' }}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
