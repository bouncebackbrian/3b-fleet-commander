'use client'
import { useMemo, useState } from 'react'
import Sheet, { primaryBtnStyle } from './Sheet'
import { toast } from '@/hooks/useToast'

interface Props {
  shiftId: string
  workDate: string
  clockInAt: string | null
  clockOutAt: string | null
  onClose: () => void
  onDone: () => void
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function DriverTimeCorrectionSheet({ shiftId, workDate, clockInAt, clockOutAt, onClose, onDone }: Props) {
  const [start, setStart] = useState(toLocalInput(clockInAt))
  const [end, setEnd] = useState(toLocalInput(clockOutAt))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const hours = useMemo(() => {
    const a = new Date(start).getTime()
    const b = new Date(end).getTime()
    return Number.isFinite(a) && Number.isFinite(b) && b > a ? (b - a) / 3600000 : null
  }, [start, end])

  const submit = async () => {
    if (!start || !end || !note.trim() || hours == null) return
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/hours/driver-correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId,
          workDate,
          correctedStartAt: new Date(start).toISOString(),
          correctedEndAt: new Date(end).toISOString(),
          note: note.trim(),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not submit correction')
      toast.success('Corrected times submitted — previous values remain in the audit history')
      onClose()
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit correction')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={`Correct Times — ${workDate}`} onClose={onClose}>
      <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '.85rem' }}>
        Enter the actual start and end time. Fleet Commander will keep the original clock events, timestamp this correction, and use the corrected total as the verified hours for review.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ fontSize: '.75rem', fontWeight: 700 }}>
          Actual start
          <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: '.75rem', fontWeight: 700 }}>
          Actual end / drop-off
          <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} style={inputStyle} />
        </label>
      </div>
      <div style={{ marginTop: 10, fontSize: '.8rem', color: hours == null ? 'var(--warn, #d99a2b)' : 'var(--primary)' }}>
        Corrected total: {hours == null ? 'check the times above' : `${hours.toFixed(2)} hrs`}
      </div>
      <label style={{ display: 'block', marginTop: 12, fontSize: '.75rem', fontWeight: 700 }}>
        Required correction note
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Example: broker sheet ended at 3:30; drove truck back to yard and dropped it at sign shop at 4:30."
          style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>Cancel</button>
        <button disabled={busy || !note.trim() || hours == null} onClick={submit} style={{ ...primaryBtnStyle, flex: 1, opacity: busy || !note.trim() || hours == null ? .5 : 1 }}>
          {busy ? 'Submitting…' : 'Submit Corrected Times'}
        </button>
      </div>
    </Sheet>
  )
}

const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 5, padding: '.65rem', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '16px',
}
