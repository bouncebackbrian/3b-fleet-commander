'use client'
/**
 * ComplianceEventSheet — Log violations, warnings, repairs, and proof docs.
 *
 * Handles the full lifecycle:
 *   1. Log the event (type, severity, violation code, entities)
 *   2. Track repair (shop, cost, completion)
 *   3. Attach proof documents (photos, invoices, work orders)
 *   4. Update status → open → repair_pending → repair_submitted → verified
 */
import { useState, useEffect, useRef } from 'react'
import {
  COMPLIANCE_EVENT_META,
  COMPLIANCE_STATUS_META,
  SEVERITY_META,
  COMMON_VIOLATION_CODES,
  COMPLIANCE_DOC_LABELS,
  newComplianceEvent,
  saveComplianceEvent,
  captureGPS,
  type ComplianceEvent,
  type ComplianceEventType,
  type ComplianceStatus,
  type ComplianceSeverity,
  type ComplianceDocType,
  type ComplianceDocument,
} from '@/lib/complianceEvents'
import { logTimelineEvent } from '@/lib/timeline'
import type { LoadMission } from '@/lib/dashboard/types'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Event type groups
const VIOLATION_TYPES: ComplianceEventType[] = [
  'dot_violation', 'dot_warning', 'out_of_service',
  'weight_violation', 'log_violation',
]
const DEFECT_TYPES: ComplianceEventType[] = [
  'brake_defect', 'tire_defect', 'lighting_defect', 'equipment_defect',
]
const INSPECTION_TYPES: ComplianceEventType[] = [
  'roadside_inspection', 'terminal_inspection', 'inspection_passed', 'inspection_failed',
]
const REPAIR_TYPES: ComplianceEventType[] = [
  'repair_ordered', 'repair_completed', 'repair_verified', 'proof_uploaded',
]

const DOC_TYPES: ComplianceDocType[] = [
  'photo', 'insurance', 'repair_invoice', 'work_order', 'inspection_report', 'citation', 'court_notice', 'other',
]

interface Props {
  open:         boolean
  onClose:      () => void
  mission?:     LoadMission | null
  // If editing an existing event (to add repair/proof)
  existingEvent?: ComplianceEvent
}

type SectionId = 'event' | 'repair' | 'docs'

