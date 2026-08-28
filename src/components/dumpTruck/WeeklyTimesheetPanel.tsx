'use client'

import { useCallback, useEffect, useState } from 'react'
import Sheet, { primaryBtnStyle } from './Sheet'
import SignaturePad from './SignaturePad'
import { toast } from '@/hooks/useToast'

interface Escalation { workDate: string; code: string; message: string }
interface TimesheetAction {
  role: 'driver' | 'dispatch'
  action: 'confirmed' | 'correction_requested' | 'approved' | 'sent_back'
  note: string | null
  totalHoursAtAction: number | null
  createdAt: string
  createdByEmail: string | null
}
interface WeeklyTimesheet {
  weekStart: string
  weekEnd: string
  summary: { daysWorked: number; totalRegularHours: number; totalOvertimeHours: number; totalPaidHours: number }
  escalations: Escalation[]
  driverAction: TimesheetAction | null
  dispatchAction: TimesheetAction | null
  status: 'not_submitted' | 'correction_requested' | 'pending_dispatch' | 'sent_back' | 'approved'
  history: TimesheetAction[]
}

const STATUS_LABEL: Record<WeeklyTimesheet['status'], string> = {
  not_submitted: 'Awaiting your sign-off',
  correction_requested: 'Correction requested — waiting on review',
  pending_dispatch: 'Signed — waiting on dispatch',
  sent_back: 'Sent back by dispatch — please review',
  approved: '✅ Approved by dispatch',
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }

interface Props {
  weekStart: string
  weekEnd: string
  role: 'driver' | 'dispatch'
  driverId?: string
  driverName?: string
  onChanged?: () => void
}

