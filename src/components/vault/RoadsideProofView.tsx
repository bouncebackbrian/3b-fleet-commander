'use client'
/**
 * RoadsideProofView — Full-screen proof overlay for roadside use.
 *
 * Shows all documents in a group (inspection, repair, load, truck).
 * Designed for one-tap use when stopped at a scale or pulled over:
 * big thumbnails, swipe between docs, zoom on tap, share button.
 *
 * Usage:
 *   <RoadsideProofView
 *     open={true}
 *     group="inspection"
 *     onClose={() => ...}
 *   />
 */
import { useState, useEffect } from 'react'
import {
  getDocsByGroup, ROADSIDE_GROUPS, CATEGORY_META,
  type ProofDoc, type RoadsideGroup,
} from '@/lib/proofVault'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open:      boolean
  onClose:   () => void
  group:     RoadsideGroup
  /** Filter further by specific load, violation, etc. */
  loadNumber?:  string
  violationId?: string
  trailerId?:   string
  /** Override docs entirely (pass specific doc list) */
  docs?: ProofDoc[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RoadsideProofView({ open, onClose, group, loadNumber, violationId, trailerId, docs: docsProp }: Props) {
  const [docs,     setDocs]     = useState<ProofDoc[]>([])
  const [current,  setCurrent]  = useState(0)
  const [zoomed,   setZoomed]   = useState(false)
  const [sharing,  setSharing]  = useState(false)

  useEffect(() => {
    if (!open) return
    setCurrent(0); setZoomed(false)

    let list = docsProp ?? getDocsByGroup(group)

    // Further filter if context given
    if (loadNumber)  list = list.filter(d => d.loadNumber === loadNumber || d.loadId === loadNumber)
    if (violationId) list = list.filter(d => d.violationId === violationId)
    if (trailerId)   list = list.filter(d => d.trailerId === trailerId)

    // Sort newest first
    list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    setDocs(list)
  }, [open, group, loadNumber, violationId, trailerId, docsProp])

  if (!open) return null

  const groupMeta = ROADSIDE_GROUPS[group]
  const doc       = docs[current]

  function prev() { if (current > 0) { setCurrent(c => c - 1); setZoomed(false) } }
  function next() { if (current < docs.length - 1) { setCurrent(c => c + 1); setZoomed(false) } }

  async function shareDoc() {
    if (!doc || sharing) return
    setSharing(true)
    try {
      // Convert dataUrl to blob
      const res  = await fetch(doc.dataUrl)
      const blob = await res.blob()
      const file = new File([blob], doc.fileName, { type: doc.mimeType })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: CATEGORY_META[doc.category].label })
      } else {
        // Fallback: download
        const a  = document.createElement('a')
        a.href   = doc.dataUrl
        a.download = doc.fileName
        a.click()
      }
    } catch { /* user cancelled or share unavailable */ }
    finally { setSharing(false) }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: '#000',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'calc(.75rem + env(safe-area-inset-top)) 1rem .75rem',
        background: 'rgba(0,0,0,.9)', borderBottom: '1px solid rgba(255,255,255,.08)',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: '1.05rem', color: '#fff' }}>
            {groupMeta.emoji} {groupMeta.label}
          </div>
          <div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.5)', marginTop: 2 }}>
            {docs.length === 0 ? 'No documents' : `${current + 1} of ${docs.length}`}
            {loadNumber && <span> · Load #{loadNumber}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {doc && (
            <button onClick={shareDoc} disabled={sharing} style={topBtn}>
              {sharing ? '⏳' : '↗️'} Share
            </button>
          )}
          <button onClick={onClose} style={{ ...topBtn, background: 'rgba(232,64,0,.15)', borderColor: 'rgba(232,64,0,.3)', color: '#ff8080' }}>
            ✕ Close
          </button>
        </div>
      </div>

      {/* ── Main doc area ── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

        {docs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.4)', padding: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{groupMeta.emoji}</div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: '.5rem', color: 'rgba(255,255,255,.6)' }}>
              No {groupMeta.label}
            </div>
            <div style={{ fontSize: '.82rem', lineHeight: 1.6 }}>
              {groupMeta.desc}
            </div>
            <div style={{ marginTop: '1rem', fontSize: '.72rem', color: 'rgba(255,255,255,.3)' }}>
              Upload documents from the Proof Vault to access them here.
            </div>
          </div>
        ) : doc ? (
          <div
            onClick={() => setZoomed(z => !z)}
            style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'zoom-in',
              overflow: zoomed ? 'auto' : 'hidden',
            }}
          >
            {doc.fileType === 'photo' ? (
              <img
                src={doc.dataUrl}
                alt={doc.fileName}
                style={{
                  maxWidth:  zoomed ? 'none'  : '100%',
                  maxHeight: zoomed ? 'none'  : '100%',
                  width:     zoomed ? 'auto'  : undefined,
                  height:    zoomed ? 'auto'  : undefined,
                  objectFit: zoomed ? 'none'  : 'contain',
                  transition: 'all .2s',
                  cursor:    zoomed ? 'zoom-out' : 'zoom-in',
                }}
              />
            ) : doc.fileType === 'pdf' ? (
              <div style={{ width: '100%', height: '100%' }}>
                <iframe
                  src={doc.dataUrl}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title={doc.fileName}
                />
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#fff', padding: '2rem' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📄</div>
                <div style={{ fontWeight: 700 }}>{doc.fileName}</div>
                <div style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.5)', marginTop: 4 }}>{doc.sizeKb} KB</div>
                <button onClick={shareDoc} style={{ marginTop: '1.5rem', padding: '.75rem 1.5rem', borderRadius: 10, background: 'rgba(0,232,176,.15)', border: '1px solid rgba(0,232,176,.35)', color: '#00e8b0', fontWeight: 800, cursor: 'pointer', fontSize: '.9rem' }}>
                  ↗️ Open / Share File
                </button>
              </div>
            )}

            {/* Zoom hint */}
            {!zoomed && doc.fileType === 'photo' && (
              <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,.6)', color: 'rgba(255,255,255,.6)', fontSize: '.65rem', padding: '.3rem .7rem', borderRadius: 20, pointerEvents: 'none' }}>
                Tap to zoom
              </div>
            )}
          </div>
        ) : null}

        {/* ── Prev / Next arrows ── */}
        {docs.length > 1 && !zoomed && (
          <>
            <button
              onClick={prev}
              disabled={current === 0}
              style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.15)',
                color: '#fff', fontSize: '1.2rem', cursor: current === 0 ? 'not-allowed' : 'pointer',
                opacity: current === 0 ? .3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >‹</button>
            <button
              onClick={next}
              disabled={current === docs.length - 1}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.15)',
                color: '#fff', fontSize: '1.2rem', cursor: current === docs.length - 1 ? 'not-allowed' : 'pointer',
                opacity: current === docs.length - 1 ? .3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >›</button>
          </>
        )}
      </div>

      {/* ── Bottom doc info + thumbnail strip ── */}
      {docs.length > 0 && (
        <div style={{
          background: 'rgba(0,0,0,.9)', borderTop: '1px solid rgba(255,255,255,.08)',
          padding: '.75rem 1rem calc(.75rem + env(safe-area-inset-bottom))',
          flexShrink: 0,
        }}>
          {/* Current doc meta */}
          {doc && (
            <div style={{ marginBottom: '.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1rem' }}>{CATEGORY_META[doc.category].emoji}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '.85rem', color: '#fff' }}>
                    {CATEGORY_META[doc.category].label}
                  </div>
                  <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.45)', marginTop: 1 }}>
                    {doc.loadNumber && `Load #${doc.loadNumber} · `}
                    {doc.trailerId && `Trailer ${doc.trailerId} · `}
                    {fmtDate(doc.occurredAt || doc.createdAt)}
                  </div>
                </div>
                {doc.notes && (
                  <div style={{ marginLeft: 'auto', fontSize: '.7rem', color: 'rgba(255,255,255,.5)', maxWidth: 120, textAlign: 'right', lineHeight: 1.3 }}>
                    {doc.notes}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Thumbnail strip — only if multiple docs */}
          {docs.length > 1 && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
              {docs.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => { setCurrent(i); setZoomed(false) }}
                  style={{
                    flexShrink: 0, width: 52, height: 52, borderRadius: 8, overflow: 'hidden',
                    border: i === current ? '2px solid var(--primary)' : '2px solid rgba(255,255,255,.12)',
                    background: 'rgba(255,255,255,.08)', cursor: 'pointer', padding: 0,
                    position: 'relative',
                  }}
                >
                  {d.fileType === 'photo' ? (
                    <img src={d.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>
                      {CATEGORY_META[d.category].emoji}
                    </div>
                  )}
                  {i === current && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'var(--primary)' }} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

const topBtn: React.CSSProperties = {
  padding: '.4rem .8rem', borderRadius: 8,
  border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.08)',
  color: 'rgba(255,255,255,.8)', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer',
}
