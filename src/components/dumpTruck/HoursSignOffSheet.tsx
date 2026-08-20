'use client'
import { useState } from 'react'
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

export default function HoursSignOffSheet({ shiftId, workDate, totalHours, onClose, onDone }: Props) {
  const [step, setStep] = useState<Step>('review')
  const [sheetPhoto, setSheetPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [correctionNote, setCorrectionNote] = useState('')

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
      toast.success('Hours confirmed and signed')
      onDone()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save confirmation')
    } finally {
      setBusy(false)
    }
  }

  const submitCorrection = async () => {
    if (!correctionNote.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/hours/correction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId, workDate, note: correctionNote.trim(), totalHours }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not send correction')
      toast.success('Correction noted — dispatch/payroll will follow up. You can resubmit once it\'s fixed.')
      onDone()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send correction')
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
      <Sheet title="Note a Correction" onClose={onClose}>
        <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '.75rem' }}>
          Explain what looks wrong for {workDate} (e.g. a missed clock-out, wrong odometer, a load that
          didn&apos;t get logged). Dispatch/payroll will review — once it&apos;s fixed you can come back and confirm.
        </p>
        <textarea
          value={correctionNote}
          onChange={e => setCorrectionNote(e.target.value)}
          placeholder="What needs to be corrected?"
          style={{ width: '100%', minHeight: 100, padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 8, marginTop: '.75rem' }}>
          <button onClick={() => setStep('review')} style={{ flex: 1, padding: '.7rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>Back</button>
          <button
            onClick={submitCorrection}
            disabled={!correctionNote.trim() || busy}
            style={{ ...primaryBtnStyle, flex: 1, opacity: correctionNote.trim() && !busy ? 1 : .5 }}
          >
            {busy ? 'Sending…' : 'Send Correction'}
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
          <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
            Attach a signed paper sheet (optional)
          </div>
          {sheetPhoto ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.6rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '.8rem' }}>📎 {sheetPhoto.name}</span>
              <button onClick={() => setSheetPhoto(null)} style={{ color: 'var(--error)', fontWeight: 700 }}>Remove</button>
            </div>
          ) : (
            <label style={{ display: 'block', padding: '.75rem', borderRadius: 8, border: '1px dashed var(--border)', textAlign: 'center', fontSize: '.82rem', color: 'var(--primary)', cursor: 'pointer' }}>
              📷 Scan / Photo of Signed Sheet
              <input
                type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                onChange={e => setSheetPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>

        <button style={primaryBtnStyle} onClick={() => setStep('sign')}>
          ✅ Hours Are Correct — Sign &amp; Submit
        </button>
        <button
          onClick={() => setStep('correction')}
          style={{ padding: '.75rem', borderRadius: 10, background: 'none', border: '1px solid var(--border)', color: 'var(--warn, #d99a2b)', fontWeight: 700 }}
        >
          ⚠️ Not Correct — Note a Correction
        </button>
      </div>
    </Sheet>
  )
}
