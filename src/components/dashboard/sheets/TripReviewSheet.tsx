'use client'
import { useState, useEffect } from 'react'
import type { LoadMission, TripReview } from '@/lib/dashboard/types'

interface Props {
  open:     boolean
  onClose:  () => void
  mission:  LoadMission | null
  onSubmit: (review: TripReview) => Promise<void>
}

// ── Shared style atoms ────────────────────────────────────────────────────────
const LABEL: React.CSSProperties = {
  fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase',
  letterSpacing: '.08em', color: 'var(--muted)', display: 'block', marginBottom: '.35rem',
}

const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '.6rem .75rem', fontSize: '.88rem', color: 'var(--text)',
  outline: 'none', boxSizing: 'border-box',
}

const SECTION: React.CSSProperties = {
  fontSize: '.65rem', fontWeight: 800, textTransform: 'uppercase',
  letterSpacing: '.1em', color: 'var(--muted)', marginBottom: '.6rem', marginTop: '.1rem',
}

// ── Issue flag definitions ────────────────────────────────────────────────────
type IssueKey = 'detention' | 'parkingIssue' | 'routeProblem' | 'fuelIssue' | 'weatherDelay' | 'receiverDelay'

const ISSUE_FLAGS: { key: IssueKey; emoji: string; label: string }[] = [
  { key: 'detention',    emoji: '⏱',  label: 'Detention'     },
  { key: 'parkingIssue', emoji: '🅿️', label: 'Parking'       },
  { key: 'routeProblem', emoji: '🗺',  label: 'Route Problem' },
  { key: 'fuelIssue',    emoji: '⛽', label: 'Fuel Issue'    },
  { key: 'weatherDelay', emoji: '🌧️', label: 'Weather Delay' },
  { key: 'receiverDelay',emoji: '📦', label: 'Receiver Delay'},
]

