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
import type { DumpTruckJob, DumpTruckSite } from '@/lib/dumpTruck/types'
import BrokerPicker, { type BrokerOption } from '@/components/dumpTruck/BrokerPicker'

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', width: '100%', fontSize: '.85rem' }
const labelStyle: React.CSSProperties = { fontSize: '.66rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase' as const }

type EditableField = 'brokerName' | 'pricePerHour' | 'pricePerTon' | 'fuelSurcharge' | 'materialCost'

export default function BrokerDeskPage() {
  const [jobs, setJobs] = useState<DumpTruckJob[]>([])
  const [sites, setSites] = useState<DumpTruckSite[]>([])
  const [brokers, setBrokers] = useState<BrokerOption[]>([])
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
  useEffect(() => {
    fetch('/api/fleet/dump-truck/sites').then(r => r.json()).then(b => setSites(b.sites ?? []))
  }, [])
  const loadBrokers = useCallback(() => {
    fetch('/api/fleet/dump-truck/brokers').then(r => r.json()).then(b => setBrokers(b.brokers ?? []))
  }, [])
  useEffect(loadBrokers, [loadBrokers])

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

      <ProposeDealForm sites={sites} brokers={brokers} onBrokersChanged={loadBrokers} onProposed={load} />

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
                  <div style={{ fontSize: '.7rem', color: statusColor(job.status), textTransform: 'uppercase', fontWeight: 700 }}>{statusLabel(job.status)}</div>
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

function statusLabel(status: DumpTruckJob['status']): string {
  if (status === 'proposed') return 'Awaiting dispatch'
  return status
}

function statusColor(status: DumpTruckJob['status']): string {
  if (status === 'proposed') return 'var(--warn, #d99a2b)'
  return 'var(--muted)'
}

const emptyDeal = {
  customerName: '', brokerId: '', material: '', estQuantity: '', quantityUnit: 'loads' as const,
  pickupSiteId: '', dumpSiteId: '', pricePerHour: '', pricePerTon: '', fuelSurcharge: '', materialCost: '',
}

function ProposeDealForm({ sites, brokers, onBrokersChanged, onProposed }: {
  sites: DumpTruckSite[]; brokers: BrokerOption[]; onBrokersChanged: () => void; onProposed: () => void
}) {
  const [open, setOpen] = useState(false)
  const [deal, setDeal] = useState(emptyDeal)
  const [submitting, setSubmitting] = useState(false)

  const pickupSites = sites.filter(s => s.siteType === 'pickup' || s.siteType === 'customer')
  const dumpSites = sites.filter(s => s.siteType === 'dump' || s.siteType === 'disposal')

  const submit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/broker/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: deal.customerName || null,
          brokerId: deal.brokerId || null,
          material: deal.material || null,
          estQuantity: deal.estQuantity ? Number(deal.estQuantity) : null,
          quantityUnit: deal.quantityUnit,
          pickupSiteId: deal.pickupSiteId || null,
          dumpSiteId: deal.dumpSiteId || null,
          pricePerHour: deal.pricePerHour ? Number(deal.pricePerHour) : null,
          pricePerTon: deal.pricePerTon ? Number(deal.pricePerTon) : null,
          fuelSurcharge: deal.fuelSurcharge ? Number(deal.fuelSurcharge) : null,
          materialCost: deal.materialCost ? Number(deal.materialCost) : null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not propose deal')
      toast.success('Deal sent to dispatch')
      setDeal(emptyDeal)
      setOpen(false)
      onProposed()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not propose deal')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ padding: '.7rem 1rem', borderRadius: 10, background: 'var(--primary)', color: '#04140f', fontWeight: 800, fontSize: '.85rem', alignSelf: 'flex-start' }}
      >
        + Propose New Deal
      </button>
    )
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Propose New Deal</h2>
        <button onClick={() => setOpen(false)} style={{ color: 'var(--muted)', fontSize: '.8rem' }}>Cancel</button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '.8rem', marginBottom: '1rem' }}>
        Fill in what you know — dispatch picks the driver/truck and accepts to schedule it. No re-typing needed.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem', marginBottom: '1rem' }}>
        <div>
          <div style={labelStyle}>Customer</div>
          <input style={inputStyle} value={deal.customerName} onChange={e => setDeal(d => ({ ...d, customerName: e.target.value }))} />
        </div>
        <div>
          <div style={labelStyle}>Broker</div>
          <BrokerPicker
            brokers={brokers}
            brokerId={deal.brokerId || null}
            onChange={brokerId => setDeal(d => ({ ...d, brokerId: brokerId ?? '' }))}
            onBrokerCreated={onBrokersChanged}
          />
        </div>
        <div>
          <div style={labelStyle}>Material</div>
          <input style={inputStyle} value={deal.material} onChange={e => setDeal(d => ({ ...d, material: e.target.value }))} />
        </div>
        <div>
          <div style={labelStyle}>Est. Quantity</div>
          <input style={inputStyle} type="number" step="0.01" value={deal.estQuantity} onChange={e => setDeal(d => ({ ...d, estQuantity: e.target.value }))} />
        </div>
        <div>
          <div style={labelStyle}>Unit</div>
          <select style={inputStyle} value={deal.quantityUnit} onChange={e => setDeal(d => ({ ...d, quantityUnit: e.target.value as typeof d.quantityUnit }))}>
            {['loads', 'tons', 'cubic_yards', 'hours', 'miles', 'units'].map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Pickup Site</div>
          <select style={inputStyle} value={deal.pickupSiteId} onChange={e => setDeal(d => ({ ...d, pickupSiteId: e.target.value }))}>
            <option value="">— Select —</option>
            {pickupSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Dump Site</div>
          <select style={inputStyle} value={deal.dumpSiteId} onChange={e => setDeal(d => ({ ...d, dumpSiteId: e.target.value }))}>
            <option value="">— Select —</option>
            {dumpSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Price / Hour ($)</div>
          <input style={inputStyle} type="number" step="0.01" value={deal.pricePerHour} onChange={e => setDeal(d => ({ ...d, pricePerHour: e.target.value }))} />
        </div>
        <div>
          <div style={labelStyle}>Price / Ton ($)</div>
          <input style={inputStyle} type="number" step="0.01" value={deal.pricePerTon} onChange={e => setDeal(d => ({ ...d, pricePerTon: e.target.value }))} />
        </div>
        <div>
          <div style={labelStyle}>Fuel Surcharge ($)</div>
          <input style={inputStyle} type="number" step="0.01" value={deal.fuelSurcharge} onChange={e => setDeal(d => ({ ...d, fuelSurcharge: e.target.value }))} />
        </div>
        <div>
          <div style={labelStyle}>Material Cost ($)</div>
          <input style={inputStyle} type="number" step="0.01" value={deal.materialCost} onChange={e => setDeal(d => ({ ...d, materialCost: e.target.value }))} />
        </div>
      </div>
      <button
        onClick={submit}
        disabled={submitting}
        style={{ padding: '.6rem 1.2rem', borderRadius: 8, background: 'var(--primary)', color: '#04140f', fontWeight: 800, fontSize: '.85rem', opacity: submitting ? .5 : 1 }}
      >
        {submitting ? 'Sending…' : 'Send to Dispatch'}
      </button>
    </div>
  )
}
