'use client'

import { useCallback, useEffect, useState } from 'react'

interface Reconciliation {
  id: string
  shiftId: string
  brokerEndAt: string
  promptedAt: string
  responseDeadlineAt: string
  status: 'pending' | 'confirmed_working' | 'auto_closed' | 'resolved'
  provisionalEndAt: string | null
  reviewRequired: boolean
  correctedEndAt: string | null
  driverNote: string | null
}

interface ContextPayload {
  context?: {
    missedPunchPrompt?: Reconciliation | null
    pendingReconciliation?: Reconciliation | null
  }
}

function localInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function pretty(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

export default function MissedPunchGuard() {
  const [prompt, setPrompt] = useState<Reconciliation | null>(null)
  const [review, setReview] = useState<Reconciliation | null>(null)
  const [correctedEnd, setCorrectedEnd] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/dump-truck/context', { cache: 'no-store' })
      if (!res.ok) return
      const body = await res.json() as ContextPayload
      const nextPrompt = body.context?.missedPunchPrompt ?? null
      const nextReview = body.context?.pendingReconciliation ?? null
      setPrompt(nextPrompt)
      setReview(nextReview)
      if (nextReview && !correctedEnd) setCorrectedEnd(localInputValue(nextReview.provisionalEndAt ?? nextReview.brokerEndAt))
    } catch {
      // Driver cockpit already handles connectivity; this guard should not add noise while offline.
    }
  }, [correctedEnd])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const patch = async (payload: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/fleet/dump-truck/missed-punch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not save response')
      setPrompt(null)
      setReview(null)
      setNote('')
      setCorrectedEnd('')
      await refresh()
      window.dispatchEvent(new Event('fleet-context-refresh'))
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save response')
      return false
    } finally {
      setBusy(false)
    }
  }

  // Prior auto-close review takes priority and blocks a new shift until resolved.
  if (review) {
    const provisional = review.provisionalEndAt ?? review.brokerEndAt
    const correctedIso = correctedEnd ? new Date(correctedEnd).toISOString() : null
    const extraMinutes = correctedIso
      ? Math.max(0, (new Date(correctedIso).getTime() - new Date(review.brokerEndAt).getTime()) / 60000)
      : 0
    const noteRequired = extraMinutes > 30

    return (
      <div style={overlay} role="dialog" aria-modal="true" aria-label="Previous shift review required">
        <div style={card}>
          <div style={eyebrow}>SHIFT REVIEW REQUIRED</div>
          <h2 style={title}>Confirm your previous end time</h2>
          <p style={copy}>
            Fleet Commander provisionally ended the prior shift at the broker sheet end because the clock was still open. Review it before starting another shift.
          </p>

          <div style={facts}>
            <div><strong>Broker sheet end</strong><br />{pretty(review.brokerEndAt)}</div>
            <div><strong>Provisional end</strong><br />{pretty(provisional)}</div>
          </div>

          <label style={label}>
            Actual end time
            <input
              type="datetime-local"
              value={correctedEnd}
              onChange={e => setCorrectedEnd(e.target.value)}
              style={input}
            />
          </label>

          <label style={label}>
            Note / reason {noteRequired ? '(required — more than 30 min past broker sheet)' : '(optional unless over 30 min)'}
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Example: drove truck back to yard, fueled, shop drop-off, assigned driving..."
              rows={3}
              style={{ ...input, resize: 'vertical' }}
            />
          </label>

          {error && <div style={errorStyle}>{error}</div>}

          <div style={actions}>
            <button
              disabled={busy}
              style={secondaryButton}
              onClick={() => patch({ reconciliationId: review.id, action: 'confirm', note: note || null })}
            >
              Confirm provisional end
            </button>
            <button
              disabled={busy || !correctedEnd || (noteRequired && !note.trim())}
              style={primaryButton}
              onClick={() => patch({ reconciliationId: review.id, action: 'correct', correctedEndAt: correctedIso, note: note || null })}
            >
              Save corrected end
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (prompt) {
    return (
      <div style={overlay} role="dialog" aria-modal="true" aria-label="Still working check">
        <div style={card}>
          <div style={eyebrow}>MISSED-PUNCH CHECK</div>
          <h2 style={title}>Still working?</h2>
          <p style={copy}>
            Your clock is still running more than 2 hours after the broker sheet ended at <strong>{pretty(prompt.brokerEndAt)}</strong>.
          </p>
          <p style={copy}>
            If you are still working, your shift stays open and the extra time remains driver-payable operational time. If you are done, Fleet Commander will provisionally use the broker sheet end and ask you to review it next shift.
          </p>
          <div style={{ ...copy, fontWeight: 700 }}>No response will also trigger the provisional close.</div>
          {error && <div style={errorStyle}>{error}</div>}
          <div style={actions}>
            <button
              disabled={busy}
              style={secondaryButton}
              onClick={() => patch({ reconciliationId: prompt.id, action: 'not_working' })}
            >
              No — I’m done
            </button>
            <button
              disabled={busy}
              style={primaryButton}
              onClick={() => patch({ reconciliationId: prompt.id, action: 'still_working' })}
            >
              Yes — still working
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.72)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
}
const card: React.CSSProperties = {
  width: 'min(560px, 100%)', background: 'var(--surface, #fff)', color: 'var(--foreground, #111)',
  borderRadius: 16, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,.35)',
}
const eyebrow: React.CSSProperties = { fontSize: 12, fontWeight: 900, letterSpacing: '.08em', color: '#b45309' }
const title: React.CSSProperties = { margin: '6px 0 8px', fontSize: 24 }
const copy: React.CSSProperties = { fontSize: 14, lineHeight: 1.5, color: 'var(--muted, #555)' }
const facts: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '14px 0' }
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, fontSize: 13, fontWeight: 700 }
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #bbb', font: 'inherit', background: '#fff', color: '#111' }
const actions: React.CSSProperties = { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }
const primaryButton: React.CSSProperties = { border: 0, borderRadius: 9, padding: '11px 16px', fontWeight: 800, background: '#0b4ea2', color: '#fff', cursor: 'pointer' }
const secondaryButton: React.CSSProperties = { border: '1px solid #bbb', borderRadius: 9, padding: '11px 16px', fontWeight: 800, background: '#fff', color: '#111', cursor: 'pointer' }
const errorStyle: React.CSSProperties = { marginTop: 12, padding: 10, borderRadius: 8, background: 'rgba(220,38,38,.1)', color: '#b91c1c', fontSize: 13, fontWeight: 700 }