export default function ComplianceEventSheet({ open, onClose, mission, existingEvent }: Props) {
  const [event,        setEvent]        = useState<ComplianceEvent | null>(null)
  const [activeSection, setSection]     = useState<SectionId>('event')
  const [gpsCapturing, setGpsCapturing] = useState(false)
  const [showCodeRef,  setShowCodeRef]  = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [saveError,    setSaveError]    = useState<string | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [selectedDocType, setSelectedDocType] = useState<ComplianceDocType>('photo')
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setSaved(false); setSaving(false); setSection('event')

    if (existingEvent) {
      setEvent({ ...existingEvent })
    } else {
      const fresh = newComplianceEvent({
        truckNumber:   mission?.tractorId,
        trailerNumber: mission?.trailerNum,
        loadId:        mission?.id,
        orderNumber:   mission?.orderNumber,
      })
      setEvent(fresh)
    }

    setGpsCapturing(true)
    captureGPS().then(pos => {
      setGpsCapturing(false)
      if (pos) setEvent(prev => prev ? { ...prev, gpsLat: pos.lat, gpsLng: pos.lng } : prev)
    })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !event) return null

  function setF<K extends keyof ComplianceEvent>(k: K, v: ComplianceEvent[K]) {
    setEvent(prev => prev ? { ...prev, [k]: v } : prev)
  }

  async function handlePhotoAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setPhotoLoading(true)
    try {
      const docs: ComplianceDocument[] = await Promise.all(files.map(async f => ({
        id:         crypto.randomUUID(),
        docType:    selectedDocType,
        caption:    f.name,
        uploadedAt: new Date().toISOString(),
        dataUrl:    await fileToBase64(f),
      })))
      setEvent(prev => prev ? { ...prev, documents: [...prev.documents, ...docs] } : prev)
    } finally {
      setPhotoLoading(false)
      if (photoRef.current) photoRef.current.value = ''
    }
  }

  function removeDoc(id: string) {
    setEvent(prev => prev ? { ...prev, documents: prev.documents.filter(d => d.id !== id) } : prev)
  }

  async function handleSave() {
    if (!event || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await saveComplianceEvent(event)

      const isViolation = VIOLATION_TYPES.includes(event.eventType) || DEFECT_TYPES.includes(event.eventType)
      const isRepair    = REPAIR_TYPES.includes(event.eventType)
      const hasProof    = event.documents.length > 0

      void logTimelineEvent(
        event.eventType === 'dot_violation' || event.eventType === 'out_of_service'
          ? 'violation_created'
          : event.eventType === 'dot_warning'
          ? 'warning_created'
          : isRepair
          ? 'repair_started'
          : hasProof
          ? 'proof_uploaded'
          : 'warning_created',
        'compliance_command',
        {
          eventType:    event.eventType,
          severity:     event.severity,
          status:       event.status,
          truckNumber:  event.truckNumber,
          trailerNumber: event.trailerNumber,
          violationCode: event.violationCode,
          outOfService: event.outOfService,
          docCount:     event.documents.length,
        },
        event.loadId,
      )

      setSaved(true)
      setTimeout(() => { onClose(); setSaved(false) }, 900)
    } catch (err) {
      setSaving(false)
      setSaveError(err instanceof Error ? err.message : 'Could not save — try again.')
    }
  }

  const meta    = COMPLIANCE_EVENT_META[event.eventType]
  const sevMeta = SEVERITY_META[event.severity]
  const isRepairSection = event.status === 'repair_pending' || event.status === 'repair_submitted'

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        maxHeight: '92dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '.6rem 1.1rem .4rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>
                {meta.emoji} {existingEvent ? 'Update' : 'Log'} Compliance Event
              </div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 1, display: 'flex', gap: 8 }}>
                {gpsCapturing && <span style={{ color: 'var(--primary)' }}>📍 locating…</span>}
                {!gpsCapturing && event.gpsLat && <span style={{ color: 'var(--success)' }}>📍 GPS locked</span>}
                <span style={{ color: sevMeta.color, fontWeight: 800 }}>{sevMeta.label}</span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--muted)' }}>✕</button>
          </div>
        </div>

        {/* Section nav */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {([
            { id: 'event',  label: '📋 Event' },
            { id: 'repair', label: '🔧 Repair' },
            { id: 'docs',   label: `📎 Docs${event.documents.length ? ` (${event.documents.length})` : ''}` },
          ] as { id: SectionId; label: string }[]).map(s => (
            <button key={s.id} onClick={() => setSection(s.id)} style={{
              flex: 1, padding: '.55rem .5rem', background: 'none', border: 'none',
              borderBottom: `2px solid ${activeSection === s.id ? 'var(--primary)' : 'transparent'}`,
              color: activeSection === s.id ? 'var(--primary)' : 'var(--muted)',
              fontSize: '.75rem', fontWeight: 700, cursor: 'pointer',
            }}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem' }}>

          {/* ── EVENT TAB ── */}
          {activeSection === 'event' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Event type groups */}
              {[
                { label: '🚨 Violations & Warnings', types: VIOLATION_TYPES },
                { label: '⚙️ Equipment Defects',     types: DEFECT_TYPES    },
                { label: '🔍 Inspections',            types: INSPECTION_TYPES },
                { label: '🔧 Repairs & Proof',        types: REPAIR_TYPES    },
              ].map(group => (
                <div key={group.label}>
                  <div style={secLabel}>{group.label}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                    {group.types.map(t => {
                      const m = COMPLIANCE_EVENT_META[t]
                      const sel = event.eventType === t
                      return (
                        <button key={t} onClick={() => setF('eventType', t)} style={{
                          padding: '.3rem .65rem', borderRadius: 20, fontSize: '.78rem',
                          cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: sel ? 800 : 600,
                          border: `1.5px solid ${sel ? (VIOLATION_TYPES.includes(t) || DEFECT_TYPES.includes(t) ? 'var(--error)' : 'var(--primary)') : 'var(--border)'}`,
                          background: sel ? (VIOLATION_TYPES.includes(t) || DEFECT_TYPES.includes(t) ? 'rgba(232,64,0,.12)' : 'rgba(0,232,176,.1)') : 'var(--surface-2)',
                          color: sel ? (VIOLATION_TYPES.includes(t) || DEFECT_TYPES.includes(t) ? 'var(--error)' : 'var(--primary)') : 'var(--text)',
                        }}>
                          {m.emoji} {m.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Severity */}
              <div>
                <div style={secLabel}>Severity</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                  {(Object.keys(SEVERITY_META) as ComplianceSeverity[]).map(s => {
                    const sm = SEVERITY_META[s]
                    const sel = event.severity === s
                    return (
                      <button key={s} onClick={() => setF('severity', s)} style={{
                        padding: '.3rem .7rem', borderRadius: 20, fontSize: '.78rem', cursor: 'pointer',
                        border: `1.5px solid ${sel ? sm.color : 'var(--border)'}`,
                        background: sel ? `${sm.color}18` : 'var(--surface-2)',
                        color: sel ? sm.color : 'var(--muted)', fontWeight: sel ? 800 : 600,
                      }}>
                        {sm.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Status */}
              <div>
                <div style={secLabel}>Status</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                  {(Object.keys(COMPLIANCE_STATUS_META) as ComplianceStatus[]).map(s => {
                    const sm = COMPLIANCE_STATUS_META[s]
                    const sel = event.status === s
                    return (
                      <button key={s} onClick={() => setF('status', s)} style={{
                        padding: '.3rem .7rem', borderRadius: 20, fontSize: '.78rem', cursor: 'pointer',
                        border: `1.5px solid ${sel ? sm.color : 'var(--border)'}`,
                        background: sel ? `${sm.color}18` : 'var(--surface-2)',
                        color: sel ? sm.color : 'var(--muted)', fontWeight: sel ? 800 : 600,
                      }}>
                        {sm.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Violation code + OOS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    placeholder="Violation Code (e.g. 393.47)"
                    value={event.violationCode ?? ''}
                    onChange={e => setF('violationCode', e.target.value || undefined)}
                    style={{ ...inp, flex: 1 }}
                  />
                  <button onClick={() => setShowCodeRef(v => !v)} style={{
                    padding: '.5rem .65rem', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--surface-2)', color: 'var(--muted)', fontSize: '.72rem',
                    fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                    {showCodeRef ? '▲ Codes' : '▼ Codes'}
                  </button>
                </div>
                {showCodeRef && (
                  <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {COMMON_VIOLATION_CODES.map(c => (
                      <button key={c.code} onClick={() => { setF('violationCode', c.code); setShowCodeRef(false) }} style={{
                        width: '100%', textAlign: 'left', padding: '.45rem .75rem',
                        background: 'var(--surface-2)', border: 'none', borderBottom: '1px solid var(--border)',
                        cursor: 'pointer', fontSize: '.78rem', display: 'flex', gap: 10,
                      }}>
                        <span style={{ fontWeight: 800, color: 'var(--primary)', minWidth: 50 }}>{c.code}</span>
                        <span style={{ color: 'var(--muted)' }}>{c.desc}</span>
                      </button>
                    ))}
                  </div>
                )}
                <input placeholder="Inspection / Citation #" value={event.inspectionReport ?? ''} onChange={e => setF('inspectionReport', e.target.value || undefined)} style={inp} />
                <input placeholder="Officer Badge #" value={event.officerBadge ?? ''} onChange={e => setF('officerBadge', e.target.value || undefined)} style={inp} />
                <input placeholder="Location" value={event.inspectionLocation ?? ''} onChange={e => setF('inspectionLocation', e.target.value || undefined)} style={inp} />
              </div>

              {/* Entity context */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={secLabel}>Unit Context</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input placeholder="Truck #" value={event.truckNumber ?? ''} onChange={e => setF('truckNumber', e.target.value || undefined)} style={{ ...inp, flex: 1 }} />
                  <input placeholder="Trailer #" value={event.trailerNumber ?? ''} onChange={e => setF('trailerNumber', e.target.value || undefined)} style={{ ...inp, flex: 1 }} />
                </div>
                <input placeholder="Driver Name" value={event.driverName ?? ''} onChange={e => setF('driverName', e.target.value || undefined)} style={inp} />
                <input placeholder="Order / Load #" value={event.orderNumber ?? ''} onChange={e => setF('orderNumber', e.target.value || undefined)} style={inp} />
              </div>

              {/* OOS toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '.6rem .8rem', borderRadius: 10, border: `1.5px solid ${event.outOfService ? 'var(--error)' : 'var(--border)'}`, background: event.outOfService ? 'rgba(232,64,0,.08)' : 'var(--surface-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={event.outOfService ?? false} onChange={e => setF('outOfService', e.target.checked)} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '.88rem', color: event.outOfService ? 'var(--error)' : 'var(--text)' }}>🛑 Out of Service</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>Unit removed from service pending repair</div>
                </div>
              </label>
              {event.outOfService && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '.5rem .8rem', borderRadius: 10, border: '1px solid var(--success)', background: 'rgba(0,200,100,.06)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={event.oosCleared ?? false} onChange={e => setF('oosCleared', e.target.checked)} />
                  <span style={{ fontWeight: 700, fontSize: '.85rem', color: 'var(--success)' }}>✅ OOS Cleared — back in service</span>
                </label>
              )}

              {/* Notes */}
              <div>
                <div style={secLabel}>Notes</div>
                <textarea value={event.notes} onChange={e => setF('notes', e.target.value)} placeholder="Describe the violation, conditions, officer instructions…" rows={4} style={{ ...inp, resize: 'vertical', minHeight: 80, fontFamily: 'inherit', lineHeight: 1.5 }} />
              </div>
            </div>
          )}

          {/* ── REPAIR TAB ── */}
          {activeSection === 'repair' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={secLabel}>Repair Tracking</div>
              <input placeholder="Repair Shop / Facility" value={event.repairShop ?? ''} onChange={e => setF('repairShop', e.target.value || undefined)} style={inp} />
              <input placeholder="Repair Order / Work Order #" value={event.repairOrderNumber ?? ''} onChange={e => setF('repairOrderNumber', e.target.value || undefined)} style={inp} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input placeholder="Repair Cost ($)" type="number" value={event.repairCost ?? ''} onChange={e => setF('repairCost', e.target.value ? parseFloat(e.target.value) : undefined)} style={{ ...inp, flex: 1 }} />
                <input type="datetime-local" value={event.repairCompletedAt?.slice(0, 16) ?? ''} onChange={e => setF('repairCompletedAt', e.target.value ? new Date(e.target.value).toISOString() : undefined)} style={{ ...inp, flex: 1 }} />
              </div>
              <textarea placeholder="Repair notes — what was fixed, parts used, technician…" value={event.repairNotes ?? ''} onChange={e => setF('repairNotes', e.target.value || undefined)} rows={4} style={{ ...inp, resize: 'vertical', minHeight: 80, fontFamily: 'inherit', lineHeight: 1.5 }} />

              {/* Quick status update after repair info */}
              {event.repairShop && event.status === 'open' && (
                <button onClick={() => setF('status', 'repair_pending')} style={{
                  padding: '.65rem', borderRadius: 10, border: '1px solid var(--warn)',
                  background: 'rgba(245,194,0,.08)', color: 'var(--warn)', fontWeight: 800, cursor: 'pointer', fontSize: '.85rem',
                }}>
                  → Mark as Repair Pending
                </button>
              )}
              {event.repairCompletedAt && event.status !== 'verified' && event.status !== 'closed' && (
                <button onClick={() => setF('status', 'repair_submitted')} style={{
                  padding: '.65rem', borderRadius: 10, border: '1px solid #60c8ff',
                  background: 'rgba(96,200,255,.08)', color: '#60c8ff', fontWeight: 800, cursor: 'pointer', fontSize: '.85rem',
                }}>
                  → Mark as Repair Submitted
                </button>
              )}
            </div>
          )}

          {/* ── DOCS TAB ── */}
          {activeSection === 'docs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={selectedDocType} onChange={e => setSelectedDocType(e.target.value as ComplianceDocType)} style={{ ...inp, flex: 1 }}>
                  {DOC_TYPES.map(t => <option key={t} value={t}>{COMPLIANCE_DOC_LABELS[t]}</option>)}
                </select>
                <button onClick={() => photoRef.current?.click()} disabled={photoLoading} style={{
                  padding: '.5rem .9rem', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 700, fontSize: '.82rem',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  {photoLoading ? 'Loading…' : '📷 Add File'}
                </button>
              </div>
              <input ref={photoRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }} onChange={handlePhotoAdd} />

              {event.documents.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--faint)', fontSize: '.82rem' }}>
                  No documents yet.<br />
                  <span style={{ fontSize: '.72rem' }}>Add repair invoices, photos, inspection reports, citations.</span>
                </div>
              )}

              {event.documents.map(doc => (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '.6rem .75rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  {doc.dataUrl?.startsWith('data:image') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={doc.dataUrl} alt={doc.caption} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 7, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 7, background: 'var(--surface)', display: 'grid', placeItems: 'center', fontSize: '1.4rem', flexShrink: 0 }}>📄</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.82rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.caption}</div>
                    <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>{COMPLIANCE_DOC_LABELS[doc.docType]}</div>
                  </div>
                  <button onClick={() => removeDoc(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1rem', padding: '4px' }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '.75rem 1.1rem 1.4rem', borderTop: '1px solid var(--border)' }}>
          {saveError && (
            <div style={{ marginBottom: '.6rem', padding: '.6rem .75rem', borderRadius: 10, background: 'rgba(232,64,0,.12)', color: 'var(--error)', fontSize: '.8rem', fontWeight: 700 }}>
              ⚠️ {saveError}
            </div>
          )}
          <button onClick={handleSave} disabled={saving || saved} style={{
            width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
            background: saved ? 'var(--success)' : 'var(--primary)',
            color: '#000', fontWeight: 900, fontSize: '1rem',
            cursor: saving || saved ? 'default' : 'pointer', opacity: saving ? .7 : 1, transition: 'all .2s',
          }}>
            {saved ? '✅ Saved' : saving ? 'Saving…' : `💾 Save ${meta.label}`}
          </button>
        </div>
      </div>
    </>
  )
}

const secLabel: React.CSSProperties = {
  fontSize: '.68rem', fontWeight: 900, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '.06em', display: 'block',
}
const inp: React.CSSProperties = {
  width: '100%', padding: '.55rem .75rem', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box',
}
