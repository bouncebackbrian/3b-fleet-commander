'use client'
import { useState, useRef } from 'react'
import { todayISO } from '@/lib/dashboard/helpers'

interface Props {
  open:    boolean
  onClose: () => void
}

export default function DocsSheet({ open, onClose }: Props) {
  const [docPreview, setDocPreview] = useState<string | null>(null)
  const [docName,    setDocName]    = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const handleClose = () => {
    setDocPreview(null)
    setDocName('')
    onClose()
  }

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocName(file.name)
    const reader = new FileReader()
    reader.onload = ev => setDocPreview((ev.target?.result as string) ?? null)
    reader.readAsDataURL(file)
  }

  const handleSave = () => {
    if (!docPreview) return
    try {
      const raw = localStorage.getItem('3b-scanned-docs')
      const docs: { id: string; name: string; date: string; savedAt: string }[] = raw ? JSON.parse(raw) : []
      docs.unshift({ id: crypto.randomUUID(), name: docName || 'Scan', date: todayISO(), savedAt: new Date().toISOString() })
      localStorage.setItem('3b-scanned-docs', JSON.stringify(docs.slice(0, 50)))
    } catch { /* ignore */ }
    setDocPreview(null)
    setDocName('')
    if (inputRef.current) inputRef.current.value = ''
    onClose()
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display: 'none' }} onChange={handleCapture} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,13,11,.7)' }} onClick={handleClose} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, background: 'var(--surface)', borderTop: '2px solid rgba(0,232,176,.15)', borderRadius: '20px 20px 0 0', padding: '1.5rem 1.5rem 2.5rem', maxHeight: '90dvh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>📄 Scan Document</div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>BOL · Rate Con · Delivery Receipt · Scale Ticket</div>
          </div>
          <button onClick={handleClose} style={{ padding: '.4rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
        </div>
        {docPreview ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={docPreview} alt="Doc preview" style={{ width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)' }} />
            <div style={{ fontSize: '.8rem', color: 'var(--muted)', fontWeight: 600 }}>{docName}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={handleSave}
                style={{ padding: '1rem', borderRadius: 12, border: 'none', background: 'rgba(0,232,176,.15)', color: 'var(--primary)', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', minHeight: 56 }}>✓ Save Doc</button>
              <button onClick={() => { setDocPreview(null); setTimeout(() => inputRef.current?.click(), 50) }}
                style={{ padding: '1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', minHeight: 56 }}>📷 Retake</button>
            </div>
          </div>
        ) : (
          <button onClick={() => inputRef.current?.click()}
            style={{ width: '100%', padding: '2rem', borderRadius: 16, border: '2px dashed rgba(0,232,176,.3)', background: 'rgba(0,232,176,.04)', color: 'var(--primary)', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, minHeight: 130 }}>
            <span style={{ fontSize: '2.5rem' }}>📷</span>
            Tap to capture or select file
            <span style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600 }}>Camera · Photos · Files</span>
          </button>
        )}
      </div>
    </>
  )
}
