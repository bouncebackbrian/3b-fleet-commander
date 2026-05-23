'use client'
/**
 * /vault — Proof Vault
 *
 * Every document that protects the driver: BOLs, PODs, inspection reports,
 * repair invoices, registration, insurance, permits.
 *
 * Top section: Quick-access roadside proof buttons — one tap to show
 * the right docs when stopped at a scale or pulled over.
 *
 * Bottom section: Full document grid with tab filter by group.
 */
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  getDocs, getVaultSummary, deleteDoc,
  CATEGORY_META, ROADSIDE_GROUPS,
  type ProofDoc, type RoadsideGroup,
} from '@/lib/proofVault'
import DocUploadSheet   from '@/components/vault/DocUploadSheet'
import RoadsideProofView from '@/components/vault/RoadsideProofView'

const VALID_GROUPS = new Set<string>(['load','inspection','violation','repair','truck','other'])

// ── Tab filter ────────────────────────────────────────────────────────────────

type Tab = RoadsideGroup | 'all'

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'all',        label: 'All',        emoji: '🗄️' },
  { id: 'load',       label: 'Loads',      emoji: '📦' },
  { id: 'inspection', label: 'Inspection', emoji: '🔍' },
  { id: 'violation',  label: 'Violations', emoji: '📋' },
  { id: 'repair',     label: 'Repairs',    emoji: '🔧' },
  { id: 'truck',      label: 'Truck',      emoji: '🚛' },
]

// ── Component ─────────────────────────────────────────────────────────────────

