'use client'
import { useRef, useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import { captureGeolocation } from '@/lib/dumpTruck/events'
import { toast } from '@/hooks/useToast'

const TYPES: { key: string; label: string }[] = [
  { key: 'collision', label: 'Collision' },
  { key: 'property_damage', label: 'Property Damage' },
  { key: 'near_miss', label: 'Near Miss' },
  { key: 'injury', label: 'Injury' },
  { key: 'spill', label: 'Spill' },
  { key: 'equipment_failure', label: 'Equipment Failure' },
  { key: 'other', label: 'Other' },
]

interface Props {
  shiftId: string
  truckId: string | null
  jobId: string | null
  onClose: () => void
  onSaved: () => void
}

export default function IncidentQuickSheet({ shiftId, truckId, jobId, onClose, onSaved }: Props) {
  const [incidentType, setIncidentType] = useState('other')
  const [description, setDescription] = useState('')
  const [injuries, setInjuries] = useState(false)
  const [safetyStatus, setSafetyStatus] = useState<'safe' | 'needs_assistance' | 'emergency'>('safe')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const submit = async () => {
    setBusy(true)
    try {
      let photoDocumentId: string | null = null
      if (photo) {
        const form = new FormData()
        form.append('file', photo)
        form.append('docType', 'incident_photo')
        form.append('shiftId', shiftId)
        form.append('capturedAt', new Date().toISOString())
        const uploadRes = await fetch('/api/fleet/dump-truck/documents', { method: 'POST', body: form })
        if (!uploadRes.ok) throw new Error((await uploadRes.json()).error ?? 'Photo upload failed')
        photoDocumentId = (await uploadRes.json()).id
      }

      const geo = await captureGeolocation()
      const res = await fetch('/api/fleet/dump-truck/incidents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId, truckId, jobId, incidentType, description, injuries,
          immediateSafetyStatus: safetyStatus, occurredAt: new Date().toISOString(),
          lat: geo.lat, lng: geo.lng, photoDocumentId,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save incident')
      toast.success('Incident reported — dispatch notified')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save incident')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Report Incident" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {safetyStatus === 'emergency' && (
          <div style={{ padding: '.75rem', borderRadius: 10, background: 'rgba(232,64,0,.15)', color: 'var(--error)', fontWeight: 800, fontSize: '.85rem' }}>
            🚨 If this is a medical emergency, call 911 first.
          </div>
        )}
        <select style={inputStyle} value={incidentType} onChange={e => setIncidentType(e.target.value)}>
          {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <textarea style={{ ...inputStyle, minHeight: 90 }} placeholder="What happened?" value={description} onChange={e => setDescription(e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.9rem' }}>
          <input type="checkbox" checked={injuries} onChange={e => setInjuries(e.target.checked)} /> Injuries involved
        </label>
        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Immediate Safety Status</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['safe', 'needs_assistance', 'emergency'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSafetyStatus(s)}
                style={{
                  flex: 1, padding: '.5rem', borderRadius: 8, fontSize: '.75rem', fontWeight: 700,
                  background: safetyStatus === s ? 'var(--error)' : 'var(--surface-2)',
                  color: safetyStatus === s ? '#fff' : 'var(--text)', border: '1px solid var(--border)',
                }}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => setPhoto(e.target.files?.[0] ?? null)} />
        <button style={{ ...inputStyle, minHeight: 60, fontWeight: 700 }} onClick={() => fileRef.current?.click()}>
          {photo ? `📷 ${photo.name}` : '📷 Attach Photo (optional)'}
        </button>
        <button
          style={{ ...primaryBtnStyle, opacity: description.trim() && !busy ? 1 : .5 }}
          disabled={!description.trim() || busy}
          onClick={submit}
        >
          {busy ? 'Saving…' : 'Report Incident'}
        </button>
      </div>
    </Sheet>
  )
}
