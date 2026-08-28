'use client'

import { useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import { captureGeolocation } from '@/lib/dumpTruck/events'
import { toast } from '@/hooks/useToast'

type CloseoutMode = 'shutdown' | 'transfer'
type TransferCondition = 'pass' | 'monitor' | 'fail'

interface Props {
  shiftId: string
  onClose: () => void
  onCompleted: () => void
}

const TRANSFER_CONDITIONS: { key: TransferCondition; label: string; color: string }[] = [
  { key: 'pass', label: 'Pass', color: 'var(--success)' },
  { key: 'monitor', label: 'Monitor', color: 'var(--warn, #d99a2b)' },
  { key: 'fail', label: 'Fail', color: 'var(--error)' },
]

export default function EndShiftExceptionSheet({ shiftId, onClose, onCompleted }: Props) {
  const [mode, setMode] = useState<CloseoutMode>('shutdown')
  const [odometer, setOdometer] = useState('')
  const [reason, setReason] = useState('')
  const [condition, setCondition] = useState<TransferCondition | null>(null)
  const [conditionNote, setConditionNote] = useState('')
  const [receivingName, setReceivingName] = useState('')
  const [receivingUserId, setReceivingUserId] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (mode === 'transfer' && (!reason.trim() || !odometer.trim() || !condition)) {
      toast.error('Transfer odometer, reason and condition are required')
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
            transferCondition: condition,
            transferConditionNote: conditionNote.trim() || null,
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
        : 'Post-Trip Lite submitted — asset transferred and shift clocked out')
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
    <Sheet title={mode === 'transfer' ? 'Post-Trip Lite — Asset Transfer' : 'End Shift — Asset Shutdown'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
        <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
          {mode === 'transfer'
            ? 'Transfer requires a light custody closeout: mileage, timestamp/location, reason and a quick condition check.'
            : 'Use shutdown closeout only when the asset has been formally taken out of service and a normal Post-Trip cannot reasonably be completed.'}
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
            <div>
              <div style={{ fontSize: '.75rem', fontWeight: 800, marginBottom: 6 }}>Quick asset condition</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {TRANSFER_CONDITIONS.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setCondition(item.key)}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      fontWeight: 800,
                      background: condition === item.key ? item.color : 'var(--surface-2)',
                      color: condition === item.key ? '#fff' : 'var(--text)',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <input
              style={inputStyle}
              placeholder="Condition note — optional"
              value={conditionNote}
              onChange={e => setConditionNote(e.target.value)}
            />
            <input
              style={inputStyle}
              placeholder="Receiving person name"
              value={receivingName}
              onChange={e => setReceivingName(e.target.value)}
            />
            <input
              style={inputStyle}
              placeholder="Receiving 3B user ID / user ID — optional"
              value={receivingUserId}
              onChange={e => setReceivingUserId(e.target.value)}
            />
          </>
        )}

        <div style={{ padding: '.7rem', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: '.76rem', color: 'var(--muted)' }}>
          {mode === 'transfer'
            ? 'Submitting ends the outgoing driver’s custody and shift at this recorded mileage/time/location. The next driver starts a new custody record.'
            : 'Shutdown time remains part of the driver’s paid-time record as a separate shutdown/breakdown category. The asset remains unavailable until Admin approves return to service.'}
        </div>

        <button
          style={{ ...primaryBtnStyle, opacity: busy ? .5 : 1 }}
          disabled={busy}
          onClick={submit}
        >
          {busy ? 'Saving…' : mode === 'shutdown' ? 'Clock Out — Asset Shutdown' : 'Submit Post-Trip Lite & Clock Out'}
        </button>
      </div>
    </Sheet>
  )
}
