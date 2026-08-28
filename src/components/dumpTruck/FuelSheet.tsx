'use client'
/**
 * FuelSheet — "Add Fuel" quick action (spec §9)
 *
 * Receipt photo + odometer are required. Opening this sheet starts a paid
 * fueling timer; taking the receipt photo ends the fuel event. The overall
 * driver shift continues — fuel timing is evidence/analytics, not a pay
 * deduction. Fuel start/end are written to the append-only event log so the
 * hours portal can report fueling duration and spot unusually long stops.
 */
import { useRef, useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import { captureGeolocation, createId, getDeviceTimezone, getUtcOffsetMinutes } from '@/lib/dumpTruck/events'
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
  const fuelStartedAtRef = useRef(new Date().toISOString())
  const fuelStartEventIdRef = useRef(createId())
  const fuelStartPostedRef = useRef(false)
  const [fuelEndedAt, setFuelEndedAt] = useState<string | null>(null)
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

  const postFuelEvent = async (eventType: 'fuel_stop_started' | 'fuel_stop_ended', effectiveAt: string, eventId: string, eventNotes: string) => {
    if (!isOnline) return
    const geo = await captureGeolocation()
    const when = new Date(effectiveAt)
    const res = await fetch('/api/fleet/dump-truck/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: eventId,
        idempotencyKey: eventId,
        shiftId,
        eventType,
        jobId,
        deviceCapturedAt: effectiveAt,
        effectiveAt,
        timezone: getDeviceTimezone(),
        utcOffsetMinutes: getUtcOffsetMinutes(when),
        geo,
        odometer: odometer.trim() ? Number(odometer) : null,
        notes: eventNotes,
        deviceMetadata: { paidOperationalTime: true, analyticsOnly: true },
      }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? `Could not record ${eventType}`)
  }

  const ensureFuelStartEvent = async () => {
    if (fuelStartPostedRef.current || !isOnline) return
    await postFuelEvent('fuel_stop_started', fuelStartedAtRef.current, fuelStartEventIdRef.current, 'Fueling started — paid operational time')
    fuelStartPostedRef.current = true
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    const endedAt = new Date().toISOString()
    setFuelEndedAt(endedAt)
    try {
      await ensureFuelStartEvent()
      if (isOnline) {
        await postFuelEvent('fuel_stop_ended', endedAt, createId(), 'Fueling ended when receipt photo was captured — paid operational time')
      }
    } catch (err) {
      toast.warn(err instanceof Error ? err.message : 'Fuel timing will remain visible in the fuel record')
    }

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
      await ensureFuelStartEvent().catch(() => {})
      const geo = await captureGeolocation()
      const endAt = fuelEndedAt ?? new Date().toISOString()
      const fields: Record<string, string> = {
        shiftId, vehicleId, vendorName, purchasedAt: endAt,
        fuelStartedAt: fuelStartedAtRef.current, fuelEndedAt: endAt,
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
        toast.success('Fuel entry saved — fueling time remains paid operational time')
      } catch {
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
        <div style={{ fontSize: '.75rem', padding: '.6rem .7rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          ⛽ Fueling is <strong>paid operational time</strong>. The fuel timer starts when Fuel is opened and ends when the receipt photo is taken. Your overall shift keeps running until post-trip is complete.
        </div>
        {!isOnline && (
          <div style={{ fontSize: '.72rem', fontWeight: 700, padding: '.5rem .6rem', borderRadius: 8, textAlign: 'center', background: 'rgba(245,194,0,.12)', color: 'var(--warn)' }}>
            📴 No signal — this will save on the truck and upload automatically once you're back in range.
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
        <Row>
          <Field label="Odometer at Fuel Start *"><input style={inputStyle} type="number" inputMode="numeric" value={odometer} onChange={e => setOdometer(e.target.value)} placeholder="record mileage before fueling" /></Field>
          <Field label="Vendor / Station"><input style={inputStyle} value={vendorName} onChange={e => setVendorName(e.target.value)} /></Field>
        </Row>
        <button style={{ ...inputStyle, minHeight: 100, fontWeight: 700, border: !file ? '1px solid var(--warn)' : undefined }} onClick={() => fileRef.current?.click()} disabled={scanning}>
          {scanning ? '🔍 Reading receipt…' : file ? `📷 ${file.name} — fuel timer stopped` : '📷 Take Receipt Photo * — ends fuel timer'}
        </button>

        {ocr?.confidence && (
          <div style={{ fontSize: '.72rem', fontWeight: 700, padding: '.4rem .6rem', borderRadius: 8, textAlign: 'center', background: ocr.confidence === 'high' ? 'rgba(40,192,72,.12)' : ocr.confidence === 'medium' ? 'rgba(245,194,0,.12)' : 'rgba(232,64,0,.12)', color: ocr.confidence === 'high' ? 'var(--success)' : ocr.confidence === 'medium' ? 'var(--warn)' : 'var(--error)' }}>
            OCR confidence: {ocr.confidence} — review every field before saving
          </div>
        )}

        <Row>
          <Field label="Fuel Type"><select style={inputStyle} value={fuelType} onChange={e => setFuelType(e.target.value)}>{FUEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></Field>
          <Field label="Full Tank?"><select style={inputStyle} value={fullTank ? 'yes' : 'no'} onChange={e => setFullTank(e.target.value === 'yes')}><option value="yes">Yes</option><option value="no">No</option></select></Field>
        </Row>
        <Row>
          <Field label="Gallons"><input style={inputStyle} type="number" inputMode="decimal" value={gallons} onChange={e => setGallons(e.target.value)} /></Field>
          <Field label="$ / Gallon"><input style={inputStyle} type="number" inputMode="decimal" value={pricePerGallon} onChange={e => setPricePerGallon(e.target.value)} /></Field>
        </Row>
        <Field label="Total Cost *"><input style={{ ...inputStyle, fontSize: '1.3rem', fontWeight: 900 }} type="number" inputMode="decimal" value={totalCost} onChange={e => setTotalCost(e.target.value)} placeholder="0.00" /></Field>
        <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 60 }} value={notes} onChange={e => setNotes(e.target.value)} /></Field>

        {!canSave && <div style={{ fontSize: '.72rem', color: 'var(--muted)', textAlign: 'center' }}>Odometer, receipt photo, and total cost are required.</div>}
        <button style={{ ...primaryBtnStyle, opacity: canSave && !saving ? 1 : .5 }} disabled={!canSave || saving} onClick={submit}>
          {saving ? 'Saving…' : isOnline ? 'Save Fuel Entry' : 'Save Offline — Upload Later'}
        </button>
      </div>
    </Sheet>
  )
}

function Row({ children }: { children: React.ReactNode }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{children}</div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>{children}</div>
}
