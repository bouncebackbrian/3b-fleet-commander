'use client'
/**
 * DocUploadSheet — Bottom sheet for uploading and linking a document.
 *
 * Driver selects a file (camera, gallery, or PDF) → picks a category →
 * links it to a load / stop / truck / trailer / violation / repair →
 * hits Upload → stored in localStorage + metadata synced to Supabase.
 */
import { useState, useRef, useEffect } from 'react'
import {
  uploadDoc, CATEGORY_META, getContextSuggestions,
  WARN_DOC_SIZE_KB, MAX_DOC_SIZE_KB,
  type DocCategory, type UploadResult,
} from '@/lib/proofVault'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open:          boolean
  onClose:       () => void
  onUploaded?:   (result: UploadResult) => void
  // Pre-set links (from calling context — e.g. opened from violation card)
  presetLoadId?:      string
  presetLoadNumber?:  string
  presetViolationId?: string
  presetRepairId?:    string
  presetCategory?:    DocCategory
}

// ── Category groups ───────────────────────────────────────────────────────────

const CAT_GROUPS: { label: string; cats: DocCategory[] }[] = [
  {
    label: 'Load Documents',
    cats: ['bol', 'rate_con', 'pod', 'scale_ticket', 'fuel_receipt', 'lumper_receipt'],
  },
  {
    label: 'Compliance & Safety',
    cats: ['inspection_report', 'pre_trip', 'violation_citation', 'accident_report'],
  },
  {
    label: 'Repairs & Equipment',
    cats: ['repair_invoice', 'registration', 'insurance', 'permit'],
  },
  { label: 'Other', cats: ['other'] },
]

