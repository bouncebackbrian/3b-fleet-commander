'use client'
import { useEffect, useState } from 'react'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'
import type { DumpTruckSite, DumpTruckJob, SiteType } from '@/lib/dumpTruck/types'
import type { EquipmentOption } from '@/lib/fleet/dumpTruck/equipment'
import type { DriverOption } from '@/lib/fleet/dumpTruck/jobs'

const SITE_TYPES: SiteType[] = ['yard', 'pickup', 'dump', 'customer', 'fuel', 'maintenance', 'scale', 'disposal', 'parking', 'other']

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', width: '100%' }
const labelStyle: React.CSSProperties = { fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' as const }
const btnStyle: React.CSSProperties = { padding: '.65rem 1.2rem', borderRadius: 10, background: 'var(--primary)', color: '#04140f', fontWeight: 800 }

export default function DumpTruckAdminPage() {
  const [sites, setSites] = useState<DumpTruckSite[]>([])
  const [jobs, setJobs] = useState<DumpTruckJob[]>([])
  const [equipment, setEquipment] = useState<{ trucks: EquipmentOption[]; trailers: EquipmentOption[] }>({ trucks: [], trailers: [] })
  const [drivers, setDrivers] = useState<DriverOption[]>([])

  const reload = () => {
    fetch('/api/fleet/dump-truck/sites').then(r => r.json()).then(b => setSites(b.sites ?? []))
    fetch('/api/fleet/dump-truck/jobs').then(r => r.json()).then(b => setJobs(b.jobs ?? []))
    fetch('/api/fleet/dump-truck/equipment').then(r => r.json()).then(setEquipment)
    fetch('/api/fleet/dump-truck/drivers').then(r => r.json()).then(b => setDrivers(b.drivers ?? []))
  }
  useEffect(reload, [])

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>Dump Truck Mode — Setup</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>
          Minimal setup screens for sites and jobs so drivers can run a full day. Trucks/trailers come from the
          existing fleet equipment registry — add them there first if the lists below are empty. The full
          geocoding/map-pin location directory (spec §6) is a follow-up build, not included here.
        </p>
      </div>

      <SitesPanel sites={sites} onCreated={reload} />
      <JobsPanel jobs={jobs} sites={sites} equipment={equipment} drivers={drivers} onCreated={reload} />
      <PayPolicyPanel />

      <ToastContainer />
    </div>
  )
}

