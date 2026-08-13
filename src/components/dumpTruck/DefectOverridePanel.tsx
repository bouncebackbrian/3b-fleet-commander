'use client'
import { useState } from 'react'
import { buildHectorReport, type HectorReportDefect } from '@/lib/dumpTruck/hectorReport'
import { toast } from '@/hooks/useToast'

interface Props {
  truckUnitNumber: string | null
  driverName: string | null
  defects: HectorReportDefect[]
  busy: boolean
  /** Fires the blocked action anyway, passing the report text as the event's
   *  documented override reason/notes. */
  onContinue: (reportText: string) => void
}

const FUEL_LEVELS = ['Empty', 'Quarter', 'Half', 'Three-quarter', 'Full']

/**
 * Shown in place of the normal primary action when a safety-critical/
 * out-of-service defect is blocking dispatch (page.tsx's disabledReason).
 * Two escape hatches, both requiring the driver to actually document
 * something first — this does not silently clear the defect or bypass the
 * block with no record, it replaces a hard stop with a documented one:
 *
 * 1. Copy a plain-text report (truck, date, fuel, open issues) to text to
 *    ownership before/while continuing.
 * 2. "Continue Anyway" — fires the blocked event with that report text as
 *    the persisted override reason, so there's an audit trail of who
 *    dispatched despite the defect and why (canDispatchWithDefects already
 *    supported a documented overrideReason — this is what wires it up).
 */
export default function DefectOverridePanel({ truckUnitNumber, driverName, defects, busy, onContinue }: Props) {
  const [fuelLevel, setFuelLevel] = useState('')
  const [note, setNote] = useState('')

  const reportText = buildHectorReport({ truckUnitNumber, driverName, fuelLevel, defects, note })
  const canContinue = fuelLevel.trim().length > 0

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText)
      toast.success('Report copied — paste it into a text to Hector')
    } catch {
      toast.error('Could not copy — select and copy the text manually')
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '.75rem', width: '100%', maxWidth: 480,
      background: 'rgba(232,64,0,.06)', border: '1px solid rgba(232,64,0,.3)', borderRadius: 12, padding: '1rem',
    }}>
      <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--error)' }}>
        Truck has an open safety-critical/out-of-service defect. Report it to Hector, then you can continue.
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.75rem', fontWeight: 600 }}>
        Fuel level (required to continue)
        <select
          value={fuelLevel}
          onChange={e => setFuelLevel(e.target.value)}
          style={{ padding: '.5rem', borderRadius: 8, fontSize: '.9rem' }}
        >
          <option value="">Select…</option>
          {FUEL_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.75rem', fontWeight: 600 }}>
        Note (optional — e.g. "daylight only", "driving carefully")
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          style={{ padding: '.5rem', borderRadius: 8, fontSize: '.9rem', resize: 'vertical' }}
        />
      </label>

      <pre style={{
        whiteSpace: 'pre-wrap', fontSize: '.78rem', background: 'var(--surface, #1a1c20)',
        padding: '.6rem', borderRadius: 8, margin: 0, maxHeight: 160, overflowY: 'auto',
      }}>
        {reportText}
      </pre>

      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <button type="button" className="dt-secondary-btn" onClick={handleCopy}>
          📋 Copy Report for Hector
        </button>
        <button
          type="button"
          className="dt-primary-btn"
          disabled={busy || !canContinue}
          onClick={() => onContinue(reportText)}
        >
          {busy ? 'Saving…' : 'Continue Anyway (Reported)'}
        </button>
      </div>
      {!canContinue && (
        <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>
          Select a fuel level to enable Continue — it goes in the report either way.
        </div>
      )}
    </div>
  )
}
