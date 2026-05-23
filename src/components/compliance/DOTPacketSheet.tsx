'use client'
/**
 * DOTPacketSheet — Roadside-ready DOT compliance proof packet
 *
 * Aggregates open violations, repair proofs, inspection history, and
 * unit context into a clean "show the officer" view.
 *
 * Flow: View open issues → Generate packet → Log dot_packet_generated
 */
import { useState, useEffect } from 'react'
import {
  readLocalComplianceEvents,
  readLocalPreTripRecords,
  COMPLIANCE_EVENT_META,
  COMPLIANCE_STATUS_META,
  SEVERITY_META,
  COMPLIANCE_DOC_LABELS,
  type ComplianceEvent,
  type PreTripRecord,
} from '@/lib/complianceEvents'
import { logTimelineEvent } from '@/lib/timeline'
import type { LoadMission } from '@/lib/dashboard/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHead({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: '.62rem', fontWeight: 900, color: 'var(--muted)',
      textTransform: 'uppercase', letterSpacing: '.07em',
      borderBottom: '1px solid var(--border)', paddingBottom: 4, marginBottom: 8,
    }}>{label}</div>
  )
}

function InfoRow({ label, value, accent }: { label: string; value: string | undefined; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
      <span style={{ fontSize: '.72rem', color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '.82rem', fontWeight: 700, color: accent ?? 'var(--text)', textAlign: 'right' }}>
        {value ?? '—'}
      </span>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open:     boolean
  onClose:  () => void
  mission?: LoadMission | null
  /** Open a specific event as the primary subject of the packet */
  event?:   ComplianceEvent
}

export default function DOTPacketSheet({ open, onClose, mission, event: primaryEvent }: Props) {
  const [allEvents,    setAllEvents]    = useState<ComplianceEvent[]>([])
  const [preTripRecs,  setPreTripRecs]  = useState<PreTripRecord[]>([])
  const [filterTruck,  setFilterTruck]  = useState('')
  const [generated,    setGenerated]    = useState(false)
  const [generating,   setGenerating]   = useState(false)
  const [packetTs,     setPacketTs]     = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setGenerated(false)
    setGenerating(false)
    setPacketTs(null)

    const events = readLocalComplianceEvents()
    const pts    = readLocalPreTripRecords()
    setAllEvents(events)
    setPreTripRecs(pts)

    // Auto-set truck filter from mission or primary event
    const truck = primaryEvent?.truckNumber ?? mission?.tractorId ?? ''
    setFilterTruck(truck)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  // ── Filtered data ──────────────────────────────────────────────────────────

  const subjectEvents: ComplianceEvent[] = primaryEvent
    ? [primaryEvent, ...allEvents.filter(e =>
        e.id !== primaryEvent.id &&
        (filterTruck ? e.truckNumber === filterTruck || e.trailerNumber === filterTruck : true) &&
        e.status !== 'closed'
      )]
    : allEvents.filter(e =>
        (filterTruck ? e.truckNumber === filterTruck || e.trailerNumber === filterTruck : true) &&
        e.status !== 'closed'
      )

  const openIssues  = subjectEvents.filter(e => e.status === 'open')
  const repairItems = subjectEvents.filter(e => e.status === 'repair_pending' || e.status === 'repair_submitted')
  const verifiedItems = subjectEvents.filter(e => e.status === 'verified')
  const allDocs     = subjectEvents.flatMap(e => e.documents)

  // Most recent pre-trip for the subject truck
  const relevantPretrips = preTripRecs.filter(p =>
    !filterTruck || p.truckNumber === filterTruck || p.trailerNumber === filterTruck
  ).slice(0, 3)

  const truckNum    = filterTruck || primaryEvent?.truckNumber || mission?.tractorId || '—'
  const trailerNum  = primaryEvent?.trailerNumber || mission?.trailerNum || '—'
  const driverName  = primaryEvent?.driverName || '—'
  const loadNum     = primaryEvent?.loadId || mission?.loadNumber || '—'
  const orderNum    = primaryEvent?.orderNumber || mission?.orderNumber || '—'

  const hasOOS      = subjectEvents.some(e => e.outOfService && !e.oosCleared)
  const criticalCt  = subjectEvents.filter(e => e.severity === 'critical' && e.status === 'open').length

  async function handleGenerate() {
    setGenerating(true)
    void logTimelineEvent(
      'dot_packet_generated',
      'compliance_command',
      {
        truckNumber:    truckNum,
        trailerNumber:  trailerNum,
        eventCount:     subjectEvents.length,
        openCount:      openIssues.length,
        repairCount:    repairItems.length,
        docCount:       allDocs.length,
        hasOOS,
      },
      primaryEvent?.loadId ?? mission?.id,
    )
    setPacketTs(new Date().toISOString())
    setGenerated(true)
    setGenerating(false)
  }

  // ── Packet generated view (clean officer-facing layout) ───────────────────

  if (generated && packetTs) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(2px)' }} />
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          maxHeight: '94dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
          </div>

          {/* Packet header banner */}
          <div style={{
            padding: '.8rem 1.1rem .6rem', flexShrink: 0,
            background: hasOOS ? 'rgba(232,64,0,.08)' : criticalCt > 0 ? 'rgba(232,64,0,.06)' : 'rgba(0,232,176,.06)',
            borderBottom: `2px solid ${hasOOS || criticalCt > 0 ? 'var(--error)' : 'var(--primary)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.1rem', letterSpacing: '.03em' }}>
                  {hasOOS ? '🛑 OUT OF SERVICE' : criticalCt > 0 ? '🚨 COMPLIANCE PACKET' : '✅ COMPLIANCE PACKET'}
                </div>
                <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 1 }}>
                  Generated {fmtDateTime(packetTs)} · {subjectEvents.length} event{subjectEvents.length !== 1 ? 's' : ''}
                </div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--muted)' }}>✕</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem' }}>

            {/* Unit info */}
            <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '.85rem 1rem', marginBottom: 14 }}>
              <SectionHead label="Unit Information" />
              <InfoRow label="Tractor #"   value={truckNum}   />
              <InfoRow label="Trailer #"   value={trailerNum} />
              <InfoRow label="Driver"      value={driverName} />
              <InfoRow label="Load #"      value={loadNum}    />
              <InfoRow label="Order #"     value={orderNum}   />
            </div>

            {/* OOS banner */}
            {hasOOS && (
              <div style={{
                background: 'rgba(232,64,0,.12)', border: '2px solid var(--error)',
                borderRadius: 12, padding: '.75rem 1rem', marginBottom: 14, textAlign: 'center',
              }}>
                <div style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--error)' }}>🛑 UNIT OUT OF SERVICE</div>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 3 }}>
                  Not authorized to operate until OOS order is cleared by enforcement
                </div>
              </div>
            )}

            {/* Open violations */}
            {openIssues.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <SectionHead label={`Open Issues (${openIssues.length})`} />
                {openIssues.map(e => (
                  <div key={e.id} style={{
                    background: 'var(--surface-2)', borderRadius: 10,
                    borderLeft: `4px solid ${SEVERITY_META[e.severity].color}`,
                    padding: '.65rem .85rem', marginBottom: 6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 800, fontSize: '.85rem' }}>
                        {COMPLIANCE_EVENT_META[e.eventType].emoji} {COMPLIANCE_EVENT_META[e.eventType].label}
                      </div>
                      <span style={{ fontSize: '.65rem', fontWeight: 700, color: SEVERITY_META[e.severity].color }}>
                        {SEVERITY_META[e.severity].label}
                      </span>
                    </div>
                    {e.violationCode && <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>Code: {e.violationCode}</div>}
                    {e.inspectionReport && <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Report #: {e.inspectionReport}</div>}
                    {e.inspectionLocation && <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Location: {e.inspectionLocation}</div>}
                    {e.officerBadge && <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Officer Badge: {e.officerBadge}</div>}
                    {e.notes && <div style={{ fontSize: '.72rem', color: 'var(--faint)', marginTop: 4, fontStyle: 'italic' }}>{e.notes}</div>}
                    <div style={{ fontSize: '.65rem', color: 'var(--faint)', marginTop: 4 }}>{fmtDateTime(e.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Repair chain */}
            {repairItems.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <SectionHead label={`Repair Chain (${repairItems.length})`} />
                {repairItems.map(e => (
                  <div key={e.id} style={{
                    background: 'var(--surface-2)', borderRadius: 10,
                    borderLeft: '4px solid var(--warn)',
                    padding: '.65rem .85rem', marginBottom: 6,
                  }}>
                    <div style={{ fontWeight: 800, fontSize: '.85rem', marginBottom: 4 }}>
                      {COMPLIANCE_EVENT_META[e.eventType].emoji} {COMPLIANCE_EVENT_META[e.eventType].label}
                      {' → '}
                      <span style={{ color: COMPLIANCE_STATUS_META[e.status].color }}>{COMPLIANCE_STATUS_META[e.status].label}</span>
                    </div>
                    {e.repairShop && <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Shop: {e.repairShop}</div>}
                    {e.repairOrderNumber && <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Order: {e.repairOrderNumber}</div>}
                    {e.repairCost != null && <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Cost: ${e.repairCost.toFixed(2)}</div>}
                    {e.repairCompletedAt && <div style={{ fontSize: '.72rem', color: 'var(--success)', fontWeight: 700 }}>Completed: {fmtDateTime(e.repairCompletedAt)}</div>}
                    <div style={{ fontSize: '.65rem', color: 'var(--faint)', marginTop: 4 }}>Logged: {fmtDateTime(e.createdAt)}</div>
                    {e.documents.length > 0 && (
                      <div style={{ fontSize: '.68rem', color: 'var(--success)', marginTop: 4 }}>
                        📎 {e.documents.length} doc{e.documents.length > 1 ? 's' : ''} attached ({e.documents.map(d => COMPLIANCE_DOC_LABELS[d.docType]).join(', ')})
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Verified items */}
            {verifiedItems.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <SectionHead label={`Verified / Resolved (${verifiedItems.length})`} />
                {verifiedItems.map(e => (
                  <div key={e.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'var(--surface-2)', borderRadius: 10,
                    borderLeft: '4px solid var(--success)',
                    padding: '.55rem .85rem', marginBottom: 5,
                  }}>
                    <span>✅</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.82rem', fontWeight: 700 }}>{COMPLIANCE_EVENT_META[e.eventType].label}</div>
                      {e.violationCode && <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>Code {e.violationCode}</div>}
                    </div>
                    <span style={{ fontSize: '.65rem', color: 'var(--faint)' }}>{fmtDate(e.updatedAt)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* All docs */}
            {allDocs.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <SectionHead label={`Attached Documents (${allDocs.length})`} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {allDocs.map(doc => (
                    <div key={doc.id} style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      background: 'var(--surface-2)', borderRadius: 8, padding: '.45rem .65rem',
                      border: '1px solid var(--border)', maxWidth: 180,
                    }}>
                      {doc.dataUrl?.startsWith('data:image') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={doc.dataUrl} alt={doc.caption} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />
                      ) : (
                        <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>📄</span>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '.72rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.caption}</div>
                        <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>{COMPLIANCE_DOC_LABELS[doc.docType]}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pre-trip history */}
            {relevantPretrips.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <SectionHead label="Pre-Trip Records" />
                {relevantPretrips.map(pt => (
                  <div key={pt.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'var(--surface-2)', borderRadius: 10, padding: '.55rem .85rem',
                    borderLeft: `4px solid ${pt.result === 'pass' ? 'var(--success)' : 'var(--error)'}`,
                    marginBottom: 5,
                  }}>
                    <span>{pt.result === 'pass' ? '✅' : '❌'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.82rem', fontWeight: 700 }}>
                        Pre-Trip {pt.result === 'pass' ? 'Passed' : 'Failed'}
                        {pt.failCount > 0 && <span style={{ color: 'var(--error)', marginLeft: 6 }}>({pt.failCount} defect{pt.failCount > 1 ? 's' : ''})</span>}
                      </div>
                      {pt.truckNumber && <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>🚛 {pt.truckNumber}</div>}
                    </div>
                    <div style={{ fontSize: '.65rem', color: 'var(--faint)', textAlign: 'right', flexShrink: 0 }}>{fmtDate(pt.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {subjectEvents.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--faint)', fontSize: '.85rem' }}>
                ✅ No open compliance issues for this unit
              </div>
            )}

          </div>

          {/* Footer */}
          <div style={{ flexShrink: 0, padding: '.75rem 1.1rem 1.4rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '.65rem', color: 'var(--muted)', textAlign: 'center', marginBottom: 6 }}>
              Packet valid at time of generation · {fmtDateTime(packetTs)}
            </div>
            <button onClick={onClose} style={{
              width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
              background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 800, fontSize: '.95rem', cursor: 'pointer',
            }}>
              Close Packet
            </button>
          </div>
        </div>
      </>
    )
  }

  // ── Pre-generate setup view ────────────────────────────────────────────────

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        maxHeight: '90dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '.6rem 1.1rem .4rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>📋 Generate DOT Packet</div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 1 }}>Roadside-ready compliance proof</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--muted)' }}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem' }}>

          {/* Truck filter */}
          <div style={{ marginBottom: 14 }}>
            <div style={secLabel}>Filter by Truck / Trailer #</div>
            <input
              placeholder="Enter truck or trailer # (leave blank for all)"
              value={filterTruck}
              onChange={e => setFilterTruck(e.target.value)}
              style={inp}
            />
          </div>

          {/* Unit summary */}
          <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '.85rem 1rem', marginBottom: 14 }}>
            <SectionHead label="Packet Will Include" />
            <InfoRow label="Tractor"       value={truckNum}   />
            <InfoRow label="Trailer"       value={trailerNum} />
            <InfoRow label="Load #"        value={loadNum}    />
            <InfoRow label="Order #"       value={orderNum}   />
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {openIssues.length > 0 && (
                <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--error)', padding: '3px 8px', borderRadius: 20, background: 'rgba(232,64,0,.1)', border: '1px solid rgba(232,64,0,.2)' }}>
                  {openIssues.length} open issue{openIssues.length > 1 ? 's' : ''}
                </span>
              )}
              {repairItems.length > 0 && (
                <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--warn)', padding: '3px 8px', borderRadius: 20, background: 'rgba(245,194,0,.1)', border: '1px solid rgba(245,194,0,.2)' }}>
                  {repairItems.length} in repair
                </span>
              )}
              {verifiedItems.length > 0 && (
                <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--success)', padding: '3px 8px', borderRadius: 20, background: 'rgba(0,200,100,.1)', border: '1px solid rgba(0,200,100,.2)' }}>
                  {verifiedItems.length} verified
                </span>
              )}
              {allDocs.length > 0 && (
                <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--primary)', padding: '3px 8px', borderRadius: 20, background: 'rgba(0,232,176,.1)', border: '1px solid rgba(0,232,176,.2)' }}>
                  {allDocs.length} doc{allDocs.length > 1 ? 's' : ''}
                </span>
              )}
              {relevantPretrips.length > 0 && (
                <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--primary)', padding: '3px 8px', borderRadius: 20, background: 'rgba(0,232,176,.1)', border: '1px solid rgba(0,232,176,.2)' }}>
                  {relevantPretrips.length} pre-trip{relevantPretrips.length > 1 ? 's' : ''}
                </span>
              )}
              {subjectEvents.length === 0 && relevantPretrips.length === 0 && (
                <span style={{ fontSize: '.72rem', color: 'var(--faint)' }}>No events found for this unit</span>
              )}
            </div>
          </div>

          {hasOOS && (
            <div style={{
              background: 'rgba(232,64,0,.1)', border: '1.5px solid var(--error)',
              borderRadius: 12, padding: '.7rem .9rem', marginBottom: 14,
            }}>
              <div style={{ fontWeight: 900, color: 'var(--error)', fontSize: '.9rem' }}>🛑 Out of Service on Record</div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 3 }}>
                This unit has an active OOS order. Packet will clearly show OOS status to enforcement officers.
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '.75rem 1.1rem 1.4rem', borderTop: '1px solid var(--border)' }}>
          <button onClick={handleGenerate} disabled={generating} style={{
            width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
            background: 'var(--primary)', color: '#000',
            fontWeight: 900, fontSize: '1rem', cursor: generating ? 'default' : 'pointer',
            opacity: generating ? .7 : 1,
          }}>
            {generating ? 'Generating…' : '📋 Generate DOT Packet'}
          </button>
        </div>
      </div>
    </>
  )
}

const secLabel: React.CSSProperties = {
  fontSize: '.68rem', fontWeight: 900, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6,
}
const inp: React.CSSProperties = {
  width: '100%', padding: '.55rem .75rem', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box',
}
