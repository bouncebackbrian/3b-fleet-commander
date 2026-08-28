'use client'
import { useEffect, useMemo, useState } from 'react'
import Sheet, { primaryBtnStyle } from './Sheet'
import SignaturePad from './SignaturePad'
import { toast } from '@/hooks/useToast'

interface Props {
  shiftId: string
  workDate: string
  totalHours: number
  onClose: () => void
  onDone: () => void
}

type Step = 'review' | 'sign' | 'correction'

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function HoursSignOffSheet({ shiftId, workDate, totalHours, onClose, onDone }: Props) {
  const [step, setStep] = useState<Step>('review')
  const [sheetPhoto, setSheetPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [correctionNote, setCorrectionNote] = useState('')
  const [correctedStart, setCorrectedStart] = useState('')
  const [correctedEnd, setCorrectedEnd] = useState('')
  const [loadingTimes, setLoadingTimes] = useState(false)

  useEffect(() => {
    if (step !== 'correction' || correctedStart || correctedEnd) return
    setLoadingTimes(true)
    fetch(`/api/fleet/dump-truck/hours/log?from=${workDate}&to=${workDate}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Could not load timestamps')))
      .then(body => {
        const entries = (body.entries ?? []) as { shiftId: string; eventType: string; effectiveAt: string }[]
        const shiftEntries = entries.filter(e => e.shiftId === shiftId).sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt))
        const clockIn = shiftEntries.find(e => e.eventType === 'clock_in')?.effectiveAt ?? shiftEntries[0]?.effectiveAt ?? null
        const clockOut = [...shiftEntries].reverse().find(e => e.eventType === 'clock_out')?.effectiveAt ?? shiftEntries[shiftEntries.length - 1]?.effectiveAt ?? null
        setCorrectedStart(toLocalInput(clockIn))
        setCorrectedEnd(toLocalInput(clockOut))
      })
      .catch(() => {})
      .finally(() => setLoadingTimes(false))
  }, [step, workDate, shiftId, correctedStart, correctedEnd])

  const correctedHours = useMemo(() => {
    const start = new Date(correctedStart).getTime()
    const end = new Date(correctedEnd).getTime()
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 3600000 : null
  }, [correctedStart, correctedEnd])

  const submitConfirmation = async (signatureBlob: Blob) => {
    setBusy(true)
    try {
      const form = new FormData()
      form.append('shiftId', shiftId)
      form.append('workDate', workDate)
      form.append('signature', signatureBlob, 'signature.png')
      form.append('totalHours', String(totalHours))
      if (sheetPhoto) form.append('sheetPhoto', sheetPhoto, sheetPhoto.name)
      const res = await fetch('/api/fleet/dump-truck/hours/confirm', { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save confirmation')
      toast.success('Hours confirmed and submitted')
      onDone()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save confirmation')
    } finally {
      setBusy(false)
    }
  }

  const submitCorrection = async () => {
    if (!correctionNote.trim() || !correctedStart || !correctedEnd || correctedHours == null) return
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/hours/driver-correction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId,
          workDate,
          correctedStartAt: new Date(correctedStart).toISOString(),
          correctedEndAt: new Date(correctedEnd).toISOString(),
          note: correctionNote.trim(),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not submit corrected times')
      toast.success('Corrected times submitted — original punches remain in the audit history')
      onDone()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit corrected times')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'sign') {
    return (
      <SignaturePad
        label={`Sign to confirm ${workDate} — ${totalHours.toFixed(2)} hrs is correct`}
        busy={busy}
        onCancel={() => setStep('review')}
        onSave={submitConfirmation}
      />
    )
  }

  if (step === 'correction') {
    return (
      <Sheet title="Correct & Submit Times" onClose={onClose}>
        <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '.75rem' }}>
          Enter the actual start and end/drop-off time. The original clock events stay preserved. This correction is timestamped with your note and becomes the submitted verified total for this day.
        </p>
        {loadingTimes && <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 8 }}>Loading recorded timestamps…</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={labelStyle}>Actual start<input type="datetime-local" value={correctedStart} onChange={e => setCorrectedStart(e.target.value)} style={inputStyle} /></label>
          <label style={labelStyle}>Actual end / drop-off<input type="datetime-local" value={correctedEnd} onChange={e => setCorrectedEnd(e.target.value)} style={inputStyle} /></label>
        </div>
        <div style={{ fontSize: '.8rem', marginTop: 8, color: correctedHours == null ? 'var(--warn, #d99a2b)' : 'var(--primary)', fontWeight: 700 }}>
          Corrected total: {correctedHours == null ? 'check start/end times' : `${correctedHours.toFixed(2)} hrs`}
        </div>
        <textarea
          value={correctionNote}
          onChange={e => setCorrectionNote(e.target.value)}
          placeholder="Required note — what was corrected and why?"
          style={{ width: '100%', minHeight: 100, marginTop: 10, padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '16px' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: '.75rem' }}>
          <button onClick={() => setStep('review')} style={{ flex: 1, padding: '.7rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>Back</button>
          <button
            onClick={submitCorrection}
            disabled={!correctionNote.trim() || correctedHours == null || busy}
            style={{ ...primaryBtnStyle, flex: 1, opacity: correctionNote.trim() && correctedHours != null && !busy ? 1 : .5 }}
          >
            {busy ? 'Submitting…' : 'Submit Corrected Times'}
          </button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title="Confirm Hours" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ padding: '.85rem 1rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>{workDate}</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{totalHours.toFixed(2)} hrs</div>
        </div>

        <div>
          <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>Attach a signed paper sheet (optional)</div>
          {sheetPhoto ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.6rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '.8rem' }}>📎 {sheetPhoto.name}</span>
              <button onClick={() => setSheetPhoto(null)} style={{ color: 'var(--error)', fontWeight: 700 }}>Remove</button>
            </div>
          ) : (
            <label style={{ display: 'block', padding: '.75rem', borderRadius: 8, border: '1px dashed var(--border)', textAlign: 'center', fontSize: '.82rem', color: 'var(--primary)', cursor: 'pointer' }}>
              📷 Scan / Photo of Signed Sheet
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => setSheetPhoto(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </div>

        <button style={primaryBtnStyle} onClick={() => setStep('sign')}>✅ Hours Are Correct — Sign &amp; Submit</button>
        <button onClick={() => setStep('correction')} style={{ padding: '.75rem', borderRadius: 10, background: 'none', border: '1px solid var(--border)', color: 'var(--warn, #d99a2b)', fontWeight: 700 }}>
          ✏️ Correct Times &amp; Submit
        </button>
      </div>
    </Sheet>
  )
}

const inputStyle: React.CSSProperties = { display: 'block', width: '100%', marginTop: 5, padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '16px' }
const labelStyle: React.CSSProperties = { fontSize: '.75rem', fontWeight: 700, color: 'var(--muted)' }
