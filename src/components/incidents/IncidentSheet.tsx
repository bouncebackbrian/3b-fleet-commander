'use client'
/**
 * IncidentSheet — Bottom sheet for logging load incidents and compliance cases.
 *
 * Usage:
 *   <IncidentSheet
 *     open={showIncident}
 *     onClose={() => setShowIncident(false)}
 *     mission={mission}          // pre-fills truck/trailer/load context
 *   />
 *
 * Pattern: GPS auto-capture on open, localStorage-first save, Supabase async.
 * Photos: base64 stored locally only; metadata synced to Supabase.
 */
import { useState, useEffect, useRef } from 'react'
import {
  INCIDENT_META,
  STATUS_META,
  QUICK_CATEGORIES,
  COMPLIANCE_CATEGORIES,
  newIncident,
  saveIncident,
  captureGPS,
  readLocalIncidents,
  type Incident,
  type IncidentEventType,
  type IncidentStatus,
  type IncidentDocument,
} from '@/lib/incidents'
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

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open:     boolean
  onClose:  () => void
  mission?: LoadMission | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function IncidentSheet({ open, onClose, mission }: Props) {
  const [incident,          setIncident]          = useState<Incident | null>(null)
  const [gpsCapturing,      setGpsCapturing]      = useState(false)
  const [complianceExpanded, setComplianceExpanded] = useState(false)
  const [saving,            setSaving]            = useState(false)
  const [saved,             setSaved]             = useState(false)
  const [photoCapturing,    setPhotoCapturing]    = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Init new incident on open ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setSaved(false)
    setSaving(false)
    setComplianceExpanded(false)

    const fresh = newIncident({
      loadId:        mission?.id,
      orderNumber:   mission?.orderNumber,
      truckNumber:   mission?.tractorId,
      trailerNumber: mission?.trailerNum,
    })
    setIncident(fresh)

    // GPS auto-capture
    setGpsCapturing(true)
    captureGPS().then(pos => {
      setGpsCapturing(false)
      if (pos) {
        setIncident(prev => prev ? { ...prev, gpsLat: pos.lat, gpsLng: pos.lng } : prev)
      }
    })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !incident) return null

  // ── Handlers ─────────────────────────────────────────────────────────────

  function selectType(type: IncidentEventType) {
    setIncident(prev => prev ? { ...prev, eventType: type } : prev)
    // Expand compliance section if user picks a compliance type
    if (COMPLIANCE_CATEGORIES.includes(type)) setComplianceExpanded(true)
  }

  function selectStatus(status: IncidentStatus) {
    setIncident(prev => prev ? { ...prev, status } : prev)
  }

  function setNotes(notes: string) {
    setIncident(prev => prev ? { ...prev, notes } : prev)
  }

  function setField<K extends keyof Incident>(key: K, value: Incident[K]) {
    setIncident(prev => prev ? { ...prev, [key]: value } : prev)
  }

  async function handlePhotoAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setPhotoCapturing(true)
    try {
      const docs: IncidentDocument[] = await Promise.all(
        files.map(async f => ({
          id:         crypto.randomUUID(),
          caption:    f.name,
          uploadedAt: new Date().toISOString(),
          dataUrl:    await fileToBase64(f),
        }))
      )
      setIncident(prev => prev ? { ...prev, documents: [...prev.documents, ...docs] } : prev)
    } finally {
      setPhotoCapturing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function removePhoto(id: string) {
    setIncident(prev => prev ? {
      ...prev,
      documents: prev.documents.filter(d => d.id !== id),
    } : prev)
  }

  async function handleSave() {
    if (!incident || saving) return
    setSaving(true)
    try {
      await saveIncident(incident)

      // Log to timeline
      void logTimelineEvent(
        'incident_logged',
        'compliance_scanner',
        {
          eventType:   incident.eventType,
          status:      incident.status,
          truckNumber: incident.truckNumber,
          orderNumber: incident.orderNumber,
          notes:       incident.notes.slice(0, 80),
          photoCount:  incident.documents.length,
          hasGps:      incident.gpsLat != null,
        },
        incident.loadId,
      )

      setSaved(true)
      setTimeout(() => {
        onClose()
        setSaved(false)
      }, 900)
    } catch {
      setSaving(false)
    }
  }

  const meta   = INCIDENT_META[incident.eventType]
  const hasDocs = incident.documents.length > 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:   'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)',
        }}
      />

      {/* Sheet */}
      <div style={{
        position:     'fixed', bottom: 0, left: 0, right: 0,
        zIndex:       201,
        background:   'var(--surface)',
        borderRadius: '20px 20px 0 0',
        maxHeight:    '90dvh',
        display:      'flex',
        flexDirection: 'column',
        overflow:     'hidden',
      }}>

        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '.6rem 1.1rem .5rem',
          borderBottom:   '1px solid var(--border)',
          flexShrink:     0,
        }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.05rem', color: 'var(--text)' }}>
              {meta.emoji} Document Event
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 1 }}>
              {mission ? `Load ${mission.loadNumber ?? ''} · ${mission.tractorId ?? ''}` : 'No active load'}
              {gpsCapturing && <span style={{ color: 'var(--primary)', marginLeft: 6 }}>📍 locating…</span>}
              {!gpsCapturing && incident.gpsLat && <span style={{ color: 'var(--success)', marginLeft: 6 }}>📍 GPS locked</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '1.3rem', color: 'var(--muted)', padding: '4px 8px',
              lineHeight: 1,
            }}
          >✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem' }}>

          {/* Quick categories */}
          <div style={{ marginBottom: '1.1rem' }}>
            <div style={sectionLabel}>Quick Categories</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {QUICK_CATEGORIES.map(type => {
                const m   = INCIDENT_META[type]
                const sel = incident.eventType === type
                return (
                  <button
                    key={type}
                    onClick={() => selectType(type)}
                    style={{
                      ...chipBase,
                      background:  sel ? 'var(--primary)' : 'var(--surface-2)',
                      color:       sel ? '#000' : 'var(--text)',
                      border:      `1px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
                      fontWeight:  sel ? 800 : 600,
                    }}
                  >
                    {m.emoji} {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Compliance section */}
          <div style={{ marginBottom: '1.1rem' }}>
            <button
              onClick={() => setComplianceExpanded(v => !v)}
              style={{
                ...sectionLabel,
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                padding: 0, width: '100%', textAlign: 'left',
              }}
            >
              <span>⚖️ Compliance / Violations</span>
              <span style={{ marginLeft: 'auto', fontSize: '.75rem', color: 'var(--muted)' }}>
                {complianceExpanded ? '▲' : '▼'}
              </span>
            </button>

            {complianceExpanded && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {COMPLIANCE_CATEGORIES.map(type => {
                  const m   = INCIDENT_META[type]
                  const sel = incident.eventType === type
                  return (
                    <button
                      key={type}
                      onClick={() => selectType(type)}
                      style={{
                        ...chipBase,
                        background:  sel ? 'var(--error)' : 'var(--surface-2)',
                        color:       sel ? '#fff' : 'var(--text)',
                        border:      `1px solid ${sel ? 'var(--error)' : 'var(--border)'}`,
                        fontWeight:  sel ? 800 : 600,
                      }}
                    >
                      {m.emoji} {m.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Status row */}
          <div style={{ marginBottom: '1.1rem' }}>
            <div style={sectionLabel}>Status</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(STATUS_META) as IncidentStatus[]).map(s => {
                const sm  = STATUS_META[s]
                const sel = incident.status === s
                return (
                  <button
                    key={s}
                    onClick={() => selectStatus(s)}
                    style={{
                      padding:      '.3rem .75rem',
                      borderRadius: 20,
                      border:       `1.5px solid ${sel ? sm.color : 'var(--border)'}`,
                      background:   sel ? `${sm.color}18` : 'var(--surface-2)',
                      color:        sel ? sm.color : 'var(--muted)',
                      fontSize:     '.78rem',
                      fontWeight:   sel ? 800 : 600,
                      cursor:       'pointer',
                      transition:   'all .15s',
                    }}
                  >
                    {sm.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Compliance extras (case number / violation code / officer notes) */}
          {COMPLIANCE_CATEGORIES.includes(incident.eventType) && (
            <div style={{ marginBottom: '1.1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={sectionLabel}>Compliance Details</div>
              <input
                placeholder="Case / Citation Number"
                value={incident.caseNumber ?? ''}
                onChange={e => setField('caseNumber', e.target.value || undefined)}
                style={inputStyle}
              />
              <input
                placeholder="Violation Code"
                value={incident.violationCode ?? ''}
                onChange={e => setField('violationCode', e.target.value || undefined)}
                style={inputStyle}
              />
              <input
                placeholder="Officer / Inspector Notes"
                value={incident.officerNotes ?? ''}
                onChange={e => setField('officerNotes', e.target.value || undefined)}
                style={inputStyle}
              />
            </div>
          )}

          {/* Notes */}
          <div style={{ marginBottom: '1.1rem' }}>
            <div style={sectionLabel}>Notes</div>
            <textarea
              placeholder="Describe what happened — location, details, action taken…"
              value={incident.notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              style={{
                ...inputStyle,
                resize:     'vertical',
                minHeight:  90,
                fontFamily: 'inherit',
                lineHeight: 1.5,
              }}
            />
          </div>

          {/* Photos */}
          <div style={{ marginBottom: '1.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={sectionLabel}>Photos / Documents</div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={photoCapturing}
                style={{
                  padding:      '.28rem .7rem',
                  borderRadius: 8,
                  background:   'var(--surface-2)',
                  border:       '1px solid var(--border)',
                  color:        'var(--text)',
                  fontSize:     '.78rem',
                  fontWeight:   700,
                  cursor:       'pointer',
                }}
              >
                {photoCapturing ? 'Loading…' : '📷 Add Photo'}
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              style={{ display: 'none' }}
              onChange={handlePhotoAdd}
            />

            {hasDocs && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {incident.documents.map(doc => (
                  <div
                    key={doc.id}
                    style={{
                      position:     'relative',
                      borderRadius: 8,
                      overflow:     'hidden',
                      border:       '1px solid var(--border)',
                      width:        80,
                      height:       80,
                      background:   'var(--surface-2)',
                    }}
                  >
                    {doc.dataUrl?.startsWith('data:image') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={doc.dataUrl}
                        alt={doc.caption}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{
                        display:     'flex', alignItems: 'center', justifyContent: 'center',
                        height:      '100%', fontSize: '1.6rem',
                      }}>📄</div>
                    )}
                    <button
                      onClick={() => removePhoto(doc.id)}
                      style={{
                        position:   'absolute', top: 2, right: 2,
                        width:      18, height: 18,
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,.65)',
                        border:     'none', cursor: 'pointer',
                        color:      '#fff', fontSize: '.6rem',
                        display:    'grid', placeItems: 'center',
                      }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}

            {!hasDocs && (
              <div style={{
                fontSize:  '.74rem', color: 'var(--faint)',
                fontStyle: 'italic', marginTop: 2,
              }}>
                Photos stored on device only — not uploaded to cloud.
              </div>
            )}
          </div>
        </div>

        {/* Footer — save button */}
        <div style={{
          flexShrink:   0,
          padding:      '.75rem 1.1rem 1.4rem',
          borderTop:    '1px solid var(--border)',
          background:   'var(--surface)',
        }}>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            style={{
              width:        '100%',
              padding:      '1rem',
              borderRadius: 14,
              border:       'none',
              background:   saved ? 'var(--success)' : 'var(--primary)',
              color:        '#000',
              fontWeight:   900,
              fontSize:     '1rem',
              cursor:       saving || saved ? 'default' : 'pointer',
              opacity:      saving ? .7 : 1,
              transition:   'all .2s',
            }}
          >
            {saved ? '✅ Saved' : saving ? 'Saving…' : `💾 Save ${meta.label}`}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  fontSize:     '.7rem',
  fontWeight:   900,
  color:        'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  marginBottom:  6,
  display:       'block',
}

const chipBase: React.CSSProperties = {
  padding:      '.35rem .7rem',
  borderRadius: 20,
  fontSize:     '.8rem',
  cursor:       'pointer',
  transition:   'all .15s',
  whiteSpace:   'nowrap',
}

const inputStyle: React.CSSProperties = {
  width:        '100%',
  padding:      '.6rem .75rem',
  borderRadius: 10,
  border:       '1px solid var(--border)',
  background:   'var(--surface-2)',
  color:        'var(--text)',
  fontSize:     '.88rem',
  outline:      'none',
  boxSizing:    'border-box',
}
