'use client'
import { useState, useRef, useEffect } from 'react'
import { todayISO } from '@/lib/dashboard/helpers'

interface Props {
  open:    boolean
  onClose: () => void
}

type SavedDoc = {
  id:      string
  name:    string
  date:    string
  savedAt: string
  data?:   string   // base64 data URL — may be absent on older records
}

const STORAGE_KEY = '3b-scanned-docs'
const MAX_DOCS    = 30          // keep last 30 docs
const MAX_IMG_PX  = 1200        // downscale large images before storing

// Compress image to a max width/height before storing in localStorage
function compressImage(dataUrl: string, maxPx = MAX_IMG_PX): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width  * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')?.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return iso }
}

export default function DocsSheet({ open, onClose }: Props) {
  const [docPreview, setDocPreview] = useState<string | null>(null)
  const [docName,    setDocName]    = useState('')
  const [saving,     setSaving]     = useState(false)
  const [savedDocs,  setSavedDocs]  = useState<SavedDoc[]>([])
  const [viewDoc,    setViewDoc]    = useState<SavedDoc | null>(null)
  const [tab,        setTab]        = useState<'scan' | 'saved'>('scan')
  const inputRef = useRef<HTMLInputElement>(null)

  // Load saved docs whenever sheet opens
  useEffect(() => {
    if (!open) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setSavedDocs(JSON.parse(raw) as SavedDoc[])
    } catch { /* ignore */ }
  }, [open])

  if (!open) return null

  const handleClose = () => {
    setDocPreview(null)
    setDocName('')
    setViewDoc(null)
    onClose()
  }

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocName(file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '))
    const reader = new FileReader()
    reader.onload = ev => {
      setDocPreview((ev.target?.result as string) ?? null)
      setTab('scan')
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!docPreview) return
    setSaving(true)
    try {
      const compressed = await compressImage(docPreview)
      const raw  = localStorage.getItem(STORAGE_KEY)
      const docs: SavedDoc[] = raw ? JSON.parse(raw) : []
      const newDoc: SavedDoc = {
        id:      crypto.randomUUID(),
        name:    docName.trim() || 'Scan',
        date:    todayISO(),
        savedAt: new Date().toISOString(),
        data:    compressed,
      }
      docs.unshift(newDoc)
      const trimmed = docs.slice(0, MAX_DOCS)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
      setSavedDocs(trimmed)
    } catch {
      // localStorage full — save without image
      try {
        const raw  = localStorage.getItem(STORAGE_KEY)
        const docs: SavedDoc[] = raw ? JSON.parse(raw) : []
        docs.unshift({ id: crypto.randomUUID(), name: docName.trim() || 'Scan', date: todayISO(), savedAt: new Date().toISOString() })
        localStorage.setItem(STORAGE_KEY, JSON.stringify(docs.slice(0, MAX_DOCS)))
        setSavedDocs(docs.slice(0, MAX_DOCS))
      } catch { /* ignore */ }
    } finally {
      setSaving(false)
    }
    setDocPreview(null)
    setDocName('')
    if (inputRef.current) inputRef.current.value = ''
    setTab('saved')   // Switch to library after saving
  }

  const handleDelete = (id: string) => {
    try {
      const next = savedDocs.filter(d => d.id !== id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setSavedDocs(next)
      if (viewDoc?.id === id) setViewDoc(null)
    } catch { /* ignore */ }
  }

  // ── View single doc ────────────────────────────────────────────────────────
  if (viewDoc) {
    return (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,13,11,.8)' }} onClick={() => setViewDoc(null)} />
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, background: 'var(--surface)', borderTop: '2px solid rgba(0,232,176,.15)', borderRadius: '20px 20px 0 0', padding: '1.2rem 1.25rem 2.5rem', maxHeight: '94dvh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '.95rem' }}>{viewDoc.name}</div>
              <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 2 }}>Saved {fmtDate(viewDoc.savedAt)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleDelete(viewDoc.id)}
                style={{ padding: '.35rem .7rem', borderRadius: 7, border: '1px solid rgba(232,64,0,.2)', background: 'rgba(232,64,0,.06)', color: 'var(--error)', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}
              >
                🗑 Delete
              </button>
              <button onClick={() => setViewDoc(null)}
                style={{ padding: '.35rem .7rem', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.85rem' }}>
                ✕
              </button>
            </div>
          </div>
          {viewDoc.data ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewDoc.data} alt={viewDoc.name}
              style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', maxHeight: '70vh', objectFit: 'contain' }} />
          ) : (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: '.85rem', border: '1px dashed var(--border)', borderRadius: 12 }}>
              📄 Image not stored — older records save name/date only
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display: 'none' }} onChange={handleCapture} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,13,11,.7)' }} onClick={handleClose} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, background: 'var(--surface)', borderTop: '2px solid rgba(0,232,176,.15)', borderRadius: '20px 20px 0 0', padding: '1.25rem 1.25rem 2.5rem', maxHeight: '92dvh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.15rem' }}>📄 Documents</div>
            <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 2 }}>
              BOL · Rate Con · Delivery Receipt · Scale Ticket
            </div>
          </div>
          <button onClick={handleClose} style={{ padding: '.4rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: '1rem', background: 'var(--surface-2)', borderRadius: 10, padding: '.3rem' }}>
          {[['scan', '📷 Scan New'], ['saved', `📚 Saved (${savedDocs.length})`]] .map(([id, label]) => (
            <button key={id} onClick={() => setTab(id as 'scan' | 'saved')}
              style={{
                flex: 1, padding: '.5rem', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontWeight: 800, fontSize: '.72rem',
                background: tab === id ? 'var(--surface)' : 'none',
                color: tab === id ? 'var(--primary)' : 'var(--muted)',
                boxShadow: tab === id ? '0 1px 4px rgba(0,0,0,.15)' : 'none',
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── SCAN TAB ── */}
        {tab === 'scan' && (
          <div style={{ display: 'grid', gap: 12 }}>
            {docPreview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={docPreview} alt="Preview"
                  style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)' }} />
                <div>
                  <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Document name</label>
                  <input
                    value={docName}
                    onChange={e => setDocName(e.target.value)}
                    placeholder="e.g. BOL #12345, Rate Con TQL"
                    style={{ width: '100%', padding: '.65rem .8rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.9rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button onClick={handleSave} disabled={saving}
                    style={{ padding: '1rem', borderRadius: 12, border: 'none', background: 'rgba(0,232,176,.15)', color: 'var(--primary)', fontWeight: 800, fontSize: '.9rem', cursor: saving ? 'default' : 'pointer', minHeight: 56, opacity: saving ? .6 : 1 }}>
                    {saving ? '⏳ Saving…' : '✅ Save'}
                  </button>
                  <button onClick={() => { setDocPreview(null); setTimeout(() => inputRef.current?.click(), 50) }}
                    style={{ padding: '1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', minHeight: 56 }}>
                    📷 Retake
                  </button>
                </div>
              </>
            ) : (
              <button onClick={() => inputRef.current?.click()}
                style={{ width: '100%', padding: '2rem', borderRadius: 16, border: '2px dashed rgba(0,232,176,.3)', background: 'rgba(0,232,176,.04)', color: 'var(--primary)', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, minHeight: 140 }}>
                <span style={{ fontSize: '2.5rem' }}>📷</span>
                Tap to capture or select file
                <span style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600 }}>Camera · Photos · Files</span>
              </button>
            )}
            {/* Storage note */}
            <div style={{ fontSize: '.62rem', color: 'var(--muted)', lineHeight: 1.5, padding: '.4rem .6rem', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
              💾 <strong>Saved docs stay on this device</strong> — stored locally in your browser. Tap the <strong>Saved</strong> tab to view, or use <strong>📷 Scan BOL</strong> on the load sheet to auto-fill load info.
            </div>
          </div>
        )}

        {/* ── SAVED TAB ── */}
        {tab === 'saved' && (
          <div style={{ display: 'grid', gap: '.5rem' }}>
            {savedDocs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--muted)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>📂</div>
                <div style={{ fontWeight: 800, fontSize: '.9rem', marginBottom: '.35rem' }}>No saved documents</div>
                <div style={{ fontSize: '.75rem', lineHeight: 1.5 }}>
                  Use the <strong style={{ color: 'var(--primary)' }}>Scan New</strong> tab to capture a BOL, rate con, delivery receipt, or scale ticket.
                </div>
                <button onClick={() => setTab('scan')}
                  style={{ marginTop: '1rem', padding: '.6rem 1.2rem', borderRadius: 10, background: 'var(--primary)', color: '#061210', fontWeight: 800, fontSize: '.8rem', border: 'none', cursor: 'pointer' }}>
                  📷 Scan first document
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 600, marginBottom: '.25rem' }}>
                  {savedDocs.length} document{savedDocs.length !== 1 ? 's' : ''} · stored on this device
                </div>
                {savedDocs.map(doc => (
                  <div key={doc.id}
                    onClick={() => setViewDoc(doc)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '.7rem .85rem',
                      borderRadius: 11, background: 'var(--surface-2)', border: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    {/* Thumbnail or icon */}
                    <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--surface-off)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {doc.data ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={doc.data} alt={doc.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: '1.4rem' }}>📄</span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                      <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 2 }}>{fmtDate(doc.savedAt)}</div>
                    </div>
                    <span style={{ color: 'var(--muted)', fontSize: '.75rem', flexShrink: 0 }}>›</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
