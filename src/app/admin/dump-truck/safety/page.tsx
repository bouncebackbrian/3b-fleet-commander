'use client'
/**
 * /admin/dump-truck/safety — Safety & Escalation
 *
 * Was previously the "Open Defects" panel embedded at the top of the Sites &
 * Jobs setup page — moved out to its own tab since defect/hold escalations
 * and accident/incident reports aren't setup work, they're an ongoing
 * safety inbox. Incident photos captured on /driver/dump-truck already have
 * date/time + GPS coordinates + a map thumbnail burned into the image
 * itself (see src/lib/dumpTruck/photoStamp.ts) before they ever reach this
 * page.
 */
import { useEffect, useState } from 'react'
import { toast } from '@/hooks/useToast'
import ToastContainer from '@/components/shared/ToastContainer'
import type { EquipmentOption } from '@/lib/fleet/dumpTruck/equipment'
import type { DriverOption } from '@/lib/fleet/dumpTruck/jobs'
import { LanguageProvider, useLanguage } from '@/lib/i18n/LanguageContext'
import { safetyDict } from '@/lib/i18n/dictionaries/safety'
import LanguageToggle from '@/components/shared/LanguageToggle'

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }
const inputStyle: React.CSSProperties = { padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', width: '100%' }
const btnStyle: React.CSSProperties = { padding: '.65rem 1.2rem', borderRadius: 10, background: 'var(--primary)', color: '#04140f', fontWeight: 800 }

export default function DumpTruckSafetyPage() {
  return (
    <LanguageProvider dictionary={safetyDict}>
      <DumpTruckSafetyPageInner />
    </LanguageProvider>
  )
}

function DumpTruckSafetyPageInner() {
  const { t } = useLanguage()
  const [equipment, setEquipment] = useState<{ trucks: EquipmentOption[]; trailers: EquipmentOption[] }>({ trucks: [], trailers: [] })
  const [drivers, setDrivers] = useState<DriverOption[]>([])

  useEffect(() => {
    fetch('/api/fleet/dump-truck/equipment').then(r => r.json()).then(setEquipment)
    fetch('/api/fleet/dump-truck/drivers').then(r => r.json()).then(b => setDrivers(b.drivers ?? []))
  }, [])

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>{t('Safety')}</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: 4 }}>
            {t('Truck defect escalations and driver-reported incidents in one place. Setup for sites and jobs moved to the')}{' '}
            <a href="/admin/dump-truck" style={{ color: 'var(--primary)', fontWeight: 700 }}>{t('Sites & Jobs')}</a>{t(' page.')}
          </p>
        </div>
        <LanguageToggle />
      </div>

      <IncidentsPanel equipment={equipment} drivers={drivers} />
      <OpenDefectsPanel equipment={equipment} drivers={drivers} />

      <ToastContainer />
    </div>
  )
}

interface IncidentDTO {
  id: string
  incidentType: 'collision' | 'property_damage' | 'near_miss' | 'injury' | 'spill' | 'equipment_failure' | 'other'
  description: string
  occurredAt: string
  truckId: string | null
  jobId: string | null
  driverId: string
  lat: number | null
  lng: number | null
  injuries: boolean
  immediateSafetyStatus: 'safe' | 'needs_assistance' | 'emergency'
  policeReportNumber: string | null
  policeAgency: string | null
  photoDocumentId: string | null
  createdAt: string
}

const INCIDENT_TYPE_LABEL: Record<IncidentDTO['incidentType'], string> = {
  collision: 'Collision', property_damage: 'Property Damage', near_miss: 'Near Miss',
  injury: 'Injury', spill: 'Spill', equipment_failure: 'Equipment Failure', other: 'Other',
}
const SAFETY_STATUS_COLOR: Record<IncidentDTO['immediateSafetyStatus'], string> = {
  safe: 'var(--muted)', needs_assistance: 'var(--warn)', emergency: 'var(--error)',
}
const SAFETY_STATUS_LABEL: Record<IncidentDTO['immediateSafetyStatus'], string> = {
  safe: 'Safe', needs_assistance: 'Needs Assistance', emergency: 'Emergency',
}

/**
 * Driver-reported incidents (collision/property damage/near miss/injury/
 * spill/equipment failure) — dispatch/admin visibility only, no disposition
 * workflow yet (unlike defects). Photos, when attached, already have the
 * geotag/timestamp/map baked in by the driver's device before upload.
 */