// ── Default review values ─────────────────────────────────────────────────────
function makeDefaults(mission: LoadMission | null): Omit<TripReview, 'reviewedAt'> {
  // Pre-fill end with right now
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const localNow = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`

  // Pre-fill start from mission date if available (default 08:00)
  const startDate = mission?.date
    ? `${mission.date}T08:00`
    : ''

  return {
    actualStart:   startDate,
    actualEnd:     localNow,
    stopsAccurate: true,
    detention:     false,
    parkingIssue:  false,
    routeProblem:  false,
    fuelIssue:     false,
    weatherDelay:  false,
    receiverDelay: false,
    wouldRunAgain: true,
    driverRating:  4,
    notes:         '',
  }
}

export default function TripReviewSheet({ open, onClose, mission, onSubmit }: Props) {
  const [form,       setForm]       = useState(() => makeDefaults(mission))
  const [submitting, setSubmitting] = useState(false)

  // Reset form whenever sheet opens for a new mission
  useEffect(() => {
    if (open) setForm(makeDefaults(mission))
  }, [open, mission])

  const toggle = (key: IssueKey | 'stopsAccurate' | 'wouldRunAgain') =>
    setForm(f => ({ ...f, [key]: !f[key] }))

  const setRating = (r: 1 | 2 | 3 | 4 | 5) =>
    setForm(f => ({ ...f, driverRating: r }))

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const review: TripReview = {
        ...form,
        reviewedAt: new Date().toISOString(),
      }
      await onSubmit(review)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const issueCount = ISSUE_FLAGS.filter(f => form[f.key]).length

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 400 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
        background: 'var(--surface)', borderRadius: '18px 18px 0 0',
        padding: '1.5rem 1.25rem 2.5rem',
        boxShadow: '0 -6px 32px rgba(0,0,0,.4)',
        maxHeight: '92vh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 1.2rem' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.4rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>🏁 Complete Trip</div>
            {mission && (
              <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 3, fontWeight: 600 }}>
                {mission.loadNumber && <span style={{ color: 'var(--primary)', marginRight: 6 }}>{mission.loadNumber}</span>}
                {mission.origin.split(',')[0]} → {mission.destination.split(',')[0]}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: 'var(--muted)', cursor: 'pointer', padding: '.2rem .4rem', lineHeight: 1, flexShrink: 0 }}
          >×</button>
        </div>

        {/* ── TIMING ── */}
        <div style={{ marginBottom: '1.4rem' }}>
          <div style={SECTION}>Timing</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem' }}>
            <div>
              <label style={LABEL}>Actual Start</label>
              <input
                type="datetime-local"
                value={form.actualStart ?? ''}
                onChange={e => setForm(f => ({ ...f, actualStart: e.target.value || null }))}
                style={INPUT}
              />
            </div>
            <div>
              <label style={LABEL}>Actual End</label>
              <input
                type="datetime-local"
                value={form.actualEnd ?? ''}
                onChange={e => setForm(f => ({ ...f, actualEnd: e.target.value || null }))}
                style={INPUT}
              />
            </div>
          </div>
        </div>

        {/* ── ISSUE FLAGS ── */}
        <div style={{ marginBottom: '1.4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.6rem' }}>
            <div style={SECTION}>Issues</div>
            {issueCount > 0 && (
              <span style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--warn)', letterSpacing: '.04em' }}>
                {issueCount} flagged
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.45rem' }}>
            {ISSUE_FLAGS.map(({ key, emoji, label }) => {
              const active = form[key] as boolean
              return (
                <button
                  key={key}
                  onClick={() => toggle(key)}
                  style={{
                    padding: '.45rem .5rem', borderRadius: 9, cursor: 'pointer', textAlign: 'center',
                    border:     active ? '1px solid rgba(245,194,0,.55)' : '1px solid var(--border)',
                    background: active ? 'rgba(245,194,0,.1)' : 'var(--surface-2)',
                    transition: 'all .15s',
                  }}
                >
                  <div style={{ fontSize: '.9rem', lineHeight: 1, marginBottom: 2 }}>{emoji}</div>
                  <div style={{ fontSize: '.62rem', fontWeight: 700, color: active ? 'var(--warn)' : 'var(--muted)', lineHeight: 1.2 }}>{label}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── TRIP SUMMARY ── */}
        <div style={{ marginBottom: '1.4rem' }}>
          <div style={SECTION}>Trip Summary</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem' }}>

            {/* Stops accurate */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '.6rem .85rem', borderRadius: 10,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '.82rem', fontWeight: 700 }}>📍 All stops completed as planned</span>
              <ToggleSwitch active={form.stopsAccurate} onToggle={() => toggle('stopsAccurate')} />
            </div>

            {/* Would run again */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '.6rem .85rem', borderRadius: 10,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '.82rem', fontWeight: 700 }}>🔁 Would run this lane again</span>
              <ToggleSwitch active={form.wouldRunAgain} onToggle={() => toggle('wouldRunAgain')} />
            </div>
          </div>
        </div>

        {/* ── DRIVER RATING ── */}
        <div style={{ marginBottom: '1.4rem' }}>
          <div style={SECTION}>Overall Trip Rating</div>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            {([1, 2, 3, 4, 5] as const).map(n => (
              <button
                key={n}
                onClick={() => setRating(n)}
                style={{
                  fontSize: '1.6rem', background: 'none', border: 'none', cursor: 'pointer', padding: '.1rem',
                  lineHeight: 1,
                  filter: n <= form.driverRating ? 'none' : 'grayscale(1) opacity(.35)',
                  transform: n === form.driverRating ? 'scale(1.2)' : 'scale(1)',
                  transition: 'all .15s',
                }}
                aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
              >
                ⭐
              </button>
            ))}
            <span style={{ fontSize: '.78rem', color: 'var(--muted)', fontWeight: 700, alignSelf: 'center', marginLeft: 4 }}>
              {['', 'Rough', 'Below avg', 'Average', 'Good run', 'Perfect'][form.driverRating]}
            </span>
          </div>
        </div>

        {/* ── NOTES ── */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={LABEL}>Final Notes (optional)</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Shipper issues, detention details, route conditions, anything worth logging…"
            rows={3}
            style={{ ...INPUT, resize: 'none', fontFamily: 'inherit' }}
          />
        </div>

        {/* ── SUBMIT ── */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%', padding: '1rem', borderRadius: 12, fontWeight: 900, fontSize: '1rem',
            border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
            background: submitting ? 'var(--border)' : 'var(--success)',
            color: submitting ? 'var(--muted)' : '#fff',
            boxShadow: submitting ? 'none' : '0 3px 12px rgba(40,192,72,.3)',
            transition: 'all .2s',
          }}
        >
          {submitting ? '⟳ Saving…' : '✅ Complete Trip & Archive'}
        </button>

        <p style={{ fontSize: '.67rem', color: 'var(--muted)', textAlign: 'center', marginTop: '.65rem', lineHeight: 1.4 }}>
          This will archive the load. It remains visible in Completed Trips and Operational Memory.
        </p>
      </div>
    </>
  )
}

// ── Inline toggle switch ──────────────────────────────────────────────────────
function ToggleSwitch({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: active ? 'var(--primary)' : 'var(--surface-2)',
        boxShadow: active ? '0 0 8px rgba(0,232,176,.3)' : 'inset 0 0 0 1px var(--border)',
        transition: 'background .2s',
      }}
      aria-checked={active}
      role="switch"
    >
      <span style={{
        position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%',
        background: active ? '#000' : 'var(--muted)',
        left: active ? 23 : 3,
        transition: 'left .2s',
      }} />
    </button>
  )
}
