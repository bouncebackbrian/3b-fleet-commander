'use client'
import { useEffect, useState, useRef } from 'react'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'
import type { DumpTruckSite, DumpTruckJob, SiteType } from '@/lib/dumpTruck/types'
import type { EquipmentOption } from '@/lib/fleet/dumpTruck/equipment'
import type { DriverOption } from '@/lib/fleet/dumpTruck/jobs'
import { haversineMeters } from '@/lib/dumpTruck/geofence'
import AdminActivityLogPanel from '@/components/dumpTruck/AdminActivityLogPanel'
import AdminPayrollHoursPanel from '@/components/dumpTruck/AdminPayrollHoursPanel'
import AdminWeeklyApprovalsPanel from '@/components/dumpTruck/AdminWeeklyApprovalsPanel'
import AdminTimeAdjustmentsPanel from '@/components/dumpTruck/AdminTimeAdjustmentsPanel'
import AdminFuelPanel from '@/components/dumpTruck/AdminFuelPanel'
import AdminDriverTaxPanel from '@/components/dumpTruck/AdminDriverTaxPanel'
import BrokerPicker, { type BrokerOption } from '@/components/dumpTruck/BrokerPicker'
import TicketSheet from '@/components/dumpTruck/TicketSheet'
import { TICKET_FIELD_CATALOG } from '@/lib/fleet/dumpTruck/ticketTemplates'
import { LanguageProvider, useLanguage } from '@/lib/i18n/LanguageContext'
import { adminDumpTruckDict } from '@/lib/i18n/dictionaries/adminDumpTruck'
import LanguageToggle from '@/components/shared/LanguageToggle'

const SITE_TYPES: SiteType[] = ['yard', 'pickup', 'dump', 'customer', 'fuel', 'maintenance', 'scale', 'disposal', 'parking', 'other']

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', width: '100%' }
const labelStyle: React.CSSProperties = { fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' as const }
const btnStyle: React.CSSProperties = { padding: '.65rem 1.2rem', borderRadius: 10, background: 'var(--primary)', color: '#04140f', fontWeight: 800 }

export default function DumpTruckAdminPage() {
  return (
    <LanguageProvider dictionary={adminDumpTruckDict}>
      <DumpTruckAdminPageInner />
    </LanguageProvider>
  )
}

function DumpTruckAdminPageInner() {
  const { t: tr } = useLanguage()
  const [sites, setSites] = useState<DumpTruckSite[]>([])
  const [jobs, setJobs] = useState<DumpTruckJob[]>([])
  const [equipment, setEquipment] = useState<{ trucks: EquipmentOption[]; trailers: EquipmentOption[] }>({ trucks: [], trailers: [] })
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [brokers, setBrokers] = useState<BrokerOption[]>([])

  const reload = () => {
    fetch('/api/fleet/dump-truck/sites').then(r => r.json()).then(b => setSites(b.sites ?? []))
    fetch('/api/fleet/dump-truck/jobs').then(r => r.json()).then(b => setJobs(b.jobs ?? []))
    fetch('/api/fleet/dump-truck/equipment').then(r => r.json()).then(setEquipment)
    fetch('/api/fleet/dump-truck/drivers').then(r => r.json()).then(b => setDrivers(b.drivers ?? []))
    fetch('/api/fleet/dump-truck/brokers').then(r => r.json()).then(b => setBrokers(b.brokers ?? []))
  }
  useEffect(reload, [])

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>{tr('Dump Truck Mode — Setup')}</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>
            {tr('Minimal setup screens for sites and jobs so drivers can run a full day. Trucks/trailers come from the existing fleet equipment registry — add them there first if the lists below are empty. The full geocoding/map-pin location directory (spec §6) is a follow-up build, not included here. Open defect escalations and incident reports moved to the')}{' '}
            <a href="/admin/dump-truck/safety" style={{ color: 'var(--primary)', fontWeight: 700 }}>{tr('Safety')}</a> {tr('page. To send a driver a job/location for a specific day, use')}{' '}
            <a href="/admin/dump-truck/dispatch" style={{ color: 'var(--primary)', fontWeight: 700 }}>{tr('Dispatch — Send Job')}</a>.
          </p>
        </div>
        <LanguageToggle />
      </div>

      <SitesPanel sites={sites} onCreated={reload} />
      <PendingDealsPanel jobs={jobs} sites={sites} equipment={equipment} drivers={drivers} onAccepted={reload} />
      <JobsPanel jobs={jobs} sites={sites} equipment={equipment} drivers={drivers} brokers={brokers} onBrokersChanged={reload} onCreated={reload} />
      <TicketTemplatesPanel brokers={brokers} />
      <PayPolicyPanel drivers={drivers} />
      <AdminDriverTaxPanel drivers={drivers} />
      <AdminTimeAdjustmentsPanel drivers={drivers} trucks={equipment.trucks} />
      <AdminWeeklyApprovalsPanel drivers={drivers} />
      <AdminPayrollHoursPanel drivers={drivers} />
      <AdminFuelPanel />
      <AdminActivityLogPanel drivers={drivers} />

      <ToastContainer />
    </div>
  )
}

