'use client'
/**
 * TruckProblemSheet — driver "Truck Problem" breakdown workflow (spec).
 *
 * Two states, both against fleet_dt_breakdowns:
 *   - No open breakdown for this shift: report form (can move? safe
 *     location? category, notes, GPS captured automatically) -> START
 *     BREAKDOWN TIME.
 *   - An open breakdown exists: RESUME WORK / RETURN TO YARD / TOWED /
 *     END DAY resolves it (records actual downtime; never decides pay/bill
 *     — that's a management adjustment, see /admin time adjustments).
 */
import { useEffect, useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import { captureGeolocation } from '@/lib/dumpTruck/events'
import { toast } from '@/hooks/useToast'

const CATEGORIES = [
  'tire', 'engine', 'transmission', 'air_system', 'brake', 'overheating', 'electrical',
  'fuel', 'hydraulic', 'suspension', 'accident', 'stuck', 'other',
] as const

const CATEGORY_LABELS: Record<string, string> = {
  tire: 'Tire', engine: 'Engine', transmission: 'Transmission', air_system: 'Air System', brake: 'Brake',
  overheating: 'Overheating', electrical: 'Electrical', fuel: 'Fuel', hydraulic: 'Hydraulic',
  suspension: 'Suspension', accident: 'Accident', stuck: 'Stuck', other: 'Other',
}

interface OpenBreakdown {
  id: string
  startedAt: string
  category: string | null
}

interface Props {
  shiftId: string
  truckId: string
  jobId: string | null
  onClose: () => void
  onChanged: () => void
}

export default function TruckProblemSheet({ shiftId, truckId, jobId, onClose, onChanged }: Props) {
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<OpenBreakdown | null>(null)
  const [busy, setBusy] = useState(false)

  const [canMove, setCanMove] = useState<boolean | null>(null)
  const [safeLocation, setSafeLocation] = useState<boolean | null>(null)
  const [category, setCategory] = useState<string>('other')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetch(`/api/fleet/dump-truck/breakdowns/open?shiftId=${shiftId}`)
      .then(r => r.json())
      .then(b => setOpen(b.breakdown ?? null))
      .finally(() => setLoading(false))
  }, [shiftId])

  const report = async () => {
    setBusy(true)
    try {
      const geo = await captureGeolocation()
      const res = await fetch('/api/fleet/dump-truck/breakdowns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId, truckId, jobId, category, canMove, safeLocation, notes: notes || null,
          lat: geo.lat, lng: geo.lng,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not report breakdown')
      toast.success('Breakdown reported — downtime started')
      onChanged()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not report breakdown')
    } finally {
      setBusy(false)
    }
  }

  const resolve = async (resolution: 'resumed' | 'returned_to_yard' | 'towed' | 'ended_day') => {
    if (!open) return
    setBusy(true)
    try {
      const res = await fetch(`/api/fleet/dump-truck/breakdowns/${open.id}/resolve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolution }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not resolve breakdown')
      toast.success('Breakdown resolved')
      onChanged()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not resolve breakdown')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <Sheet title="Truck Problem" onClose={onClose}><div style={{ color: 'var(--muted)' }}>Loading…</div></Sheet>
  }

  if (open) {
    const elapsedMin = Math.round((Date.now() - new Date(open.startedAt).getTime()) / 60000)
    return (
      <Sheet title="Truck Down" onClose={onClose}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ fontSize: '.9rem', color: 'var(--muted)' }}>
            {open.category ? CATEGORY_LABELS[open.category] ?? open.category : 'Breakdown'} reported {elapsedMin} min ago. Downtime is being recorded.
          </div>
          <button style={{ ...primaryBtnStyle, opacity: busy ? .5 : 1 }} disabled={busy} onClick={() => resolve('resumed')}>▶ RESUME WORK</button>
          <button style={{ ...primaryBtnStyle, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', opacity: busy ? .5 : 1 }} disabled={busy} onClick={() => resolve('returned_to_yard')}>🏠 RETURN TO YARD</button>
          <button style={{ ...primaryBtnStyle, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', opacity: busy ? .5 : 1 }} disabled={busy} onClick={() => resolve('towed')}>🚛 TOWED</button>
          <button style={{ ...primaryBtnStyle, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', opacity: busy ? .5 : 1 }} disabled={busy} onClick={() => resolve('ended_day')}>⏹ END DAY</button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title="Truck Problem" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '.85rem', fontWeight: 700, marginBottom: 6 }}>Can the vehicle move?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <YesNoButton value={canMove} target={true} onClick={() => setCanMove(true)} label="Yes" />
            <YesNoButton value={canMove} target={false} onClick={() => setCanMove(false)} label="No" />
          </div>
        </div>
        <div>
          <div style={{ fontSize: '.85rem', fontWeight: 700, marginBottom: 6 }}>Are you in a safe location?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <YesNoButton value={safeLocation} target={true} onClick={() => setSafeLocation(true)} label="Yes" />
            <YesNoButton value={safeLocation} target={false} onClick={() => setSafeLocation(false)} label="No" />
          </div>
        </div>
        <div>
          <div style={{ fontSize: '.85rem', fontWeight: 700, marginBottom: 6 }}>Problem category</div>
          <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <textarea style={{ ...inputStyle, minHeight: 80 }} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
        <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>Your current GPS location will be attached automatically.</div>
        <button style={{ ...primaryBtnStyle, opacity: busy ? .5 : 1 }} disabled={busy} onClick={report}>
          {busy ? 'Saving…' : '🚨 START BREAKDOWN TIME'}
        </button>
      </div>
    </Sheet>
  )
}

function YesNoButton({ value, target, onClick, label }: { value: boolean | null; target: boolean; onClick: () => void; label: string }) {
  const active = value === target
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '.7rem', borderRadius: 10, fontWeight: 800,
        background: active ? 'var(--primary)' : 'var(--surface-2)',
        color: active ? 'var(--dt-on-primary, #04140f)' : 'var(--text)',
        border: active ? 'none' : '1px solid var(--border)',
      }}
    >
      {label}
    </button>
  )
}
