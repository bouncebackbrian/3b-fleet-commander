'use client'
/**
 * ComplianceProofModal — Roadside pull-up showing compliance status.
 *
 * Designed to be opened by an officer or driver to immediately show:
 * - Active incident/violation cases and their status
 * - Current load context (truck, trailer, order)
 * - Quick visual proof of "fixed" or "verified" items
 *
 * Usage:
 *   <ComplianceProofModal open={showProof} onClose={() => setShowProof(false)} mission={mission} />
 */
import { useState, useEffect } from 'react'
import {
  readLocalIncidents,
  INCIDENT_META,
  STATUS_META,
  type Incident,
  type IncidentStatus,
} from '@/lib/incidents'
import type { LoadMission } from '@/lib/dashboard/types'

interface Props {
  open:     boolean
  onClose:  () => void
  mission?: LoadMission | null
}

// Status priority for display order (most critical first)
const STATUS_ORDER: IncidentStatus[] = ['open', 'repair_pending', 'fixed', 'verified', 'closed']

function statusPriority(s: IncidentStatus): number {
  return STATUS_ORDER.indexOf(s)
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ComplianceProofModal({ open, onClose, mission }: Props) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [filter,    setFilter]    = useState<IncidentStatus | 'all'>('all')

  useEffect(() => {
    if (!open) return
    const all = readLocalIncidents()
    // Show incidents for this load/truck, or all recent if no mission
    const relevant = mission
      ? all.filter(i =>
          i.loadId       === mission.id          ||
          i.orderNumber  === mission.orderNumber  ||
          i.truckNumber  === mission.tractorId
        )
      : all.slice(0, 25)
    setIncidents(relevant.sort((a, b) => statusPriority(a.status) - statusPriority(b.status)))
  }, [open, mission])

  if (!open) return null

  const displayed = filter === 'all'
    ? incidents
    : incidents.filter(i => i.status === filter)

  const openCount     = incidents.filter(i => i.status === 'open').length
  const pendingCount  = incidents.filter(i => i.status === 'repair_pending').length
  const fixedCount    = incidents.filter(i => i.status === 'fixed' || i.status === 'verified').length
  const allClear      = openCount === 0 && pendingCount === 0

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:   'fixed', inset: 0, zIndex: 210,
          background: 'rgba(0,0,0,.7)',
        }}
      />

      {/* Modal */}
      <div style={{
        position:     'fixed', inset: '5dvh 0 0',
        zIndex:       211,
        background:   'var(--surface)',
        borderRadius: '24px 24px 0 0',
        display:      'flex',
        flexDirection: 'column',
        overflow:     'hidden',
      }}>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{
          padding:      '.75rem 1.1rem .65rem',
          borderBottom: '1px solid var(--border)',
          flexShrink:   0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--text)' }}>
                ⚖️ Compliance Proof
              </div>
              {mission && (
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
                  {mission.tractorId && `Truck ${mission.tractorId}`}
                  {mission.trailerNum && ` · Trailer ${mission.trailerNum}`}
                  {mission.orderNumber && ` · Order ${mission.orderNumber}`}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '1.3rem', color: 'var(--muted)', padding: '4px 8px',
              }}
            >✕</button>
          </div>

          {/* Status summary banner */}
          <div style={{
            marginTop:    10,
            padding:      '.6rem .85rem',
            borderRadius: 12,
            background:   allClear ? 'rgba(0,210,120,.12)' : 'rgba(255,60,60,.1)',
            border:       `1.5px solid ${allClear ? 'var(--success)' : 'var(--error)'}`,
            display:      'flex',
            alignItems:   'center',
            gap:          10,
          }}>
            <span style={{ fontSize: '1.4rem' }}>{allClear ? '✅' : '⚠️'}</span>
            <div>
              <div style={{
                fontWeight: 900, fontSize: '.88rem',
                color: allClear ? 'var(--success)' : 'var(--error)',
              }}>
                {allClear ? 'All Clear' : `${openCount + pendingCount} Active Issue${openCount + pendingCount !== 1 ? 's' : ''}`}
              </div>
              <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 1 }}>
                {openCount > 0 && `${openCount} open · `}
                {pendingCount > 0 && `${pendingCount} pending repair · `}
                {fixedCount > 0 && `${fixedCount} resolved`}
                {incidents.length === 0 && 'No incidents on record'}
              </div>
            </div>
          </div>
        </div>

        {/* Filter pills */}
        <div style={{
          display:    'flex',
          gap:        6,
          padding:    '.6rem 1.1rem',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          overflowX:  'auto',
          scrollbarWidth: 'none',
        }}>
          {(['all', ...STATUS_ORDER] as (IncidentStatus | 'all')[]).map(s => {
            const sm  = s === 'all' ? null : STATUS_META[s]
            const sel = filter === s
            const cnt = s === 'all' ? incidents.length : incidents.filter(i => i.status === s).length
            if (cnt === 0 && s !== 'all') return null
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                style={{
                  padding:      '.28rem .65rem',
                  borderRadius: 20,
                  border:       `1.5px solid ${sel && sm ? sm.color : sel ? 'var(--primary)' : 'var(--border)'}`,
                  background:   sel ? (sm ? `${sm.color}18` : 'rgba(0,232,176,.1)') : 'var(--surface-2)',
                  color:        sel ? (sm?.color ?? 'var(--primary)') : 'var(--muted)',
                  fontSize:     '.75rem',
                  fontWeight:   sel ? 800 : 600,
                  cursor:       'pointer',
                  whiteSpace:   'nowrap',
                  flexShrink:   0,
                }}
              >
                {s === 'all' ? 'All' : sm!.label} ({cnt})
              </button>
            )
          })}
        </div>

        {/* Incident list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {displayed.length === 0 && (
            <div style={{
              padding:   '3rem 1.5rem',
              textAlign: 'center',
              color:     'var(--faint)',
              fontSize:  '.85rem',
              fontWeight: 700,
            }}>
              No incidents found.
            </div>
          )}

          {displayed.map(inc => {
            const im = INCIDENT_META[inc.eventType]
            const sm = STATUS_META[inc.status]
            return (
              <div
                key={inc.id}
                style={{
                  padding:      '.85rem 1.1rem',
                  borderBottom: '1px solid var(--border)',
                  display:      'flex',
                  gap:          12,
                  alignItems:   'flex-start',
                }}
              >
                {/* Emoji */}
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  display: 'grid', placeItems: 'center',
                  fontSize: '1.1rem', flexShrink: 0,
                }}>
                  {im.emoji}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '.9rem', color: 'var(--text)' }}>
                      {im.label}
                    </span>
                    <span style={{
                      fontSize:     '.68rem',
                      fontWeight:   800,
                      color:        sm.color,
                      background:   `${sm.color}18`,
                      border:       `1px solid ${sm.color}40`,
                      borderRadius: 6,
                      padding:      '.1em .4em',
                    }}>
                      {sm.label}
                    </span>
                    {inc.documents.length > 0 && (
                      <span style={{
                        fontSize: '.66rem', color: 'var(--muted)',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 6, padding: '.1em .4em',
                      }}>
                        📷 {inc.documents.length}
                      </span>
                    )}
                  </div>

                  {inc.notes && (
                    <div style={{
                      fontSize:  '.76rem', color: 'var(--muted)',
                      marginTop: 3, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {inc.notes}
                    </div>
                  )}

                  {/* Compliance details row */}
                  {(inc.caseNumber || inc.violationCode) && (
                    <div style={{ fontSize: '.7rem', color: 'var(--faint)', marginTop: 2 }}>
                      {inc.caseNumber   && `Case: ${inc.caseNumber}  `}
                      {inc.violationCode && `Code: ${inc.violationCode}`}
                    </div>
                  )}

                  <div style={{ fontSize: '.65rem', color: 'var(--faint)', marginTop: 3 }}>
                    {fmtDate(inc.createdAt)} {fmtTime(inc.createdAt)}
                    {inc.gpsLat && ' · 📍 GPS'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          flexShrink:   0,
          padding:      '.75rem 1.1rem 1.4rem',
          borderTop:    '1px solid var(--border)',
          background:   'var(--surface)',
          display:      'flex',
          gap:          8,
        }}>
          <div style={{
            flex:         1,
            padding:      '.6rem',
            borderRadius: 10,
            background:   'var(--surface-2)',
            border:       '1px solid var(--border)',
            fontSize:     '.7rem',
            color:        'var(--muted)',
            textAlign:    'center',
          }}>
            📱 Data stored on device · Shown for roadside verification
          </div>
          <button
            onClick={onClose}
            style={{
              padding:      '.6rem 1rem',
              borderRadius: 10,
              border:       'none',
              background:   'var(--surface-2)',
              color:        'var(--text)',
              fontWeight:   700,
              fontSize:     '.85rem',
              cursor:       'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </>
  )
}
