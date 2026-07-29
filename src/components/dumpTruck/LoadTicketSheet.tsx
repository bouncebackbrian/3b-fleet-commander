'use client'
/**
 * LoadTicketSheet — attach a scale/delivery ticket photo + number to a load cycle (spec §7, §9)
 */
import { useRef, useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import { toast } from '@/hooks/useToast'
import type { TicketType } from '@/lib/fleet/dumpTruck/loadCycles'

interface LoadCycleOption { id: string; sequence: number }

interface Props {
  shiftId: string
  loadCycles: LoadCycleOption[]
  onClose: () => void
  onSaved: () => void
}

export default function LoadTicketSheet({ shiftId, loadCycles, onClose, onSaved }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loadCycleId, setLoadCycleId] = useState(loadCycles[0]?.id ?? '')
  const [ticketType, setTicketType] = useState<TicketType>('scale')
  const [ticketNumber, setTicketNumber] = useState('')
  const [weightTons, setWeightTons] = useState('')
  const [busy, setBusy] = useState(false)

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
                color: ticketType === t ? '#04140f' : 'var(--text)', border: '1px solid var(--border)',
              }}
            >
              {t === 'scale' ? 'Scale Ticket' : 'Delivery Ticket'}
            </button>
          ))}
        </div>

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

        <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <button style={{ ...inputStyle, minHeight: 100, fontWeight: 700 }} onClick={() => fileRef.current?.click()}>
          {file ? `📷 ${file.name}` : '📷 Tap to photograph the ticket'}
        </button>

        <button style={{ ...primaryBtnStyle, opacity: canSave && !busy ? 1 : .5 }} disabled={!canSave || busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save Ticket'}
        </button>
      </div>
    </Sheet>
  )
}
