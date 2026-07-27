'use client'
import { useState } from 'react'
import Sheet, { primaryBtnStyle } from './Sheet'

interface Props {
  loadCount: number
  onClose: () => void
  onConfirm: () => Promise<boolean>
}

export default function SubmitDaySheet({ loadCount, onClose, onConfirm }: Props) {
  const [certified, setCertified] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <Sheet title="Submit Day" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '.95rem' }}>
          You completed <strong>{loadCount}</strong> load{loadCount === 1 ? '' : 's'} today. Once submitted, this
          shift goes to payroll and billing for review. Estimated pay is not final until payroll approves it.
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '.88rem' }}>
          <input type="checkbox" checked={certified} onChange={e => setCertified(e.target.checked)} style={{ marginTop: 3 }} />
          I certify that this record accurately reflects my workday.
        </label>
        <button
          style={{ ...primaryBtnStyle, opacity: certified && !busy ? 1 : .5 }}
          disabled={!certified || busy}
          onClick={async () => {
            setBusy(true)
            const ok = await onConfirm()
            setBusy(false)
            if (ok) onClose()
          }}
        >
          {busy ? 'Submitting…' : 'Submit Day'}
        </button>
      </div>
    </Sheet>
  )
}
