'use client'
/**
 * ExpenseScanSheet — Camera/upload → OCR → review → save
 *
 * Handles ALL expense types: fuel, lumper, scale, parking, tolls,
 * repairs, meals, lodging, supplies, DEF, other.
 *
 * Flow:
 *   1. User taps "Scan Receipt"
 *   2. Camera or file picker opens
 *   3. Image sent to /api/scan-expense (Claude vision)
 *   4. Extracted data fills the review form
 *   5. Driver reviews / edits any field
 *   6. Confirm → saves to localStorage (3b-expenses)
 *   7. Optional callback onSaved(expense) for parent refresh
 */
import { useRef, useState, useCallback } from 'react'

// ── Category definitions (mirrors expenses/page.tsx) ─────────────────────────
export const SCAN_CATEGORIES = [
  { id: 'fuel',    label: 'Fuel / DEF',       emoji: '⛽', deductPct: 100 },
  { id: 'parking', label: 'Parking / Scales', emoji: '🅿️', deductPct: 100 },
  { id: 'tolls',   label: 'Tolls',            emoji: '🛣️', deductPct: 100 },
  { id: 'meals',   label: 'Meals',            emoji: '🍔', deductPct: 80  },
  { id: 'lodging', label: 'Lodging',          emoji: '🏨', deductPct: 100 },
  { id: 'repairs', label: 'Repairs',          emoji: '🔧', deductPct: 100 },
  { id: 'supplies',label: 'Supplies',         emoji: '🧤', deductPct: 100 },
  { id: 'lumper',  label: 'Lumper Fee',       emoji: '📦', deductPct: 100 },
  { id: 'scale',   label: 'Scale Ticket',     emoji: '⚖️', deductPct: 100 },
  { id: 'def',     label: 'DEF / Fluids',     emoji: '🛢️', deductPct: 100 },
  { id: 'other',   label: 'Other',            emoji: '❓', deductPct: 100 },
] as const

type CatId = typeof SCAN_CATEGORIES[number]['id']

function getCat(id: string) {
  return SCAN_CATEGORIES.find(c => c.id === id) ?? SCAN_CATEGORIES[SCAN_CATEGORIES.length - 1]
}

// ── Expense record (local shape) ──────────────────────────────────────────────
interface SavedExpense {
  id:           string
  date:         string
  category:     string
  amount:       number
  description:  string
  location:     string
  loadNumber:   string
  deductPct:    number
  isDeductible: boolean
  createdAt:    string
  occurredAt?:  string
  missionId?:   string | null
  orderNumber?: string
  // Extra fuel fields
  fuelGallons?:     number
  fuelPricePerGal?: number
  fuelType?:        string
  // Extra receipt fields
  vendor?:          string
  truckNumber?:     string
  transactionId?:   string
  scaleWeight?:     number
  lumperWorkers?:   number
}

// ── OCR result shape ──────────────────────────────────────────────────────────
interface OcrResult {
  category?:        string
  amount?:          number | null
  vendor?:          string | null
  description?:     string | null
  address?:         string | null
  city?:            string | null
  state?:           string | null
  date?:            string | null
  time?:            string | null
  loadNumber?:      string | null
  fuelGallons?:     number | null
  fuelPricePerGal?: number | null
  fuelType?:        string | null
  truckNumber?:     string | null
  odometer?:        number | null
  lumperWorkers?:   number | null
  scaleWeight?:     number | null
  transactionId?:   string | null
  notes?:           string | null
  confidence?:      'high' | 'medium' | 'low'
  error?:           string
}

type ScanState = 'idle' | 'scanning' | 'review' | 'saving' | 'saved' | 'error'

interface Props {
  open:          boolean
  onClose:       () => void
  missionId?:    string | null
  orderNumber?:  string
  loadNumber?:   string
  onSaved?:      (expense: SavedExpense) => void
}

const today = () => new Date().toISOString().slice(0, 10)

