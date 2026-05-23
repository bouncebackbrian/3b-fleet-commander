'use client'
/**
 * TrailerHookSheet — Unified trailer hook / drop event logger.
 *
 * Covers: empty_hook | loaded_hook | empty_drop | loaded_drop
 *
 * Flow:
 *  1. Select event type (tabs)
 *  2. Enter trailer #
 *  3. GPS auto-captured on open
 *  4. Condition checklist (tap OK / Issue / N/A per item)
 *  5. Inspection verification (annual, reefer, registration)
 *  6. Event-specific fields (seal, BOL, receiver, POD)
 *  7. Photos
 *  8. Notes → Save → timeline event
 */
import { useState, useEffect, useRef } from 'react'
import {
  TRAILER_EVENT_META,
  CONDITION_ITEMS,
  INSPECTION_META,
  defaultConditionList,
  newTrailerEvent,
  saveTrailerEvent,
  captureGPS,
  computeExpiry,
  type TrailerEvent,
  type TrailerEventType,
  type ConditionStatus,
  type ConditionItem,
  type TrailerDocument,
  type TrailerInspectionRecord,
  type InspectionType,
} from '@/lib/trailerEvents'
import { logTimelineEvent } from '@/lib/timeline'
import type { LoadMission } from '@/lib/dashboard/types'

// ── helpers ───────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function daysLabel(days: number | undefined): string {
  if (days == null)  return ''
  if (days <= 0)     return '🚨 EXPIRED'
  if (days <= 7)     return `⚠️ ${days}d left`
  if (days <= 30)    return `⚠️ ${days}d left`
  return `✅ ${days}d left`
}

function daysColor(days: number | undefined): string {
  if (days == null) return 'var(--muted)'
  if (days <= 0)    return 'var(--error)'
  if (days <= 30)   return 'var(--warn)'
  return 'var(--success)'
}

const EVENT_TABS: TrailerEventType[] = ['empty_hook', 'loaded_hook', 'empty_drop', 'loaded_drop']

const STATUS_OPTS: { val: ConditionStatus; label: string; bg: string; color: string }[] = [
  { val: 'ok',    label: 'OK',    bg: 'rgba(0,200,100,.15)', color: 'var(--success)' },
  { val: 'issue', label: 'Issue', bg: 'rgba(232,64,0,.15)',  color: 'var(--error)'   },
  { val: 'na',    label: 'N/A',   bg: 'var(--surface-2)',    color: 'var(--faint)'   },
]

