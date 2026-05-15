'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Attachment = {
  id: string
  fileName: string
  storagePath: string
  mimeType: string | null
  fileSize: number | null
  createdAt: string
}

type Props = {
  entityType: 'load' | 'fuel' | 'delay'
  entityId: string
}

function getPublicUrl(path: string): string {
  if (!supabase) return ''
  const { data } = supabase.storage.from('attachments').getPublicUrl(path)
  return data.publicUrl
}

const isImage = (mime: string | null) => !!mime?.startsWith('image/')
const fmtSize = (b: number | null) => !b ? '' : b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(0)}KB` : `${(b / 1048576).toFixed(1)}MB`

export default function Attachments({ entityType, entityId }: Props) {
  const [items, setItems] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!supabase || !entityId) { setLoading(false); return }
    supabase.from('attachments').select('*')
      .eq('entity_type', entityType).eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setItems(data.map(r => ({
          id: r.id, fileName: r.file_name, storagePath: r.storage_path,
          mimeType: r.mime_type, fileSize: r.file_size, createdAt: r.created_at,
        })))
        setLoading(false)
      })
  }, [entityType, entityId])

  async function handleFiles(files: FileList | null) {
    if (!files || !supabase) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_')
      const path = `${entityType}/${entityId}/${Date.now()}-${safeName}`
      const { error: storageErr } = await supabase.storage.from('attachments').upload(path, file)
      if (storageErr) continue
      const { data, error } = await supabase.from('attachments').insert({
        entity_type: entityType, entity_id: entityId,
        file_name: file.name, storage_path: path,
        file_size: file.size, mime_type: file.type || null,
      }).select().single()
      if (!error && data) setItems(prev => [{
        id: data.id, fileName: data.file_name, storagePath: data.storage_path,
        mimeType: data.mime_type, fileSize: data.file_size, createdAt: data.created_at,
      }, ...prev])
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleDelete(item: Attachment, e: React.MouseEvent) {
    e.stopPropagation()
    if (!supabase) return
    await supabase.storage.from('attachments').remove([item.storagePath])
    await supabase.from('attachments').delete().eq('id', item.id)
    setItems(prev => prev.filter(a => a.id !== item.id))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
          Attachments{!loading ? ` (${items.length})` : ''}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {uploading && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Uploading…</span>}
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || !supabase}
            style={{ padding: '.3rem .8rem', borderRadius: 8, border: '1px solid var(--border)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--muted)', background: 'var(--surface-2)', opacity: !supabase ? .4 : 1 }}>
            + Attach
          </button>
        </div>
        <input ref={inputRef} type="file" multiple accept="image/*,application/pdf,.pdf" style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)} />
      </div>

      {!supabase && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', padding: '.6rem .8rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          Supabase not connected — attachments unavailable.
        </div>
      )}

      {items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(80px,1fr))', gap: 8 }}>
          {items.map(item => {
            const url = getPublicUrl(item.storagePath)
            const img = isImage(item.mimeType)
            return (
              <div key={item.id} style={{ position: 'relative' }}>
                <div onClick={() => img && setPreview(url)}
                  style={{ width: '100%', height: 72, borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', cursor: img ? 'pointer' : 'default', background: 'var(--surface-2)', display: 'grid', placeItems: 'center' }}>
                  {img
                    ? <img src={url} alt={item.fileName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', padding: 4, textAlign: 'center', wordBreak: 'break-all', lineHeight: 1.3 }}>
                        <div style={{ fontSize: 18, marginBottom: 2 }}>PDF</div>
                        <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 10 }}>Open</a>
                      </div>
                  }
                </div>
                <button type="button" onClick={e => handleDelete(item, e)}
                  style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,.72)', border: 'none', color: 'white', fontSize: 10, cursor: 'pointer', display: 'grid', placeItems: 'center', lineHeight: 1 }}>
                  x
                </button>
                <div style={{ fontSize: 10, color: 'var(--faint)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.fileName}>
                  {item.fileName}
                </div>
                {item.fileSize && <div style={{ fontSize: 10, color: 'var(--faint)' }}>{fmtSize(item.fileSize)}</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox */}
      {preview && (
        <div onClick={() => setPreview(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 100, display: 'grid', placeItems: 'center', cursor: 'zoom-out' }}>
          <img src={preview} alt="" style={{ maxWidth: '94vw', maxHeight: '94vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 24px 64px rgba(0,0,0,.6)' }} />
          <div style={{ position: 'absolute', top: 16, right: 20, fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,.5)' }}>click anywhere to close</div>
        </div>
      )}
    </div>
  )
}
