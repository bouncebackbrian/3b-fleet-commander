'use client'

import { useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import { captureGeolocation } from '@/lib/dumpTruck/events'
import { toast } from '@/hooks/useToast'

type CloseoutMode = 'shutdown' | 'transfer'

interface Props {
  shiftId: string
  onClose: () => void
  onCompleted: () => void
}

export default function EndShiftExceptionSheet({ shiftId, onClose, onCompleted }: Props) {
  const [mode, setMode] = useState<CloseoutMode>('shutdown')
  const [odometer, setOdometer] = useState('')
  const [reason, setReason] = useState('')
  const [condition, setCondition] = useState('')
  const [receivingName, setReceivingName] = useState('')
  const [receivingUserId, setReceivingUserId] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (mode === 'transfer' && (!reason.trim() || !odometer.trim())) {
      toast.error('Transfer reason and odometer are required')
      return
    }

    setBusy(true)
    try {
      const geo = await captureGeolocation()
      const now = new Date()
      const common = {
        shiftId,
        effectiveAt: now.toISOString(),
        deviceCapturedAt: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        utcOffsetMinutes: -now.getTimezoneOffset(),
        geo,
      }

      const url = mode === 'shutdown'
        ? '/api/fleet/dump-truck/shifts/shutdown-closeout'
        : '/api/fleet/dump-truck/shifts/asset-transfer-closeout'

      const body = mode === 'shutdown'
        ? {
            ...common,
            odometer: odometer.trim() ? Number(odometer) : null,
            releaseNote: reason.trim() || 'Driver released after formal asset shutdown',
          }
        : {
            ...common,
            odometer: Number(odometer),
            transferReason: reason.trim(),
            transferCondition: condition.trim() || null,
            receivingUserId: receivingUserId.trim() || null,
            receivingName: receivingName.trim() || null,
          }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const response = await res.json()
      if (!res.ok) throw new Error(response.error ?? 'Could not close shift')

      toast.success(mode === 'shutdown'
        ? 'Clocked out — Post-Trip waived for asset shutdown'
        : 'Asset transferred and shift clocked out')
      onCompleted()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not close shift')
    } finally {
      setBusy(false)
    }
  }

  const segmentStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    minHeight: 48,
    padding: '.6rem',
    borderRadius: 9,
    border: '1px solid var(--border)',
    fontWeight: 800,
    background: active ? 'var(--primary)' : 'var(--surface-2)',
    color: active ? '#04140f' : 'var(--text)',
  })

  return (
    <Sheet title="End Shift Exception" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
        <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
          Use only when a normal Post-Trip cannot be completed because the asset is formally shut down or custody is being transferred.
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button style={segmentStyle(mode === 'shutdown')} onClick={() => setMode('shutdown')}>🛑 Asset Shutdown</button>
          <button style={segmentStyle(mode === 'transfer')} onClick={() => setMode('transfer')}>🔁 Asset Transfer</button>
        </div>

        <input
          style={inputStyle}
          type="number"
          inputMode="numeric"
          placeholder={mode === 'transfer' ? 'Transfer odometer — required' : 'Current odometer — if safely available'}
          value={odometer}
          onChange={e => setOdometer(e.target.value)}
        />

        <textarea
          style={{ ...inputStyle, minHeight: 82, resize: 'vertical' }}
          placeholder={mode === 'transfer' ? 'Reason for transfer — required' : 'Release / shutdown note — optional'}
          value={reason}
          onChange={e => setReason(e.target.value)}
        />

        {mode === 'transfer' && (
          <>
            <input
              style={inputStyle}
              placeholder="Receiving person name"
              value={receivingName}
              onChange={e => setReceivingName(e.target.value)}
            />
            <input
              style={inputStyle}
              placeholder="Receiving user ID — optional if selected elsewhere"
              value={receivingUserId}
              onChange={e => setReceivingUserId(e.target.value)}
            />
            <input
              style={inputStyle}
              placeholder="Asset condition at transfer — optional"
              value={condition}
              onChange={e => setCondition(e.target.value)}
            />
          </>
        )}

        <div style={{ padding: '.7rem', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: '.76rem', color: 'var(--muted)' }}>
          This closes the outgoing driver&apos;s shift without a normal Post-Trip. Time, mileage, location and the exception reason remain in the shift report and audit trail.
        </div>

        <button
          style={{ ...primaryBtnStyle, opacity: busy ? .5 : 1 }}
          disabled={busy}
          onClick={submit}
        >
          {busy ? 'Saving…' : mode === 'shutdown' ? 'Clock Out — Asset Shutdown' : 'Transfer Asset & Clock Out'}
        </button>
      </div>
    </Sheet>
  )
}
