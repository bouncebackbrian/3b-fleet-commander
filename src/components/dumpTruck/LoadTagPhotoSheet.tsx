'use client'
/**
 * LoadTagPhotoSheet — optional load-tag photo for one specific timeline
 * event on the digital dispatch ticket (spec: "For each time stamp also
 * have optional picture of load tag ... AI detect tag number, weight,
 * times ... auto input into fields"). "Location" is NOT read from the
 * photo — the event already has real device GPS from when it was logged.
 *
 * Same OCR review-before-save pattern as LoadTicketSheet: the photo is
 * uploaded as a document linked to this event, then scanned, then the
 * (editable) result is written into the event's device_metadata.
 */
import { useRef, useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import { toast } from '@/hooks/useToast'

interface OcrResult {
  ticketNumber?: string | null
  netWeightTons?: number | null
  material?: string | null
  date?: string | null
  time?: string | null
  confidence?: 'high' | 'medium' | 'low'
  error?: string
}

interface Props {
  shiftId: string
  eventId: string
  onClose: () => void
  onSaved: () => void
}

export default function LoadTagPhotoSheet({ shiftId, eventId, onClose, onSaved }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [scanning, setScanning] = useState(false)
  const [ocr, setOcr] = useState<OcrResult | null>(null)
  const [ticketNumber, setTicketNumber] = useState('')
  const [weightTons, setWeightTons] = useState('')
  const [material, setMaterial] = useState('')
  const [busy, setBusy] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setScanning(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/fleet/dump-truck/scan-load-tag', { method: 'POST', body: fd })
      const data: OcrResult = await res.json()
      if (res.ok && !data.error) {
        setOcr(data)
        if (data.ticketNumber) setTicketNumber(data.ticketNumber)
        if (data.netWeightTons != null) setWeightTons(String(data.netWeightTons))
        if (data.material) setMaterial(data.material)
      } else {
        toast.warn('Could not read the tag automatically — fill in the details below')
      }
    } catch {
      toast.warn('Tag scan failed — fill in the details below')
    } finally {
      setScanning(false)
    }
  }

  const submit = async () => {
    if (!file) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('docType', 'scale_ticket')
      form.append('shiftId', shiftId)
      form.append('linkedEntityType', 'event')
      form.append('linkedEntityId', eventId)
      form.append('capturedAt', new Date().toISOString())

      const uploadRes = await fetch('/api/fleet/dump-truck/documents', { method: 'POST', body: form })
      if (!uploadRes.ok) throw new Error((await uploadRes.json()).error ?? 'Upload failed')
      const { id: documentId } = await uploadRes.json()

      const patchRes = await fetch(`/api/fleet/dump-truck/events/${eventId}/load-tag`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          ticketNumber: ticketNumber || null,
          netWeightTons: weightTons ? Number(weightTons) : null,
          material: material || null,
          date: ocr?.date ?? null,
          time: ocr?.time ?? null,
        }),
      })
      if (!patchRes.ok) throw new Error((await patchRes.json()).error ?? 'Could not save tag info')

      toast.success('Load tag saved')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save load tag')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Attach Load Tag Photo" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
        <button style={{ ...inputStyle, minHeight: 100, fontWeight: 700 }} disabled={scanning} onClick={() => fileRef.current?.click()}>
          {scanning ? '🔍 Reading tag…' : file ? `📷 ${file.name} — tap to rescan` : '📷 Scan Load Tag (auto-fills the fields below)'}
        </button>

        {ocr?.confidence && (
          <div style={{
            fontSize: '.75rem', fontWeight: 700, padding: '.5rem .75rem', borderRadius: 8,
            background: ocr.confidence === 'high' ? 'rgba(40,192,72,.12)' : ocr.confidence === 'medium' ? 'rgba(245,194,0,.12)' : 'rgba(232,64,0,.12)',
            color: ocr.confidence === 'high' ? 'var(--success)' : ocr.confidence === 'medium' ? 'var(--warn)' : 'var(--error)',
          }}>
            OCR confidence: {ocr.confidence} — review before saving
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Tag #</div>
            <input style={inputStyle} value={ticketNumber} onChange={e => setTicketNumber(e.target.value)} placeholder="Optional" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Weight (tons)</div>
            <input style={inputStyle} type="number" inputMode="decimal" step="0.01" value={weightTons} onChange={e => setWeightTons(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Material</div>
          <input style={inputStyle} value={material} onChange={e => setMaterial(e.target.value)} placeholder="Optional" />
        </div>

        <button style={{ ...primaryBtnStyle, opacity: file && !busy ? 1 : .5 }} disabled={!file || busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Sheet>
  )
}
