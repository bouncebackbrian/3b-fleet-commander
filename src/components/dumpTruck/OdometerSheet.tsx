'use client'
import { useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'

interface Props {
  title: string
  isDropOff: boolean
  onClose: () => void
  onConfirm: (odometer: number, extra: { vehicleCondition?: string; fuelLevel?: string; keyStatus?: string }) => Promise<void>
}

export default function OdometerSheet({ title, isDropOff, onClose, onConfirm }: Props) {
  const [odometer, setOdometer] = useState('')
  const [condition, setCondition] = useState('good')
  const [fuelLevel, setFuelLevel] = useState('full')
  const [keyStatus, setKeyStatus] = useState('returned')
  const [busy, setBusy] = useState(false)

  const value = Number(odometer)
  const valid = odometer.trim() !== '' && !Number.isNaN(value) && value >= 0

  return (
    <Sheet title={title} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Odometer</div>
          <input
            style={{ ...inputStyle, fontSize: '1.5rem', fontWeight: 900, textAlign: 'center' }}
            type="number" inputMode="numeric" placeholder="Miles"
            value={odometer} onChange={e => setOdometer(e.target.value)}
            autoFocus
          />
        </div>

        {isDropOff && (
          <>
            <SelectField label="Vehicle Condition" value={condition} onChange={setCondition}
              options={[['good', 'Good'], ['minor_issue', 'Minor Issue'], ['needs_attention', 'Needs Attention']]} />
            <SelectField label="Fuel Level" value={fuelLevel} onChange={setFuelLevel}
              options={[['full', 'Full'], ['three_quarter', '3/4'], ['half', '1/2'], ['quarter', '1/4'], ['low', 'Low']]} />
            <SelectField label="Key Status" value={keyStatus} onChange={setKeyStatus}
              options={[['returned', 'Returned to Lockbox'], ['handed_off', 'Handed to Next Driver'], ['left_in_vehicle', 'Left in Vehicle']]} />
          </>
        )}

        <button
          style={{ ...primaryBtnStyle, opacity: valid && !busy ? 1 : .5 }}
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true)
            await onConfirm(value, isDropOff ? { vehicleCondition: condition, fuelLevel, keyStatus } : {})
            setBusy(false)
            onClose()
          }}
        >
          {busy ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </Sheet>
  )
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]
}) {
  return (
    <div>
      <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
      <select style={inputStyle} value={value} onChange={e => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}
