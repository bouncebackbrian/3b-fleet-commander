'use client'
import { useRef, useState } from 'react'
import Sheet, { inputStyle, primaryBtnStyle } from './Sheet'
import { captureGeolocation } from '@/lib/dumpTruck/events'
import { toast } from '@/hooks/useToast'

interface Props {
  shiftId: string
  docType: 'inspection_photo' | 'scale_ticket' | 'delivery_ticket' | 'other'
  title: string
  onClose: () => void
  onUploaded: () => void
}

export default function PhotoTicketSheet({ shiftId, docType, title, onClose, onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const upload = async () => {
    if (!file) return
    setBusy(true)
    try {
      const geo = await captureGeolocation()
      const form = new FormData()
      form.append('file', file)
      form.append('docType', docType)
      form.append('shiftId', shiftId)
      form.append('capturedAt', new Date().toISOString())
      if (geo.lat != null) form.append('lat', String(geo.lat))
      if (geo.lng != null) form.append('lng', String(geo.lng))

      const res = await fetch('/api/fleet/dump-truck/documents', { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Upload failed')
      toast.success('Saved')
      onUploaded()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed — try again when you have signal')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          style={{ display: 'none' }}
          onChange={e => setFile(e.target.files?.[0] ?? null)}
        />
        <button style={{ ...inputStyle, minHeight: 120, fontWeight: 700 }} onClick={() => fileRef.current?.click()}>
          {file ? `📷 ${file.name}` : '📷 Tap to take a photo'}
        </button>
        <button
          style={{ ...primaryBtnStyle, opacity: file && !busy ? 1 : .5 }}
          disabled={!file || busy}
          onClick={upload}
        >
          {busy ? 'Uploading…' : 'Save'}
        </button>
      </div>
    </Sheet>
  )
}
