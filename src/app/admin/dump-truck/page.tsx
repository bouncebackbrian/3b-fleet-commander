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
import AdminFuelPanel from '@/components/dumpTruck/AdminFuelPanel'
import AdminDriverTaxPanel from '@/components/dumpTruck/AdminDriverTaxPanel'
import BrokerPicker, { type BrokerOption } from '@/components/dumpTruck/BrokerPicker'
import TicketSheet from '@/components/dumpTruck/TicketSheet'
import { TICKET_FIELD_CATALOG } from '@/lib/fleet/dumpTruck/ticketTemplates'

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
      <div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>Dump Truck Mode — Setup</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>
          Minimal setup screens for sites and jobs so drivers can run a full day. Trucks/trailers come from the
          existing fleet equipment registry — add them there first if the lists below are empty. The full
          geocoding/map-pin location directory (spec §6) is a follow-up build, not included here.
        </p>
      </div>

      <OpenDefectsPanel equipment={equipment} drivers={drivers} />
      <SitesPanel sites={sites} onCreated={reload} />
      <PendingDealsPanel jobs={jobs} sites={sites} equipment={equipment} drivers={drivers} onAccepted={reload} />
      <JobsPanel jobs={jobs} sites={sites} equipment={equipment} drivers={drivers} brokers={brokers} onBrokersChanged={reload} onCreated={reload} />
      <TicketTemplatesPanel brokers={brokers} />
      <PayPolicyPanel drivers={drivers} />
      <AdminDriverTaxPanel drivers={drivers} />
      <AdminPayrollHoursPanel drivers={drivers} />
      <AdminFuelPanel />
      <AdminActivityLogPanel drivers={drivers} />

      <ToastContainer />
    </div>
  )
}

interface DefectDTO {
  id: string
  truckId: string
  trailerId: string | null
  description: string
  severity: 'monitor' | 'non_safety' | 'safety_critical' | 'out_of_service'
  status: 'open' | 'acknowledged' | 'resolved' | 'deferred'
  reportedBy: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  acknowledgedAt: string | null
  resolutionNotes: string | null
  createdAt: string
  photoDocumentId: string | null
  lat: number | null
  lng: number | null
  assignedTo: string | null
}

const SEVERITY_COLOR: Record<DefectDTO['severity'], string> = {
  monitor: 'var(--muted)', non_safety: 'var(--muted)', safety_critical: 'var(--warn)', out_of_service: 'var(--error)',
}
const SEVERITY_LABEL: Record<DefectDTO['severity'], string> = {
  monitor: 'Monitor', non_safety: 'Non-Safety', safety_critical: 'Safety-Critical', out_of_service: 'Out of Service',
}

function formatDowntime(ms: number): string {
  if (ms < 0) return '0m'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Simple keyword clustering — no vendor/booking integration, just a hint that
// multiple trucks have the same kind of open issue so one shop visit/appointment
// can cover all of them instead of separate calls.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Tires: ['tire', 'tread'],
  Brakes: ['brake'],
  Lights: ['light', 'lamp', 'signal', 'blinker'],
  Hydraulics: ['hydraulic', 'hoist', 'ram', 'cylinder'],
  Engine: ['engine', 'oil leak', 'coolant', 'overheat'],
  Electrical: ['electrical', 'battery', 'alternator', 'wiring'],
}

function groupSimilarOpenDefects(defects: DefectDTO[], unitFor: (id: string) => string) {
  const open = defects.filter(d => d.status === 'open' || d.status === 'acknowledged')
  const byCategory = new Map<string, { truckId: string; unit: string }[]>()

  for (const d of open) {
    const text = d.description.toLowerCase()
    const category = Object.keys(CATEGORY_KEYWORDS).find(cat => CATEGORY_KEYWORDS[cat].some(kw => text.includes(kw)))
    if (!category) continue
    const list = byCategory.get(category) ?? []
    if (!list.some(t => t.truckId === d.truckId)) list.push({ truckId: d.truckId, unit: unitFor(d.truckId) })
    byCategory.set(category, list)
  }

  return [...byCategory.entries()].filter(([, trucks]) => trucks.length >= 2)
}

