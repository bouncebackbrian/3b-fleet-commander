'use client'
/**
 * /broker — Broker Desk
 *
 * The Broker portal's one screen: every Dump Truck Mode job with a broker
 * on file, showing rate fields and letting a broker-portal member correct
 * them inline. Read access needs the Broker portal (any level); edits need
 * manage-level — enforced server-side by /api/fleet/dump-truck/broker/jobs,
 * this page just shows the fields and lets a save fail with a toast if the
 * caller only has view access.
 */
import { useState, useEffect, useCallback } from 'react'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'
import type { DumpTruckJob } from '@/lib/dumpTruck/types'

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', width: '100%', fontSize: '.85rem' }
const labelStyle: React.CSSProperties = { fontSize: '.66rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase' as const }

type EditableField = 'brokerName' | 'pricePerHour' | 'pricePerTon' | 'fuelSurcharge' | 'materialCost'

export default function BrokerDeskPage() {
  const [jobs, setJobs] = useState<DumpTruckJob[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Partial<Record<EditableField, string>>>>({})

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/fleet/dump-truck/broker/jobs')
      .then(r => r.json())
      .then(b => setJobs(b.jobs ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const draftValue = (job: DumpTruckJob, field: EditableField): string => {
    const draft = drafts[job.id]?.[field]
    if (draft !== undefined) return draft
    const v = job[field]
    return v == null ? '' : String(v)
  }

  const setDraft = (jobId: string, field: EditableField, value: string) => {
    setDrafts(d => ({ ...d, [jobId]: { ...d[jobId], [field]: value } }))
  }

  const save = async (job: DumpTruckJob) => {
    const draft = drafts[job.id]
    if (!draft) return
    setSaving(job.id)
    try {
      const body: Record<string, unknown> = { jobId: job.id }
      if (draft.brokerName !== undefined) body.brokerName = draft.brokerName || null
      if (draft.pricePerHour !== undefined) body.pricePerHour = draft.pricePerHour ? Number(draft.pricePerHour) : null
      if (draft.pricePerTon !== undefined) body.pricePerTon = draft.pricePerTon ? Number(draft.pricePerTon) : null
      if (draft.fuelSurcharge !== undefined) body.fuelSurcharge = draft.fuelSurcharge ? Number(draft.fuelSurcharge) : null
      if (draft.materialCost !== undefined) body.materialCost = draft.materialCost ? Number(draft.materialCost) : null

      const res = await fetch('/api/fleet/dump-truck/broker/jobs', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save')
      toast.success('Saved')
      setDrafts(d => { const next = { ...d }; delete next[job.id]; return next })
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>📦 Broker Desk</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>
          Every job with a broker on file — rates, fuel surcharge, and material cost. Edits require manage-level
          Broker portal access.
        </p>
      </div>

      <div style={cardStyle}>
        {loading && <div style={{ color: 'var(--muted)', padding: '1rem 0' }}>Loading…</div>}
        {!loading && jobs.length === 0 && (
          <div style={{ color: 'var(--faint)', padding: '1rem 0' }}>No jobs have a broker on file yet.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {jobs.map(job => {
            const hasDraft = !!drafts[job.id]
            return (
              <div key={job.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', background: 'var(--surface-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
                  <div style={{ fontWeight: 800, fontSize: '.95rem' }}>{job.jobNumber} {job.customerName ? `— ${job.customerName}` : ''}</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>{job.status}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem', marginBottom: hasDraft ? '.75rem' : 0 }}>
                  <div>
                    <div style={labelStyle}>Broker</div>
                    <input style={inputStyle} value={draftValue(job, 'brokerName')} onChange={e => setDraft(job.id, 'brokerName', e.target.value)} />
                  </div>
                  <div>
                    <div style={labelStyle}>Price / Hour ($)</div>
                    <input style={inputStyle} type="number" step="0.01" value={draftValue(job, 'pricePerHour')} onChange={e => setDraft(job.id, 'pricePerHour', e.target.value)} />
                  </div>
                  <div>
                    <div style={labelStyle}>Price / Ton ($)</div>
                    <input style={inputStyle} type="number" step="0.01" value={draftValue(job, 'pricePerTon')} onChange={e => setDraft(job.id, 'pricePerTon', e.target.value)} />
                  </div>
                  <div>
                    <div style={labelStyle}>Fuel Surcharge ($)</div>
                    <input style={inputStyle} type="number" step="0.01" value={draftValue(job, 'fuelSurcharge')} onChange={e => setDraft(job.id, 'fuelSurcharge', e.target.value)} />
                  </div>
                  <div>
                    <div style={labelStyle}>Material Cost ($)</div>
                    <input style={inputStyle} type="number" step="0.01" value={draftValue(job, 'materialCost')} onChange={e => setDraft(job.id, 'materialCost', e.target.value)} />
                  </div>
                </div>
                {hasDraft && (
                  <button
                    onClick={() => save(job)}
                    disabled={saving === job.id}
                    style={{ padding: '.5rem 1rem', borderRadius: 8, background: 'var(--primary)', color: '#04140f', fontWeight: 800, fontSize: '.8rem', opacity: saving === job.id ? .5 : 1 }}
                  >
                    {saving === job.id ? 'Saving…' : 'Save Changes'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}
