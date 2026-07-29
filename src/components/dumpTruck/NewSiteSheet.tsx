'use client'
/**
 * NewSiteSheet — driver-facing "add a site" quick action.
 *
 * For a pickup/dump/yard location nothing is on file for yet (common in
 * remote hauling routes) — captures GPS automatically on open (recapturable),
 * plus name/type/notes. POSTs to the same /api/fleet/dump-truck/sites
 * endpoint dispatch's admin screen uses; that endpoint is intentionally open
 * to any active business member, not just admin/dispatcher roles.
 */
import { useEffect, useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import { captureGeolocation } from '@/lib/dumpTruck/events'
import { toast } from '@/hooks/useToast'
import type { SiteType } from '@/lib/dumpTruck/types'

interface Props {
  onClose: () => void
  onSaved: () => void
}

const SITE_TYPES: SiteType[] = ['pickup', 'dump', 'yard', 'customer', 'fuel', 'maintenance', 'scale', 'disposal', 'parking', 'other']

export default function NewSiteSheet({ onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [siteType, setSiteType] = useState<SiteType>('pickup')
  const [addressLine1, setAddressLine1] = useState('')
  const [notes, setNotes] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [locating, setLocating] = useState(false)
  const [busy, setBusy] = useState(false)

  const captureLocation = async () => {
    setLocating(true)
    try {
      const geo = await captureGeolocation()
      if (geo.lat != null && geo.lng != null) {
        setLat(geo.lat)
        setLng(geo.lng)
      } else {
        toast.warn('Could not get GPS location — check location permissions')
      }
    } finally {
      setLocating(false)
    }
  }

  useEffect(() => { captureLocation() }, [])

  const canSave = name.trim().length > 0

  const submit = async () => {
    if (!canSave) return
    setBusy(true)
    try {
      const res = await fetch('/api/fleet/dump-truck/sites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), siteType,
          addressLine1: addressLine1 || null,
          instructions: notes || null,
          lat, lng,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save site')
      toast.success(`${name.trim()} added`)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save site')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="New Site" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Site Name</div>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. New Pit Road" autoFocus />
        </div>

        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Type</div>
          <select style={inputStyle} value={siteType} onChange={e => setSiteType(e.target.value as SiteType)}>
            {SITE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Address <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></div>
          <input style={inputStyle} value={addressLine1} onChange={e => setAddressLine1(e.target.value)} placeholder="Optional — GPS pin works without one" />
        </div>

        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>GPS Location</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ ...inputStyle, flex: 1, color: lat != null ? 'var(--text)' : 'var(--muted)' }}>
              {locating ? 'Locating…' : lat != null && lng != null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : 'No location captured'}
            </div>
            <button onClick={captureLocation} disabled={locating} style={{ ...inputStyle, width: 'auto', padding: '.75rem 1rem', fontWeight: 700 }}>
              📍 {locating ? '…' : 'Recapture'}
            </button>
          </div>
        </div>

        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>Notes <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></div>
          <textarea style={{ ...inputStyle, minHeight: 70 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Gate code, landmark, anything dispatch should know" />
        </div>

        <button style={{ ...primaryBtnStyle, opacity: canSave && !busy ? 1 : .5 }} disabled={!canSave || busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save Site'}
        </button>
      </div>
    </Sheet>
  )
}
