'use client'
import { useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'

const REASONS = [
  'Waiting for loader', 'Waiting for mechanic', 'Site locked', 'Traffic',
  'Breakdown', 'Fuel', 'Weather', 'Customer delay', 'Scale line', 'Other',
]

interface Props {
  delayActive: boolean
  onClose: () => void
  onStart: (reason: string, billable: boolean, notes: string) => Promise<void>
  onEnd: () => Promise<void>
}

export default function DelaySheet({ delayActive, onClose, onStart, onEnd }: Props) {
  const [reason, setReason] = useState(REASONS[0])
  const [billable, setBillable] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  if (delayActive) {
    return (
      <Sheet title="End Delay" onClose={onClose}>
        <button
          style={{ ...primaryBtnStyle, opacity: busy ? .5 : 1 }}
          disabled={busy}
          onClick={async () => { setBusy(true); await onEnd(); setBusy(false); onClose() }}
        >
          {busy ? 'Saving…' : 'End Delay'}
        </button>
      </Sheet>
    )
  }

  return (
    <Sheet title="Start Delay" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <select style={inputStyle} value={reason} onChange={e => setReason(e.target.value)}>
          {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.9rem' }}>
          <input type="checkbox" checked={billable} onChange={e => setBillable(e.target.checked)} />
          Billable detention
        </label>
        <textarea style={{ ...inputStyle, minHeight: 80 }} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
        <button
          style={{ ...primaryBtnStyle, opacity: busy ? .5 : 1 }}
          disabled={busy}
          onClick={async () => { setBusy(true); await onStart(reason, billable, notes); setBusy(false); onClose() }}
        >
          {busy ? 'Saving…' : 'Start Delay'}
        </button>
      </div>
    </Sheet>
  )
}
