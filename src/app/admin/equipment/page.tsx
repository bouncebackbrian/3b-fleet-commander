'use client'
/**
 * /admin/equipment — Fleet Equipment Registry
 *
 * Real trucks/trailers records shared by both the OTR and Dump Truck Mode
 * sides of the app (one fleet_equipment table) — compliance expiry dates,
 * mileage, and a maintenance/service history log per unit. Reuses the
 * existing document-upload pipeline (fleet_dt_documents) for attaching
 * registration/insurance/inspection copies and service receipts.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'

interface EquipmentRecord {
  id: string
  unitNumber: string
  equipmentType: string
  status: string
  vin: string | null
  licensePlate: string | null
  make: string | null
  model: string | null
  year: number | null
  registrationExp: string | null
  insuranceExp: string | null
  inspectionExp: string | null
  currentOdometer: number | null
  lastOdometerUpdate: string | null
  nextServiceDueDate: string | null
  nextServiceDueMiles: number | null
  notes: string | null
}

interface ServiceRecord {
  id: string
  serviceType: string
  performedAt: string
  odometer: number | null
  cost: number | null
  vendorName: string | null
  notes: string | null
  docId: string | null
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', width: '100%' }
const labelStyle: React.CSSProperties = { fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' as const }
const btnStyle: React.CSSProperties = { padding: '.65rem 1.2rem', borderRadius: 10, background: 'var(--primary)', color: '#04140f', fontWeight: 800 }

const SERVICE_TYPES = ['oil_change', 'tire_rotation', 'tire_replacement', 'brake_inspection', 'brake_service', 'dot_inspection', 'annual_inspection', 'repair', 'recall', 'other']

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 3600 * 1000))
}

function complianceStatus(eq: EquipmentRecord): { label: string; color: string } {
  const dates = [eq.registrationExp, eq.insuranceExp, eq.inspectionExp]
  if (dates.every(d => !d)) return { label: 'No dates on file', color: 'var(--faint)' }
  const soonest = Math.min(...dates.filter((d): d is string => !!d).map(d => daysUntil(d)!))
  if (soonest < 0) return { label: 'Expired', color: 'var(--error)' }
  if (soonest <= 30) return { label: `${soonest}d left`, color: 'var(--warn)' }
  return { label: 'Current', color: 'var(--success)' }
}

export default function EquipmentAdminPage() {
  const [equipment, setEquipment] = useState<EquipmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/fleet/equipment').then(r => r.json()).then(b => setEquipment(b.equipment ?? [])).finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>🚛 Fleet Equipment</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>
          Every truck and trailer — compliance expiry dates, current mileage, and service history. Shared by both
          regional OTR dispatch and Dump Truck Mode.
        </p>
      </div>

      <NewEquipmentPanel onCreated={load} />

      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>Equipment ({equipment.length})</h2>
        {loading && <div style={{ color: 'var(--muted)', padding: '1rem 0' }}>Loading…</div>}
        {!loading && equipment.length === 0 && <div style={{ color: 'var(--faint)', padding: '1rem 0' }}>No equipment on file yet.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {equipment.map(eq => {
            const cs = complianceStatus(eq)
            const isOpen = expanded === eq.id
            return (
              <div key={eq.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : eq.id)}
                  style={{
                    width: '100%', padding: '.75rem 1rem', background: 'var(--surface-2)', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '.9rem' }}>
                      {eq.unitNumber} {eq.make || eq.model ? `— ${[eq.year, eq.make, eq.model].filter(Boolean).join(' ')}` : ''}
                    </div>
                    <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                      {eq.equipmentType} · {eq.status} {eq.currentOdometer != null ? `· ${eq.currentOdometer.toLocaleString()} mi` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: '.72rem', fontWeight: 800, color: cs.color, padding: '.25rem .6rem', borderRadius: 6, background: 'var(--surface)', border: `1px solid ${cs.color}` }}>
                    {cs.label}
                  </span>
                </button>
                {isOpen && <EquipmentDetail equipment={eq} onUpdated={load} />}
              </div>
            )
          })}
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}

function NewEquipmentPanel({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ unitNumber: '', equipmentType: 'tractor', vin: '', licensePlate: '', make: '', model: '', year: '' })
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!form.unitNumber) { toast.error('Unit number is required'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/equipment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, year: form.year ? Number(form.year) : null }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not create equipment')
      toast.success('Equipment added')
      setForm({ unitNumber: '', equipmentType: 'tractor', vin: '', licensePlate: '', make: '', model: '', year: '' })
      setOpen(false)
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create equipment')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button style={{ ...btnStyle, alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>+ Add Truck / Trailer</button>
    )
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>Add Truck / Trailer</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
        <div><div style={labelStyle}>Unit Number *</div><input style={inputStyle} value={form.unitNumber} onChange={e => setForm({ ...form, unitNumber: e.target.value })} /></div>
        <div>
          <div style={labelStyle}>Type</div>
          <select style={inputStyle} value={form.equipmentType} onChange={e => setForm({ ...form, equipmentType: e.target.value })}>
            {['tractor', 'straight_dump_truck', 'super_10', 'trailer_dump', 'pup_trailer', 'other'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div><div style={labelStyle}>VIN</div><input style={inputStyle} value={form.vin} onChange={e => setForm({ ...form, vin: e.target.value })} /></div>
        <div><div style={labelStyle}>License Plate</div><input style={inputStyle} value={form.licensePlate} onChange={e => setForm({ ...form, licensePlate: e.target.value })} /></div>
        <div><div style={labelStyle}>Make</div><input style={inputStyle} value={form.make} onChange={e => setForm({ ...form, make: e.target.value })} /></div>
        <div><div style={labelStyle}>Model</div><input style={inputStyle} value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></div>
        <div><div style={labelStyle}>Year</div><input style={inputStyle} type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ ...btnStyle, opacity: busy ? .5 : 1 }} disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Save'}</button>
        <button style={{ ...btnStyle, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}

function EquipmentDetail({ equipment, onUpdated }: { equipment: EquipmentRecord; onUpdated: () => void }) {
  const [form, setForm] = useState({
    registrationExp: equipment.registrationExp ?? '', insuranceExp: equipment.insuranceExp ?? '',
    inspectionExp: equipment.inspectionExp ?? '', currentOdometer: equipment.currentOdometer != null ? String(equipment.currentOdometer) : '',
    nextServiceDueDate: equipment.nextServiceDueDate ?? '', nextServiceDueMiles: equipment.nextServiceDueMiles != null ? String(equipment.nextServiceDueMiles) : '',
  })
  const [saving, setSaving] = useState(false)
  const [records, setRecords] = useState<ServiceRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(true)

  const loadRecords = useCallback(() => {
    setRecordsLoading(true)
    fetch(`/api/fleet/equipment/${equipment.id}/service-records`).then(r => r.json()).then(b => setRecords(b.records ?? [])).finally(() => setRecordsLoading(false))
  }, [equipment.id])
  useEffect(loadRecords, [loadRecords])

  const saveCompliance = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/fleet/equipment/${equipment.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationExp: form.registrationExp || null,
          insuranceExp: form.insuranceExp || null,
          inspectionExp: form.inspectionExp || null,
          currentOdometer: form.currentOdometer ? Number(form.currentOdometer) : null,
          nextServiceDueDate: form.nextServiceDueDate || null,
          nextServiceDueMiles: form.nextServiceDueMiles ? Number(form.nextServiceDueMiles) : null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save')
      toast.success('Saved')
      onUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '1rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Compliance &amp; Mileage</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem', marginBottom: '.75rem' }}>
          <div><div style={labelStyle}>Registration Exp.</div><input style={inputStyle} type="date" value={form.registrationExp} onChange={e => setForm({ ...form, registrationExp: e.target.value })} /></div>
          <div><div style={labelStyle}>Insurance Exp.</div><input style={inputStyle} type="date" value={form.insuranceExp} onChange={e => setForm({ ...form, insuranceExp: e.target.value })} /></div>
          <div><div style={labelStyle}>Inspection Exp.</div><input style={inputStyle} type="date" value={form.inspectionExp} onChange={e => setForm({ ...form, inspectionExp: e.target.value })} /></div>
          <div><div style={labelStyle}>Current Odometer</div><input style={inputStyle} type="number" value={form.currentOdometer} onChange={e => setForm({ ...form, currentOdometer: e.target.value })} /></div>
          <div><div style={labelStyle}>Next Service Due (date)</div><input style={inputStyle} type="date" value={form.nextServiceDueDate} onChange={e => setForm({ ...form, nextServiceDueDate: e.target.value })} /></div>
          <div><div style={labelStyle}>Next Service Due (miles)</div><input style={inputStyle} type="number" value={form.nextServiceDueMiles} onChange={e => setForm({ ...form, nextServiceDueMiles: e.target.value })} /></div>
        </div>
        <button style={{ ...btnStyle, opacity: saving ? .5 : 1 }} disabled={saving} onClick={saveCompliance}>{saving ? 'Saving…' : 'Save'}</button>
      </div>

      <ServiceRecordsPanel equipmentId={equipment.id} records={records} loading={recordsLoading} onAdded={() => { loadRecords(); onUpdated() }} />
    </div>
  )
}

function ServiceRecordsPanel({ equipmentId, records, loading, onAdded }: {
  equipmentId: string; records: ServiceRecord[]; loading: boolean; onAdded: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ serviceType: 'oil_change', performedAt: new Date().toISOString().slice(0, 10), odometer: '', cost: '', vendorName: '', notes: '' })
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      let docId: string | null = null
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('docType', 'equipment_service_receipt')
        fd.append('linkedEntityType', 'equipment')
        fd.append('linkedEntityId', equipmentId)
        const uploadRes = await fetch('/api/fleet/dump-truck/documents', { method: 'POST', body: fd })
        if (uploadRes.ok) docId = (await uploadRes.json()).id
      }
      const res = await fetch(`/api/fleet/equipment/${equipmentId}/service-records`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: form.serviceType, performedAt: form.performedAt,
          odometer: form.odometer ? Number(form.odometer) : null,
          cost: form.cost ? Number(form.cost) : null,
          vendorName: form.vendorName || null, notes: form.notes || null, docId,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save record')
      toast.success('Service record added')
      setForm({ serviceType: 'oil_change', performedAt: new Date().toISOString().slice(0, 10), odometer: '', cost: '', vendorName: '', notes: '' })
      setFile(null)
      onAdded()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save record')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Service History</div>
      {loading && <div style={{ color: 'var(--muted)', fontSize: '.8rem' }}>Loading…</div>}
      {!loading && records.length === 0 && <div style={{ color: 'var(--faint)', fontSize: '.8rem', marginBottom: '.75rem' }}>No service records yet.</div>}
      {!loading && records.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '.75rem' }}>
          {records.map(r => (
            <div key={r.id} style={{ fontSize: '.8rem', padding: '.5rem .65rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <strong>{r.serviceType.replace(/_/g, ' ')}</strong> — {r.performedAt}
                {r.vendorName ? ` · ${r.vendorName}` : ''}{r.odometer != null ? ` · ${r.odometer.toLocaleString()} mi` : ''}
              </div>
              {r.cost != null && <div style={{ color: 'var(--muted)' }}>${r.cost.toFixed(2)}</div>}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '.5rem', marginBottom: '.5rem' }}>
        <select style={inputStyle} value={form.serviceType} onChange={e => setForm({ ...form, serviceType: e.target.value })}>
          {SERVICE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <input style={inputStyle} type="date" value={form.performedAt} onChange={e => setForm({ ...form, performedAt: e.target.value })} />
        <input style={inputStyle} type="number" placeholder="Odometer" value={form.odometer} onChange={e => setForm({ ...form, odometer: e.target.value })} />
        <input style={inputStyle} type="number" step="0.01" placeholder="Cost ($)" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} />
        <input style={inputStyle} placeholder="Vendor" value={form.vendorName} onChange={e => setForm({ ...form, vendorName: e.target.value })} />
      </div>
      <input style={{ ...inputStyle, marginBottom: '.5rem' }} placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button style={{ ...btnStyle, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => fileRef.current?.click()}>
          {file ? `📎 ${file.name}` : '📎 Attach Receipt'}
        </button>
        <button style={{ ...btnStyle, opacity: saving ? .5 : 1 }} disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Add Record'}</button>
      </div>
    </div>
  )
}
