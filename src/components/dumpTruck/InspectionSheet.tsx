'use client'
import { useEffect, useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import { captureGeolocation, createId } from '@/lib/dumpTruck/events'
import { validateInspectionSubmission } from '@/lib/dumpTruck/inspections'
import type { InspectionItemInput, InspectionItemResult, InspectionTemplateItem, DefectSeverity } from '@/lib/dumpTruck/types'
import { toast } from '@/hooks/useToast'

interface Props {
  shiftId: string
  inspectionType: 'pretrip' | 'posttrip'
  onClose: () => void
  onComplete: (hasBlockingDefects: boolean) => void
}

const RESULTS: { key: InspectionItemResult; label: string; color: string }[] = [
  { key: 'pass', label: 'Pass', color: 'var(--success)' },
  { key: 'defect', label: 'Defect', color: 'var(--error)' },
  { key: 'not_applicable', label: 'N/A', color: 'var(--muted)' },
]

const SEVERITIES: { key: DefectSeverity; label: string }[] = [
  { key: 'monitor', label: 'Monitor' },
  { key: 'non_safety', label: 'Non-Safety' },
  { key: 'safety_critical', label: 'Safety-Critical' },
  { key: 'out_of_service', label: 'Out of Service' },
]

export default function InspectionSheet({ shiftId, inspectionType, onClose, onComplete }: Props) {
  const [inspectionId, setInspectionId] = useState<string | null>(null)
  const [items, setItems] = useState<InspectionTemplateItem[]>([])
  const [results, setResults] = useState<Record<string, InspectionItemInput>>({})
  const [odometer, setOdometer] = useState('')
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const geo = await captureGeolocation()
        const now = new Date()
        const res = await fetch('/api/fleet/dump-truck/inspections', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shiftId, inspectionType,
            id: createId(), idempotencyKey: createId(),
            deviceCapturedAt: now.toISOString(), effectiveAt: now.toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, utcOffsetMinutes: -now.getTimezoneOffset(),
            geo,
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Could not start inspection')
        const body = await res.json()
        setInspectionId(body.inspectionId)
        setItems(body.items)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not start inspection')
        onClose()
      } finally {
        setBusy(false)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })()
  }, [])

  const setResult = (item: InspectionTemplateItem, result: InspectionItemResult) => {
    setResults(prev => ({
      ...prev,
      [item.key]: {
        itemKey: item.key, itemLabel: item.label, category: item.category, result,
        severity: prev[item.key]?.severity ?? null, notes: prev[item.key]?.notes ?? null,
      },
    }))
  }
  const setSeverity = (item: InspectionTemplateItem, severity: DefectSeverity) => {
    setResults(prev => ({ ...prev, [item.key]: { ...prev[item.key], severity } }))
  }
  const setNotes = (item: InspectionTemplateItem, notes: string) => {
    setResults(prev => ({ ...prev, [item.key]: { ...prev[item.key], notes } }))
  }

  const submittedItems = Object.values(results)
  const odometerNeeded = items.some(i => i.requiresOdometer)
  const odometerValue = odometer.trim() ? Number(odometer) : null

  const handleComplete = async () => {
    if (!inspectionId) return
    const validation = validateInspectionSubmission(items, submittedItems, odometerValue)
    if (!validation.valid) {
      toast.error(validation.errors[0])
      return
    }
    setSaving(true)
    try {
      const geo = await captureGeolocation()
      const now = new Date()
      const res = await fetch(`/api/fleet/dump-truck/inspections/${inspectionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: submittedItems, odometer: odometerValue,
          completionEvent: {
            id: createId(), idempotencyKey: createId(),
            deviceCapturedAt: now.toISOString(), effectiveAt: now.toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, utcOffsetMinutes: -now.getTimezoneOffset(),
            geo,
          },
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not complete inspection')
      const body = await res.json()
      toast.success(`${inspectionType === 'pretrip' ? 'Pre-trip' : 'Post-trip'} complete`)
      onComplete(body.hasBlockingDefects)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not complete inspection')
    } finally {
      setSaving(false)
    }
  }

  const title = inspectionType === 'pretrip' ? 'Pre-Trip Inspection' : 'Post-Trip Inspection'
  const complete = submittedItems.length === items.length && (!odometerNeeded || odometerValue != null)

  return (
    <Sheet title={title} onClose={onClose}>
      {busy ? (
        <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--muted)' }}>Loading checklist…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {odometerNeeded && (
            <input
              style={{ ...inputStyle, fontWeight: 900, fontSize: '1.1rem' }}
              type="number" inputMode="numeric" placeholder="Odometer reading"
              value={odometer} onChange={e => setOdometer(e.target.value)}
            />
          )}

          {items.map(item => {
            const current = results[item.key]
            return (
              <div key={item.key} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '.7rem' }}>
                <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 6 }}>{item.label}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {RESULTS.filter(r => r.key !== 'not_applicable' || item.allowNa).map(r => (
                    <button
                      key={r.key}
                      onClick={() => setResult(item, r.key)}
                      style={{
                        flex: 1, padding: '.5rem', borderRadius: 8, fontSize: '.8rem', fontWeight: 700,
                        background: current?.result === r.key ? r.color : 'var(--surface-2)',
                        color: current?.result === r.key ? '#04140f' : 'var(--text)',
                        border: '1px solid var(--border)', minHeight: 44,
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                {current?.result === 'defect' && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {SEVERITIES.map(s => (
                        <button
                          key={s.key}
                          onClick={() => setSeverity(item, s.key)}
                          style={{
                            padding: '.4rem .6rem', borderRadius: 6, fontSize: '.72rem', fontWeight: 700,
                            background: current.severity === s.key ? 'var(--error)' : 'var(--surface-2)',
                            color: current.severity === s.key ? '#fff' : 'var(--text)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <input
                      style={{ ...inputStyle, fontSize: '.85rem', padding: '.5rem' }}
                      placeholder="Defect notes"
                      value={current.notes ?? ''}
                      onChange={e => setNotes(item, e.target.value)}
                    />
                  </div>
                )}
              </div>
            )
          })}

          <button
            style={{ ...primaryBtnStyle, opacity: complete && !saving ? 1 : .5, marginTop: '.5rem' }}
            disabled={!complete || saving}
            onClick={handleComplete}
          >
            {saving ? 'Saving…' : `Complete ${inspectionType === 'pretrip' ? 'Pre-Trip' : 'Post-Trip'}`}
          </button>
        </div>
      )}
    </Sheet>
  )
}
