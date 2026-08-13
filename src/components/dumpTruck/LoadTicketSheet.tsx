'use client'
/**
 * LoadTicketSheet — attach a scale/delivery ticket photo + number to a load cycle (spec §7, §9)
 *
 * OCR pre-fill via /api/fleet/dump-truck/scan-load-ticket (Claude vision) —
 * same review-before-save pattern as FuelSheet/ExpenseScanSheet. Ticket
 * formats vary a lot in practice: some scale houses print a full
 * gross/tare/net breakdown, others just hand over a total — the OCR fills
 * in whatever it can read, and every field stays manually editable so a
 * driver can enter everything by hand when there's no usable photo.
 */
import { useRef, useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import { toast } from '@/hooks/useToast'
import type { TicketType } from '@/lib/fleet/dumpTruck/loadCycles'

interface LoadCycleOption { id: string; sequence: number }

interface OcrResult {
  ticketNumber?: string | null
  netWeightTons?: number | null
  material?: string | null
  orderNumber?: string | null
  customerName?: string | null
  date?: string | null
  time?: string | null
  confidence?: 'high' | 'medium' | 'low'
  error?: string
}

interface Props {
  shiftId: string
  loadCycles: LoadCycleOption[]
  onClose: () => void
  onSaved: () => void
}

export default function LoadTicketSheet({ shiftId, loadCycles, onClose, onSaved }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [scanning, setScanning] = useState(false)
  const [ocr, setOcr] = useState<OcrResult | null>(null)
  const [loadCycleId, setLoadCycleId] = useState(loadCycles[0]?.id ?? '')
  const [ticketType, setTicketType] = useState<TicketType>('scale')
  const [ticketNumber, setTicketNumber] = useState('')
  const [weightTons, setWeightTons] = useState('')
  const [ticketDate, setTicketDate] = useState('')
  const [ticketTime, setTicketTime] = useState('')
  const [busy, setBusy] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setScanning(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/fleet/dump-truck/scan-load-ticket', { method: 'POST', body: fd })
      const data: OcrResult = await res.json()
      if (res.ok && !data.error) {
        setOcr(data)
        if (data.ticketNumber) setTicketNumber(data.ticketNumber)
        if (data.netWeightTons != null) setWeightTons(String(data.netWeightTons))
        if (data.date) setTicketDate(data.date)
        if (data.time) setTicketTime(data.time)
      } else {
        toast.warn('Could not read ticket automatically — fill in the details below')
      }
    } catch {
      toast.warn('Ticket scan failed — fill in the details below')
    } finally {
      setScanning(false)
    }
  }

  const canSave = !!file && !!loadCycleId

  const submit = async () => {
    if (!canSave || !file) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('ticketType', ticketType)
      form.append('shiftId', shiftId)
      if (ticketNumber) form.append('ticketNumber', ticketNumber)
      if (weightTons) form.append('weightTons', weightTons)
      if (ticketDate) {
        const iso = new Date(`${ticketDate}T${ticketTime || '00:00'}:00`).toISOString()
        form.append('ticketCapturedAt', iso)
      }

      const res = await fetch(`/api/fleet/dump-truck/load-cycles/${loadCycleId}/ticket`, { method: 'PATCH', body: form })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save ticket')
      toast.success('Ticket saved')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save ticket')
    } finally {
      setBusy(false)
    }
  }

  if (loadCycles.length === 0) {
    return (
      <Sheet title="Load Ticket" onClose={onClose}>
        <div style={{ padding: '1rem 0', color: 'var(--muted)', fontSize: '.9rem' }}>
          No loads recorded yet this shift — arrive at a pickup site first.
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title="Load Ticket" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Load</div>
          <select style={inputStyle} value={loadCycleId} onChange={e => setLoadCycleId(e.target.value)}>
            {loadCycles.map(lc => <option key={lc.id} value={lc.id}>Load #{lc.sequence}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {(['scale', 'delivery'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTicketType(t)}
              style={{
                flex: 1, padding: '.6rem', borderRadius: 8, fontWeight: 700, fontSize: '.85rem',
                background: ticketType === t ? 'var(--primary)' : 'var(--surface-2)',
                color: ticketType === t ? 'var(--dt-on-primary, #04140f)' : 'var(--text)', border: '1px solid var(--border)',
              }}
            >
              {t === 'scale' ? 'Scale Ticket' : 'Delivery Ticket'}
            </button>
          ))}
        </div>

        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
        <button style={{ ...inputStyle, minHeight: 100, fontWeight: 700 }} disabled={scanning} onClick={() => fileRef.current?.click()}>
          {scanning ? '🔍 Reading ticket…' : file ? `📷 ${file.name} — tap to rescan` : '📷 Scan Ticket (auto-fills the fields below)'}
        </button>

        {ocr?.confidence && (
          <div style={{
            fontSize: '.75rem', fontWeight: 700, padding: '.5rem .75rem', borderRadius: 8,
            background: ocr.confidence === 'high' ? 'rgba(40,192,72,.12)' : ocr.confidence === 'medium' ? 'rgba(245,194,0,.12)' : 'rgba(232,64,0,.12)',
            color: ocr.confidence === 'high' ? 'var(--success)' : ocr.confidence === 'medium' ? 'var(--warn)' : 'var(--error)',
          }}>
            OCR confidence: {ocr.confidence} — review every field before saving
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Tag / Ticket #</div>
            <input style={inputStyle} value={ticketNumber} onChange={e => setTicketNumber(e.target.value)} placeholder="Optional" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Weight (tons)</div>
            <input style={inputStyle} type="number" inputMode="decimal" step="0.01" value={weightTons} onChange={e => setWeightTons(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>
            Ticket Date / Time <span style={{ textTransform: 'none', fontWeight: 400 }}>(as printed on the ticket — optional, fill in by hand if no photo)</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={inputStyle} type="date" value={ticketDate} onChange={e => setTicketDate(e.target.value)} />
            <input style={inputStyle} type="time" value={ticketTime} onChange={e => setTicketTime(e.target.value)} />
          </div>
        </div>

        <button style={{ ...primaryBtnStyle, opacity: canSave && !busy ? 1 : .5 }} disabled={!canSave || busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save Ticket'}
        </button>
      </div>
    </Sheet>
  )
}
