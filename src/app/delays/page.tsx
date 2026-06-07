'use client'
import { useState, useEffect } from 'react'
import TopBar from '@/components/layout/TopBar'
import LoadBadge from '@/components/ui/LoadBadge'
import KpiCard from '@/components/ui/KpiCard'
import { SAMPLE_DELAYS } from '@/lib/store'
import Attachments from '@/components/ui/Attachments'
import type { DelayEntry } from '@/types'

const DELAY_TYPES = ['Traffic','Gate','Shipper Wait','Receiver Wait','No receiving driver','Dispatch Delay','Paperwork','Scale/Fuel','Other']
const inp: React.CSSProperties = { width: '100%', padding: '.8rem 1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', outline: 'none', fontSize: 'var(--text-sm)' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }


type F = { loadNumber: string; trailer: string; delayType: string; location: string; totalHours: string; billable: 'Yes' | 'No' | 'Review'; detentionRate: string; notes: string }
const BLANK: F = { loadNumber: '', trailer: '', delayType: 'Traffic', location: '', totalHours: '', billable: 'Review', detentionRate: '', notes: '' }

export default function Delays() {
  const [entries, setEntries] = useState<DelayEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<F>(BLANK)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DelayEntry | null>(null)
  const [attachTarget, setAttachTarget] = useState<DelayEntry | null>(null)

  useEffect(() => {
    fetch('/api/fleet/delays')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setEntries(data?.delays ?? SAMPLE_DELAYS)
        setLoading(false)
      })
      .catch(() => { setEntries(SAMPLE_DELAYS); setLoading(false) })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const hours = Number(form.totalHours) || 0
    const rate = Number(form.detentionRate) || 0
    const res = await fetch('/api/fleet/delays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loadNumber: form.loadNumber,
        trailer: form.trailer || undefined,
        delayType: form.delayType,
        location: form.location,
        totalHours: hours,
        billable: form.billable,
        detentionRate: rate || undefined,
        notes: form.notes || undefined,
      }),
    })
    if (res.ok) {
      const { delay } = await res.json()
      setEntries(es => [delay, ...es])
    }
    setSaving(false); setForm(BLANK)
  }

  async function handleDelete(entry: DelayEntry) {
    await fetch(`/api/fleet/delays/${entry.id}`, { method: 'DELETE' })
    setEntries(es => es.filter(e => e.id !== entry.id))
    setDeleteTarget(null)
  }

  async function toggleNotified(entry: DelayEntry) {
    const next = !entry.dispatcherNotified
    const res = await fetch(`/api/fleet/delays/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dispatcherNotified: next }),
    })
    if (res.ok) {
      const { delay: updated } = await res.json()
      setEntries(es => es.map(e => e.id === entry.id ? updated : e))
    }
  }

  const totalHours = entries.reduce((a, e) => a + (e.totalHours || 0), 0)
  const billableHours = entries.filter(e => e.billable === 'Yes').reduce((a, e) => a + (e.totalHours || 0), 0)
  const set = (k: keyof F, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <>
      <TopBar title="Delay & Detention" module="ops" subtitle="Document every wait — it becomes money or a dispute" />
      <main style={{ padding: '1.4rem', display: 'grid', gap: '1.4rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(200px,100%),1fr))', gap: '1rem' }}>
          <KpiCard label="Entries" value={entries.length.toString()} />
          <KpiCard label="Total hours" value={totalHours.toFixed(2) + 'h'} note="All documented delays" />
          <KpiCard label="Billable hours" value={billableHours.toFixed(2) + 'h'} color={billableHours > 0 ? 'error' : undefined} />
          <KpiCard label="Under review" value={entries.filter(e => e.billable === 'Review').length.toString()} color="warn" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.4rem', alignItems: 'start' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'auto' }}>
            {loading
              ? <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>
              : (
                <table>
                  <thead>
                    <tr>{['Load #', 'Type', 'Location', 'Hours', 'Billable', 'Dispatch notified', 'Notes', ''].map(h => (
                      <th key={h} style={{ padding: '.85rem 1rem', fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>{entries.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '.85rem 1rem', fontWeight: 700, fontSize: 'var(--text-sm)' }}>{e.loadNumber}</td>
                      <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-sm)' }}>{e.delayType}</td>
                      <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-sm)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.location}</td>
                      <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)', color: e.totalHours > 1 ? 'var(--warn)' : 'var(--text)' }}>{e.totalHours || 'TBD'}</td>
                      <td style={{ padding: '.85rem 1rem' }}><LoadBadge label={e.billable} color={e.billable === 'Yes' ? 'error' : e.billable === 'Review' ? 'warn' : 'muted'} /></td>
                      <td style={{ padding: '.85rem 1rem' }}>
                        <button onClick={() => toggleNotified(e)}
                          style={{ fontSize: 'var(--text-xs)', color: e.dispatcherNotified ? 'var(--success)' : 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          {e.dispatcherNotified ? 'Yes' : 'No — tap to mark'}
                        </button>
                      </td>
                      <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-xs)', color: 'var(--muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes || '—'}</td>
                      <td style={{ padding: '.85rem 1rem' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => setAttachTarget(e)}
                            style={{ padding: '.3rem .6rem', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 'var(--text-xs)' }}>
                            Evidence
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
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Log delay</h2>
            {([['loadNumber', 'Load #', 'text'], ['trailer', 'Trailer #', 'text'], ['location', 'Location', 'text'], ['totalHours', 'Total hours', 'number'], ['detentionRate', 'Detention $/hr', 'number']] as [keyof F, string, string][]).map(([k, label, type]) => (
              <div key={k}>
                <label style={lbl}>{label}</label>
                <input value={form[k]} onChange={e => set(k, e.target.value)} type={type} step={type === 'number' ? 'any' : undefined} style={inp} />
              </div>
            ))}
            <div>
              <label style={lbl}>Delay type</label>
              <select value={form.delayType} onChange={e => set('delayType', e.target.value)} style={inp}>
                {DELAY_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Billable?</label>
              <select value={form.billable} onChange={e => set('billable', e.target.value)} style={inp}>
                <option>Review</option><option>Yes</option><option>No</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} />
            </div>
            <button type="submit" disabled={saving}
              style={{ padding: '.9rem', borderRadius: 12, background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', opacity: saving ? .6 : 1 }}>
              {saving ? 'Saving…' : 'Save delay entry'}
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
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Evidence</h2>
                <button onClick={() => setAttachTarget(null)} style={{ fontSize: '1.2rem', color: 'var(--muted)', lineHeight: 1 }}>x</button>
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '1rem', border: '1px solid var(--border)', display: 'grid', gap: '.3rem' }}>
                <div style={{ fontWeight: 700 }}>Load {attachTarget.loadNumber} &middot; {attachTarget.delayType}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{attachTarget.location}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: attachTarget.totalHours > 1 ? 'var(--warn)' : 'var(--muted)' }}>{attachTarget.totalHours}h &middot; Billable: {attachTarget.billable}</div>
              </div>
              <Attachments entityType="delay" entityId={attachTarget.id} />
            </div>
          </div>
        )}

        {deleteTarget && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', zIndex: 60, display: 'grid', placeItems: 'center', padding: '1rem' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '2rem', maxWidth: 400, width: '100%', textAlign: 'center' }}>
              <h3 style={{ fontWeight: 800, marginBottom: '.5rem' }}>Delete delay entry?</h3>
              <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)', marginBottom: '1.5rem' }}>
                {deleteTarget.delayType} &middot; {deleteTarget.loadNumber}<br />This cannot be undone.
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