function IncidentsPanel({ equipment, drivers }: { equipment: { trucks: EquipmentOption[]; trailers: EquipmentOption[] }; drivers: DriverOption[] }) {
  const { t } = useLanguage()
  const [incidents, setIncidents] = useState<IncidentDTO[]>([])

  useEffect(() => {
    fetch('/api/fleet/dump-truck/incidents').then(r => r.json()).then(b => setIncidents(b.incidents ?? []))
  }, [])

  const unitFor = (id: string | null) => (id && (equipment.trucks.find(t => t.id === id)?.unitNumber ?? equipment.trailers.find(t => t.id === id)?.unitNumber)) || '—'
  const nameFor = (id: string) => drivers.find(d => d.userId === id)?.name ?? '—'

  const viewPhoto = async (documentId: string) => {
    try {
      const res = await fetch(`/api/fleet/dump-truck/documents/${documentId}`)
      if (!res.ok) throw new Error(t('Could not load photo'))
      const { url } = await res.json()
      window.open(url, '_blank')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Could not load photo'))
    }
  }

  const urgentCount = incidents.filter(i => i.injuries || i.immediateSafetyStatus !== 'safe' || i.incidentType === 'collision').length

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '.75rem' }}>
        {t('Incidents')} {urgentCount > 0 && <span style={{ color: 'var(--error)' }}>{t('({count} urgent)', { count: urgentCount })}</span>}
      </h2>

      {incidents.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>{t('No incidents reported.')}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
        {incidents.map(i => {
          const urgent = i.injuries || i.immediateSafetyStatus !== 'safe' || i.incidentType === 'collision'
          return (
            <div key={i.id} style={{ border: urgent ? '1px solid var(--error)' : '1px solid var(--border)', borderRadius: 10, padding: '.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <span style={{ fontWeight: 800, color: SAFETY_STATUS_COLOR[i.immediateSafetyStatus], fontSize: '.78rem' }}>
                    {t(INCIDENT_TYPE_LABEL[i.incidentType])}
                  </span>
                  {' — '}<span style={{ fontWeight: 700 }}>{unitFor(i.truckId)}</span>
                  <span style={{ color: 'var(--muted)', fontSize: '.78rem' }}> · {t('reported by {name}', { name: nameFor(i.driverId) })}</span>
                </div>
                <span style={{ fontSize: '.72rem', color: 'var(--muted)', flexShrink: 0 }}>{new Date(i.occurredAt).toLocaleString()}</span>
              </div>
              <div style={{ margin: '.4rem 0', fontSize: '.85rem' }}>{i.description}</div>
              <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '.78rem', color: 'var(--muted)' }}>
                <span>{t('Safety status')}: <strong style={{ color: SAFETY_STATUS_COLOR[i.immediateSafetyStatus] }}>{t(SAFETY_STATUS_LABEL[i.immediateSafetyStatus])}</strong></span>
                {i.injuries && <span style={{ color: 'var(--error)', fontWeight: 700 }}>{t('⚠ Injuries reported')}</span>}
                {(i.policeReportNumber || i.policeAgency) && (
                  <span>{t('🚓 {agency} report {number}', { agency: i.policeAgency ?? t('Police'), number: i.policeReportNumber ?? '—' })}</span>
                )}
                {i.photoDocumentId && (
                  <button onClick={() => viewPhoto(i.photoDocumentId!)} style={{ color: 'var(--primary)', fontWeight: 700 }}>{t('📷 View Photo')}</button>
                )}
                {i.lat != null && i.lng != null && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${i.lat},${i.lng}&travelmode=driving`}
                    target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 700 }}
                  >
                    {t('📍 Scene Location')}
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
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
  const { t } = useLanguage()
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
        action === 'place_on_hold' ? t('Truck placed on hold') :
        action === 'mark_operable' ? t('Truck hold released') :
        action === 'resolve' ? t('Defect resolved') :
        action === 'acknowledge' ? t('Defect acknowledged') :
        action === 'request_details' ? t('Details requested') :
        action === 'assign_maintenance' ? t('Defect assigned') :
        action === 'reopen' ? t('Defect reopened') :
        action === 'defer' ? t('Defect deferred') : t('Defect updated'),
      )
      setNoteAction(null)
      setNoteText('')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Could not update defect'))
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
      if (!res.ok) throw new Error(t('Could not load photo'))
      const { url } = await res.json()
      window.open(url, '_blank')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Could not load photo'))
    }
  }

  const openCount = defects.filter(d => d.status === 'open' || d.status === 'acknowledged').length

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
          {t('Open Defects')} {openCount > 0 && <span style={{ color: 'var(--error)' }}>({openCount})</span>}
        </h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.78rem', color: 'var(--muted)' }}>
          <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} /> {t('Show resolved')}
        </label>
      </div>

      {groupSimilarOpenDefects(defects, unitFor).map(([category, categoryTrucks]) => (
        <div key={category} style={{ marginBottom: '.6rem', padding: '.6rem .75rem', borderRadius: 10, background: 'rgba(245,194,0,.1)', border: '1px solid var(--warn)', fontSize: '.8rem', color: 'var(--warn)', fontWeight: 700 }}>
          {t('🔧 {count} trucks need {category} work ({units}) — consider booking one appointment to save a call.', {
            count: categoryTrucks.length,
            category: t(category).toLowerCase(),
            units: categoryTrucks.map(ct => ct.unit).join(', '),
          })}
        </div>
      ))}

      {visible.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>{t('No open defects.')}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
        {visible.map(d => {
          const downtimeMs = (d.resolvedAt ? new Date(d.resolvedAt).getTime() : now) - new Date(d.createdAt).getTime()
          const truck = truckFor(d.truckId)
          const onHold = truck?.holdStatus === 'on_hold'
          return (
            <div key={d.id} style={{ border: onHold ? '1px solid var(--error)' : '1px solid var(--border)', borderRadius: 10, padding: '.75rem' }}>
              {onHold && (
                <div style={{ marginBottom: '.5rem', padding: '.5rem .6rem', borderRadius: 8, background: 'rgba(220,38,38,.1)', fontSize: '.78rem', fontWeight: 700, color: 'var(--error)' }}>
                  {t('🚫 {unit} is on a dispatch hold{reason}. Driver cannot start custody until released.', {
                    unit: unitFor(d.truckId),
                    reason: truck?.holdReason ? ` — ${truck.holdReason}` : '',
                  })}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <span style={{ fontWeight: 800, color: SEVERITY_COLOR[d.severity], fontSize: '.78rem' }}>{t(SEVERITY_LABEL[d.severity])}</span>
                  {' — '}<span style={{ fontWeight: 700 }}>{unitFor(d.truckId)}</span>
                  <span style={{ color: 'var(--muted)', fontSize: '.78rem' }}> · {t('reported by {name}', { name: nameFor(d.reportedBy) })}</span>
                </div>
                <span style={{ fontSize: '.72rem', color: 'var(--muted)', flexShrink: 0 }}>{new Date(d.createdAt).toLocaleString()}</span>
              </div>
              <div style={{ margin: '.4rem 0', fontSize: '.85rem' }}>{d.description}</div>
              <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '.78rem', color: 'var(--muted)' }}>
                <span>⏱ {t('Downtime')}: <strong style={{ color: 'var(--text)' }}>{formatDowntime(downtimeMs)}</strong>{!d.resolvedAt && ` (${t('running')})`}</span>
                <span>{t('Status')}: <strong style={{ color: 'var(--text)' }}>{t(d.status)}</strong></span>
                {d.acknowledgedAt && (
                  <span>🚗 {t('Arrived')}: <strong style={{ color: 'var(--text)' }}>{new Date(d.acknowledgedAt).toLocaleString()}</strong></span>
                )}
                {d.resolvedAt && (
                  <span>✅ {t('Left/Done')}: <strong style={{ color: 'var(--text)' }}>{new Date(d.resolvedAt).toLocaleString()}</strong></span>
                )}
                {d.photoDocumentId && (
                  <button onClick={() => viewPhoto(d.photoDocumentId!)} style={{ color: 'var(--primary)', fontWeight: 700 }}>{t('📷 View Photo')}</button>
                )}
                {d.lat != null && d.lng != null && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}&travelmode=driving`}
                    target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 700 }}
                  >
                    {t("📍 Driver's Location")}
                  </a>
                )}
              </div>
              {d.resolutionNotes && <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 4 }}>{t('Resolution')}: {d.resolutionNotes}</div>}

              {assigningId === d.id ? (
                <div style={{ marginTop: '.5rem', display: 'flex', gap: 6 }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }} placeholder={t("Who's handling it — shop, tow company, mobile tech…")}
                    value={assignedTo} onChange={e => setAssignedTo(e.target.value)} autoFocus
                  />
                  <button onClick={() => assign(d.id, assignedTo)} style={{ ...btnStyle, padding: '.4rem .8rem', fontSize: '.78rem' }}>{t('Save')}</button>
                  <button onClick={() => setAssigningId(null)} style={{ padding: '.4rem .8rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '.78rem' }}>{t('Cancel')}</button>
                </div>
              ) : (
                <div style={{ marginTop: '.4rem', fontSize: '.78rem', color: 'var(--muted)' }}>
                  {d.assignedTo ? <>🔧 {t('Assigned to')} <strong style={{ color: 'var(--text)' }}>{d.assignedTo}</strong></> : t('Not yet assigned')}
                  {' '}
                  <button onClick={() => { setAssigningId(d.id); setAssignedTo(d.assignedTo ?? '') }} style={{ color: 'var(--primary)', fontWeight: 700 }}>
                    {d.assignedTo ? t('Change') : t('Assign')}
                  </button>
                </div>
              )}

              {noteAction?.id === d.id ? (
                <div style={{ marginTop: '.6rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea
                    style={{ ...inputStyle, minHeight: 50 }} placeholder={NOTE_ACTIONS[noteAction.action]?.placeholder ? t(NOTE_ACTIONS[noteAction.action]!.placeholder) : undefined}
                    value={noteText} onChange={e => setNoteText(e.target.value)} autoFocus
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={confirmNoteAction}
                      disabled={busyId === d.id || (NOTE_ACTIONS[noteAction.action]?.required && !noteText.trim())}
                      style={{ ...btnStyle, padding: '.4rem .8rem', fontSize: '.78rem', opacity: busyId === d.id ? .6 : 1 }}
                    >
                      {busyId === d.id ? t('Saving…') : NOTE_ACTIONS[noteAction.action]?.confirmLabel ? t(NOTE_ACTIONS[noteAction.action]!.confirmLabel) : ''}
                    </button>
                    <button onClick={() => { setNoteAction(null); setNoteText('') }} style={{ padding: '.4rem .8rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '.78rem' }}>{t('Cancel')}</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, marginTop: '.6rem', flexWrap: 'wrap' }}>
                  {d.status === 'open' && (
                    <button disabled={busyId === d.id} onClick={() => disposition(d.id, 'acknowledge')} style={{ padding: '.4rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '.78rem', fontWeight: 700 }}>{t('🚗 Mark Arrived')}</button>
                  )}
                  <button disabled={busyId === d.id} onClick={() => startNoteAction(d.id, 'request_details')} style={{ padding: '.4rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '.78rem', fontWeight: 700 }}>{t('❓ Request Details')}</button>
                  {onHold ? (
                    <button disabled={busyId === d.id} onClick={() => startNoteAction(d.id, 'mark_operable')} style={{ padding: '.4rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--warn)', color: 'var(--warn)', fontSize: '.78rem', fontWeight: 700 }}>{t('✅ Mark Operable / Release Hold')}</button>
                  ) : (
                    <button disabled={busyId === d.id} onClick={() => startNoteAction(d.id, 'place_on_hold')} style={{ padding: '.4rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--error)', color: 'var(--error)', fontSize: '.78rem', fontWeight: 700 }}>{t('🚫 Place Truck on Hold')}</button>
                  )}
                  {d.status !== 'resolved' && (
                    <>
                      <button disabled={busyId === d.id} onClick={() => startNoteAction(d.id, 'resolve')} style={{ ...btnStyle, padding: '.4rem .8rem', fontSize: '.78rem' }}>{t('✅ Mark Left / Done')}</button>
                      {(d.status === 'open' || d.status === 'acknowledged') && (
                        <button disabled={busyId === d.id} onClick={() => disposition(d.id, 'defer')} style={{ padding: '.4rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '.78rem', fontWeight: 700 }}>{t('Defer')}</button>
                      )}
                    </>
                  )}
                  {(d.status === 'resolved' || d.status === 'deferred') && (
                    <button disabled={busyId === d.id} onClick={() => disposition(d.id, 'reopen')} style={{ padding: '.4rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '.78rem', fontWeight: 700 }}>{t('↩️ Reopen')}</button>
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
