'use client'
import { useEffect, useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import { captureGeolocation, createId } from '@/lib/dumpTruck/events'
import { validateInspectionSubmission } from '@/lib/dumpTruck/inspections'
import type { InspectionItemInput, InspectionTemplateItem, TireAxleType, TireStatus } from '@/lib/dumpTruck/types'
import { toast } from '@/hooks/useToast'

interface Props {
  shiftId: string
  inspectionType: 'pretrip' | 'posttrip'
  onClose: () => void
  onComplete: (hasBlockingDefects: boolean) => void
}

type DriverCheck = 'pass' | 'monitor' | 'fail'

const CHECKS: { key: DriverCheck; label: string; color: string }[] = [
  { key: 'pass', label: 'Pass', color: 'var(--success)' },
  { key: 'monitor', label: 'Monitor', color: 'var(--warn, #d99a2b)' },
  { key: 'fail', label: 'Fail', color: 'var(--error)' },
]

const NEED_CATEGORIES = [
  ['paperwork', 'Paperwork'], ['coolant', 'Coolant'], ['oil', 'Oil'], ['def', 'DEF'],
  ['ppe', 'PPE'], ['permit', 'Permit'], ['equipment', 'Equipment'], ['other', 'Other'],
] as const

function classifyTire(depth: number | null, axleType: TireAxleType | null, visibleDamage: boolean | null): TireStatus | null {
  if (visibleDamage) return 'red'
  if (depth == null || !axleType) return null
  if (axleType === 'steer') {
    if (depth < 4) return 'red'
    if (depth <= 6) return 'yellow'
    return 'green'
  }
  if (depth < 2) return 'red'
  if (depth <= 4) return 'yellow'
  return 'green'
}

export default function InspectionSheet({ shiftId, inspectionType, onClose, onComplete }: Props) {
  const [inspectionId, setInspectionId] = useState<string | null>(null)
  const [items, setItems] = useState<InspectionTemplateItem[]>([])
  const [results, setResults] = useState<Record<string, InspectionItemInput>>({})
  const [odometer, setOdometer] = useState('')
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [needCategory, setNeedCategory] = useState<string>('paperwork')
  const [needText, setNeedText] = useState('')
  const [dayNeeds, setDayNeeds] = useState<{ category: string; description: string }[]>([])
  const [driverDayNote, setDriverDayNote] = useState('')

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

  const patchItem = (item: InspectionTemplateItem, patch: Partial<InspectionItemInput>) => {
    setResults(prev => ({ ...prev, [item.key]: { ...prev[item.key], ...patch } as InspectionItemInput }))
  }

  const setCheck = (item: InspectionTemplateItem, check: DriverCheck) => {
    setResults(prev => {
      const old = prev[item.key]
      return {
        ...prev,
        [item.key]: {
          itemKey: item.key,
          itemLabel: item.label,
          category: item.category,
          result: check === 'pass' ? 'pass' : 'defect',
          severity: check === 'monitor' ? 'monitor' : check === 'fail' ? 'safety_critical' : null,
          notes: old?.notes ?? null,
          photoDocId: old?.photoDocId ?? null,
          tirePosition: old?.tirePosition ?? null,
          tireAxleType: old?.tireAxleType ?? null,
          treadDepth32nds: old?.treadDepth32nds ?? null,
          visibleDamage: old?.visibleDamage ?? null,
          tireStatus: old?.tireStatus ?? null,
        },
      }
    })
  }

  const selectedCheck = (current?: InspectionItemInput): DriverCheck | null => {
    if (!current) return null
    if (current.result === 'pass') return 'pass'
    if (current.severity === 'monitor') return 'monitor'
    return 'fail'
  }

  const uploadPhoto = async (item: InspectionTemplateItem, file: File) => {
    if (!inspectionId) return
    setUploadingKey(item.key)
    try {
      const geo = await captureGeolocation()
      const form = new FormData()
      form.append('file', file)
      form.append('docType', 'inspection_photo')
      form.append('shiftId', shiftId)
      form.append('linkedEntityType', 'inspection')
      form.append('linkedEntityId', inspectionId)
      form.append('capturedAt', new Date().toISOString())
      if (geo.lat != null) form.append('lat', String(geo.lat))
      if (geo.lng != null) form.append('lng', String(geo.lng))
      const res = await fetch('/api/fleet/dump-truck/documents', { method: 'POST', body: form })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Photo upload failed')
      patchItem(item, { photoDocId: body.id })
      toast.success('Photo attached')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Photo upload failed')
    } finally {
      setUploadingKey(null)
    }
  }

  const updateTire = (item: InspectionTemplateItem, patch: Partial<InspectionItemInput>) => {
    setResults(prev => {
      const current = { ...prev[item.key], ...patch } as InspectionItemInput
      const status = classifyTire(current.treadDepth32nds ?? null, current.tireAxleType ?? null, current.visibleDamage ?? null)
      if (status === 'red') {
        current.result = 'defect'
        current.severity = 'out_of_service'
      } else if (status === 'yellow' && current.result === 'pass') {
        current.result = 'defect'
        current.severity = 'monitor'
      }
      current.tireStatus = status
      return { ...prev, [item.key]: current }
    })
  }

  const addNeed = () => {
    const description = needText.trim()
    if (!description) return
    setDayNeeds(prev => [...prev, { category: needCategory, description }])
    setNeedText('')
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
          inspectionType,
          items: submittedItems,
          odometer: odometerValue,
          dayNeeds: inspectionType === 'pretrip' ? dayNeeds : [],
          driverDayNote: driverDayNote.trim() || null,
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
      toast.success(`${inspectionType === 'pretrip' ? 'Pre-trip' : 'Post-trip'} submitted`)
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
            const isTire = item.label.toLowerCase().includes('tire') || item.category.toLowerCase().includes('tire')
            const check = selectedCheck(current)
            return (
              <div key={item.key} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '.75rem' }}>
                <div style={{ fontWeight: 800, fontSize: '.9rem', marginBottom: 7 }}>{item.label}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {CHECKS.map(option => (
                    <button
                      type="button"
                      key={option.key}
                      onClick={() => setCheck(item, option.key)}
                      style={{
                        flex: 1, padding: '.55rem', borderRadius: 8, fontSize: '.8rem', fontWeight: 800, minHeight: 44,
                        background: check === option.key ? option.color : 'var(--surface-2)',
                        color: check === option.key ? '#fff' : 'var(--text)',
                        border: '1px solid var(--border)',
                      }}
                    >{option.label}</button>
                  ))}
                </div>

                {current && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <input
                      style={{ ...inputStyle, fontSize: '.84rem', padding: '.5rem' }}
                      placeholder="Optional note"
                      value={current.notes ?? ''}
                      onChange={e => patchItem(item, { notes: e.target.value })}
                    />

                    <label style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 42, cursor: 'pointer', fontSize: '.8rem', fontWeight: 700 }}>
                      {uploadingKey === item.key ? 'Uploading photo…' : current.photoDocId ? '📷 Photo attached' : '📷 Optional photo'}
                      <input
                        type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                        disabled={uploadingKey === item.key}
                        onChange={e => { const file = e.target.files?.[0]; if (file) void uploadPhoto(item, file) }}
                      />
                    </label>

                    {isTire && (
                      <div style={{ padding: '.65rem', borderRadius: 8, background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 7 }}>
                        <div style={{ fontSize: '.75rem', fontWeight: 800 }}>Tire details — add only when needed</div>
                        <input style={{ ...inputStyle, padding: '.45rem' }} placeholder="Tire position (example: LF steer, RR outer)" value={current.tirePosition ?? ''} onChange={e => updateTire(item, { tirePosition: e.target.value })} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(['steer', 'other'] as TireAxleType[]).map(axle => (
                            <button key={axle} type="button" onClick={() => updateTire(item, { tireAxleType: axle })} style={{ ...inputStyle, flex: 1, fontWeight: 700, background: current.tireAxleType === axle ? 'var(--primary)' : 'var(--surface)' }}>{axle === 'steer' ? 'Steer' : 'Drive / Other'}</button>
                          ))}
                        </div>
                        <input
                          style={{ ...inputStyle, padding: '.45rem' }} type="number" min="0" max="32" step="0.5" inputMode="decimal"
                          placeholder="Tread depth (32nds)"
                          value={current.treadDepth32nds ?? ''}
                          onChange={e => updateTire(item, { treadDepth32nds: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8rem', fontWeight: 700 }}>
                          <input type="checkbox" checked={!!current.visibleDamage} onChange={e => updateTire(item, { visibleDamage: e.target.checked })} /> Visible cut, bulge, separation, exposed material, leak, or other damage
                        </label>
                        {current.tireStatus && (
                          <div style={{ fontSize: '.78rem', fontWeight: 900, textTransform: 'uppercase' }}>
                            Tire planning status: {current.tireStatus}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {inspectionType === 'pretrip' && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '.8rem', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontWeight: 800 }}>Anything needed for today?</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <select style={{ ...inputStyle, width: 130 }} value={needCategory} onChange={e => setNeedCategory(e.target.value)}>
                  {NEED_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="Coolant, oil, paperwork, PPE…" value={needText} onChange={e => setNeedText(e.target.value)} />
                <button type="button" onClick={addNeed} style={{ ...primaryBtnStyle, width: 'auto', padding: '0 .8rem' }}>Add</button>
              </div>
              {dayNeeds.map((need, index) => (
                <div key={`${need.category}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '.8rem', padding: '.4rem .5rem', background: 'var(--surface-2)', borderRadius: 7 }}>
                  <span>{need.description}</span>
                  <button type="button" onClick={() => setDayNeeds(prev => prev.filter((_, i) => i !== index))}>×</button>
                </div>
              ))}
            </div>
          )}

          <textarea
            style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
            placeholder={inspectionType === 'pretrip' ? 'Optional note for dispatch' : 'Optional end-of-shift note'}
            value={driverDayNote}
            onChange={e => setDriverDayNote(e.target.value)}
          />

          <button
            style={{ ...primaryBtnStyle, opacity: complete && !saving ? 1 : .5, marginTop: '.5rem' }}
            disabled={!complete || saving}
            onClick={handleComplete}
          >
            {saving ? 'Submitting…' : `Submit ${inspectionType === 'pretrip' ? 'Pre-Trip' : 'Post-Trip'}`}
          </button>
        </div>
      )}
    </Sheet>
  )
}