type DispositionAction =
  | 'acknowledge' | 'request_details' | 'assign_maintenance'
  | 'place_on_hold' | 'mark_operable' | 'resolve' | 'reopen' | 'defer'

/** Actions that show an inline note field before firing — required ones match
 *  defectDisposition.ts's requiresReason/requiresInstruction; resolve's note
 *  is optional (same as the old "resolution notes" textarea). */
const NOTE_ACTIONS: Partial<Record<DispositionAction, { field: 'reason' | 'instruction'; required: boolean; placeholder: string; confirmLabel: string }>> = {
  resolve: { field: 'reason', required: false, placeholder: 'Resolution notes (optional)', confirmLabel: 'Confirm Resolved' },
  place_on_hold: { field: 'reason', required: true, placeholder: 'Why is this truck being placed on hold? (required)', confirmLabel: 'Place on Hold' },
  request_details: { field: 'reason', required: true, placeholder: 'What details are you requesting from the driver? (required)', confirmLabel: 'Send Request' },
  mark_operable: { field: 'instruction', required: true, placeholder: 'Instruction for the driver — e.g. "daylight only until repaired" (required)', confirmLabel: 'Release Hold' },
}

/**
 * Open Defects / dispatch defect inbox (spec §5.1) — acknowledge, request
 * details, assign to maintenance, place a truck on hold, mark operable with
 * an instruction, resolve, or reopen. Every action goes through
 * /disposition, which writes an append-only audit row (who/when/reason/
 * instruction/before-after) in addition to whatever it changes on the
 * defect or (hold/release) the truck. Shows downtime, attached photo, and
 * whether the defect's truck is currently on a dispatch-authorized hold.
 */