export default function WeeklyTimesheetPanel({ weekStart, weekEnd, role, driverId, driverName, onChanged }: Props) {
  const [data, setData] = useState<WeeklyTimesheet | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<'idle' | 'sign' | 'note'>('idle')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ weekStart, weekEnd })
      if (role === 'dispatch' && driverId) params.set('driverId', driverId)
      const res = await fetch(`/api/fleet/dump-truck/hours/weekly?${params}`)
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not load weekly recap')
      setData((await res.json()).timesheet)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load weekly recap')
    } finally { setLoading(false) }
  }, [weekStart, weekEnd, role, driverId])

  useEffect(() => { load() }, [load])

  const submitSign = async (blob: Blob) => {
    setBusy(true)
    try {
      const form = new FormData()
      form.append('weekStart', weekStart)
      form.append('weekEnd', weekEnd)
      form.append('signature', blob, 'signature.png')
      const url = role === 'driver' ? '/api/fleet/dump-truck/hours/weekly/confirm' : '/api/fleet/dump-truck/hours/weekly/approve'
      if (role === 'dispatch' && driverId) form.append('driverId', driverId)
      const res = await fetch(url, { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not sign')
      toast.success(role === 'driver' ? 'Week confirmed and sent to dispatch' : 'Week approved')
      setStep('idle'); await load(); onChanged?.()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not sign') }
    finally { setBusy(false) }
  }

  const submitNote = async () => {
    if (!note.trim()) return
    setBusy(true)
    try {
      const url = role === 'driver' ? '/api/fleet/dump-truck/hours/weekly/correction' : '/api/fleet/dump-truck/hours/weekly/send-back'
      const body: Record<string, string> = { weekStart, weekEnd, note: note.trim() }
      if (role === 'dispatch' && driverId) body.driverId = driverId
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not submit')
      toast.success(role === 'driver' ? 'Correction note sent for review' : 'Sent back to driver')
      setStep('idle'); setNote(''); await load(); onChanged?.()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not submit') }
    finally { setBusy(false) }
  }

  if (loading) return <div style={{ ...cardStyle, color: 'var(--muted)', fontSize: '.85rem' }}>Loading weekly recap…</div>
  if (!data || data.summary.daysWorked === 0) return null

  const grossHours = data.summary.totalPaidHours ?? (data.summary.totalRegularHours + data.summary.totalOvertimeHours)
  const canDriverAct = role === 'driver' && data.status !== 'approved' && data.status !== 'pending_dispatch'
  const canDispatchAct = role === 'dispatch' && data.status === 'pending_dispatch'

  return <div style={cardStyle}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 850 }}>Weekly Timesheet{driverName ? ` — ${driverName}` : ''}</h2>
      <span style={{ fontSize: '.72rem', fontWeight: 800, padding: '.3rem .6rem', borderRadius: 999, border: '1px solid var(--border)', color: data.status === 'approved' ? 'var(--primary)' : 'var(--muted)' }}>{STATUS_LABEL[data.status]}</span>
    </div>

    <div style={{ marginTop: '.6rem', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '.82rem' }}>
      <div><span style={{ color: 'var(--muted)' }}>Gross pay hours </span><strong>{grossHours.toFixed(2)}</strong></div>
      <div><span style={{ color: 'var(--muted)' }}>Regular </span><strong>{data.summary.totalRegularHours.toFixed(2)}</strong></div>
      <div><span style={{ color: 'var(--muted)' }}>OT </span><strong>{data.summary.totalOvertimeHours.toFixed(2)}</strong></div>
    </div>

    {data.escalations.length > 0 && <div style={{ marginTop: '.8rem', padding: '.75rem .9rem', borderRadius: 10, background: 'rgba(217,154,43,.08)', border: '1px solid rgba(217,154,43,.3)' }}>
      <div style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--warn, #d99a2b)', textTransform: 'uppercase', marginBottom: 6 }}>🚩 Flagged This Week</div>
      {data.escalations.map((e, i) => <div key={i} style={{ fontSize: '.78rem', marginTop: 3 }}><span style={{ color: 'var(--muted)' }}>{e.workDate}</span> — {e.message}</div>)}
    </div>}

    {data.history.length > 0 && <div style={{ marginTop: '.8rem' }}>
      <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Sign-Off / Correction History</div>
      {data.history.map((a, i) => <div key={i} style={{ padding: '.35rem 0', borderBottom: '1px solid var(--border)', fontSize: '.78rem' }}>
        <strong>{a.role === 'driver' ? 'Driver' : 'Dispatch'}</strong> — {a.action.replace(/_/g, ' ')} — {new Date(a.createdAt).toLocaleString()}
        {a.note && <div style={{ marginTop: 2, fontStyle: 'italic' }}>“{a.note}”</div>}
      </div>)}
    </div>}

    {(canDriverAct || canDispatchAct) && <div style={{ display: 'flex', gap: 8, marginTop: '.9rem', flexWrap: 'wrap' }}>
      <button onClick={() => setStep('sign')} style={{ ...primaryBtnStyle, width: 'auto', flex: '1 1 190px' }}>{role === 'driver' ? '✅ Week Is Correct — Sign' : '✍️ Approve Week'}</button>
      <button onClick={() => setStep('note')} style={{ flex: '1 1 190px', padding: '.9rem', borderRadius: 12, background: 'none', border: '1px solid var(--border)', color: 'var(--warn, #d99a2b)', fontWeight: 700 }}>{role === 'driver' ? '⚠️ Note a Correction' : '↩️ Send Back'}</button>
    </div>}

    {step === 'sign' && <Sheet title={role === 'driver' ? 'Sign Weekly Timesheet' : 'Approve Weekly Timesheet'} onClose={() => setStep('idle')}>
      <SignaturePad label={`confirms the week of ${data.weekStart} is correct`} busy={busy} onCancel={() => setStep('idle')} onSave={submitSign} />
    </Sheet>}

    {step === 'note' && <Sheet title={role === 'driver' ? 'Note a Correction' : 'Send Back to Driver'} onClose={() => setStep('idle')}>
      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Explain what needs to be corrected" style={{ width: '100%', minHeight: 105, padding: '.65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }} />
      <button onClick={submitNote} disabled={!note.trim() || busy} style={{ ...primaryBtnStyle, marginTop: '.75rem', opacity: note.trim() && !busy ? 1 : .5 }}>{busy ? 'Sending…' : 'Send'}</button>
    </Sheet>}
  </div>
}