export default function ExpenseScanSheet({
  open, onClose, missionId, orderNumber, loadNumber: propLoadNumber, onSaved,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [scanState,  setScanState]  = useState<ScanState>('idle')
  const [ocr,        setOcr]        = useState<OcrResult | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorMsg,   setErrorMsg]   = useState('')

  // Editable review fields
  const [category,    setCategory]    = useState<CatId>('fuel')
  const [amount,      setAmount]      = useState('')
  const [description, setDescription] = useState('')
  const [location,    setLocation]    = useState('')
  const [dateVal,     setDateVal]     = useState(today())
  const [loadNumber,  setLoadNumber]  = useState(propLoadNumber ?? '')

  // ── Fill review form from OCR result ─────────────────────────────────────
  const fillFromOcr = useCallback((result: OcrResult) => {
    if (result.category) setCategory(result.category as CatId)

    setAmount(result.amount != null ? String(result.amount) : '')

    // Build description from vendor + OCR description
    const parts = [result.vendor, result.description].filter(Boolean)
    if (parts.length) setDescription(parts.join(' — '))

    // Build location from city + state (+ address if no city)
    const loc = result.city && result.state
      ? `${result.city}, ${result.state}`
      : result.city || result.state || result.address || ''
    setLocation(loc)

    if (result.date) setDateVal(result.date)
    if (result.loadNumber) setLoadNumber(result.loadNumber)
  }, [])

  // ── Handle file selection ─────────────────────────────────────────────────
  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Show preview
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setScanState('scanning')
    setErrorMsg('')
    setOcr(null)

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/scan-expense', { method: 'POST', body: fd })
      const data: OcrResult = await res.json()

      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? 'Could not read receipt. Please fill in manually.')
        setScanState('review')
        return
      }

      setOcr(data)
      fillFromOcr(data)
      setScanState('review')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Scan failed')
      setScanState('review')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [fillFromOcr])

  // ── Save expense ──────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return

    setScanState('saving')
    const catDef  = getCat(category)
    const now     = new Date().toISOString()

    const expense: SavedExpense = {
      id:           crypto.randomUUID(),
      date:         dateVal,
      category,
      amount:       Math.round(amt * 100) / 100,
      description:  description.trim(),
      location:     location.trim(),
      loadNumber:   loadNumber.trim(),
      deductPct:    catDef.deductPct,
      isDeductible: catDef.deductPct > 0,
      createdAt:    now,
      occurredAt:   dateVal ? `${dateVal}T${ocr?.time ?? '12:00'}:00.000Z` : now,
      missionId:    missionId ?? null,
      orderNumber,
      // Pass fuel/receipt extras through
      ...(ocr?.fuelGallons     != null && { fuelGallons:     ocr.fuelGallons }),
      ...(ocr?.fuelPricePerGal != null && { fuelPricePerGal: ocr.fuelPricePerGal }),
      ...(ocr?.fuelType        != null && { fuelType:        ocr.fuelType }),
      ...(ocr?.truckNumber     != null && { truckNumber:     ocr.truckNumber }),
      ...(ocr?.transactionId   != null && { transactionId:   ocr.transactionId }),
      ...(ocr?.scaleWeight     != null && { scaleWeight:     ocr.scaleWeight }),
      ...(ocr?.lumperWorkers   != null && { lumperWorkers:   ocr.lumperWorkers }),
      ...(ocr?.vendor          != null && { vendor:          ocr.vendor }),
    }

    try {
      const raw   = localStorage.getItem('3b-expenses') ?? '[]'
      const all   = JSON.parse(raw) as SavedExpense[]
      all.unshift(expense)
      localStorage.setItem('3b-expenses', JSON.stringify(all))
    } catch { /* storage full */ }

    setScanState('saved')
    onSaved?.(expense)

    // Reset after brief success state
    setTimeout(() => {
      setScanState('idle')
      setOcr(null)
      setPreviewUrl(null)
      setErrorMsg('')
      setAmount('')
      setDescription('')
      setLocation('')
      setDateVal(today())
      setLoadNumber(propLoadNumber ?? '')
      setCategory('fuel')
      onClose()
    }, 1200)
  }, [amount, category, dateVal, description, loadNumber, location, missionId, ocr, orderNumber, propLoadNumber, onClose, onSaved])

  const handleReset = () => {
    setScanState('idle')
    setOcr(null)
    setPreviewUrl(null)
    setErrorMsg('')
    setAmount('')
    setDescription('')
    setLocation('')
    setDateVal(today())
    setLoadNumber(propLoadNumber ?? '')
    setCategory('fuel')
  }

  if (!open) return null

  const catDef  = getCat(category)
  const amt     = parseFloat(amount)
  const canSave = amt > 0

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 400 }}
        onClick={scanState === 'scanning' ? undefined : onClose}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        boxShadow: '0 -4px 40px rgba(0,0,0,.4)',
        maxHeight: '94vh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', margin: '1rem auto .25rem', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.5rem 1.25rem .75rem', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.15rem' }}>
              {scanState === 'scanning' ? '🔍 Reading Receipt…' : scanState === 'saved' ? '✅ Saved!' : '📷 Scan Receipt'}
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
              {scanState === 'idle'     && 'Photograph any receipt — AI will extract the details'}
              {scanState === 'scanning' && 'Claude is reading your receipt…'}
              {scanState === 'review'   && 'Review and confirm the extracted data'}
              {scanState === 'saving'   && 'Saving expense…'}
              {scanState === 'saved'    && 'Expense added to your records'}
            </div>
          </div>
          {scanState !== 'scanning' && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--muted)', cursor: 'pointer', lineHeight: 1 }}>×</button>
          )}
        </div>

        {/* ── IDLE: show scan trigger ── */}
        {scanState === 'idle' && (
          <div style={{ padding: '0 1.25rem 2rem' }}>
            {/* Hidden input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleFile}
            />

            {/* Big camera button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', padding: '2rem 1rem',
                borderRadius: 18, border: '2px dashed var(--primary)',
                background: 'rgba(0,232,176,.04)', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
                marginBottom: '1rem',
              }}
            >
              <div style={{ fontSize: '3.5rem', lineHeight: 1 }}>📷</div>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--primary)' }}>Tap to scan receipt</div>
                <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 4 }}>Camera opens automatically · any receipt type</div>
              </div>
            </button>

            {/* Upload from gallery fallback */}
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute('capture')
                  fileInputRef.current.click()
                  // Restore capture after click
                  setTimeout(() => fileInputRef.current?.setAttribute('capture', 'environment'), 100)
                }
              }}
              style={{ width: '100%', padding: '.85rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', color: 'var(--muted)' }}
            >
              🖼️ Choose from gallery
            </button>

            {/* What it handles */}
            <div style={{ marginTop: '1.25rem', padding: '.75rem 1rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>Handles all receipt types</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {SCAN_CATEGORIES.map(c => (
                  <span key={c.id} style={{ fontSize: '.7rem', fontWeight: 700, padding: '.25rem .6rem', borderRadius: 20, background: 'var(--surface-off)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                    {c.emoji} {c.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SCANNING: loading state ── */}
        {scanState === 'scanning' && (
          <div style={{ padding: '2rem 1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
            {previewUrl && (
              <img src={previewUrl} alt="Receipt" style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--border)' }} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid var(--primary)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: '.9rem', color: 'var(--muted)', fontWeight: 600 }}>Extracting expense data…</div>
            </div>
          </div>
        )}

        {/* ── REVIEW: edit + confirm ── */}
        {scanState === 'review' && (
          <div style={{ padding: '0 1.25rem 2rem', display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
            {/* Receipt preview + confidence */}
            {previewUrl && (
              <div style={{ position: 'relative' }}>
                <img src={previewUrl} alt="Receipt" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border)' }} />
                {ocr?.confidence && (
                  <div style={{
                    position: 'absolute', top: 8, right: 8, padding: '.25rem .65rem', borderRadius: 20, fontSize: '.65rem', fontWeight: 800,
                    background: ocr.confidence === 'high' ? 'rgba(40,192,72,.9)' : ocr.confidence === 'medium' ? 'rgba(245,194,0,.9)' : 'rgba(232,64,0,.9)',
                    color: '#fff',
                  }}>
                    {ocr.confidence === 'high' ? '✓ High confidence' : ocr.confidence === 'medium' ? '~ Medium' : '⚠ Low confidence'}
                  </div>
                )}
                <button onClick={handleReset} style={{ position: 'absolute', top: 8, left: 8, padding: '.25rem .6rem', borderRadius: 8, border: 'none', background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer' }}>
                  🔄 Re-scan
                </button>
              </div>
            )}

            {/* Error notice */}
            {errorMsg && (
              <div style={{ padding: '.65rem .9rem', background: 'rgba(232,64,0,.08)', border: '1px solid rgba(232,64,0,.25)', borderRadius: 10, fontSize: '.78rem', color: 'var(--error)', fontWeight: 600 }}>
                ⚠️ {errorMsg} — fill in the details below.
              </div>
            )}

            {/* Category */}
            <div>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Category</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                {SCAN_CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id as CatId)}
                    style={{
                      padding: '.5rem .2rem', borderRadius: 10, cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      border:     category === c.id ? '1px solid var(--primary)' : '1px solid var(--border)',
                      background: category === c.id ? 'rgba(0,232,176,.12)' : 'var(--surface-2)',
                    }}
                  >
                    <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{c.emoji}</span>
                    <span style={{ fontSize: '.5rem', fontWeight: 700, color: category === c.id ? 'var(--primary)' : 'var(--muted)', textAlign: 'center', lineHeight: 1.2 }}>
                      {c.label.length > 9 ? c.label.slice(0, 9) : c.label}
                    </span>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 6, fontSize: '.65rem', color: 'var(--primary)', fontWeight: 700 }}>
                {catDef.emoji} {catDef.label} — {catDef.deductPct}% tax deductible
              </div>
            </div>

            {/* Amount — LARGE, most important */}
            <div>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Total Amount *</div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontWeight: 800, fontSize: '1.4rem' }}>$</span>
                <input
                  type="text" inputMode="decimal"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  style={{
                    width: '100%', padding: '1rem 1rem 1rem 2.2rem',
                    borderRadius: 12, border: `2px solid ${canSave ? 'var(--primary)' : 'var(--border)'}`,
                    background: 'var(--surface-2)', color: 'var(--text)',
                    fontSize: '1.6rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums',
                  }}
                />
              </div>
              {canSave && catDef.deductPct > 0 && (
                <div style={{ fontSize: '.7rem', color: 'var(--success)', marginTop: 4, fontWeight: 700 }}>
                  ✅ ${(amt * catDef.deductPct / 100).toFixed(2)} tax deductible ({catDef.deductPct}%)
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Description</div>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Love's #478 diesel fill-up"
                style={{ width: '100%', padding: '.65rem .9rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.9rem' }}
              />
            </div>

            {/* Location + Date row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Location</div>
                <input
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="City, ST"
                  style={{ width: '100%', padding: '.65rem .9rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.88rem' }}
                />
              </div>
              <div>
                <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Date</div>
                <input
                  type="date"
                  value={dateVal}
                  onChange={e => setDateVal(e.target.value)}
                  style={{ width: '100%', padding: '.65rem .9rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.88rem' }}
                />
              </div>
            </div>

            {/* Load number */}
            <div>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Load # (optional)</div>
              <input
                value={loadNumber}
                onChange={e => setLoadNumber(e.target.value)}
                placeholder="Load or BOL number"
                style={{ width: '100%', padding: '.65rem .9rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.88rem' }}
              />
            </div>

            {/* Fuel-specific extracted data (read-only display) */}
            {ocr && category === 'fuel' && (ocr.fuelGallons != null || ocr.fuelPricePerGal != null) && (
              <div style={{ background: 'rgba(0,232,176,.05)', border: '1px solid rgba(0,232,176,.15)', borderRadius: 12, padding: '.75rem .9rem' }}>
                <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>⛽ Extracted Fuel Data</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {ocr.fuelGallons != null && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700 }}>Gallons</div>
                      <div style={{ fontSize: '.95rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{ocr.fuelGallons.toFixed(3)}</div>
                    </div>
                  )}
                  {ocr.fuelPricePerGal != null && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700 }}>$/Gal</div>
                      <div style={{ fontSize: '.95rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>${ocr.fuelPricePerGal.toFixed(3)}</div>
                    </div>
                  )}
                  {ocr.fuelType && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700 }}>Type</div>
                      <div style={{ fontSize: '.95rem', fontWeight: 900, textTransform: 'capitalize' }}>{ocr.fuelType}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Scale / Lumper extracted info */}
            {ocr && (category === 'scale' || category === 'lumper') && (
              <div style={{ background: 'rgba(0,232,176,.05)', border: '1px solid rgba(0,232,176,.15)', borderRadius: 12, padding: '.75rem .9rem' }}>
                <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                  {category === 'scale' ? '⚖️ Scale Data' : '📦 Lumper Data'}
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {ocr.scaleWeight != null && (
                    <div>
                      <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700 }}>Gross Weight</div>
                      <div style={{ fontSize: '.95rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{ocr.scaleWeight.toLocaleString()} lbs</div>
                    </div>
                  )}
                  {ocr.lumperWorkers != null && (
                    <div>
                      <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700 }}>Workers</div>
                      <div style={{ fontSize: '.95rem', fontWeight: 900 }}>{ocr.lumperWorkers}</div>
                    </div>
                  )}
                  {ocr.transactionId && (
                    <div>
                      <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700 }}>Ticket #</div>
                      <div style={{ fontSize: '.88rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{ocr.transactionId}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Confirm + Cancel */}
            <div style={{ display: 'flex', gap: 10, paddingTop: '.25rem' }}>
              <button
                onClick={handleReset}
                style={{ flex: 1, padding: '1rem', borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', fontWeight: 800, fontSize: '.9rem', cursor: 'pointer', color: 'var(--muted)' }}
              >
                🔄 Re-scan
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave || (scanState as string) === 'saving'}
                style={{
                  flex: 2, padding: '1rem', borderRadius: 14, border: 'none',
                  background: canSave ? 'var(--primary)' : 'var(--surface-2)',
                  color: canSave ? '#061210' : 'var(--muted)',
                  fontWeight: 900, fontSize: '1rem',
                  cursor: canSave ? 'pointer' : 'not-allowed',
                  opacity: (scanState as string) === 'saving' ? 0.7 : 1,
                }}
              >
                {`✅ Save ${catDef.emoji} ${amt > 0 ? `$${amt.toFixed(2)}` : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* ── SAVED ── */}
        {scanState === 'saved' && (
          <div style={{ padding: '2rem 1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{ fontSize: '4rem', lineHeight: 1 }}>✅</div>
            <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>Expense Saved!</div>
            <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
              {getCat(category).emoji} {getCat(category).label} — ${parseFloat(amount).toFixed(2)}
            </div>
          </div>
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg) } }
        `}</style>
      </div>
    </>
  )
}