function OpenDefectsPanel({ equipment, drivers }: { equipment: { trucks: EquipmentOption[]; trailers: EquipmentOption[] }; drivers: DriverOption[] }) {
  const [defects, setDefects] = useState<DefectDTO[]>([])
  const [showResolved, setShowResolved] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignedTo, setAssignedTo] = useState('')
  const [noteAction, setNoteAction] = useState<{ id: string; action: DispositionAction } | null>(null)
  const [noteText, setNoteText] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const reload = () => {
    fetch('/api/fleet/dump-truck/defects').then(r => r.json()).then(b => setDefects(b.defects ?? []))
  }
  useEffect(reload, [])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const truckFor = (id: string) => equipment.trucks.find(t => t.id === id)
  const unitFor = (id: string) => truckFor(id)?.unitNumber ?? equipment.trailers.find(t => t.id === id)?.unitNumber ?? '—'
  const nameFor = (id: string | null) => drivers.find(d => d.userId === id)?.name ?? '—'

  const visible = defects.filter(d => showResolved || d.status !== 'resolved')

  const disposition = async (id: string, action: DispositionAction, extra?: { reason?: string; instruction?: string; assignedTo?: string }) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/fleet/dump-truck/defects/${id}/disposition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not update defect')
      toast.success(
        action === 'place_on_hold' ? 'Truck placed on hold' :
        action === 'mark_operable' ? 'Truck hold released' :
        action === 'resolve' ? 'Defect resolved' : `Defect ${action.replace('_', ' ')}`,
      )
      setNoteAction(null)
      setNoteText('')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update defect')
    } finally {
      setBusyId(null)
    }
  }

  const startNoteAction = (id: string, action: DispositionAction) => {
    if (NOTE_ACTIONS[action]) { setNoteAction({ id, action }); setNoteText(''); return }
    disposition(id, action)
  }

  const confirmNoteAction = () => {
    if (!noteAction) return
    const cfg = NOTE_ACTIONS[noteAction.action]
    if (cfg?.required && !noteText.trim()) return
    disposition(noteAction.id, noteAction.action, cfg?.field === 'instruction' ? { instruction: noteText } : { reason: noteText })
  }

  const assign = async (id: string, to: string) => {
    await disposition(id, 'assign_maintenance', { assignedTo: to })
    setAssigningId(null)
    setAssignedTo('')
  }

  const viewPhoto = async (documentId: string) => {
    try {
      const res = await fetch(`/api/fleet/dump-truck/documents/${documentId}`)
      if (!res.ok) throw new Error('Could not load photo')
      const { url } = await res.json()
      window.open(url, '_blank')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load photo')
    }
  }

  const openCount = defects.filter(d => d.status === 'open' || d.status === 'acknowledged').length

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
          Open Defects {openCount > 0 && <span style={{ color: 'var(--error)' }}>({openCount})</span>}
        </h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.78rem', color: 'var(--muted)' }}>
          <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} /> Show resolved
        </label>
      </div>

      {groupSimilarOpenDefects(defects, unitFor).map(([category, trucks]) => (
        <div key={category} style={{ marginBottom: '.6rem', padding: '.6rem .75rem', borderRadius: 10, background: 'rgba(245,194,0,.1)', border: '1px solid var(--warn)', fontSize: '.8rem', color: 'var(--warn)', fontWeight: 700 }}>
          🔧 {trucks.length} trucks need {category.toLowerCase()} work ({trucks.map(t => t.unit).join(', ')}) — consider booking one appointment to save a call.
        </div>
      ))}

      {visible.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>No open defects.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
        {visible.map(d => {
          const downtimeMs = (d.resolvedAt ? new Date(d.resolvedAt).getTime() : now) - new Date(d.createdAt).getTime()
          const truck = truckFor(d.truckId)
          const onHold = truck?.holdStatus === 'on_hold'
          return (
            <div key={d.id} style={{ border: onHold ? '1px solid var(--error)' : '1px solid var(--border)', borderRadius: 10, padding: '.75rem' }}>
              {onHold && (
                <div style={{ marginBottom: '.5rem', padding: '.5rem .6rem', borderRadius: 8, background: 'rgba(220,38,38,.1)', fontSize: '.78rem', fontWeight: 700, color: 'var(--error)' }}>
                  🚫 {unitFor(d.truckId)} is on a dispatch hold{truck?.holdReason ? ` — ${truck.holdReason}` : ''}. Driver cannot start custody until released.
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <span style={{ fontWeight: 800, color: SEVERITY_COLOR[d.severity], fontSize: '.78rem' }}>{SEVERITY_LABEL[d.severity]}</span>
                  {' — '}<span style={{ fontWeight: 700 }}>{unitFor(d.truckId)}</span>
                  <span style={{ color: 'var(--muted)', fontSize: '.78rem' }}> · reported by {nameFor(d.reportedBy)}</span>
                </div>
                <span style={{ fontSize: '.72rem', color: 'var(--muted)', flexShrink: 0 }}>{new Date(d.createdAt).toLocaleString()}</span>
              </div>
              <div style={{ margin: '.4rem 0', fontSize: '.85rem' }}>{d.description}</div>
              <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '.78rem', color: 'var(--muted)' }}>
                <span>⏱ Downtime: <strong style={{ color: 'var(--text)' }}>{formatDowntime(downtimeMs)}</strong>{!d.resolvedAt && ' (running)'}</span>
                <span>Status: <strong style={{ color: 'var(--text)' }}>{d.status}</strong></span>
                {d.acknowledgedAt && (
                  <span>🚗 Arrived: <strong style={{ color: 'var(--text)' }}>{new Date(d.acknowledgedAt).toLocaleString()}</strong></span>
                )}
                {d.resolvedAt && (
                  <span>✅ Left/Done: <strong style={{ color: 'var(--text)' }}>{new Date(d.resolvedAt).toLocaleString()}</strong></span>
                )}
                {d.photoDocumentId && (
                  <button onClick={() => viewPhoto(d.photoDocumentId!)} style={{ color: 'var(--primary)', fontWeight: 700 }}>📷 View Photo</button>
                )}
                {d.lat != null && d.lng != null && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}&travelmode=driving`}
                    target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 700 }}
                  >
                    📍 Driver's Location
                  </a>
                )}
              </div>
              {d.resolutionNotes && <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 4 }}>Resolution: {d.resolutionNotes}</div>}

              {assigningId === d.id ? (
                <div style={{ marginTop: '.5rem', display: 'flex', gap: 6 }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }} placeholder="Who's handling it — shop, tow company, mobile tech…"
                    value={assignedTo} onChange={e => setAssignedTo(e.target.value)} autoFocus
                  />
                  <button onClick={() => assign(d.id, assignedTo)} style={{ ...btnStyle, padding: '.4rem .8rem', fontSize: '.78rem' }}>Save</button>
                  <button onClick={() => setAssigningId(null)} style={{ padding: '.4rem .8rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '.78rem' }}>Cancel</button>
                </div>
              ) : (
                <div style={{ marginTop: '.4rem', fontSize: '.78rem', color: 'var(--muted)' }}>
                  {d.assignedTo ? <>🔧 Assigned to <strong style={{ color: 'var(--text)' }}>{d.assignedTo}</strong></> : 'Not yet assigned'}
                  {' '}
                  <button onClick={() => { setAssigningId(d.id); setAssignedTo(d.assignedTo ?? '') }} style={{ color: 'var(--primary)', fontWeight: 700 }}>
                    {d.assignedTo ? 'Change' : 'Assign'}
                  </button>
                </div>
              )}

              {noteAction?.id === d.id ? (
                <div style={{ marginTop: '.6rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea
                    style={{ ...inputStyle, minHeight: 50 }} placeholder={NOTE_ACTIONS[noteAction.action]?.placeholder}
                    value={noteText} onChange={e => setNoteText(e.target.value)} autoFocus
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={confirmNoteAction}
                      disabled={busyId === d.id || (NOTE_ACTIONS[noteAction.action]?.required && !noteText.trim())}
                      style={{ ...btnStyle, padding: '.4rem .8rem', fontSize: '.78rem', opacity: busyId === d.id ? .6 : 1 }}
                    >
                      {busyId === d.id ? 'Saving…' : NOTE_ACTIONS[noteAction.action]?.confirmLabel}
                    </button>
                    <button onClick={() => { setNoteAction(null); setNoteText('') }} style={{ padding: '.4rem .8rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '.78rem' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, marginTop: '.6rem', flexWrap: 'wrap' }}>
                  {d.status === 'open' && (
                    <button disabled={busyId === d.id} onClick={() => disposition(d.id, 'acknowledge')} style={{ padding: '.4rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '.78rem', fontWeight: 700 }}>🚗 Mark Arrived</button>
                  )}
                  <button disabled={busyId === d.id} onClick={() => startNoteAction(d.id, 'request_details')} style={{ padding: '.4rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '.78rem', fontWeight: 700 }}>❓ Request Details</button>
                  {onHold ? (
                    <button disabled={busyId === d.id} onClick={() => startNoteAction(d.id, 'mark_operable')} style={{ padding: '.4rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--warn)', color: 'var(--warn)', fontSize: '.78rem', fontWeight: 700 }}>✅ Mark Operable / Release Hold</button>
                  ) : (
                    <button disabled={busyId === d.id} onClick={() => startNoteAction(d.id, 'place_on_hold')} style={{ padding: '.4rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--error)', color: 'var(--error)', fontSize: '.78rem', fontWeight: 700 }}>🚫 Place Truck on Hold</button>
                  )}
                  {d.status !== 'resolved' && (
                    <>
                      <button disabled={busyId === d.id} onClick={() => startNoteAction(d.id, 'resolve')} style={{ ...btnStyle, padding: '.4rem .8rem', fontSize: '.78rem' }}>✅ Mark Left / Done</button>
                      {(d.status === 'open' || d.status === 'acknowledged') && (
                        <button disabled={busyId === d.id} onClick={() => disposition(d.id, 'defer')} style={{ padding: '.4rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '.78rem', fontWeight: 700 }}>Defer</button>
                      )}
                    </>
                  )}
                  {(d.status === 'resolved' || d.status === 'deferred') && (
                    <button disabled={busyId === d.id} onClick={() => disposition(d.id, 'reopen')} style={{ padding: '.4rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '.78rem', fontWeight: 700 }}>↩️ Reopen</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SitesPanel({ sites, onCreated }: { sites: DumpTruckSite[]; onCreated: () => void }) {
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
      toast.success('Fields filled — review before saving')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read screenshot')
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
      toast.success('Fields filled — review before saving')
      setAiText('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not parse location')
    } finally {
      setAiBusy(false)
    }
  }

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

      {!aiOpen ? (
        <button
          onClick={() => setAiOpen(true)}
          style={{ marginBottom: '1rem', padding: '.55rem .9rem', borderRadius: 9, border: '1px dashed rgba(0,232,176,.4)', background: 'rgba(0,232,176,.06)', color: 'var(--primary)', fontWeight: 700, fontSize: '.8rem' }}
        >
          ✨ AI Fill from Screenshot or Location
        </button>
      ) : (
        <div style={{ marginBottom: '1rem', padding: '.85rem', borderRadius: 10, border: '1px solid rgba(0,232,176,.25)', background: 'rgba(0,232,176,.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
            <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--primary)' }}>✨ AI Fill</div>
            <button onClick={() => setAiOpen(false)} style={{ color: 'var(--muted)', fontSize: '.75rem' }}>✕</button>
          </div>
          <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: '.6rem' }}>
            Screenshot a maps app pin (Apple/Google Maps), or type/paste coordinates or a description — fills the
            fields below for you to review before saving.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => aiFileRef.current?.click()}
              disabled={aiBusy}
              style={{ padding: '.5rem .8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 700, fontSize: '.78rem', opacity: aiBusy ? .5 : 1 }}
            >
              📷 Upload Screenshot
            </button>
            <input
              ref={aiFileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) aiFillFromFile(f) }}
            />
            <input
              style={{ ...inputStyle, flex: 1, minWidth: 220 }}
              placeholder="39.073470, -119.940673  or  corner of Heaven Hill Way & Conestoga Dr, Carson City NV"
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
              {aiBusy ? 'Working…' : 'Fill'}
            </button>
          </div>
        </div>
      )}

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
        <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}><th>Name</th><th>Type</th><th>City/State</th><th>Coords</th><th>Status</th></tr></thead>
        <tbody>
          {sites.map(s => (
            <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '.4rem 0' }}>{s.name}</td>
              <td>{s.siteType}</td>
              <td>{[s.city, s.state].filter(Boolean).join(', ') || '—'}</td>
              <td>{s.lat != null ? `${s.lat.toFixed(4)}, ${s.lng!.toFixed(4)}` : '—'}</td>
              <td>
                {s.verified
                  ? <span style={{ color: 'var(--success)', fontWeight: 700 }}>✓ Verified</span>
                  : <span style={{ color: 'var(--warn)', fontWeight: 700 }} title="Address/GPS not yet confirmed with dispatch">⚠ Unverified</span>}
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
    if (!pick?.driverId || !pick?.truckId) { toast.error('Pick a driver and truck first'); return }
    setBusy(job.id)
    try {
      const res = await fetch(`/api/fleet/dump-truck/jobs/${job.id}/accept`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: pick.driverId, truckId: pick.truckId, trailerId: pick.trailerId || null }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not accept deal')
      toast.success(`${job.jobNumber} scheduled`)
      onAccepted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not accept deal')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ ...cardStyle, border: '1px solid var(--warn, #d99a2b)' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.25rem' }}>Pending Broker Deals ({proposed.length})</h2>
      <p style={{ color: 'var(--muted)', fontSize: '.8rem', marginBottom: '1rem' }}>
        Everything else came from the broker — pick a driver and truck (closest truck to pickup is pre-selected) and accept.
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
                {job.material ?? 'Material n/a'} · {pickupName ?? 'pickup n/a'} → {dumpName ?? 'dump n/a'}
                {job.pricePerHour ? ` · $${job.pricePerHour}/hr` : ''}{job.pricePerTon ? ` · $${job.pricePerTon}/ton` : ''}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem', marginBottom: '.75rem' }}>
                <Field label="Driver">
                  <select style={inputStyle} value={pick.driverId} onChange={e => setPicks(p => ({ ...p, [job.id]: { ...pick, driverId: e.target.value } }))}>
                    <option value="">Select…</option>
                    {drivers.map(d => <option key={d.userId} value={d.userId}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="Truck (closest first)">
                  <select style={inputStyle} value={pick.truckId} onChange={e => setPicks(p => ({ ...p, [job.id]: { ...pick, truckId: e.target.value } }))}>
                    <option value="">Select…</option>
                    {sortedTrucks.map(t => <option key={t.id} value={t.id}>{t.unitNumber}{t.currentLat != null ? '' : ' (no location yet)'}</option>)}
                  </select>
                </Field>
                <Field label="Trailer">
                  <select style={inputStyle} value={pick.trailerId} onChange={e => setPicks(p => ({ ...p, [job.id]: { ...pick, trailerId: e.target.value } }))}>
                    <option value="">None</option>
                    {equipment.trailers.map(t => <option key={t.id} value={t.id}>{t.unitNumber}</option>)}
                  </select>
                </Field>
              </div>
              <button style={{ ...btnStyle, opacity: busy === job.id ? .5 : 1 }} disabled={busy === job.id} onClick={() => accept(job)}>
                {busy === job.id ? 'Accepting…' : 'Accept & Assign'}
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
    if (!form.jobNumber) { toast.error('Job number is required'); return }
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
        <Field label="Freight Bill #"><input style={inputStyle} value={form.freightBillNumber} onChange={e => setForm({ ...form, freightBillNumber: e.target.value })} /></Field>
        <Field label="Customer"><input style={inputStyle} value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} /></Field>
        <Field label="Broker">
          <BrokerPicker
            brokers={brokers}
            brokerId={form.brokerId || null}
            onChange={(brokerId, brokerName) => setForm({ ...form, brokerId: brokerId ?? '', brokerName })}
            onBrokerCreated={onBrokersChanged}
          />
        </Field>
        <Field label="Material"><input style={inputStyle} value={form.material} onChange={e => setForm({ ...form, material: e.target.value })} /></Field>
        <Field label="Est. Quantity (daily goal)">
          <input style={inputStyle} type="number" min="0" value={form.estQuantity} onChange={e => setForm({ ...form, estQuantity: e.target.value })} placeholder="e.g. 5" />
        </Field>
        <Field label="Quantity Unit">
          <select style={inputStyle} value={form.quantityUnit} onChange={e => setForm({ ...form, quantityUnit: e.target.value as DumpTruckJob['quantityUnit'] })}>
            <option value="loads">Loads</option>
            <option value="tons">Tons</option>
            <option value="cubic_yards">Cubic Yards</option>
            <option value="hours">Hours</option>
            <option value="miles">Miles</option>
            <option value="units">Units</option>
          </select>
        </Field>
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
        <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}><th>Job #</th><th>Customer</th><th>Driver</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {jobs.map(j => (
            <tr key={j.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '.4rem 0' }}>{j.jobNumber}</td>
              <td>{j.customerName ?? '—'}</td>
              <td>{drivers.find(d => d.userId === j.driverId)?.name ?? '—'}</td>
              <td>{j.status}</td>
              <td>
                {j.driverId && (
                  <button
                    onClick={() => setTicketJob(j)}
                    style={{
                      fontSize: '.72rem', fontWeight: 700, padding: '.3rem .6rem', borderRadius: 6,
                      background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--primary)',
                    }}
                  >
                    🎫 Ticket
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
      toast.success('Ticket template saved')
      reloadTemplates()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save template')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.25rem' }}>Dispatch Ticket Templates</h2>
      <p style={{ color: 'var(--muted)', fontSize: '.8rem', marginBottom: '1rem' }}>
        Choose which fields show on the digital dispatch ticket and whether it requires a company/driver signature —
        per broker, or the generic Fleet Commander default used for jobs with no broker.
      </p>

      <Field label="Template For">
        <select style={inputStyle} value={selectedBrokerId} onChange={e => setSelectedBrokerId(e.target.value)}>
          <option value="">Fleet Commander (Generic)</option>
          {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>

      <div style={{ marginTop: '1rem' }}>
        <Field label="Template Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></Field>
      </div>

      <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const, margin: '1rem 0 .5rem' }}>
        Fields Shown On Ticket
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
          Requires company sign-off
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem', fontWeight: 700 }}>
          <input type="checkbox" checked={requiresDriverSignature} onChange={e => setRequiresDriverSignature(e.target.checked)} />
          Requires driver signature
        </label>
      </div>

      <button style={{ ...btnStyle, opacity: busy ? .5 : 1 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save Template'}</button>
    </div>
  )
}

interface PayPolicyState {
  baseHourlyRate: string; dailyOtThresholdHours: string; otMultiplier: string
  payType: 'hourly' | 'per_mile' | 'greater_of_hourly_or_revenue_share'; ratePerMile: string
  revenueSharePct: string; dispatchMinimumHours: string
}

const EMPTY_PAY_POLICY: PayPolicyState = {
  baseHourlyRate: '32.00', dailyOtThresholdHours: '8.00', otMultiplier: '1.50', payType: 'hourly', ratePerMile: '0.65',
  revenueSharePct: '25', dispatchMinimumHours: '4',
}

function PayPolicyFields({ state, onChange }: { state: PayPolicyState; onChange: (s: PayPolicyState) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem' }}>
      <Field label="Pay Type">
        <select style={inputStyle} value={state.payType} onChange={e => onChange({ ...state, payType: e.target.value as PayPolicyState['payType'] })}>
          <option value="hourly">Hourly + Daily OT</option>
          <option value="per_mile">Per-Mile</option>
          <option value="greater_of_hourly_or_revenue_share">Greater of Hourly or Revenue Share</option>
        </select>
      </Field>
      {state.payType === 'per_mile' ? (
        <Field label="Rate Per Mile ($)"><input style={inputStyle} type="number" step="0.01" value={state.ratePerMile} onChange={e => onChange({ ...state, ratePerMile: e.target.value })} /></Field>
      ) : (
        <>
          <Field label={state.payType === 'greater_of_hourly_or_revenue_share' ? 'Minimum Hourly Rate ($)' : 'Base Hourly Rate ($)'}>
            <input style={inputStyle} type="number" step="0.01" value={state.baseHourlyRate} onChange={e => onChange({ ...state, baseHourlyRate: e.target.value })} />
          </Field>
          <Field label="Daily OT Threshold (hrs)"><input style={inputStyle} type="number" step="0.25" value={state.dailyOtThresholdHours} onChange={e => onChange({ ...state, dailyOtThresholdHours: e.target.value })} /></Field>
          <Field label="OT Multiplier"><input style={inputStyle} type="number" step="0.05" value={state.otMultiplier} onChange={e => onChange({ ...state, otMultiplier: e.target.value })} /></Field>
        </>
      )}
      {state.payType === 'greater_of_hourly_or_revenue_share' && (
        <>
          <Field label="Revenue Share (%)"><input style={inputStyle} type="number" step="0.5" value={state.revenueSharePct} onChange={e => onChange({ ...state, revenueSharePct: e.target.value })} /></Field>
          <Field label="Dispatch Minimum (hrs)"><input style={inputStyle} type="number" step="0.5" value={state.dispatchMinimumHours} onChange={e => onChange({ ...state, dispatchMinimumHours: e.target.value })} /></Field>
        </>
      )}
    </div>
  )
}

function PayPolicyPanel({ drivers }: { drivers: DriverOption[] }) {
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
        Business default — powers the &quot;Estimated Earnings&quot; figures on the driver hours portal for any
        driver without their own override below. Hourly + daily-OT or a flat per-mile rate. This is{' '}
        <strong>not</strong> a full payroll engine: per-load/per-ton/detention rates, weekly overtime,
        double-time, and payroll approval are not implemented.
        {isDefault && ' Currently using the built-in default (not yet saved for this business).'}
      </p>
      <PayPolicyFields state={state} onChange={setState} />
      <button style={{ ...btnStyle, opacity: busy ? .5 : 1, marginTop: '1rem' }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save Default Pay Policy'}</button>

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
  } | null
}

function DriverPayOverridesPanel({ drivers }: { drivers: DriverOption[] }) {
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
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save override')
      toast.success('Driver pay override saved')
      setEditingId(null)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save override')
    } finally {
      setBusy(false)
    }
  }

  const removeOverride = async (driverId: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/fleet/dump-truck/pay-policy?driverId=${driverId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not remove override')
      toast.success('Reverted to business default')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove override')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
      <h3 style={{ fontSize: '.95rem', fontWeight: 800, marginBottom: '.4rem' }}>Per-Driver Pay Overrides</h3>
      <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: '.75rem' }}>
        Some drivers can be hourly while others are paid per-mile — set an override here for any driver who
        shouldn&apos;t use the business default above.
      </p>
      {loading && <div style={{ color: 'var(--muted)', fontSize: '.8rem' }}>Loading…</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(row => (
          <div key={row.userId} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '.6rem .75rem', background: 'var(--surface-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '.85rem' }}>{row.name}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                  {row.override
                    ? row.override.payType === 'per_mile' ? `Per-mile — $${row.override.ratePerMile}/mi`
                      : row.override.payType === 'greater_of_hourly_or_revenue_share' ? `Greater of $${row.override.baseHourlyRate}/hr or ${row.override.revenueSharePct}% of revenue`
                        : `Hourly — $${row.override.baseHourlyRate}/hr`
                    : 'Using business default'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {row.override && (
                  <button onClick={() => removeOverride(row.userId)} disabled={busy} style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--error)', padding: '.3rem .6rem', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    Remove
                  </button>
                )}
                <button onClick={() => startEdit(row)} disabled={busy} style={{ fontSize: '.72rem', fontWeight: 700, padding: '.3rem .6rem', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--primary)' }}>
                  {row.override ? 'Edit' : 'Set Override'}
                </button>
              </div>
            </div>
            {editingId === row.userId && (
              <div style={{ marginTop: '.75rem', paddingTop: '.75rem', borderTop: '1px solid var(--border)' }}>
                <PayPolicyFields state={editState} onChange={setEditState} />
                <div style={{ display: 'flex', gap: 8, marginTop: '.6rem' }}>
                  <button style={{ ...btnStyle, opacity: busy ? .5 : 1 }} disabled={busy} onClick={() => saveOverride(row.userId)}>{busy ? 'Saving…' : 'Save'}</button>
                  <button style={{ ...btnStyle, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