function VaultPage() {
  const searchParams  = useSearchParams()
  const [docs,          setDocs]          = useState<ProofDoc[]>([])
  const [tab,           setTab]           = useState<Tab>('all')
  const [showUpload,    setShowUpload]    = useState(false)
  const [proofGroup,    setProofGroup]    = useState<RoadsideGroup | null>(null)
  const [selectedDoc,   setSelectedDoc]   = useState<ProofDoc | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [searchQ,       setSearchQ]       = useState('')

  const summary = getVaultSummary()

  const loadDocs = useCallback(() => {
    setDocs(getDocs())
  }, [])

  useEffect(() => { loadDocs() }, [loadDocs])

  // ── Auto-open roadside proof view from URL param (?group=inspection etc.) ──
  // This is the "3-second roadside doc" path: dashboard link → vault → overlay opens instantly.
  useEffect(() => {
    const g = searchParams.get('group')
    if (g && VALID_GROUPS.has(g)) {
      const group = g as RoadsideGroup
      setTab(group)          // also set the background tab for context
      setProofGroup(group)   // open the full-screen overlay immediately
    }
  }, [searchParams])

  // ── Filtered docs for grid ────────────────────────────────────────────────────
  const filtered = docs.filter(d => {
    if (tab !== 'all' && CATEGORY_META[d.category].roadsideGroup !== tab) return false
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase()
      return (
        d.fileName.toLowerCase().includes(q)        ||
        d.category.toLowerCase().includes(q)        ||
        CATEGORY_META[d.category].label.toLowerCase().includes(q) ||
        (d.loadNumber ?? '').toLowerCase().includes(q) ||
        (d.notes      ?? '').toLowerCase().includes(q) ||
        (d.truckId    ?? '').toLowerCase().includes(q) ||
        (d.trailerId  ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  function handleDelete(id: string) {
    deleteDoc(id)
    setConfirmDelete(null)
    setSelectedDoc(null)
    loadDocs()
  }

  const totalMb = (summary.totalSizeKb / 1024).toFixed(1)

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>

      {/* ── Header ── */}
      <div style={{ padding: '1rem 1rem .5rem', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.25rem' }}>🗄️ Proof Vault</div>
            <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>
              {summary.total} doc{summary.total !== 1 ? 's' : ''} · {totalMb} MB
              {summary.recentCount > 0 && (
                <span style={{ marginLeft: 8, color: 'var(--primary)', fontWeight: 700 }}>
                  +{summary.recentCount} this week
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            style={{
              padding: '.5rem .9rem', borderRadius: 20, cursor: 'pointer',
              border: '1.5px solid var(--primary)', background: 'rgba(0,232,176,.1)',
              color: 'var(--primary)', fontWeight: 800, fontSize: '.82rem',
            }}
          >
            + Upload
          </button>
        </div>

        {/* Storage bar */}
        {summary.totalSizeKb > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '.75rem' }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: 'var(--primary)',
                width: `${Math.min((summary.totalSizeKb / (150 * 2048)) * 100, 100)}%`,
              }} />
            </div>
            <span style={{ fontSize: '.6rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{totalMb} / ~300 MB</span>
          </div>
        )}

        {/* Search */}
        <input
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          placeholder="🔍 Search docs, load #, truck, trailer…"
          style={{
            width: '100%', padding: '.55rem .75rem', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--text)', fontSize: '.85rem', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* ── Tab filter ── */}
      <div style={{ display: 'flex', gap: 0, overflowX: 'auto', padding: '0 1rem', background: 'var(--surface)', borderBottom: '1px solid var(--border)', marginBottom: 2 }}>
        {TABS.map(t => {
          const count = t.id === 'all' ? summary.total : summary.byGroup[t.id as RoadsideGroup]
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flexShrink: 0, padding: '.6rem .8rem',
                border: 'none', background: 'none',
                borderBottom: tab === t.id ? '2.5px solid var(--primary)' : '2.5px solid transparent',
                color: tab === t.id ? 'var(--primary)' : 'var(--muted)',
                fontWeight: tab === t.id ? 800 : 600, fontSize: '.75rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
              }}
            >
              {t.emoji} {t.label}
              {count > 0 && (
                <span style={{ background: tab === t.id ? 'rgba(0,232,176,.15)' : 'var(--border)', color: tab === t.id ? 'var(--primary)' : 'var(--muted)', borderRadius: 10, padding: '0 5px', fontSize: '.6rem', fontWeight: 800 }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Document grid ── */}
      <div style={{ padding: '1rem' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>
              {tab === 'all' ? '🗄️' : ROADSIDE_GROUPS[tab as RoadsideGroup]?.emoji ?? '📁'}
            </div>
            <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '.4rem', color: 'var(--text)' }}>
              {searchQ ? 'No matching documents' : 'No documents yet'}
            </div>
            <div style={{ fontSize: '.78rem', lineHeight: 1.6 }}>
              {searchQ ? 'Try a different search term.' : 'Tap + Upload to add your first document.'}
            </div>
            {!searchQ && (
              <button
                onClick={() => setShowUpload(true)}
                style={{ marginTop: '1.25rem', padding: '.75rem 1.5rem', borderRadius: 12, border: 'none', background: 'var(--primary)', color: '#061210', fontWeight: 800, fontSize: '.9rem', cursor: 'pointer' }}
              >
                + Upload First Doc
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 10 }}>
            {filtered.map(doc => (
              <DocCard
                key={doc.id}
                doc={doc}
                onOpen={() => setSelectedDoc(doc)}
                onDelete={() => setConfirmDelete(doc.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Upload sheet ── */}
      <DocUploadSheet
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={r => { if (r.ok) loadDocs() }}
      />

      {/* ── Roadside proof overlay ── */}
      {proofGroup && (
        <RoadsideProofView
          open={true}
          group={proofGroup}
          onClose={() => setProofGroup(null)}
        />
      )}

      {/* ── Single doc viewer ── */}
      {selectedDoc && (
        <RoadsideProofView
          open={true}
          group={CATEGORY_META[selectedDoc.category].roadsideGroup}
          docs={[selectedDoc]}
          onClose={() => setSelectedDoc(null)}
        />
      )}

      {/* ── Delete confirm ── */}
      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 16, padding: '1.5rem', maxWidth: 320, width: '100%', border: '1px solid var(--border)' }}
          >
            <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: '.5rem' }}>🗑️ Delete Document?</div>
            <div style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
              This will remove the document from your device and the cloud record. Cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: '.75rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                style={{ flex: 1, padding: '.75rem', borderRadius: 10, border: 'none', background: 'var(--error)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Suspense wrapper — required by useSearchParams in Next.js App Router ──────

import { Suspense } from 'react'

function VaultPageSuspense() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--muted)' }}>Loading vault…</div>}>
      <VaultPage />
    </Suspense>
  )
}

export { VaultPageSuspense as default }

// ── DocCard ───────────────────────────────────────────────────────────────────

function DocCard({ doc, onOpen, onDelete }: { doc: ProofDoc; onOpen: () => void; onDelete: () => void }) {
  const meta  = CATEGORY_META[doc.category]
  const group = ROADSIDE_GROUPS[meta.roadsideGroup]

  return (
    <div
      style={{
        borderRadius: 12, border: '1px solid var(--border)',
        background: 'var(--surface)', overflow: 'hidden',
        cursor: 'pointer', position: 'relative',
      }}
    >
      {/* Thumbnail / icon */}
      <div
        onClick={onOpen}
        style={{ width: '100%', aspectRatio: '4/3', overflow: 'hidden', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
      >
        {doc.fileType === 'photo' ? (
          <img
            src={doc.dataUrl}
            alt={doc.fileName}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.2rem' }}>{meta.emoji}</div>
            <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: 4 }}>{doc.sizeKb} KB</div>
          </div>
        )}
        {/* Group badge */}
        <div style={{
          position: 'absolute', top: 5, left: 5,
          background: 'rgba(0,0,0,.65)', borderRadius: 6,
          padding: '2px 6px', fontSize: '.55rem', fontWeight: 800, color: group.color,
        }}>
          {group.emoji}
        </div>
      </div>

      {/* Info row */}
      <div style={{ padding: '.5rem .6rem' }}>
        <div style={{ fontWeight: 800, fontSize: '.75rem', lineHeight: 1.3, marginBottom: 2 }}>
          {meta.label}
        </div>
        <div style={{ fontSize: '.62rem', color: 'var(--muted)', lineHeight: 1.4 }}>
          {doc.loadNumber && <span>Load #{doc.loadNumber} · </span>}
          {doc.trailerId  && <span>Trailer {doc.trailerId} · </span>}
          {fmtDate(doc.occurredAt || doc.createdAt)}
        </div>
        {doc.notes && (
          <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {doc.notes}
          </div>
        )}
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={onOpen}
          style={{ flex: 1, padding: '.45rem', border: 'none', background: 'none', color: 'var(--primary)', fontWeight: 700, fontSize: '.68rem', cursor: 'pointer' }}
        >
          👁 View
        </button>
        <div style={{ width: 1, background: 'var(--border)' }} />
        <button
          onClick={onDelete}
          style={{ padding: '.45rem .65rem', border: 'none', background: 'none', color: 'var(--error)', fontWeight: 700, fontSize: '.68rem', cursor: 'pointer' }}
        >
          🗑
        </button>
      </div>
    </div>
  )
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } catch { return iso }
}