// ── Styles ────────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', padding: '.55rem .75rem', borderRadius: 9,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box',
}
const fieldLabel: React.CSSProperties = {
  fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DocUploadSheet({
  open, onClose, onUploaded,
  presetLoadId, presetLoadNumber, presetViolationId, presetRepairId, presetCategory,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  // ── File state ───────────────────────────────────────────────────────────────
  const [file,      setFile]      = useState<File | null>(null)
  const [preview,   setPreview]   = useState<string | null>(null)

  // ── Form fields ──────────────────────────────────────────────────────────────
  const [category,   setCategory]   = useState<DocCategory>(presetCategory ?? 'other')
  const [notes,      setNotes]      = useState('')
  const [occurredAt, setOccurredAt] = useState('')

  // ── Link fields ──────────────────────────────────────────────────────────────
  const [loadNumber,  setLoadNumber]  = useState(presetLoadNumber ?? '')
  const [loadId,      setLoadId]      = useState(presetLoadId     ?? '')
  const [stopName,    setStopName]    = useState('')
  const [truckId,     setTruckId]     = useState('')
  const [trailerId,   setTrailerId]   = useState('')
  const [violationId, setViolationId] = useState(presetViolationId ?? '')
  const [repairId,    setRepairId]    = useState(presetRepairId    ?? '')

  // ── Status ───────────────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false)
  const [result,    setResult]    = useState<UploadResult | null>(null)
  const [sizeWarn,  setSizeWarn]  = useState(false)

  // Pre-fill from context on open
  useEffect(() => {
    if (!open) return
    setResult(null); setSizeWarn(false)
    const ctx = getContextSuggestions()
    if (!presetLoadNumber && ctx.loadNumber) setLoadNumber(ctx.loadNumber)
    if (!presetLoadId     && ctx.loadId)     setLoadId(ctx.loadId)
    if (!truckId          && ctx.truckId)    setTruckId(ctx.truckId)
    if (!trailerId        && ctx.trailerId)  setTrailerId(ctx.trailerId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function reset() {
    setFile(null); setPreview(null); setNotes(''); setOccurredAt('')
    setCategory(presetCategory ?? 'other'); setResult(null); setSizeWarn(false)
    setStopName(''); setViolationId(presetViolationId ?? ''); setRepairId(presetRepairId ?? '')
  }

  function handleClose() { reset(); onClose() }

  // ── File pick ─────────────────────────────────────────────────────────────────
  function handleFile(f: File) {
    const sizeKb = Math.round(f.size / 1024)
    if (sizeKb > MAX_DOC_SIZE_KB) { setSizeWarn(true); setFile(null); return }
    setSizeWarn(sizeKb > WARN_DOC_SIZE_KB)
    setFile(f)
    // Auto-set category from filename
    const lower = f.name.toLowerCase()
    if (lower.includes('bol') || lower.includes('bill'))      setCategory('bol')
    else if (lower.includes('pod') || lower.includes('proof')) setCategory('pod')
    else if (lower.includes('invoice') || lower.includes('repair')) setCategory('repair_invoice')
    else if (lower.includes('inspection'))                     setCategory('inspection_report')
    else if (lower.includes('fuel') || lower.includes('gas')) setCategory('fuel_receipt')

    // Preview for images
    if (f.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = () => setPreview(reader.result as string)
      reader.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }

  // ── Upload ────────────────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!file || uploading) return
    setUploading(true)
    try {
      const res = await uploadDoc({
        file,
        category,
        notes:       notes.trim() || undefined,
        occurredAt:  occurredAt   || undefined,
        loadId:      loadId       || undefined,
        loadNumber:  loadNumber   || undefined,
        stopName:    stopName     || undefined,
        truckId:     truckId      || undefined,
        trailerId:   trailerId    || undefined,
        violationId: violationId  || undefined,
        repairId:    repairId     || undefined,
      })
      setResult(res)
      onUploaded?.(res)
      if (res.ok) { setTimeout(() => { reset(); onClose() }, 1800) }
    } finally {
      setUploading(false)
    }
  }

  if (!open) return null

  return (
    <div
      onClick={handleClose}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '22px 22px 0 0',
          padding: '1rem 1.2rem calc(1.4rem + env(safe-area-inset-bottom))',
          maxHeight: '92dvh', overflowY: 'auto',
          border: '1px solid var(--border)', borderBottom: 'none',
          boxShadow: '0 -8px 40px rgba(0,0,0,.35)',
        }}
      >
        {/* Handle */}
        <div style={{ width: 38, height: 3, borderRadius: 2, background: 'var(--border)', margin: '0 auto .9rem' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>📎 Upload Document</div>
          <button onClick={handleClose} style={btnSm}>✕ Close</button>
        </div>

        {/* Success state */}
        {result?.ok && (
          <div style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(0,232,176,.07)', borderRadius: 14, border: '1px solid rgba(0,232,176,.2)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 6 }}>✅</div>
            <div style={{ fontWeight: 900, color: 'var(--primary)' }}>Document Saved</div>
            <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 4 }}>
              {CATEGORY_META[category].emoji} {CATEGORY_META[category].label}
              {loadNumber ? ` · Load #${loadNumber}` : ''}
            </div>
          </div>
        )}

        {!result?.ok && (
          <>
            {/* File picker */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />

            {!file ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1rem' }}>
                <button
                  onClick={() => { if (fileRef.current) { fileRef.current.capture = 'environment'; fileRef.current.click() } }}
                  style={pickBtn}
                >
                  <span style={{ fontSize: '1.6rem' }}>📷</span>
                  <span style={{ fontWeight: 800, fontSize: '.82rem' }}>Camera</span>
                  <span style={{ fontSize: '.65rem', color: 'var(--muted)' }}>Take a photo now</span>
                </button>
                <button
                  onClick={() => { if (fileRef.current) { fileRef.current.removeAttribute('capture'); fileRef.current.click() } }}
                  style={pickBtn}
                >
                  <span style={{ fontSize: '1.6rem' }}>🗂️</span>
                  <span style={{ fontWeight: 800, fontSize: '.82rem' }}>Gallery / PDF</span>
                  <span style={{ fontSize: '.65rem', color: 'var(--muted)' }}>From files or photos</span>
                </button>
              </div>
            ) : (
              <div style={{ marginBottom: '1rem', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
                {preview ? (
                  <img src={preview} alt="Preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ background: 'var(--surface-2)', padding: '1.25rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem' }}>📄</div>
                    <div style={{ fontWeight: 700, fontSize: '.82rem', marginTop: 4 }}>{file.name}</div>
                    <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{Math.round(file.size / 1024)} KB</div>
                  </div>
                )}
                <button
                  onClick={() => { setFile(null); setPreview(null); setSizeWarn(false) }}
                  style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: 6, color: '#fff', padding: '.2rem .45rem', cursor: 'pointer', fontSize: '.75rem' }}
                >
                  ✕ Change
                </button>
                {sizeWarn && (
                  <div style={{ background: 'rgba(245,194,0,.1)', padding: '.4rem .7rem', fontSize: '.7rem', color: 'var(--warn)', fontWeight: 700 }}>
                    ⚠️ Large file ({Math.round(file.size / 1024)} KB) — may be slow to save
                  </div>
                )}
              </div>
            )}

            {/* Category picker */}
            <div style={{ marginBottom: '1rem' }}>
              <span style={fieldLabel}>Document Type</span>
              {CAT_GROUPS.map(group => (
                <div key={group.label} style={{ marginBottom: '.6rem' }}>
                  <div style={{ fontSize: '.55rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }}>{group.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
                    {group.cats.map(cat => {
                      const m = CATEGORY_META[cat]
                      return (
                        <button
                          key={cat}
                          onClick={() => setCategory(cat)}
                          style={{
                            padding: '.45rem .3rem', borderRadius: 9, border: category === cat ? '1.5px solid rgba(0,232,176,.5)' : '1px solid var(--border)',
                            background: category === cat ? 'rgba(0,232,176,.08)' : 'var(--surface-2)',
                            color: category === cat ? 'var(--primary)' : 'var(--muted)',
                            cursor: 'pointer', textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: '1.1rem', lineHeight: 1 }}>{m.emoji}</div>
                          <div style={{ fontSize: '.58rem', fontWeight: 700, marginTop: 3, lineHeight: 1.2 }}>{m.label}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Link to entities */}
            <div style={{ display: 'grid', gap: 8, marginBottom: '1rem' }}>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                🔗 Link Document To
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                <div>
                  <span style={fieldLabel}>Load #</span>
                  <input value={loadNumber} onChange={e => setLoadNumber(e.target.value)} placeholder="0241482" style={inp} />
                </div>
                <div>
                  <span style={fieldLabel}>Stop / Facility</span>
                  <input value={stopName} onChange={e => setStopName(e.target.value)} placeholder="Walmart DC Sparks" style={inp} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                <div>
                  <span style={fieldLabel}>Truck / Unit #</span>
                  <input value={truckId} onChange={e => setTruckId(e.target.value)} placeholder="Unit 1" style={inp} />
                </div>
                <div>
                  <span style={fieldLabel}>Trailer #</span>
                  <input value={trailerId} onChange={e => setTrailerId(e.target.value)} placeholder="260692" style={inp} />
                </div>
              </div>

              {/* Violation / Repair IDs — show only if preset or non-empty */}
              {(presetViolationId || violationId) && (
                <div>
                  <span style={fieldLabel}>Violation ID</span>
                  <input value={violationId} onChange={e => setViolationId(e.target.value)} placeholder="Auto-linked" style={{ ...inp, fontSize: '.72rem', color: 'var(--warn)' }} />
                </div>
              )}
              {(presetRepairId || repairId) && (
                <div>
                  <span style={fieldLabel}>Repair ID</span>
                  <input value={repairId} onChange={e => setRepairId(e.target.value)} placeholder="Auto-linked" style={{ ...inp, fontSize: '.72rem', color: '#e89000' }} />
                </div>
              )}
            </div>

            {/* Date + Notes */}
            <div style={{ display: 'grid', gap: 7, marginBottom: '1.1rem' }}>
              <div>
                <span style={fieldLabel}>Document Date (optional)</span>
                <input type="date" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} style={inp} />
              </div>
              <div>
                <span style={fieldLabel}>Notes (optional)</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Add context — dock #, reference number, officer name…"
                  rows={2} style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} />
              </div>
            </div>

            {/* Error state */}
            {result && !result.ok && (
              <div style={{ padding: '.55rem .8rem', borderRadius: 9, background: 'rgba(232,64,0,.08)', border: '1px solid rgba(232,64,0,.2)', color: 'var(--error)', fontSize: '.78rem', fontWeight: 700, marginBottom: '.85rem' }}>
                ❌ {result.error}
              </div>
            )}

            {/* Upload button */}
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              style={{
                width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
                background: !file ? 'var(--border)' : 'var(--primary)',
                color: !file ? 'var(--muted)' : '#061210',
                fontWeight: 900, fontSize: '1rem', cursor: !file ? 'not-allowed' : 'pointer',
                boxShadow: file ? '0 4px 16px rgba(0,232,176,.25)' : 'none',
                opacity: uploading ? .7 : 1,
              }}
            >
              {uploading ? '⏳ Saving…' : !file ? 'Select a file to upload' : `${CATEGORY_META[category].emoji} Save ${CATEGORY_META[category].label}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const btnSm: React.CSSProperties = {
  padding: '.4rem .75rem', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface-2)', color: 'var(--muted)', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer',
}

const pickBtn: React.CSSProperties = {
  padding: '1.2rem .75rem', borderRadius: 14,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  color: 'var(--text)',
}
