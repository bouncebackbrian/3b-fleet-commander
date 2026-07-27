'use client'
import { useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import type { DefectSeverity } from '@/lib/dumpTruck/types'
import { toast } from '@/hooks/useToast'

const SEVERITIES: { key: DefectSeverity; label: string }[] = [
  { key: 'monitor', label: 'Monitor' },
  { key: 'non_safety', label: 'Non-Safety' },
  { key: 'safety_critical', label: 'Safety-Critical' },
  { key: 'out_of_service', label: 'Out of Service' },
]

interface Props {
  truckId: string
  trailerId: string | null
  shiftId: string
  onClose: () => void
  onSaved: () => void
}

export default function DefectQuickSheet({ truckId, trailerId, shiftId, onClose, onSaved }: Props) {
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<DefectSeverity>('non_safety')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/defects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ truckId, trailerId, shiftId, description, severity }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save defect')
      toast.success('Defect reported')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save defect')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Report Defect" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <textarea style={{ ...inputStyle, minHeight: 90 }} placeholder="Describe the issue" value={description} onChange={e => setDescription(e.target.value)} autoFocus />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SEVERITIES.map(s => (
            <button
              key={s.key}
              onClick={() => setSeverity(s.key)}
              style={{
                padding: '.5rem .7rem', borderRadius: 8, fontSize: '.78rem', fontWeight: 700,
                background: severity === s.key ? 'var(--error)' : 'var(--surface-2)',
                color: severity === s.key ? '#fff' : 'var(--text)', border: '1px solid var(--border)',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        {(severity === 'safety_critical' || severity === 'out_of_service') && (
          <div style={{ fontSize: '.78rem', color: 'var(--error)', fontWeight: 700 }}>
            ⚠️ This severity blocks normal dispatch until resolved or overridden by dispatch/admin.
          </div>
        )}
        <button
          style={{ ...primaryBtnStyle, opacity: description.trim() && !busy ? 1 : .5 }}
          disabled={!description.trim() || busy}
          onClick={submit}
        >
          {busy ? 'Saving…' : 'Report Defect'}
        </button>
      </div>
    </Sheet>
  )
}
