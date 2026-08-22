'use client'
/**
 * WeeklyTimesheetPanel — weekly recap + two-party sign-off.
 *
 * Shown on /driver/hours for a Monday–Sunday week: the daily hours already
 * on the page are the source of truth, this panel adds the week-level
 * escalations (integrity warnings, open daily corrections, truck problems)
 * and the driver-then-dispatch confirmation flow (see weeklyTimesheets.ts).
 * Dispatch reuses the same panel (via `role="dispatch"`) on the admin side
 * to approve/send-back a driver-confirmed week.
 */
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
  summary: { daysWorked: number; totalRegularHours: number; totalOvertimeHours: number; estimatedGrossEarnings: number }
  escalations: Escalation[]
  driverAction: TimesheetAction | null
  dispatchAction: TimesheetAction | null
  status: 'not_submitted' | 'correction_requested' | 'pending_dispatch' | 'sent_back' | 'approved'
  /** Full audit trail, oldest first — every correction/send-back round with its note, documented for the official record. */
  history: TimesheetAction[]
}

const STATUS_LABEL: Record<WeeklyTimesheet['status'], string> = {
  not_submitted: 'Awaiting your sign-off',
  correction_requested: 'Correction requested — waiting on dispatch/payroll',
  pending_dispatch: 'Signed — waiting on dispatch',
  sent_back: 'Sent back by dispatch — please review',
  approved: '✅ Approved by dispatch',
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem' }

interface Props {
  weekStart: string
  weekEnd: string
  role: 'driver' | 'dispatch'
  /** Required when role='dispatch' — which driver's week this is. */
  driverId?: string
  driverName?: string
  /** Called after a successful sign/correction/approve/send-back, so a parent list (e.g. the dispatch approvals queue) can refresh its own status badges. */
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
    } finally {
      setLoading(false)
    }
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
      toast.success(role === 'driver' ? 'Week confirmed and signed — sent to dispatch' : 'Week approved')
      setStep('idle')
      load()
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not sign')
    } finally {
      setBusy(false)
    }
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
      toast.success(role === 'driver' ? 'Correction noted — dispatch/payroll will follow up' : 'Sent back to driver')
      setStep('idle')
      setNote('')
      load()
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div style={{ ...cardStyle, color: 'var(--muted)', fontSize: '.85rem' }}>Loading weekly recap…</div>
  if (!data || data.summary.daysWorked === 0) return null

  const canDriverAct = role === 'driver' && data.status !== 'approved' && data.status !== 'pending_dispatch'
  const canDispatchAct = role === 'dispatch' && data.status === 'pending_dispatch'
  const canAct = canDriverAct || canDispatchAct

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
          Weekly Timesheet{driverName ? ` — ${driverName}` : ''}
        </h2>
        <span style={{
          fontSize: '.72rem', fontWeight: 800, padding: '.3rem .6rem', borderRadius: 999,
          background: data.status === 'approved' ? 'rgba(0,232,176,.12)' : data.status === 'correction_requested' || data.status === 'sent_back' ? 'rgba(217,154,43,.12)' : 'var(--surface-2)',
          color: data.status === 'approved' ? 'var(--primary)' : data.status === 'correction_requested' || data.status === 'sent_back' ? 'var(--warn, #d99a2b)' : 'var(--muted)',
          border: '1px solid var(--border)',
        }}>
          {STATUS_LABEL[data.status]}
        </span>
      </div>

      <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: '.75rem' }}>
        {data.weekStart} to {data.weekEnd} — {data.summary.totalRegularHours.toFixed(2)} reg / {data.summary.totalOvertimeHours.toFixed(2)} OT hrs,
        est. ${data.summary.estimatedGrossEarnings.toFixed(2)}
      </div>

      {data.escalations.length > 0 && (
        <div style={{ marginBottom: '.75rem', padding: '.75rem .9rem', borderRadius: 10, background: 'rgba(217,154,43,.08)', border: '1px solid rgba(217,154,43,.3)' }}>
          <div style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--warn, #d99a2b)', textTransform: 'uppercase', marginBottom: 6 }}>
            🚩 Flagged This Week
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.escalations.map((e, i) => (
              <div key={i} style={{ fontSize: '.78rem' }}>
                <span style={{ color: 'var(--muted)' }}>{e.workDate}</span> — {e.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.history.length > 0 && (
        <div style={{ marginBottom: '.5rem' }}>
          <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
            Sign-Off History{data.history.length > 2 ? ' — Corrections Documented' : ''}
          </div>
          {data.history.map((a, i) => <StatusLine key={i} action={a} />)}
        </div>
      )}

      {data.status === 'approved' && (
        <button
          onClick={() => window.open(`/api/fleet/dump-truck/hours/weekly/report?weekStart=${data.weekStart}&weekEnd=${data.weekEnd}${driverId ? `&driverId=${driverId}` : ''}`, '_blank')}
          style={{ width: '100%', marginTop: '.5rem', padding: '.75rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--primary)', fontWeight: 700, fontSize: '.85rem' }}
        >
          📄 Download Official Weekly Recap &amp; Pay Report (PDF)
        </button>
      )}

      {canAct && (
        <div style={{ display: 'flex', gap: 8, marginTop: '.9rem', flexWrap: 'wrap' }}>
          <button onClick={() => setStep('sign')} style={{ ...primaryBtnStyle, width: 'auto', flex: '1 1 200px' }}>
            {role === 'driver' ? '✅ Week Is Correct — Sign' : '✍️ Approve Week'}
          </button>
          <button
            onClick={() => setStep('note')}
            style={{ flex: '1 1 200px', padding: '.9rem', borderRadius: 12, background: 'none', border: '1px solid var(--border)', color: 'var(--warn, #d99a2b)', fontWeight: 700 }}
          >
            {role === 'driver' ? '⚠️ Not Correct — Note a Correction' : '↩️ Send Back to Driver'}
          </button>
        </div>
      )}

      {step === 'sign' && (
        <Sheet title={role === 'driver' ? 'Sign Weekly Timesheet' : 'Approve Weekly Timesheet'} onClose={() => setStep('idle')}>
          <SignaturePad
            label={role === 'driver' ? `confirms the week of ${data.weekStart} is correct` : `confirms receipt/approval of the week of ${data.weekStart}`}
            busy={busy}
            onCancel={() => setStep('idle')}
            onSave={submitSign}
          />
        </Sheet>
      )}

      {step === 'note' && (
        <Sheet title={role === 'driver' ? 'Note a Correction' : 'Send Back to Driver'} onClose={() => setStep('idle')}>
          <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '.75rem' }}>
            {role === 'driver'
              ? "Explain what looks wrong for this week. Dispatch/payroll will review — once it's fixed you can come back and confirm."
              : 'Explain what needs to change before this week can be approved. The driver will see this note and can resubmit.'}
          </p>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What needs to be corrected?"
            style={{ width: '100%', minHeight: 100, padding: '.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: '.75rem' }}>
            <button onClick={() => setStep('idle')} style={{ flex: 1, padding: '.7rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>Back</button>
            <button
              onClick={submitNote}
              disabled={!note.trim() || busy}
              style={{ ...primaryBtnStyle, flex: 1, opacity: note.trim() && !busy ? 1 : .5 }}
            >
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

function StatusLine({ action }: { action: TimesheetAction }) {
  const isPositive = action.action === 'confirmed' || action.action === 'approved'
  const label = action.role === 'driver' ? 'Driver' : 'Dispatch'
  return (
    <div style={{ padding: '.35rem 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem' }}>
        <span style={{ color: 'var(--muted)' }}>{label}</span>
        <span style={{ fontWeight: 700, color: isPositive ? 'var(--primary)' : 'var(--warn, #d99a2b)' }}>
          {isPositive ? '✓' : '⚠️'} {action.action.replace(/_/g, ' ')} — {new Date(action.createdAt).toLocaleString()}
        </span>
      </div>
      {action.note && (
        <div style={{ fontSize: '.76rem', color: 'var(--text)', marginTop: 2, fontStyle: 'italic' }}>“{action.note}”</div>
      )}
    </div>
  )
}
