'use client'
import { useState, useEffect, useRef } from 'react'
import TopBar from '@/components/layout/TopBar'
import KpiCard from '@/components/ui/KpiCard'
import LoadBadge from '@/components/ui/LoadBadge'
import { supabase } from '@/lib/supabase'
import { SAMPLE_FUEL } from '@/lib/store'
import Attachments from '@/components/ui/Attachments'
import type { FuelEntry } from '@/types'

type LovesStore = {
  siteId: number; name: string; city: string; state: string; address: string | null
  miles: number | null; diesel: number | null; reefer: number | null
  showers: { total: number; available: number; queued: number; active: boolean } | null
}

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
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [lovesOpen, setLovesOpen] = useState(false)
  const [lovesLoading, setLovesLoading] = useState(false)
  const [lovesError, setLovesError] = useState('')
  const [lovesStores, setLovesStores] = useState<LovesStore[]>([])
  const [deleteTarget, setDeleteTarget] = useState<FuelEntry | null>(null)
  const [attachTarget, setAttachTarget] = useState<FuelEntry | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function handleScanReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    setScanError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/extract-receipt', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setScanError(data.error || 'Scan failed'); return }
      setForm(f => ({
        ...f,
        date: data.date || f.date,
        location: data.location || f.location,
        fuelType: (['Tractor', 'Reefer', 'DEF'].includes(data.fuelType) ? data.fuelType : f.fuelType) as F['fuelType'],
        gallons: data.gallons != null ? String(data.gallons) : f.gallons,
        pricePerGal: data.pricePerGal != null ? String(data.pricePerGal) : f.pricePerGal,
        totalCost: data.totalCost != null ? String(data.totalCost) : f.totalCost,
        notes: data.notes ? (f.notes ? f.notes + ' | ' + data.notes : data.notes) : f.notes,
      }))
    } catch {
      setScanError('Network error — try again')
    } finally {
      setScanning(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function fetchLovesPrices() {
    setLovesOpen(true)
    if (lovesStores.length) return
    setLovesLoading(true)
    setLovesError('')
    try {
      let url = '/api/loves-fuel'
      if (navigator.geolocation) {
        const pos = await new Promise<GeolocationPosition | null>(r =>
          navigator.geolocation.getCurrentPosition(p => r(p), () => r(null), { timeout: 5000 })
        )
        if (pos) url += `?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`
      }
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok || data.error === 'not_configured') {
        setLovesError(data.error === 'not_configured'
          ? 'LOVES_API_URL not set — see setup instructions.'
          : (data.error || 'Failed to load prices'))
        return
      }
      setLovesStores(data)
    } catch {
      setLovesError('Network error')
    } finally {
      setLovesLoading(false)
    }
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
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => setAttachTarget(e)}
                            style={{ padding: '.3rem .6rem', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 'var(--text-xs)' }}>
                            Receipts
                          </button>
                          <button onClick={() => setDeleteTarget(e)}
                            style={{ padding: '.3rem .6rem', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 'var(--text-xs)' }}>
                            x
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
          </div>

          <form onSubmit={handleSave} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.5rem', display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Add fuel entry</h2>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={scanning}
                style={{ padding: '.45rem .9rem', borderRadius: 10, border: '1px solid var(--primary)', color: 'var(--primary)', fontSize: 'var(--text-xs)', fontWeight: 700, opacity: scanning ? .6 : 1, whiteSpace: 'nowrap' }}>
                {scanning ? 'Scanning…' : 'Scan receipt'}
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleScanReceipt} style={{ display: 'none' }} />
            {scanError && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--error)', background: 'rgba(209,99,167,.1)', padding: '.6rem .8rem', borderRadius: 8 }}>{scanError}</div>}
            {([['date', 'Date', 'date'], ['location', 'Location', 'text'], ['gallons', 'Gallons', 'number'], ['pricePerGal', 'Price/gal', 'number']] as [keyof F, string, string][]).map(([k, label, type]) => (
              <div key={k}>
                <label style={lbl}>{label}</label>
                <input value={form[k]} onChange={e => set(k, e.target.value)} type={type} step={type === 'number' ? 'any' : undefined} style={inp} />
              </div>
            ))}
            {/* Love's live prices */}
            <div>
              <button type="button" onClick={fetchLovesPrices}
                style={{ width: '100%', padding: '.5rem', borderRadius: 10, border: '1px solid var(--border)', background: lovesOpen ? 'var(--surface-off)' : 'none', color: 'var(--primary)', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Love&apos;s live prices</span>
                <span style={{ fontSize: '.8em', opacity: .6 }}>{lovesOpen ? '▲' : '▼'}</span>
              </button>
              {lovesOpen && (
                <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  {lovesLoading && <div style={{ padding: '.8rem', fontSize: 'var(--text-xs)', color: 'var(--muted)', textAlign: 'center' }}>Fetching prices…</div>}
                  {lovesError && <div style={{ padding: '.8rem', fontSize: 'var(--text-xs)', color: 'var(--error)' }}>{lovesError}</div>}
                  {!lovesLoading && !lovesError && lovesStores.length === 0 && (
                    <div style={{ padding: '.8rem', fontSize: 'var(--text-xs)', color: 'var(--muted)', textAlign: 'center' }}>No diesel prices found</div>
                  )}
                  {lovesStores.map(s => {
                    const sh = s.showers
                    const showerColor = !sh ? 'var(--muted)' : !sh.active ? 'var(--muted)' : sh.available > 0 ? 'var(--success)' : 'var(--error)'
                    const showerLabel = !sh ? null : !sh.active ? 'Showers closed' : `${sh.available}/${sh.total} showers${sh.queued > 0 ? ` · ${sh.queued} in line` : ''}`
                    return (
                      <div key={s.siteId} style={{ padding: '.55rem .75rem', borderBottom: '1px solid var(--border)', display: 'grid', gap: '.2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700 }}>{s.name} · {s.city}, {s.state}{s.miles != null ? ` · ${s.miles.toFixed(0)} mi` : ''}</div>
                          {showerLabel && <div style={{ fontSize: 'var(--text-xs)', color: showerColor, whiteSpace: 'nowrap', marginLeft: 8 }}>{showerLabel}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {s.diesel != null && (
                            <button type="button"
                              onClick={() => { set('pricePerGal', String(s.diesel)); set('fuelType', 'Tractor'); set('location', s.address || `Love's ${s.name}`) }}
                              style={{ padding: '.25rem .5rem', borderRadius: 6, border: '1px solid var(--border)', fontSize: 'var(--text-xs)', background: 'var(--surface-2)', cursor: 'pointer' }}>
                              Diesel {fmtM(s.diesel)}
                            </button>
                          )}
                          {s.reefer != null && (
                            <button type="button"
                              onClick={() => { set('pricePerGal', String(s.reefer)); set('fuelType', 'Reefer'); set('location', s.address || `Love's ${s.name}`) }}
                              style={{ padding: '.25rem .5rem', borderRadius: 6, border: '1px solid var(--primary)', fontSize: 'var(--text-xs)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--primary)' }}>
                              Reefer {fmtM(s.reefer!)}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

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

        {/* Attachments slide-out */}
        {attachTarget && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }} onClick={() => setAttachTarget(null)}>
            <div style={{ flex: 1, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(3px)' }} />
            <div onClick={e => e.stopPropagation()}
              style={{ width: 'min(400px,100vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', height: '100%', overflow: 'auto', padding: '1.8rem', display: 'grid', gap: '1rem', alignContent: 'start', boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Receipts</h2>
                <button onClick={() => setAttachTarget(null)} style={{ fontSize: '1.2rem', color: 'var(--muted)', lineHeight: 1 }}>x</button>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '1rem', border: '1px solid var(--border)', display: 'grid', gap: '.3rem' }}>
                <div style={{ fontWeight: 700 }}>{attachTarget.date} &middot; {attachTarget.fuelType}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{attachTarget.location}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--warn)', fontWeight: 700 }}>{fmtM(attachTarget.totalCost)}</div>
              </div>
              <Attachments entityType="fuel" entityId={attachTarget.id} />
            </div>
          </div>
        )}

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
