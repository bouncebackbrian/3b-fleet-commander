'use client'
/**
 * FuelSheet — "Add Fuel" quick action (spec §9)
 *
 * Reuses the existing /api/scan-expense OCR endpoint (Claude vision) —
 * same one ExpenseScanSheet uses — rather than building a new OCR path.
 * OCR results populate the form for driver review; nothing is saved until
 * the driver confirms (spec: "OCR suggestions must be reviewed rather than
 * silently trusted").
 *
 * Receipt photo + odometer are required (2026-07-29 follow-up — tax-audit
 * record quality, and odometer is what powers the MPG averages on the
 * dispatch portal). When offline (or the live save fails mid-flight), the
 * entry and photo are queued durably via useDumpTruckDriver's
 * queueFuelEntry — see offlineFuelQueue.ts — and uploaded automatically
 * once connectivity returns, same "never lose a stamp" guarantee as the
 * primary event queue.
 */
import { useRef, useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import { captureGeolocation } from '@/lib/dumpTruck/events'
import { toast } from '@/hooks/useToast'

interface OcrResult {
  amount?: number | null
  vendor?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  date?: string | null
  fuelGallons?: number | null
  fuelPricePerGal?: number | null
  fuelType?: string | null
  odometer?: number | null
  transactionId?: string | null
  confidence?: 'high' | 'medium' | 'low'
  error?: string
}

interface Props {
  shiftId: string
  vehicleId: string
  jobId: string | null
  isOnline: boolean
  onClose: () => void
  onSaved: () => void
  onQueueOffline: (fields: Record<string, string>, file: File | null) => Promise<void>
}

const FUEL_TYPES = ['diesel', 'gasoline', 'def', 'reefer', 'other']

export default function FuelSheet({ shiftId, vehicleId, jobId, isOnline, onClose, onSaved, onQueueOffline }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [scanning, setScanning] = useState(false)
  const [ocr, setOcr] = useState<OcrResult | null>(null)
  const [saving, setSaving] = useState(false)

  const [vendorName, setVendorName] = useState('')
  const [odometer, setOdometer] = useState('')
  const [fuelType, setFuelType] = useState('diesel')
  const [gallons, setGallons] = useState('')
  const [pricePerGallon, setPricePerGallon] = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [fullTank, setFullTank] = useState(true)
  const [notes, setNotes] = useState('')

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setScanning(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/scan-expense', { method: 'POST', body: fd })
      const data: OcrResult = await res.json()
      if (res.ok && !data.error) {
        setOcr(data)
        if (data.vendor) setVendorName(data.vendor)
        if (data.odometer != null) setOdometer(String(data.odometer))
        if (data.fuelType) setFuelType(data.fuelType)
        if (data.fuelGallons != null) setGallons(String(data.fuelGallons))
        if (data.fuelPricePerGal != null) setPricePerGallon(String(data.fuelPricePerGal))
        if (data.amount != null) setTotalCost(String(data.amount))
      } else {
        toast.warn('Could not read receipt automatically — fill in the details below')
      }
    } catch {
      toast.warn('Receipt scan failed — fill in the details below')
    } finally {
      setScanning(false)
    }
  }

  const canSave = !!vehicleId && !!file && !!odometer.trim() && totalCost.trim() && Number(totalCost) > 0

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const geo = await captureGeolocation()
      const fields: Record<string, string> = {
        shiftId, vehicleId, vendorName, purchasedAt: new Date().toISOString(),
        odometer, fuelType, totalCost, fullTank: String(fullTank), driverVerified: 'true',
      }
      if (jobId) fields.jobId = jobId
      if (geo.lat != null) { fields.lat = String(geo.lat); fields.lng = String(geo.lng) }
      if (gallons) fields.gallons = gallons
      if (pricePerGallon) fields.pricePerGallon = pricePerGallon
      if (notes) fields.notes = notes
      if (ocr) {
        if (ocr.vendor) fields.ocrMerchant = ocr.vendor
        if (ocr.date) fields.ocrDate = ocr.date
        if (ocr.fuelGallons != null) fields.ocrGallons = String(ocr.fuelGallons)
        if (ocr.fuelPricePerGal != null) fields.ocrPricePerGallon = String(ocr.fuelPricePerGal)
        if (ocr.amount != null) fields.ocrTotal = String(ocr.amount)
        const addr = [ocr.address, ocr.city, ocr.state].filter(Boolean).join(', ')
        if (addr) fields.ocrAddress = addr
        if (ocr.confidence) fields.ocrConfidence = ocr.confidence
      }

      if (!isOnline) {
        await onQueueOffline(fields, file)
        toast.success('No signal — fuel entry and receipt saved, will upload automatically')
        onSaved()
        onClose()
        return
      }

      try {
        const form = new FormData()
        for (const [key, value] of Object.entries(fields)) form.append(key, value)
        if (file) form.append('file', file)
        const res = await fetch('/api/fleet/dump-truck/fuel', { method: 'POST', body: form })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save fuel entry')
        const result = await res.json()
        if (result.flags?.decreasingOdometer) toast.warn('Odometer is lower than the last fuel entry — flagged for review')
        if (result.flags?.unrealisticJump) toast.warn('Mileage jump looks unusually large — flagged for review')
        toast.success('Fuel entry saved')
      } catch {
        // Signal dropped mid-save — durably queue rather than lose the entry.
        await onQueueOffline(fields, file)
        toast.warn('Could not reach the server — fuel entry and receipt saved, will upload automatically')
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save fuel entry')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet title="Add Fuel" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
        {!isOnline && (
          <div style={{
            fontSize: '.72rem', fontWeight: 700, padding: '.5rem .6rem', borderRadius: 8, textAlign: 'center',
            background: 'rgba(245,194,0,.12)', color: 'var(--warn)',
          }}>
            📴 No signal — this will save on the truck and upload automatically once you're back in range.
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
        <button
          style={{ ...inputStyle, minHeight: 100, fontWeight: 700, border: !file ? '1px solid var(--warn)' : undefined }}
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
        >
          {scanning ? '🔍 Reading receipt…' : file ? `📷 ${file.name} — tap to rescan` : '📷 Take Receipt Photo *  — required for tax records'}
        </button>

        {ocr?.confidence && (
          <div style={{
            fontSize: '.72rem', fontWeight: 700, padding: '.4rem .6rem', borderRadius: 8, textAlign: 'center',
            background: ocr.confidence === 'high' ? 'rgba(40,192,72,.12)' : ocr.confidence === 'medium' ? 'rgba(245,194,0,.12)' : 'rgba(232,64,0,.12)',
            color: ocr.confidence === 'high' ? 'var(--success)' : ocr.confidence === 'medium' ? 'var(--warn)' : 'var(--error)',
          }}>
            OCR confidence: {ocr.confidence} — review every field before saving
          </div>
        )}

        <Row>
          <Field label="Vendor / Station"><input style={inputStyle} value={vendorName} onChange={e => setVendorName(e.target.value)} /></Field>
          <Field label="Odometer *"><input style={inputStyle} type="number" inputMode="numeric" value={odometer} onChange={e => setOdometer(e.target.value)} placeholder="required for MPG tracking" /></Field>
        </Row>
        <Row>
          <Field label="Fuel Type">
            <select style={inputStyle} value={fuelType} onChange={e => setFuelType(e.target.value)}>
              {FUEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Full Tank?">
            <select style={inputStyle} value={fullTank ? 'yes' : 'no'} onChange={e => setFullTank(e.target.value === 'yes')}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Gallons"><input style={inputStyle} type="number" inputMode="decimal" value={gallons} onChange={e => setGallons(e.target.value)} /></Field>
          <Field label="$ / Gallon"><input style={inputStyle} type="number" inputMode="decimal" value={pricePerGallon} onChange={e => setPricePerGallon(e.target.value)} /></Field>
        </Row>
        <Field label="Total Cost *">
          <input style={{ ...inputStyle, fontSize: '1.3rem', fontWeight: 900 }} type="number" inputMode="decimal" value={totalCost} onChange={e => setTotalCost(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 60 }} value={notes} onChange={e => setNotes(e.target.value)} /></Field>

        {!canSave && (
          <div style={{ fontSize: '.72rem', color: 'var(--muted)', textAlign: 'center' }}>
            Receipt photo, odometer, and total cost are required — for tax-audit records.
          </div>
        )}
        <button style={{ ...primaryBtnStyle, opacity: canSave && !saving ? 1 : .5 }} disabled={!canSave || saving} onClick={submit}>
          {saving ? 'Saving…' : isOnline ? 'Save Fuel Entry' : 'Save Offline — Upload Later'}
        </button>
      </div>
    </Sheet>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{children}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  )
}