const INSPECTION_TYPES: InspectionType[] = ['annual', 'fhwa_dot', 'bit', 'reefer', 'registration']

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open:          boolean
  onClose:       () => void
  mission?:      LoadMission | null
  defaultType?:  TrailerEventType
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TrailerHookSheet({ open, onClose, mission, defaultType = 'empty_hook' }: Props) {
  const [event,          setEvent]          = useState<TrailerEvent | null>(null)
  const [gpsCapturing,   setGpsCapturing]   = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [saved,          setSaved]          = useState(false)
  const [activeSection,  setActiveSection]  = useState<'checklist' | 'inspection' | 'details' | 'photos'>('checklist')
  const [photoCapturing, setPhotoCapturing] = useState(false)
  const [inspPhotoIdx,   setInspPhotoIdx]   = useState<number | null>(null)

  const photoRef    = useRef<HTMLInputElement>(null)
  const inspPhotoRef = useRef<HTMLInputElement>(null)

  // ── Init on open ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setSaved(false)
    setSaving(false)
    setActiveSection('checklist')

    const fresh = newTrailerEvent({
      eventType:    defaultType,
      trailerNumber: mission?.trailerNum ?? '',
      loadId:        mission?.id,
      orderNumber:   mission?.orderNumber,
      tractorId:     mission?.tractorId,
    })
    setEvent(fresh)

    setGpsCapturing(true)
    captureGPS().then(pos => {
      setGpsCapturing(false)
      if (pos) setEvent(prev => prev ? { ...prev, gpsLat: pos.lat, gpsLng: pos.lng } : prev)
    })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !event) return null

  const meta   = TRAILER_EVENT_META[event.eventType]
  const isHook = meta.isHook
  const isLoaded = event.eventType === 'loaded_hook' || event.eventType === 'loaded_drop'

  // ── Setters ───────────────────────────────────────────────────────────────

  function setField<K extends keyof TrailerEvent>(key: K, val: TrailerEvent[K]) {
    setEvent(prev => prev ? { ...prev, [key]: val } : prev)
  }

  function setEventType(t: TrailerEventType) {
    setEvent(prev => prev ? { ...prev, eventType: t } : prev)
  }

  function setConditionStatus(id: string, status: ConditionStatus) {
    setEvent(prev => {
      if (!prev) return prev
      return {
        ...prev,
        condition: prev.condition.map(c => c.id === id ? { ...c, status } : c),
      }
    })
  }

  function setConditionNotes(id: string, notes: string) {
    setEvent(prev => {
      if (!prev) return prev
      return {
        ...prev,
        condition: prev.condition.map(c => c.id === id ? { ...c, notes: notes || undefined } : c),
      }
    })
  }

  // ── Inspection helpers ────────────────────────────────────────────────────

  function getInspection(type: InspectionType): TrailerInspectionRecord | undefined {
    return event?.inspections.find(i => i.type === type)
  }

  function upsertInspection(type: InspectionType, patch: Partial<TrailerInspectionRecord>) {
    setEvent(prev => {
      if (!prev) return prev
      const existing = prev.inspections.find(i => i.type === type)
      if (existing) {
        const updated = { ...existing, ...patch }
        const { expired, daysUntilExpiry } = computeExpiry(updated.expirationDate)
        return {
          ...prev,
          inspections: prev.inspections.map(i =>
            i.type === type ? { ...updated, expired, daysUntilExpiry } : i
          ),
        }
      } else {
        const fresh: TrailerInspectionRecord = {
          type, verified: false, expired: false,
          ...patch,
        }
        const { expired, daysUntilExpiry } = computeExpiry(fresh.expirationDate)
        return {
          ...prev,
          inspections: [...prev.inspections, { ...fresh, expired, daysUntilExpiry }],
        }
      }
    })
  }

  // ── Photo handlers ────────────────────────────────────────────────────────

  async function handlePhotoAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setPhotoCapturing(true)
    try {
      const docs: TrailerDocument[] = await Promise.all(
        files.map(async f => ({
          id: crypto.randomUUID(), caption: f.name,
          uploadedAt: new Date().toISOString(),
          dataUrl: await fileToBase64(f),
        }))
      )
      setEvent(prev => prev ? { ...prev, documents: [...prev.documents, ...docs] } : prev)
    } finally {
      setPhotoCapturing(false)
      if (photoRef.current) photoRef.current.value = ''
    }
  }

  async function handleInspPhotoAdd(e: React.ChangeEvent<HTMLInputElement>, type: InspectionType) {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await fileToBase64(file)
    upsertInspection(type, { photoDataUrl: dataUrl, verified: true })
    if (inspPhotoRef.current) inspPhotoRef.current.value = ''
    setInspPhotoIdx(null)
  }

  function removePhoto(id: string) {
    setEvent(prev => prev ? { ...prev, documents: prev.documents.filter(d => d.id !== id) } : prev)
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!event || saving || !event.trailerNumber.trim()) return
    setSaving(true)
    try {
      await saveTrailerEvent(event)

      // Check for expired inspections → fire alert event
      const expiredInsp = event.inspections.filter(i => i.expired)
      if (expiredInsp.length > 0) {
        void logTimelineEvent('trailer_inspection_expired', 'trailer_lifecycle', {
          trailerNumber: event.trailerNumber,
          expired:       expiredInsp.map(i => i.type),
        }, event.loadId)
      }

      const hasVerified = event.inspections.some(i => i.verified && !i.expired)
      if (hasVerified) {
        void logTimelineEvent('trailer_inspection_verified', 'trailer_lifecycle', {
          trailerNumber: event.trailerNumber,
          types:         event.inspections.filter(i => i.verified).map(i => i.type),
        }, event.loadId)
      }

      void logTimelineEvent(
        isHook ? 'trailer_hook' : 'trailer_drop',
        'trailer_lifecycle',
        {
          eventType:    event.eventType,
          trailerNumber: event.trailerNumber,
          orderNumber:  event.orderNumber,
          sealNumber:   event.sealNumber,
          issueCount:   event.condition.filter(c => c.status === 'issue').length,
          photoCount:   event.documents.length,
          hasGps:       event.gpsLat != null,
        },
        event.loadId,
      )

      setSaved(true)
      setTimeout(() => { onClose(); setSaved(false) }, 900)
    } catch {
      setSaving(false)
    }
  }

  const issueCount = event.condition.filter(c => c.status === 'issue').length
  const okCount    = event.condition.filter(c => c.status === 'ok').length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)',
      }} />

      {/* Sheet */}
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
        <div style={{
          padding: '.6rem 1.1rem .4rem', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>
                {meta.emoji} Trailer {isHook ? 'Hook' : 'Drop'} Event
              </div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 1, display: 'flex', gap: 8 }}>
                {gpsCapturing && <span style={{ color: 'var(--primary)' }}>📍 locating…</span>}
                {!gpsCapturing && event.gpsLat && <span style={{ color: 'var(--success)' }}>📍 GPS locked</span>}
                {issueCount > 0 && <span style={{ color: 'var(--error)' }}>⚠️ {issueCount} issue{issueCount > 1 ? 's' : ''}</span>}
                {okCount > 0 && <span style={{ color: 'var(--success)' }}>✅ {okCount} OK</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--muted)', padding: '4px 8px' }}>✕</button>
          </div>

          {/* Event type tabs */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {EVENT_TABS.map(t => {
              const m = TRAILER_EVENT_META[t]
              const sel = event.eventType === t
              return (
                <button key={t} onClick={() => setEventType(t)} style={{
                  padding: '.3rem .65rem', borderRadius: 20, whiteSpace: 'nowrap',
                  border: `1.5px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
                  background: sel ? 'rgba(0,232,176,.12)' : 'var(--surface-2)',
                  color: sel ? 'var(--primary)' : 'var(--muted)',
                  fontSize: '.76rem', fontWeight: sel ? 800 : 600, cursor: 'pointer',
                }}>
                  {m.emoji} {m.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Trailer # input */}
        <div style={{ padding: '.65rem 1.1rem .3rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <input
            placeholder="Trailer Number *"
            value={event.trailerNumber}
            onChange={e => setField('trailerNumber', e.target.value)}
            style={{
              width: '100%', padding: '.55rem .75rem', borderRadius: 10,
              border: `1.5px solid ${!event.trailerNumber.trim() ? 'var(--error)' : 'var(--border)'}`,
              background: 'var(--surface-2)', color: 'var(--text)',
              fontSize: '.95rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box',
              letterSpacing: '.05em',
            }}
          />
        </div>

        {/* Section nav */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--border)',
          flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none',
        }}>
          {([
            { id: 'checklist',   label: '✅ Checklist' },
            { id: 'inspection',  label: '📋 Inspection' },
            { id: 'details',     label: isLoaded ? '📦 Load Details' : '🔧 Details' },
            { id: 'photos',      label: `📷 Photos${event.documents.length ? ` (${event.documents.length})` : ''}` },
          ] as { id: typeof activeSection; label: string }[]).map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
              flex: '1 0 auto', padding: '.55rem .5rem',
              background: activeSection === s.id ? 'var(--surface)' : 'var(--surface-2)',
              borderBottom: `2px solid ${activeSection === s.id ? 'var(--primary)' : 'transparent'}`,
              border: 'none', cursor: 'pointer',
              color: activeSection === s.id ? 'var(--primary)' : 'var(--muted)',
              fontSize: '.72rem', fontWeight: 700, whiteSpace: 'nowrap',
            }}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem' }}>

          {/* ── CHECKLIST ── */}
          {activeSection === 'checklist' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ ...secLabel, marginBottom: 8 }}>Condition Checklist</div>
              {event.condition.map(item => (
                <ConditionRow
                  key={item.id}
                  item={item}
                  onStatus={s => setConditionStatus(item.id, s)}
                  onNotes={n => setConditionNotes(item.id, n)}
                />
              ))}
            </div>
          )}

          {/* ── INSPECTION ── */}
          {activeSection === 'inspection' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={secLabel}>Inspection Verification</div>
              {INSPECTION_TYPES.map((type, idx) => {
                const im   = INSPECTION_META[type]
                const insp = getInspection(type)
                const { daysUntilExpiry } = computeExpiry(insp?.expirationDate)
                return (
                  <div key={type} style={{
                    padding: '.75rem .9rem', borderRadius: 12,
                    border: `1px solid ${insp?.expired ? 'var(--error)' : insp?.verified ? 'var(--border)' : 'var(--border)'}`,
                    background: insp?.expired ? 'rgba(232,64,0,.06)' : 'var(--surface-2)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span>{im.emoji}</span>
                      <span style={{ fontWeight: 800, fontSize: '.88rem', flex: 1 }}>{im.label}</span>
                      {insp?.expirationDate && (
                        <span style={{ fontSize: '.7rem', fontWeight: 800, color: daysColor(daysUntilExpiry) }}>
                          {daysLabel(daysUntilExpiry)}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <input
                        type="date"
                        placeholder="Inspection Date"
                        value={insp?.inspectionDate ?? ''}
                        onChange={e => upsertInspection(type, { inspectionDate: e.target.value || undefined })}
                        style={{ ...inputSm, flex: '1 1 120px' }}
                      />
                      <input
                        type="date"
                        placeholder="Expiry Date"
                        value={insp?.expirationDate ?? ''}
                        onChange={e => upsertInspection(type, { expirationDate: e.target.value || undefined })}
                        style={{ ...inputSm, flex: '1 1 120px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <input
                        placeholder="VIN / Trailer #"
                        value={insp?.vin ?? ''}
                        onChange={e => upsertInspection(type, { vin: e.target.value || undefined })}
                        style={{ ...inputSm, flex: '1 1 120px' }}
                      />
                      <input
                        placeholder="Inspector Name"
                        value={insp?.inspectorName ?? ''}
                        onChange={e => upsertInspection(type, { inspectorName: e.target.value || undefined })}
                        style={{ ...inputSm, flex: '1 1 120px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                      <button
                        onClick={() => {
                          setInspPhotoIdx(idx)
                          inspPhotoRef.current?.click()
                        }}
                        style={{
                          padding: '.28rem .7rem', borderRadius: 8,
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          color: 'var(--text)', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        📷 Scan Sticker
                      </button>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={insp?.verified ?? false}
                          onChange={e => upsertInspection(type, { verified: e.target.checked })}
                        />
                        <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted)' }}>Verified</span>
                      </label>
                      {insp?.photoDataUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={insp.photoDataUrl}
                          alt="sticker"
                          style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
                        />
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Hidden input for inspection photo */}
              <input
                ref={inspPhotoRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  if (inspPhotoIdx != null) {
                    void handleInspPhotoAdd(e, INSPECTION_TYPES[inspPhotoIdx])
                  }
                }}
              />
            </div>
          )}

          {/* ── DETAILS ── */}
          {activeSection === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Loaded-hook specific */}
              {event.eventType === 'loaded_hook' && (
                <>
                  <div style={secLabel}>Load Details</div>
                  <input
                    placeholder="Seal Number"
                    value={event.sealNumber ?? ''}
                    onChange={e => setField('sealNumber', e.target.value || undefined)}
                    style={inputFull}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={event.bolAttached ?? false}
                      onChange={e => setField('bolAttached', e.target.checked)}
                    />
                    <span style={{ fontWeight: 700, fontSize: '.88rem' }}>BOL Attached</span>
                  </label>
                </>
              )}

              {/* Loaded-drop specific */}
              {event.eventType === 'loaded_drop' && (
                <>
                  <div style={secLabel}>Delivery Details</div>
                  <input
                    placeholder="Receiver Name / Facility"
                    value={event.receiver ?? ''}
                    onChange={e => setField('receiver', e.target.value || undefined)}
                    style={inputFull}
                  />
                  <input
                    placeholder="Delivery Condition Notes"
                    value={event.deliveryCondition ?? ''}
                    onChange={e => setField('deliveryCondition', e.target.value || undefined)}
                    style={inputFull}
                  />
                  <div style={{ display: 'flex', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={event.podSigned ?? false}
                        onChange={e => setField('podSigned', e.target.checked)} />
                      <span style={{ fontWeight: 700, fontSize: '.85rem' }}>POD Signed</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={event.sealVerified ?? false}
                        onChange={e => setField('sealVerified', e.target.checked)} />
                      <span style={{ fontWeight: 700, fontSize: '.85rem' }}>Seal Verified</span>
                    </label>
                  </div>
                </>
              )}

              {/* Reefer fuel */}
              <div>
                <div style={{ ...secLabel, marginBottom: 6 }}>
                  ❄️ Reefer Fuel Level: <span style={{ color: 'var(--primary)' }}>{event.reeferFuelPct ?? '—'}%</span>
                </div>
                <input
                  type="range" min={0} max={100} step={5}
                  value={event.reeferFuelPct ?? 50}
                  onChange={e => setField('reeferFuelPct', parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.65rem', color: 'var(--faint)' }}>
                  <span>Empty</span><span>Half</span><span>Full</span>
                </div>
                <button
                  onClick={() => setField('reeferFuelPct', undefined)}
                  style={{ marginTop: 4, padding: '.2rem .5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontSize: '.72rem', cursor: 'pointer' }}
                >
                  Not applicable / no reefer
                </button>
              </div>

              {/* Notes */}
              <div>
                <div style={secLabel}>Notes</div>
                <textarea
                  placeholder="Describe condition, any issues, damage noted, location…"
                  value={event.notes}
                  onChange={e => setField('notes', e.target.value)}
                  rows={4}
                  style={{ ...inputFull, resize: 'vertical', minHeight: 90, fontFamily: 'inherit', lineHeight: 1.5 }}
                />
              </div>

              {/* Driver acknowledgement */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', padding: '.5rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <input
                  type="checkbox"
                  checked={event.driverAck ?? false}
                  onChange={e => setField('driverAck', e.target.checked)}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <span style={{ fontSize: '.8rem', color: 'var(--muted)', fontWeight: 600, lineHeight: 1.4 }}>
                  I acknowledge this condition log is accurate and was completed at time of hook/drop.
                </span>
              </label>
            </div>
          )}

          {/* ── PHOTOS ── */}
          {activeSection === 'photos' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={secLabel}>Condition Photos</div>
                <button
                  onClick={() => photoRef.current?.click()}
                  disabled={photoCapturing}
                  style={{
                    padding: '.3rem .75rem', borderRadius: 8,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    color: 'var(--text)', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {photoCapturing ? 'Loading…' : '📷 Add Photos'}
                </button>
              </div>
              <input ref={photoRef} type="file" accept="image/*,application/pdf" multiple
                style={{ display: 'none' }} onChange={handlePhotoAdd} />

              {event.documents.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {event.documents.map(doc => (
                    <div key={doc.id} style={{
                      position: 'relative', width: 90, height: 90,
                      borderRadius: 10, overflow: 'hidden',
                      border: '1px solid var(--border)', background: 'var(--surface-2)',
                    }}>
                      {doc.dataUrl?.startsWith('data:image') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={doc.dataUrl} alt={doc.caption}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: '1.8rem' }}>📄</div>
                      )}
                      <button onClick={() => removePhoto(doc.id)} style={{
                        position: 'absolute', top: 3, right: 3, width: 20, height: 20,
                        borderRadius: '50%', background: 'rgba(0,0,0,.65)',
                        border: 'none', cursor: 'pointer', color: '#fff', fontSize: '.65rem',
                        display: 'grid', placeItems: 'center',
                      }}>✕</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--faint)', fontSize: '.82rem' }}>
                  No photos yet.<br />
                  <span style={{ fontSize: '.72rem' }}>Add condition photos, damage evidence, stickers.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0, padding: '.75rem 1.1rem 1.4rem',
          borderTop: '1px solid var(--border)', background: 'var(--surface)',
        }}>
          {!event.trailerNumber.trim() && (
            <div style={{ fontSize: '.74rem', color: 'var(--error)', marginBottom: 6, fontWeight: 700, textAlign: 'center' }}>
              ⚠️ Enter trailer number to save
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving || saved || !event.trailerNumber.trim()}
            style={{
              width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
              background: saved ? 'var(--success)' : !event.trailerNumber.trim() ? 'var(--surface-2)' : 'var(--primary)',
              color: !event.trailerNumber.trim() ? 'var(--muted)' : '#000',
              fontWeight: 900, fontSize: '1rem', cursor: saving || saved || !event.trailerNumber.trim() ? 'default' : 'pointer',
              opacity: saving ? .7 : 1, transition: 'all .2s',
            }}
          >
            {saved ? '✅ Saved' : saving ? 'Saving…' : `${meta.emoji} Save ${meta.label}`}
          </button>
        </div>
      </div>
    </>
  )
}

// ── ConditionRow sub-component ────────────────────────────────────────────────

function ConditionRow({ item, onStatus, onNotes }: {
  item: ConditionItem
  onStatus: (s: ConditionStatus) => void
  onNotes:  (n: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      padding: '.45rem 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          flex: 1, fontSize: '.84rem', fontWeight: 600,
          color: item.status === 'issue' ? 'var(--error)' : item.status === 'ok' ? 'var(--text)' : 'var(--faint)',
        }}>
          {item.label}
        </span>
        {STATUS_OPTS.map(opt => (
          <button
            key={opt.val}
            onClick={() => { onStatus(opt.val); if (opt.val === 'issue') setExpanded(true) }}
            style={{
              padding: '.25rem .5rem', borderRadius: 8, fontSize: '.7rem', fontWeight: 700, cursor: 'pointer',
              background: item.status === opt.val ? opt.bg : 'var(--surface-2)',
              color:      item.status === opt.val ? opt.color : 'var(--muted)',
              border:     `1px solid ${item.status === opt.val ? opt.color : 'var(--border)'}`,
              minWidth:   36, transition: 'all .12s',
            }}
          >
            {opt.label}
          </button>
        ))}
        {item.status === 'issue' && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '.75rem', padding: '0 2px' }}
          >
            {expanded ? '▲' : '▼'}
          </button>
        )}
      </div>
      {expanded && item.status === 'issue' && (
        <input
          placeholder="Describe issue…"
          value={item.notes ?? ''}
          onChange={e => onNotes(e.target.value)}
          style={{
            marginTop: 4, width: '100%', padding: '.4rem .6rem',
            borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--surface-2)', color: 'var(--text)',
            fontSize: '.8rem', outline: 'none', boxSizing: 'border-box',
          }}
        />
      )}
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const secLabel: React.CSSProperties = {
  fontSize: '.7rem', fontWeight: 900, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '.06em',
  display: 'block',
}

const inputFull: React.CSSProperties = {
  width: '100%', padding: '.55rem .75rem', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box',
}

const inputSm: React.CSSProperties = {
  padding: '.4rem .6rem', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text)', fontSize: '.8rem', outline: 'none', boxSizing: 'border-box',
}