function SitesPanel({ sites, onCreated }: { sites: DumpTruckSite[]; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '', siteType: 'yard' as SiteType, addressLine1: '', city: '', state: '', postalCode: '',
    lat: '', lng: '', geofenceRadiusM: '300',
  })
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!form.name) { toast.error('Site name is required'); return }
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
      toast.success('Site created')
      setForm({ name: '', siteType: 'yard', addressLine1: '', city: '', state: '', postalCode: '', lat: '', lng: '', geofenceRadiusM: '300' })
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create site')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>Sites ({sites.length})</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
        <Field label="Name"><input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Type">
          <select style={inputStyle} value={form.siteType} onChange={e => setForm({ ...form, siteType: e.target.value as SiteType })}>
            {SITE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Address"><input style={inputStyle} value={form.addressLine1} onChange={e => setForm({ ...form, addressLine1: e.target.value })} /></Field>
        <Field label="City"><input style={inputStyle} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></Field>
        <Field label="State"><input style={inputStyle} value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} /></Field>
        <Field label="Zip"><input style={inputStyle} value={form.postalCode} onChange={e => setForm({ ...form, postalCode: e.target.value })} /></Field>
        <Field label="Latitude"><input style={inputStyle} value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} placeholder="39.5296" /></Field>
        <Field label="Longitude"><input style={inputStyle} value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} placeholder="-119.8138" /></Field>
        <Field label="Geofence (m)"><input style={inputStyle} value={form.geofenceRadiusM} onChange={e => setForm({ ...form, geofenceRadiusM: e.target.value })} /></Field>
      </div>
      <button style={{ ...btnStyle, opacity: busy ? .5 : 1 }} disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Add Site'}</button>

      <table style={{ width: '100%', marginTop: '1.25rem', fontSize: '.85rem' }}>
        <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}><th>Name</th><th>Type</th><th>City/State</th><th>Coords</th></tr></thead>
        <tbody>
          {sites.map(s => (
            <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '.4rem 0' }}>{s.name}</td>
              <td>{s.siteType}</td>
              <td>{[s.city, s.state].filter(Boolean).join(', ') || '—'}</td>
              <td>{s.lat != null ? `${s.lat.toFixed(4)}, ${s.lng!.toFixed(4)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function JobsPanel({ jobs, sites, equipment, drivers, onCreated }: {
  jobs: DumpTruckJob[]; sites: DumpTruckSite[]
  equipment: { trucks: EquipmentOption[]; trailers: EquipmentOption[] }
  drivers: DriverOption[]
  onCreated: () => void
}) {
  const emptyForm = {
    jobNumber: '', poNumber: '', customerName: '', brokerName: '', driverId: '', truckId: '', trailerId: '',
    pickupSiteId: '', dumpSiteId: '', material: '',
    loadTime: '', orderDate: '', deliveryDate: '', cosigneeName: '', orderedBy: '', contactPhone: '',
    truckType: '', directions: '', travelTimeMinutes: '', fuelSurcharge: '', pricePerHour: '', pricePerTon: '', materialCost: '',
  }
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!form.jobNumber) { toast.error('Job number is required'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          status: 'scheduled',
          loadTime: form.loadTime || null,
          orderDate: form.orderDate || null,
          deliveryDate: form.deliveryDate || null,
          travelTimeMinutes: form.travelTimeMinutes ? Number(form.travelTimeMinutes) : null,
          fuelSurcharge: form.fuelSurcharge ? Number(form.fuelSurcharge) : null,
          pricePerHour: form.pricePerHour ? Number(form.pricePerHour) : null,
          pricePerTon: form.pricePerTon ? Number(form.pricePerTon) : null,
          materialCost: form.materialCost ? Number(form.materialCost) : null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not create job')
      toast.success('Job created')
      setForm(emptyForm)
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create job')
    } finally {
      setBusy(false)
    }
  }

  const pickupSites = sites.filter(s => s.siteType === 'pickup' || s.siteType === 'customer')
  const dumpSites = sites.filter(s => s.siteType === 'dump' || s.siteType === 'disposal')

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>Jobs ({jobs.length})</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
        <Field label="Job Number"><input style={inputStyle} value={form.jobNumber} onChange={e => setForm({ ...form, jobNumber: e.target.value })} /></Field>
        <Field label="PO Number"><input style={inputStyle} value={form.poNumber} onChange={e => setForm({ ...form, poNumber: e.target.value })} /></Field>
        <Field label="Customer"><input style={inputStyle} value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} /></Field>
        <Field label="Broker"><input style={inputStyle} value={form.brokerName} onChange={e => setForm({ ...form, brokerName: e.target.value })} /></Field>
        <Field label="Material"><input style={inputStyle} value={form.material} onChange={e => setForm({ ...form, material: e.target.value })} /></Field>
        <Field label="Driver">
          <select style={inputStyle} value={form.driverId} onChange={e => setForm({ ...form, driverId: e.target.value })}>
            <option value="">Unassigned</option>
            {drivers.map(d => <option key={d.userId} value={d.userId}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Truck">
          <select style={inputStyle} value={form.truckId} onChange={e => setForm({ ...form, truckId: e.target.value })}>
            <option value="">Unassigned</option>
            {equipment.trucks.map(t => <option key={t.id} value={t.id}>{t.unitNumber}</option>)}
          </select>
        </Field>
        <Field label="Trailer">
          <select style={inputStyle} value={form.trailerId} onChange={e => setForm({ ...form, trailerId: e.target.value })}>
            <option value="">None</option>
            {equipment.trailers.map(t => <option key={t.id} value={t.id}>{t.unitNumber}</option>)}
          </select>
        </Field>
        <Field label="Truck Type"><input style={inputStyle} value={form.truckType} onChange={e => setForm({ ...form, truckType: e.target.value })} /></Field>
        <Field label="Pickup Site">
          <select style={inputStyle} value={form.pickupSiteId} onChange={e => setForm({ ...form, pickupSiteId: e.target.value })}>
            <option value="">Select…</option>
            {pickupSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Dump Site">
          <select style={inputStyle} value={form.dumpSiteId} onChange={e => setForm({ ...form, dumpSiteId: e.target.value })}>
            <option value="">Select…</option>
            {dumpSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const, margin: '1rem 0 .5rem' }}>
        Dispatch Ticket Details
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
        <Field label="Load Time"><input style={inputStyle} type="time" value={form.loadTime} onChange={e => setForm({ ...form, loadTime: e.target.value })} /></Field>
        <Field label="Order Date"><input style={inputStyle} type="date" value={form.orderDate} onChange={e => setForm({ ...form, orderDate: e.target.value })} /></Field>
        <Field label="Delivery Date"><input style={inputStyle} type="date" value={form.deliveryDate} onChange={e => setForm({ ...form, deliveryDate: e.target.value })} /></Field>
        <Field label="Ordered By"><input style={inputStyle} value={form.orderedBy} onChange={e => setForm({ ...form, orderedBy: e.target.value })} /></Field>
        <Field label="Cosignee"><input style={inputStyle} value={form.cosigneeName} onChange={e => setForm({ ...form, cosigneeName: e.target.value })} /></Field>
        <Field label="Phone Number"><input style={inputStyle} value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })} /></Field>
        <Field label="Travel Time (min)"><input style={inputStyle} type="number" value={form.travelTimeMinutes} onChange={e => setForm({ ...form, travelTimeMinutes: e.target.value })} /></Field>
        <Field label="Fuel Surcharge ($)"><input style={inputStyle} type="number" step="0.01" value={form.fuelSurcharge} onChange={e => setForm({ ...form, fuelSurcharge: e.target.value })} /></Field>
        <Field label="Price Per Hour ($)"><input style={inputStyle} type="number" step="0.01" value={form.pricePerHour} onChange={e => setForm({ ...form, pricePerHour: e.target.value })} /></Field>
        <Field label="Price Per Ton ($)"><input style={inputStyle} type="number" step="0.01" value={form.pricePerTon} onChange={e => setForm({ ...form, pricePerTon: e.target.value })} /></Field>
        <Field label="Material Cost ($)"><input style={inputStyle} type="number" step="0.01" value={form.materialCost} onChange={e => setForm({ ...form, materialCost: e.target.value })} /></Field>
      </div>
      <Field label="Directions"><textarea style={{ ...inputStyle, minHeight: 60 }} value={form.directions} onChange={e => setForm({ ...form, directions: e.target.value })} /></Field>

      <button style={{ ...btnStyle, opacity: busy ? .5 : 1, marginTop: '1rem' }} disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Add Job'}</button>

      <table style={{ width: '100%', marginTop: '1.25rem', fontSize: '.85rem' }}>
        <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}><th>Job #</th><th>Customer</th><th>Driver</th><th>Status</th></tr></thead>
        <tbody>
          {jobs.map(j => (
            <tr key={j.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '.4rem 0' }}>{j.jobNumber}</td>
              <td>{j.customerName ?? '—'}</td>
              <td>{drivers.find(d => d.userId === j.driverId)?.name ?? '—'}</td>
              <td>{j.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div style={labelStyle}>{label}</div>{children}</div>
}

function PayPolicyPanel() {
  const [baseHourlyRate, setBaseHourlyRate] = useState('32.00')
  const [dailyOtThresholdHours, setDailyOtThresholdHours] = useState('8.00')
  const [otMultiplier, setOtMultiplier] = useState('1.50')
  const [isDefault, setIsDefault] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/fleet/dump-truck/pay-policy').then(r => r.json()).then(b => {
      if (!b.policy) return
      setBaseHourlyRate(String(b.policy.baseHourlyRate))
      setDailyOtThresholdHours(String(b.policy.dailyOtThresholdHours))
      setOtMultiplier(String(b.policy.otMultiplier))
      setIsDefault(!!b.policy.isDefault)
    })
  }, [])

  const save = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/pay-policy', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseHourlyRate: Number(baseHourlyRate),
          dailyOtThresholdHours: Number(dailyOtThresholdHours),
          otMultiplier: Number(otMultiplier),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save pay policy')
      toast.success('Pay policy saved')
      setIsDefault(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save pay policy')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.5rem' }}>Driver Hours — Estimated Pay Policy</h2>
      <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        Powers the &quot;Estimated Earnings&quot; figures on the driver hours portal only — a single hourly
        rate with daily overtime. This is <strong>not</strong> a full payroll engine: per-load/per-mile/
        per-ton/detention rates, weekly overtime, double-time, and payroll approval are not implemented.
        {isDefault && ' Currently using the built-in default (not yet saved for this business).'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
        <Field label="Base Hourly Rate ($)"><input style={inputStyle} type="number" step="0.01" value={baseHourlyRate} onChange={e => setBaseHourlyRate(e.target.value)} /></Field>
        <Field label="Daily OT Threshold (hrs)"><input style={inputStyle} type="number" step="0.25" value={dailyOtThresholdHours} onChange={e => setDailyOtThresholdHours(e.target.value)} /></Field>
        <Field label="OT Multiplier"><input style={inputStyle} type="number" step="0.05" value={otMultiplier} onChange={e => setOtMultiplier(e.target.value)} /></Field>
      </div>
      <button style={{ ...btnStyle, opacity: busy ? .5 : 1 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save Pay Policy'}</button>
    </div>
  )
}