function SitesPanel({ sites, onCreated }: { sites: DumpTruckSite[]; onCreated: () => void }) {
  const { t: tr } = useLanguage()
  const [form, setForm] = useState({
    name: '', siteType: 'yard' as SiteType, addressLine1: '', city: '', state: '', postalCode: '',
    lat: '', lng: '', geofenceRadiusM: '300',
  })
  const [busy, setBusy] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const aiFileRef = useRef<HTMLInputElement>(null)

  const applyAiResult = (r: { name: string | null; lat: number | null; lng: number | null; addressLine1: string | null; city: string | null; state: string | null; postalCode: string | null }) => {
    setForm(f => ({
      ...f,
      name: r.name ?? f.name,
      addressLine1: r.addressLine1 ?? f.addressLine1,
      city: r.city ?? f.city,
      state: r.state ?? f.state,
      postalCode: r.postalCode ?? f.postalCode,
      lat: r.lat != null ? String(r.lat) : f.lat,
      lng: r.lng != null ? String(r.lng) : f.lng,
    }))
  }

  const aiFillFromFile = async (file: File) => {
    setAiBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/fleet/dump-truck/scan-site', { method: 'POST', body: fd })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not read screenshot')
      applyAiResult(await res.json())
      toast.success(tr('Fields filled — review before saving'))
    } catch (err) {
      toast.error(err instanceof Error ? tr(err.message) : tr('Could not read screenshot'))
    } finally {
      setAiBusy(false)
    }
  }

  const aiFillFromText = async () => {
    if (!aiText.trim()) return
    setAiBusy(true)
    try {
      const fd = new FormData()
      fd.append('text', aiText.trim())
      const res = await fetch('/api/fleet/dump-truck/scan-site', { method: 'POST', body: fd })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not parse location')
      applyAiResult(await res.json())
      toast.success(tr('Fields filled — review before saving'))
      setAiText('')
    } catch (err) {
      toast.error(err instanceof Error ? tr(err.message) : tr('Could not parse location'))
    } finally {
      setAiBusy(false)
    }
  }

  const submit = async () => {
    if (!form.name) { toast.error(tr('Site name is required')); return }
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/sites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          lat: form.lat ? Number(form.lat) : null,
          lng: form.lng ? Number(form.lng) : null,
          geofenceRadiusM: Number(form.geofenceRadiusM) || 300,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not create site')
      toast.success(tr('Site created'))
      setForm({ name: '', siteType: 'yard', addressLine1: '', city: '', state: '', postalCode: '', lat: '', lng: '', geofenceRadiusM: '300' })
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? tr(err.message) : tr('Could not create site'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>{tr('Sites ({count})', { count: sites.length })}</h2>

      {!aiOpen ? (
        <button
          onClick={() => setAiOpen(true)}
          style={{ marginBottom: '1rem', padding: '.55rem .9rem', borderRadius: 9, border: '1px dashed rgba(0,232,176,.4)', background: 'rgba(0,232,176,.06)', color: 'var(--primary)', fontWeight: 700, fontSize: '.8rem' }}
        >
          {tr('✨ AI Fill from Screenshot or Location')}
        </button>
      ) : (
        <div style={{ marginBottom: '1rem', padding: '.85rem', borderRadius: 10, border: '1px solid rgba(0,232,176,.25)', background: 'rgba(0,232,176,.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
            <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--primary)' }}>{tr('✨ AI Fill')}</div>
            <button onClick={() => setAiOpen(false)} style={{ color: 'var(--muted)', fontSize: '.75rem' }}>✕</button>
          </div>
          <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: '.6rem' }}>
            {tr('Screenshot a maps app pin (Apple/Google Maps), or type/paste coordinates or a description — fills the fields below for you to review before saving.')}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => aiFileRef.current?.click()}
              disabled={aiBusy}
              style={{ padding: '.5rem .8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 700, fontSize: '.78rem', opacity: aiBusy ? .5 : 1 }}
            >
              {tr('📷 Upload Screenshot')}
            </button>
            <input
              ref={aiFileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) aiFillFromFile(f) }}
            />
            <input
              style={{ ...inputStyle, flex: 1, minWidth: 220 }}
              placeholder={`39.073470, -119.940673 ${tr('or corner of Heaven Hill Way & Conestoga Dr, Carson City NV')}`}
              value={aiText}
              onChange={e => setAiText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') aiFillFromText() }}
              disabled={aiBusy}
            />
            <button
              onClick={aiFillFromText}
              disabled={aiBusy || !aiText.trim()}
              style={{ padding: '.5rem .9rem', borderRadius: 8, background: 'var(--primary)', color: '#04140f', fontWeight: 800, fontSize: '.78rem', opacity: aiBusy || !aiText.trim() ? .5 : 1 }}
            >
              {aiBusy ? tr('Working…') : tr('Fill')}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
        <Field label={tr('Name')}><input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label={tr('Type')}>
          <select style={inputStyle} value={form.siteType} onChange={e => setForm({ ...form, siteType: e.target.value as SiteType })}>
            {SITE_TYPES.map(st => <option key={st} value={st}>{tr(st)}</option>)}
          </select>
        </Field>
        <Field label={tr('Address')}><input style={inputStyle} value={form.addressLine1} onChange={e => setForm({ ...form, addressLine1: e.target.value })} /></Field>
        <Field label={tr('City')}><input style={inputStyle} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></Field>
        <Field label={tr('State')}><input style={inputStyle} value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} /></Field>
        <Field label={tr('Zip')}><input style={inputStyle} value={form.postalCode} onChange={e => setForm({ ...form, postalCode: e.target.value })} /></Field>
        <Field label={tr('Latitude')}><input style={inputStyle} value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} placeholder="39.5296" /></Field>
        <Field label={tr('Longitude')}><input style={inputStyle} value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} placeholder="-119.8138" /></Field>
        <Field label={tr('Geofence (m)')}><input style={inputStyle} value={form.geofenceRadiusM} onChange={e => setForm({ ...form, geofenceRadiusM: e.target.value })} /></Field>
      </div>
      <button style={{ ...btnStyle, opacity: busy ? .5 : 1 }} disabled={busy} onClick={submit}>{busy ? tr('Saving…') : tr('Add Site')}</button>

      <table style={{ width: '100%', marginTop: '1.25rem', fontSize: '.85rem' }}>
        <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}><th>{tr('Name')}</th><th>{tr('Type')}</th><th>{tr('City/State')}</th><th>{tr('Coords')}</th><th>{tr('Status')}</th></tr></thead>
        <tbody>
          {sites.map(s => (
            <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '.4rem 0' }}>{s.name}</td>
              <td>{tr(s.siteType)}</td>
              <td>{[s.city, s.state].filter(Boolean).join(', ') || '—'}</td>
              <td>{s.lat != null ? `${s.lat.toFixed(4)}, ${s.lng!.toFixed(4)}` : '—'}</td>
              <td>
                {s.verified
                  ? <span style={{ color: 'var(--success)', fontWeight: 700 }}>{tr('✓ Verified')}</span>
                  : <span style={{ color: 'var(--warn)', fontWeight: 700 }} title={tr('Address/GPS not yet confirmed with dispatch')}>{tr('⚠ Unverified')}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Broker deals awaiting a driver/truck assignment (status 'proposed').
 * Dispatch's driver/truck picks are pre-sorted closest-first (haversine
 * from the job's pickup site to each truck's last known GPS position, see
 * fleet_equipment.current_lat/current_lng) so accepting is usually just
 * confirming the top option, not hunting through the full list.
 */
function PendingDealsPanel({ jobs, sites, equipment, drivers, onAccepted }: {
  jobs: DumpTruckJob[]; sites: DumpTruckSite[]
  equipment: { trucks: EquipmentOption[]; trailers: EquipmentOption[] }
  drivers: DriverOption[]
  onAccepted: () => void
}) {
  const { t: tr } = useLanguage()
  const proposed = jobs.filter(j => j.status === 'proposed')
  const [picks, setPicks] = useState<Record<string, { driverId: string; truckId: string; trailerId: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)

  if (proposed.length === 0) return null

  const trucksByDistance = (pickupSiteId: string | null): EquipmentOption[] => {
    const site = sites.find(s => s.id === pickupSiteId)
    if (!site || site.lat == null || site.lng == null) return equipment.trucks
    return [...equipment.trucks].sort((a, b) => {
      const da = a.currentLat != null && a.currentLng != null ? haversineMeters(site.lat!, site.lng!, a.currentLat, a.currentLng) : Infinity
      const db = b.currentLat != null && b.currentLng != null ? haversineMeters(site.lat!, site.lng!, b.currentLat, b.currentLng) : Infinity
      return da - db
    })
  }

  const pickFor = (jobId: string, sortedTrucks: EquipmentOption[]) =>
    picks[jobId] ?? { driverId: '', truckId: sortedTrucks[0]?.id ?? '', trailerId: '' }

  const accept = async (job: DumpTruckJob) => {
    const pick = picks[job.id]
    if (!pick?.driverId || !pick?.truckId) { toast.error(tr('Pick a driver and truck first')); return }
    setBusy(job.id)
    try {
      const res = await fetch(`/api/fleet/dump-truck/jobs/${job.id}/accept`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: pick.driverId, truckId: pick.truckId, trailerId: pick.trailerId || null }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not accept deal')
      toast.success(tr('{job} scheduled', { job: job.jobNumber }))
      onAccepted()
    } catch (err) {
      toast.error(err instanceof Error ? tr(err.message) : tr('Could not accept deal'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ ...cardStyle, border: '1px solid var(--warn, #d99a2b)' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.25rem' }}>{tr('Pending Broker Deals ({count})', { count: proposed.length })}</h2>
      <p style={{ color: 'var(--muted)', fontSize: '.8rem', marginBottom: '1rem' }}>
        {tr('Everything else came from the broker — pick a driver and truck (closest truck to pickup is pre-selected) and accept.')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {proposed.map(job => {
          const sortedTrucks = trucksByDistance(job.pickupSiteId)
          const pick = pickFor(job.id, sortedTrucks)
          const pickupName = sites.find(s => s.id === job.pickupSiteId)?.name
          const dumpName = sites.find(s => s.id === job.dumpSiteId)?.name
          return (
            <div key={job.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', background: 'var(--surface-2)' }}>
              <div style={{ fontWeight: 800, fontSize: '.95rem', marginBottom: '.4rem' }}>
                {job.jobNumber} {job.customerName ? `— ${job.customerName}` : ''}
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '.78rem', marginBottom: '.75rem' }}>
                {job.material ?? tr('Material n/a')} · {pickupName ?? tr('pickup n/a')} → {dumpName ?? tr('dump n/a')}
                {job.pricePerHour ? ` · $${job.pricePerHour}/hr` : ''}{job.pricePerTon ? ` · $${job.pricePerTon}/ton` : ''}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem', marginBottom: '.75rem' }}>
                <Field label={tr('Driver')}>
                  <select style={inputStyle} value={pick.driverId} onChange={e => setPicks(p => ({ ...p, [job.id]: { ...pick, driverId: e.target.value } }))}>
                    <option value="">{tr('Select…')}</option>
                    {drivers.map(d => <option key={d.userId} value={d.userId}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label={tr('Truck (closest first)')}>
                  <select style={inputStyle} value={pick.truckId} onChange={e => setPicks(p => ({ ...p, [job.id]: { ...pick, truckId: e.target.value } }))}>
                    <option value="">{tr('Select…')}</option>
                    {sortedTrucks.map(truck => <option key={truck.id} value={truck.id}>{truck.unitNumber}{truck.currentLat != null ? '' : ` ${tr('(no location yet)')}`}</option>)}
                  </select>
                </Field>
                <Field label={tr('Trailer')}>
                  <select style={inputStyle} value={pick.trailerId} onChange={e => setPicks(p => ({ ...p, [job.id]: { ...pick, trailerId: e.target.value } }))}>
                    <option value="">{tr('None')}</option>
                    {equipment.trailers.map(tr2 => <option key={tr2.id} value={tr2.id}>{tr2.unitNumber}</option>)}
                  </select>
                </Field>
              </div>
              <button style={{ ...btnStyle, opacity: busy === job.id ? .5 : 1 }} disabled={busy === job.id} onClick={() => accept(job)}>
                {busy === job.id ? tr('Accepting…') : tr('Accept & Assign')}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function JobsPanel({ jobs, sites, equipment, drivers, brokers, onBrokersChanged, onCreated }: {
  jobs: DumpTruckJob[]; sites: DumpTruckSite[]
  equipment: { trucks: EquipmentOption[]; trailers: EquipmentOption[] }
  drivers: DriverOption[]
  brokers: BrokerOption[]
  onBrokersChanged: () => void
  onCreated: () => void
}) {
  const { t: tr } = useLanguage()
  const emptyForm = {
    jobNumber: '', poNumber: '', customerName: '', brokerId: '', brokerName: '', driverId: '', truckId: '', trailerId: '',
    pickupSiteId: '', dumpSiteId: '', material: '',
    loadTime: '', orderDate: '', deliveryDate: '', cosigneeName: '', orderedBy: '', contactPhone: '',
    truckType: '', directions: '', travelTimeMinutes: '', fuelSurcharge: '', pricePerHour: '', pricePerTon: '', materialCost: '', freightBillNumber: '',
    estQuantity: '', quantityUnit: 'loads' as DumpTruckJob['quantityUnit'],
  }
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [ticketJob, setTicketJob] = useState<DumpTruckJob | null>(null)

  const submit = async () => {
    if (!form.jobNumber) { toast.error(tr('Job number is required')); return }
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          status: 'scheduled',
          brokerId: form.brokerId || null,
          loadTime: form.loadTime || null,
          orderDate: form.orderDate || null,
          deliveryDate: form.deliveryDate || null,
          travelTimeMinutes: form.travelTimeMinutes ? Number(form.travelTimeMinutes) : null,
          fuelSurcharge: form.fuelSurcharge ? Number(form.fuelSurcharge) : null,
          pricePerHour: form.pricePerHour ? Number(form.pricePerHour) : null,
          pricePerTon: form.pricePerTon ? Number(form.pricePerTon) : null,
          materialCost: form.materialCost ? Number(form.materialCost) : null,
          freightBillNumber: form.freightBillNumber || null,
          estQuantity: form.estQuantity ? Number(form.estQuantity) : null,
          quantityUnit: form.quantityUnit,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not create job')
      toast.success(tr('Job created'))
      setForm(emptyForm)
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? tr(err.message) : tr('Could not create job'))
    } finally {
      setBusy(false)
    }
  }

  const pickupSites = sites.filter(s => s.siteType === 'pickup' || s.siteType === 'customer')
  const dumpSites = sites.filter(s => s.siteType === 'dump' || s.siteType === 'disposal')

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>{tr('Jobs ({count})', { count: jobs.length })}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
        <Field label={tr('Job Number')}><input style={inputStyle} value={form.jobNumber} onChange={e => setForm({ ...form, jobNumber: e.target.value })} /></Field>
        <Field label={tr('PO Number')}><input style={inputStyle} value={form.poNumber} onChange={e => setForm({ ...form, poNumber: e.target.value })} /></Field>
        <Field label={tr('Freight Bill #')}><input style={inputStyle} value={form.freightBillNumber} onChange={e => setForm({ ...form, freightBillNumber: e.target.value })} /></Field>
        <Field label={tr('Customer')}><input style={inputStyle} value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} /></Field>
        <Field label={tr('Broker')}>
          <BrokerPicker
            brokers={brokers}
            brokerId={form.brokerId || null}
            onChange={(brokerId, brokerName) => setForm({ ...form, brokerId: brokerId ?? '', brokerName })}
            onBrokerCreated={onBrokersChanged}
          />
        </Field>
        <Field label={tr('Material')}><input style={inputStyle} value={form.material} onChange={e => setForm({ ...form, material: e.target.value })} /></Field>
        <Field label={tr('Est. Quantity (daily goal)')}>
          <input style={inputStyle} type="number" min="0" value={form.estQuantity} onChange={e => setForm({ ...form, estQuantity: e.target.value })} placeholder="e.g. 5" />
        </Field>
        <Field label={tr('Quantity Unit')}>
          <select style={inputStyle} value={form.quantityUnit} onChange={e => setForm({ ...form, quantityUnit: e.target.value as DumpTruckJob['quantityUnit'] })}>
            <option value="loads">{tr('Loads')}</option>
            <option value="tons">{tr('Tons')}</option>
            <option value="cubic_yards">{tr('Cubic Yards')}</option>
            <option value="hours">{tr('Hours')}</option>
            <option value="miles">{tr('Miles')}</option>
            <option value="units">{tr('Units')}</option>
          </select>
        </Field>
        <Field label={tr('Driver')}>
          <select style={inputStyle} value={form.driverId} onChange={e => setForm({ ...form, driverId: e.target.value })}>
            <option value="">{tr('Unassigned')}</option>
            {drivers.map(d => <option key={d.userId} value={d.userId}>{d.name}</option>)}
          </select>
        </Field>
        <Field label={tr('Truck')}>
          <select style={inputStyle} value={form.truckId} onChange={e => setForm({ ...form, truckId: e.target.value })}>
            <option value="">{tr('Unassigned')}</option>
            {equipment.trucks.map(truck => <option key={truck.id} value={truck.id}>{truck.unitNumber}</option>)}
          </select>
        </Field>
        <Field label={tr('Trailer')}>
          <select style={inputStyle} value={form.trailerId} onChange={e => setForm({ ...form, trailerId: e.target.value })}>
            <option value="">{tr('None')}</option>
            {equipment.trailers.map(trailer => <option key={trailer.id} value={trailer.id}>{trailer.unitNumber}</option>)}
          </select>
        </Field>
        <Field label={tr('Truck Type')}><input style={inputStyle} value={form.truckType} onChange={e => setForm({ ...form, truckType: e.target.value })} /></Field>
        <Field label={tr('Pickup Site')}>
          <select style={inputStyle} value={form.pickupSiteId} onChange={e => setForm({ ...form, pickupSiteId: e.target.value })}>
            <option value="">{tr('Select…')}</option>
            {pickupSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label={tr('Dump Site')}>
          <select style={inputStyle} value={form.dumpSiteId} onChange={e => setForm({ ...form, dumpSiteId: e.target.value })}>
            <option value="">{tr('Select…')}</option>
            {dumpSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const, margin: '1rem 0 .5rem' }}>
        {tr('Dispatch Ticket Details')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
        <Field label={tr('Load Time')}><input style={inputStyle} type="time" value={form.loadTime} onChange={e => setForm({ ...form, loadTime: e.target.value })} /></Field>
        <Field label={tr('Order Date')}><input style={inputStyle} type="date" value={form.orderDate} onChange={e => setForm({ ...form, orderDate: e.target.value })} /></Field>
        <Field label={tr('Delivery Date')}><input style={inputStyle} type="date" value={form.deliveryDate} onChange={e => setForm({ ...form, deliveryDate: e.target.value })} /></Field>
        <Field label={tr('Ordered By')}><input style={inputStyle} value={form.orderedBy} onChange={e => setForm({ ...form, orderedBy: e.target.value })} /></Field>
        <Field label={tr('Cosignee')}><input style={inputStyle} value={form.cosigneeName} onChange={e => setForm({ ...form, cosigneeName: e.target.value })} /></Field>
        <Field label={tr('Phone Number')}><input style={inputStyle} value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })} /></Field>
        <Field label={tr('Travel Time (min)')}><input style={inputStyle} type="number" value={form.travelTimeMinutes} onChange={e => setForm({ ...form, travelTimeMinutes: e.target.value })} /></Field>
        <Field label={tr('Fuel Surcharge ($)')}><input style={inputStyle} type="number" step="0.01" value={form.fuelSurcharge} onChange={e => setForm({ ...form, fuelSurcharge: e.target.value })} /></Field>
        <Field label={tr('Price Per Hour ($)')}><input style={inputStyle} type="number" step="0.01" value={form.pricePerHour} onChange={e => setForm({ ...form, pricePerHour: e.target.value })} /></Field>
        <Field label={tr('Price Per Ton ($)')}><input style={inputStyle} type="number" step="0.01" value={form.pricePerTon} onChange={e => setForm({ ...form, pricePerTon: e.target.value })} /></Field>
        <Field label={tr('Material Cost ($)')}><input style={inputStyle} type="number" step="0.01" value={form.materialCost} onChange={e => setForm({ ...form, materialCost: e.target.value })} /></Field>
      </div>
      <Field label={tr('Directions')}><textarea style={{ ...inputStyle, minHeight: 60 }} value={form.directions} onChange={e => setForm({ ...form, directions: e.target.value })} /></Field>

      <button style={{ ...btnStyle, opacity: busy ? .5 : 1, marginTop: '1rem' }} disabled={busy} onClick={submit}>{busy ? tr('Saving…') : tr('Add Job')}</button>

      <table style={{ width: '100%', marginTop: '1.25rem', fontSize: '.85rem' }}>
        <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}><th>{tr('Job #')}</th><th>{tr('Customer')}</th><th>{tr('Driver')}</th><th>{tr('Status')}</th><th></th></tr></thead>
        <tbody>
          {jobs.map(j => (
            <tr key={j.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '.4rem 0' }}>{j.jobNumber}</td>
              <td>{j.customerName ?? '—'}</td>
              <td>{drivers.find(d => d.userId === j.driverId)?.name ?? '—'}</td>
              <td>{tr(j.status)}</td>
              <td>
                {j.driverId && (
                  <button
                    onClick={() => setTicketJob(j)}
                    style={{
                      fontSize: '.72rem', fontWeight: 700, padding: '.3rem .6rem', borderRadius: 6,
                      background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--primary)',
                    }}
                  >
                    {tr('🎫 Ticket')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {ticketJob && (
        <TicketSheet
          job={ticketJob}
          driverDisplayName={drivers.find(d => d.userId === ticketJob.driverId)?.name ?? '—'}
          truckUnit={equipment.trucks.find(t => t.id === ticketJob.truckId)?.unitNumber ?? null}
          canSign="company"
          onClose={() => setTicketJob(null)}
        />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div style={labelStyle}>{label}</div>{children}</div>
}

interface TicketTemplateDTO {
  id: string
  brokerId: string | null
  name: string
  fieldKeys: string[]
  requiresCompanySignoff: boolean
  requiresDriverSignature: boolean
}

/**
 * Ticket Templates — per-broker (or generic) digital dispatch ticket
 * configuration: which fields from the fixed catalog show on the rendered
 * ticket, and whether company/driver signatures are required to complete
 * it. One template per (business, broker) — broker=null is the generic
 * Fleet Commander default every job without a broker uses.
 */
function TicketTemplatesPanel({ brokers }: { brokers: BrokerOption[] }) {
  const { t: tr } = useLanguage()
  const [templates, setTemplates] = useState<TicketTemplateDTO[]>([])
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('') // '' = generic
  const [name, setName] = useState('Fleet Commander (Generic)')
  const [fieldKeys, setFieldKeys] = useState<string[]>(TICKET_FIELD_CATALOG.map(f => f.key))
  const [requiresCompanySignoff, setRequiresCompanySignoff] = useState(true)
  const [requiresDriverSignature, setRequiresDriverSignature] = useState(true)
  const [busy, setBusy] = useState(false)

  const reloadTemplates = () => {
    fetch('/api/fleet/dump-truck/ticket-templates').then(r => r.json()).then(b => setTemplates(b.templates ?? []))
  }
  useEffect(reloadTemplates, [])

  useEffect(() => {
    const existing = templates.find(t => (t.brokerId ?? '') === selectedBrokerId)
    if (existing) {
      setName(existing.name)
      setFieldKeys(existing.fieldKeys)
      setRequiresCompanySignoff(existing.requiresCompanySignoff)
      setRequiresDriverSignature(existing.requiresDriverSignature)
    } else {
      const broker = brokers.find(b => b.id === selectedBrokerId)
      setName(broker ? broker.name : 'Fleet Commander (Generic)')
      setFieldKeys(TICKET_FIELD_CATALOG.map(f => f.key))
      setRequiresCompanySignoff(true)
      setRequiresDriverSignature(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrokerId, templates])

  const toggleField = (key: string) => {
    setFieldKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  const save = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/ticket-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId: selectedBrokerId || null, name, fieldKeys, requiresCompanySignoff, requiresDriverSignature }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save template')
      toast.success(tr('Ticket template saved'))
      reloadTemplates()
    } catch (err) {
      toast.error(err instanceof Error ? tr(err.message) : tr('Could not save template'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.25rem' }}>{tr('Dispatch Ticket Templates')}</h2>
      <p style={{ color: 'var(--muted)', fontSize: '.8rem', marginBottom: '1rem' }}>
        {tr('Choose which fields show on the digital dispatch ticket and whether it requires a company/driver signature — per broker, or the generic Fleet Commander default used for jobs with no broker.')}
      </p>

      <Field label={tr('Template For')}>
        <select style={inputStyle} value={selectedBrokerId} onChange={e => setSelectedBrokerId(e.target.value)}>
          <option value="">{tr('Fleet Commander (Generic)')}</option>
          {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>

      <div style={{ marginTop: '1rem' }}>
        <Field label={tr('Template Name')}><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></Field>
      </div>

      <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const, margin: '1rem 0 .5rem' }}>
        {tr('Fields Shown On Ticket')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.4rem' }}>
        {TICKET_FIELD_CATALOG.map(f => (
          <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem' }}>
            <input type="checkbox" checked={fieldKeys.includes(f.key)} onChange={() => toggleField(f.key)} />
            {f.label}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', margin: '1rem 0' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem', fontWeight: 700 }}>
          <input type="checkbox" checked={requiresCompanySignoff} onChange={e => setRequiresCompanySignoff(e.target.checked)} />
          {tr('Requires company sign-off')}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem', fontWeight: 700 }}>
          <input type="checkbox" checked={requiresDriverSignature} onChange={e => setRequiresDriverSignature(e.target.checked)} />
          {tr('Requires driver signature')}
        </label>
      </div>

      <button style={{ ...btnStyle, opacity: busy ? .5 : 1 }} disabled={busy} onClick={save}>{busy ? tr('Saving…') : tr('Save Template')}</button>
    </div>
  )
}

interface PayPolicyState {
  baseHourlyRate: string; dailyOtThresholdHours: string; otMultiplier: string
  payType: 'hourly' | 'per_mile' | 'greater_of_hourly_or_revenue_share'; ratePerMile: string
  revenueSharePct: string; dispatchMinimumHours: string
  otMode: 'daily' | 'weekly' | 'daily_and_weekly'; weeklyOtThresholdHours: string
}

const EMPTY_PAY_POLICY: PayPolicyState = {
  baseHourlyRate: '32.00', dailyOtThresholdHours: '8.00', otMultiplier: '1.50', payType: 'hourly', ratePerMile: '0.65',
  revenueSharePct: '25', dispatchMinimumHours: '4', otMode: 'daily', weeklyOtThresholdHours: '40',
}

function PayPolicyFields({ state, onChange }: { state: PayPolicyState; onChange: (s: PayPolicyState) => void }) {
  const { t: tr } = useLanguage()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem' }}>
      <Field label={tr('Pay Type')}>
        <select style={inputStyle} value={state.payType} onChange={e => onChange({ ...state, payType: e.target.value as PayPolicyState['payType'] })}>
          <option value="hourly">{tr('Hourly + Daily OT')}</option>
          <option value="per_mile">{tr('Per-Mile')}</option>
          <option value="greater_of_hourly_or_revenue_share">{tr('Greater of Hourly or Revenue Share')}</option>
        </select>
      </Field>
      {state.payType === 'per_mile' ? (
        <Field label={tr('Rate Per Mile ($)')}><input style={inputStyle} type="number" step="0.01" value={state.ratePerMile} onChange={e => onChange({ ...state, ratePerMile: e.target.value })} /></Field>
      ) : (
        <>
          <Field label={state.payType === 'greater_of_hourly_or_revenue_share' ? tr('Minimum Hourly Rate ($)') : tr('Base Hourly Rate ($)')}>
            <input style={inputStyle} type="number" step="0.01" value={state.baseHourlyRate} onChange={e => onChange({ ...state, baseHourlyRate: e.target.value })} />
          </Field>
          <Field label={tr('Overtime Basis')}>
            <select style={inputStyle} value={state.otMode} onChange={e => onChange({ ...state, otMode: e.target.value as PayPolicyState['otMode'] })}>
              <option value="daily">{tr('Daily — OT past a threshold each day')}</option>
              <option value="weekly">{tr('Weekly — OT past a threshold for the week')}</option>
              <option value="daily_and_weekly">{tr('Daily + Weekly — OT past a daily threshold, AND past a weekly threshold')}</option>
            </select>
          </Field>
          {state.otMode === 'weekly' && (
            <Field label={tr('Weekly OT Threshold (hrs)')}><input style={inputStyle} type="number" step="1" value={state.weeklyOtThresholdHours} onChange={e => onChange({ ...state, weeklyOtThresholdHours: e.target.value })} /></Field>
          )}
          {state.otMode === 'daily' && (
            <Field label={tr('Daily OT Threshold (hrs)')}><input style={inputStyle} type="number" step="0.25" value={state.dailyOtThresholdHours} onChange={e => onChange({ ...state, dailyOtThresholdHours: e.target.value })} /></Field>
          )}
          {state.otMode === 'daily_and_weekly' && (
            <>
              <Field label={tr('Daily OT Threshold (hrs)')}><input style={inputStyle} type="number" step="0.25" value={state.dailyOtThresholdHours} onChange={e => onChange({ ...state, dailyOtThresholdHours: e.target.value })} /></Field>
              <Field label={tr('Weekly OT Threshold (hrs)')}><input style={inputStyle} type="number" step="1" value={state.weeklyOtThresholdHours} onChange={e => onChange({ ...state, weeklyOtThresholdHours: e.target.value })} /></Field>
            </>
          )}
          <Field label={tr('OT Multiplier')}><input style={inputStyle} type="number" step="0.05" value={state.otMultiplier} onChange={e => onChange({ ...state, otMultiplier: e.target.value })} /></Field>
        </>
      )}
      {state.payType === 'greater_of_hourly_or_revenue_share' && (
        <>
          <Field label={tr('Revenue Share (%)')}><input style={inputStyle} type="number" step="0.5" value={state.revenueSharePct} onChange={e => onChange({ ...state, revenueSharePct: e.target.value })} /></Field>
          <Field label={tr('Dispatch Minimum (hrs)')}><input style={inputStyle} type="number" step="0.5" value={state.dispatchMinimumHours} onChange={e => onChange({ ...state, dispatchMinimumHours: e.target.value })} /></Field>
        </>
      )}
    </div>
  )
}

function PayPolicyPanel({ drivers }: { drivers: DriverOption[] }) {
  const { t: tr } = useLanguage()
  const [state, setState] = useState<PayPolicyState>(EMPTY_PAY_POLICY)
  const [isDefault, setIsDefault] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = () => {
    fetch('/api/fleet/dump-truck/pay-policy').then(r => r.json()).then(b => {
      if (!b.policy) return
      setState({
        baseHourlyRate: String(b.policy.baseHourlyRate), dailyOtThresholdHours: String(b.policy.dailyOtThresholdHours),
        otMultiplier: String(b.policy.otMultiplier), payType: b.policy.payType ?? 'hourly',
        ratePerMile: b.policy.ratePerMile != null ? String(b.policy.ratePerMile) : '0.65',
        revenueSharePct: b.policy.revenueSharePct != null ? String(b.policy.revenueSharePct) : '25',
        dispatchMinimumHours: b.policy.dispatchMinimumHours != null ? String(b.policy.dispatchMinimumHours) : '4',
        otMode: b.policy.otMode === 'weekly' ? 'weekly' : b.policy.otMode === 'daily_and_weekly' ? 'daily_and_weekly' : 'daily',
        weeklyOtThresholdHours: b.policy.weeklyOtThresholdHours != null ? String(b.policy.weeklyOtThresholdHours) : '40',
      })
      setIsDefault(!!b.policy.isDefault)
    })
  }
  useEffect(load, [])

  const save = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/pay-policy', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseHourlyRate: Number(state.baseHourlyRate), dailyOtThresholdHours: Number(state.dailyOtThresholdHours),
          otMultiplier: Number(state.otMultiplier), payType: state.payType,
          ratePerMile: state.payType === 'per_mile' ? Number(state.ratePerMile) : null,
          revenueSharePct: state.payType === 'greater_of_hourly_or_revenue_share' ? Number(state.revenueSharePct) : null,
          dispatchMinimumHours: Number(state.dispatchMinimumHours),
          otMode: state.otMode, weeklyOtThresholdHours: Number(state.weeklyOtThresholdHours),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save pay policy')
      toast.success(tr('Pay policy saved'))
      setIsDefault(false)
    } catch (err) {
      toast.error(err instanceof Error ? tr(err.message) : tr('Could not save pay policy'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.5rem' }}>{tr('Driver Hours — Estimated Pay Policy')}</h2>
      <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        {tr('Business default — powers the "Estimated Earnings" figures on the driver hours portal for any driver without their own override below. Hourly (daily- or weekly-threshold OT) or a flat per-mile rate. This is')} <strong>{tr('not')}</strong> {tr('a full payroll engine: per-load/per-ton/detention rates, double-time, and payroll approval are not implemented.')}
        {isDefault && ' ' + tr('Currently using the built-in default (not yet saved for this business).')}
      </p>
      <PayPolicyFields state={state} onChange={setState} />
      <button style={{ ...btnStyle, opacity: busy ? .5 : 1, marginTop: '1rem' }} disabled={busy} onClick={save}>{busy ? tr('Saving…') : tr('Save Default Pay Policy')}</button>

      <DriverPayOverridesPanel drivers={drivers} />
    </div>
  )
}

interface DriverPayRow {
  userId: string; name: string
  override: {
    payType: 'hourly' | 'per_mile' | 'greater_of_hourly_or_revenue_share'
    baseHourlyRate: number; dailyOtThresholdHours: number; otMultiplier: number; ratePerMile: number | null
    revenueSharePct: number | null; dispatchMinimumHours: number
    otMode: 'daily' | 'weekly' | 'daily_and_weekly'; weeklyOtThresholdHours: number
  } | null
}

function DriverPayOverridesPanel({ drivers }: { drivers: DriverOption[] }) {
  const { t: tr } = useLanguage()
  const [rows, setRows] = useState<DriverPayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<PayPolicyState>(EMPTY_PAY_POLICY)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/fleet/dump-truck/pay-policy/drivers').then(r => r.json()).then(b => setRows(b.drivers ?? [])).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const startEdit = (row: DriverPayRow) => {
    setEditingId(row.userId)
    setEditState(row.override ? {
      baseHourlyRate: String(row.override.baseHourlyRate), dailyOtThresholdHours: String(row.override.dailyOtThresholdHours),
      otMultiplier: String(row.override.otMultiplier), payType: row.override.payType,
      ratePerMile: row.override.ratePerMile != null ? String(row.override.ratePerMile) : '0.65',
      revenueSharePct: row.override.revenueSharePct != null ? String(row.override.revenueSharePct) : '25',
      dispatchMinimumHours: String(row.override.dispatchMinimumHours ?? 4),
      otMode: row.override.otMode === 'weekly' ? 'weekly' : row.override.otMode === 'daily_and_weekly' ? 'daily_and_weekly' : 'daily',
      weeklyOtThresholdHours: String(row.override.weeklyOtThresholdHours ?? 40),
    } : EMPTY_PAY_POLICY)
  }

  const saveOverride = async (driverId: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/pay-policy', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId,
          baseHourlyRate: Number(editState.baseHourlyRate), dailyOtThresholdHours: Number(editState.dailyOtThresholdHours),
          otMultiplier: Number(editState.otMultiplier), payType: editState.payType,
          ratePerMile: editState.payType === 'per_mile' ? Number(editState.ratePerMile) : null,
          revenueSharePct: editState.payType === 'greater_of_hourly_or_revenue_share' ? Number(editState.revenueSharePct) : null,
          dispatchMinimumHours: Number(editState.dispatchMinimumHours),
          otMode: editState.otMode, weeklyOtThresholdHours: Number(editState.weeklyOtThresholdHours),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save override')
      toast.success(tr('Driver pay override saved'))
      setEditingId(null)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? tr(err.message) : tr('Could not save override'))
    } finally {
      setBusy(false)
    }
  }

  const removeOverride = async (driverId: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/fleet/dump-truck/pay-policy?driverId=${driverId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not remove override')
      toast.success(tr('Reverted to business default'))
      load()
    } catch (err) {
      toast.error(err instanceof Error ? tr(err.message) : tr('Could not remove override'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
      <h3 style={{ fontSize: '.95rem', fontWeight: 800, marginBottom: '.4rem' }}>{tr('Per-Driver Pay Overrides')}</h3>
      <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: '.75rem' }}>
        {tr('Some drivers can be hourly while others are paid per-mile — set an override here for any driver who shouldn\'t use the business default above.')}
      </p>
      {loading && <div style={{ color: 'var(--muted)', fontSize: '.8rem' }}>{tr('Loading…')}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(row => (
          <div key={row.userId} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '.6rem .75rem', background: 'var(--surface-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '.85rem' }}>{row.name}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                  {row.override
                    ? row.override.payType === 'per_mile' ? tr('Per-mile — ${rate}/mi', { rate: row.override.ratePerMile ?? '' })
                      : row.override.payType === 'greater_of_hourly_or_revenue_share' ? tr('Greater of ${hourly}/hr or {pct}% of revenue', { hourly: row.override.baseHourlyRate, pct: row.override.revenueSharePct ?? '' })
                        : tr('Hourly — ${hourly}/hr', { hourly: row.override.baseHourlyRate })
                    : tr('Using business default')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {row.override && (
                  <button onClick={() => removeOverride(row.userId)} disabled={busy} style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--error)', padding: '.3rem .6rem', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    {tr('Remove')}
                  </button>
                )}
                <button onClick={() => startEdit(row)} disabled={busy} style={{ fontSize: '.72rem', fontWeight: 700, padding: '.3rem .6rem', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--primary)' }}>
                  {row.override ? tr('Edit') : tr('Set Override')}
                </button>
              </div>
            </div>
            {editingId === row.userId && (
              <div style={{ marginTop: '.75rem', paddingTop: '.75rem', borderTop: '1px solid var(--border)' }}>
                <PayPolicyFields state={editState} onChange={setEditState} />
                <div style={{ display: 'flex', gap: 8, marginTop: '.6rem' }}>
                  <button style={{ ...btnStyle, opacity: busy ? .5 : 1 }} disabled={busy} onClick={() => saveOverride(row.userId)}>{busy ? tr('Saving…') : tr('Save')}</button>
                  <button style={{ ...btnStyle, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => setEditingId(null)}>{tr('Cancel')}</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
