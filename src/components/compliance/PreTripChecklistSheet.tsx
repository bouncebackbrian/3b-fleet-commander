'use client'
/**
 * PreTripChecklistSheet — FMCSA-aligned 30-item pre-trip inspection
 *
 * Covers all 7 inspection groups: Engine / Lights / Tires / Brakes / Cab / Coupling / Trailer
 * Each item: Pass ✅ | Fail ❌ | N/A
 * Defects auto-aggregate, safe-to-operate checkbox, GPS + timestamp, sign-off.
 *
 * On save: writes PreTripRecord → logs pretrip_completed to timeline
 * On failures: offers to open ComplianceEventSheet
 */
import { useState, useEffect, useRef } from 'react'
import {
  PRETRIP_CHECKLIST,
  defaultPreTripList,
  savePreTripRecord,
  captureGPS,
  newPreTripRecord,
  type PreTripItem,
  type PreTripItemStatus,
  type PreTripRecord,
} from '@/lib/complianceEvents'
import { logTimelineEvent } from '@/lib/timeline'
import type { LoadMission } from '@/lib/dashboard/types'

// ── Checklist groups ──────────────────────────────────────────────────────────

const GROUPS: { label: string; emoji: string; ids: string[] }[] = [
  { label: 'Engine Compartment', emoji: '⚙️', ids: ['oil_level','coolant','belts_hoses','power_steering','battery'] },
  { label: 'Lights',             emoji: '💡', ids: ['headlights','tail_lights','turn_signals','marker_lights','hazards'] },
  { label: 'Tires & Wheels',     emoji: '🛞', ids: ['steer_tires','drive_tires','trailer_tires','lug_nuts'] },
  { label: 'Brakes',             emoji: '🛑', ids: ['air_pressure','brake_test','abs_light'] },
  { label: 'Cab',                emoji: '🚛', ids: ['mirrors','wipers','horn','seatbelt','fire_extinguisher','triangles'] },
  { label: 'Coupling',           emoji: '🔗', ids: ['fifth_wheel','landing_gear','glad_hands','electrical'] },
  { label: 'Trailer',            emoji: '🚚', ids: ['trailer_lights','trailer_brakes','mud_flaps','doors_sealed'] },
]

// ── Pill button ───────────────────────────────────────────────────────────────

function StatusPill({ status, target, onClick }: {
  status: PreTripItemStatus; target: PreTripItemStatus; onClick: () => void
}) {
  const configs: Record<PreTripItemStatus, { label: string; color: string; bg: string }> = {
    pass: { label: '✅ Pass', color: 'var(--success)', bg: 'rgba(0,200,100,.12)' },
    fail: { label: '❌ Fail', color: 'var(--error)',   bg: 'rgba(232,64,0,.12)'   },
    na:   { label: 'N/A',    color: 'var(--muted)',    bg: 'var(--surface)'        },
  }
  const c   = configs[target]
  const sel = status === target
  return (
    <button onClick={onClick} style={{
      padding: '.25rem .55rem', borderRadius: 20, fontSize: '.7rem', fontWeight: sel ? 800 : 600,
      border: `1.5px solid ${sel ? c.color : 'var(--border)'}`,
      background: sel ? c.bg : 'var(--surface-2)',
      color: sel ? c.color : 'var(--muted)',
      cursor: 'pointer', whiteSpace: 'nowrap',
    }}>
      {c.label}
    </button>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open:              boolean
  onClose:           () => void
  mission?:          LoadMission | null
  onNeedsCompliance?: () => void   // called after fail save → opens ComplianceEventSheet
}

export default function PreTripChecklistSheet({ open, onClose, mission, onNeedsCompliance }: Props) {
  const [record,       setRecord]       = useState<PreTripRecord | null>(null)
  const [items,        setItems]        = useState<PreTripItem[]>([])
  const [odometer,     setOdometer]     = useState('')
  const [safeToOp,     setSafeToOp]     = useState(true)
  const [gpsCapturing, setGpsCapturing] = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [saveError,    setSaveError]    = useState<string | null>(null)
  const [activeGroup,  setActiveGroup]  = useState(0)

  // Per-item note input refs aren't needed — inline state
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setSaved(false); setSaving(false); setActiveGroup(0)

    const fresh = newPreTripRecord({
      truckNumber:   mission?.tractorId,
      trailerNumber: mission?.trailerNum,
      loadId:        mission?.id,
      orderNumber:   mission?.orderNumber,
    })
    const freshItems = defaultPreTripList()
    setRecord(fresh)
    setItems(freshItems)
    setItemNotes({})
    setOdometer('')
    setSafeToOp(true)

    setGpsCapturing(true)
    captureGPS().then(pos => {
      setGpsCapturing(false)
      if (pos) {
        setRecord(prev => prev ? { ...prev, gpsLat: pos.lat, gpsLng: pos.lng } : prev)
      }
    })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !record) return null

  function setItemStatus(id: string, status: PreTripItemStatus) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i))
    // If any fail, suggest unsafe
    if (status === 'fail') setSafeToOp(false)
  }

  const failItems  = items.filter(i => i.status === 'fail')
  const passItems  = items.filter(i => i.status === 'pass')
  const failCount  = failItems.length
  const passCount  = passItems.length

  async function handleSave() {
    if (!record || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      // Merge notes into items
      const finalItems: PreTripItem[] = items.map(i => ({
        ...i,
        notes: itemNotes[i.id] ?? undefined,
      }))

      const result: 'pass' | 'fail' = failCount > 0 ? 'fail' : 'pass'

      const finalRecord: PreTripRecord = {
        ...record,
        items:     finalItems,
        result,
        failCount,
        signedOff: safeToOp,
        notes:     odometer ? `Odometer: ${odometer}` : '',
      }

      await savePreTripRecord(finalRecord)

      void logTimelineEvent(
        'pretrip_completed',
        'compliance_command',
        {
          result,
          failCount,
          passCount,
          safeToOperate: safeToOp,
          odometer:      odometer || null,
          truckNumber:   record.truckNumber,
          trailerNumber: record.trailerNumber,
        },
        record.loadId,
      )

      setSaved(true)
      setTimeout(() => {
        onClose()
        setSaved(false)
        if (result === 'fail' && onNeedsCompliance) {
          onNeedsCompliance()
        }
      }, 900)
    } catch (err) {
      setSaving(false)
      setSaveError(err instanceof Error ? err.message : 'Could not save — try again.')
    }
  }

  const currentGroupDef  = GROUPS[activeGroup]
  const currentGroupItems = items.filter(i => currentGroupDef.ids.includes(i.id))
  const groupFails = (g: typeof GROUPS[0]) =>
    items.filter(i => g.ids.includes(i.id) && i.status === 'fail').length

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        maxHeight: '94dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '.6rem 1.1rem .4rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>🚛 Pre-Trip Inspection</div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 1, display: 'flex', gap: 10 }}>
                {record.truckNumber && <span>🚛 {record.truckNumber}</span>}
                {record.trailerNumber && <span>🚚 {record.trailerNumber}</span>}
                {gpsCapturing && <span style={{ color: 'var(--primary)' }}>📍 locating…</span>}
                {!gpsCapturing && record.gpsLat && <span style={{ color: 'var(--success)' }}>📍 GPS locked</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--muted)' }}>✕</button>
          </div>

          {/* Progress strip */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, transition: 'width .3s',
                width: `${((passCount + failCount) / items.length) * 100}%`,
                background: failCount > 0 ? 'var(--error)' : 'var(--success)',
              }} />
            </div>
            <span style={{ fontSize: '.68rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              {passCount + failCount}/{items.length}
            </span>
            {failCount > 0 && (
              <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--error)' }}>
                ❌ {failCount} fail{failCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Group tabs — horizontal scroll */}
        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--border)', flexShrink: 0, paddingBottom: 0 }}>
          {GROUPS.map((g, idx) => {
            const fails = groupFails(g)
            const sel   = activeGroup === idx
            return (
              <button key={g.label} onClick={() => setActiveGroup(idx)} style={{
                padding: '.5rem .7rem', background: 'none', border: 'none',
                borderBottom: `2px solid ${sel ? (fails > 0 ? 'var(--error)' : 'var(--primary)') : 'transparent'}`,
                color: sel ? (fails > 0 ? 'var(--error)' : 'var(--primary)') : 'var(--muted)',
                fontSize: '.72rem', fontWeight: sel ? 800 : 600,
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span>{g.emoji}</span>
                <span>{g.label}</span>
                {fails > 0 && (
                  <span style={{
                    fontSize: '.6rem', background: 'var(--error)', color: '#fff',
                    borderRadius: 20, padding: '0 5px', fontWeight: 900,
                  }}>{fails}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem' }}>

          {/* Current group items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {currentGroupItems.map(item => (
              <div key={item.id} style={{
                background: 'var(--surface-2)', borderRadius: 12, padding: '.7rem .85rem',
                borderLeft: `3px solid ${item.status === 'fail' ? 'var(--error)' : item.status === 'pass' ? 'var(--success)' : 'var(--border)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: item.status === 'fail' ? 8 : 0 }}>
                  <span style={{
                    fontSize: '.88rem', fontWeight: 700,
                    color: item.status === 'fail' ? 'var(--error)' : item.status === 'pass' ? 'var(--text)' : 'var(--muted)',
                  }}>
                    {item.label}
                  </span>
                  <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                    <StatusPill status={item.status} target="pass" onClick={() => setItemStatus(item.id, 'pass')} />
                    <StatusPill status={item.status} target="fail" onClick={() => setItemStatus(item.id, 'fail')} />
                    <StatusPill status={item.status} target="na"   onClick={() => setItemStatus(item.id, 'na')}   />
                  </div>
                </div>
                {/* Notes field appears on fail */}
                {item.status === 'fail' && (
                  <input
                    placeholder="Describe defect…"
                    value={itemNotes[item.id] ?? ''}
                    onChange={e => setItemNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                    style={{
                      width: '100%', padding: '.45rem .65rem', borderRadius: 8,
                      border: '1px solid var(--error)', background: 'rgba(232,64,0,.06)',
                      color: 'var(--text)', fontSize: '.82rem', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Group nav arrows */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'space-between' }}>
            <button
              onClick={() => setActiveGroup(g => Math.max(0, g - 1))}
              disabled={activeGroup === 0}
              style={{
                flex: 1, padding: '.6rem', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--surface-2)', color: activeGroup === 0 ? 'var(--faint)' : 'var(--text)',
                fontWeight: 700, fontSize: '.82rem', cursor: activeGroup === 0 ? 'default' : 'pointer',
              }}
            >
              ← Prev
            </button>
            <button
              onClick={() => setActiveGroup(g => Math.min(GROUPS.length - 1, g + 1))}
              disabled={activeGroup === GROUPS.length - 1}
              style={{
                flex: 1, padding: '.6rem', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--surface-2)', color: activeGroup === GROUPS.length - 1 ? 'var(--faint)' : 'var(--text)',
                fontWeight: 700, fontSize: '.82rem', cursor: activeGroup === GROUPS.length - 1 ? 'default' : 'pointer',
              }}
            >
              Next →
            </button>
          </div>

          {/* Odometer + sign-off — show on last group */}
          {activeGroup === GROUPS.length - 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              <div style={{ fontSize: '.68rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Sign-off</div>
              <input
                placeholder="Odometer reading (optional)"
                type="number"
                value={odometer}
                onChange={e => setOdometer(e.target.value)}
                style={{
                  width: '100%', padding: '.55rem .75rem', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box',
                }}
              />

              {/* Defect summary */}
              {failCount > 0 && (
                <div style={{
                  background: 'rgba(232,64,0,.08)', border: '1.5px solid var(--error)',
                  borderRadius: 12, padding: '.75rem .9rem',
                }}>
                  <div style={{ fontWeight: 800, color: 'var(--error)', fontSize: '.88rem', marginBottom: 6 }}>
                    ❌ {failCount} Defect{failCount > 1 ? 's' : ''} Found
                  </div>
                  {failItems.map(i => (
                    <div key={i.id} style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 3 }}>
                      • {i.label}{itemNotes[i.id] ? `: ${itemNotes[i.id]}` : ''}
                    </div>
                  ))}
                </div>
              )}

              <label style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '.65rem .85rem', borderRadius: 12,
                border: `1.5px solid ${safeToOp ? 'var(--success)' : 'var(--error)'}`,
                background: safeToOp ? 'rgba(0,200,100,.08)' : 'rgba(232,64,0,.06)',
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={safeToOp}
                  onChange={e => setSafeToOp(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: safeToOp ? 'var(--success)' : 'var(--error)' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '.88rem', color: safeToOp ? 'var(--success)' : 'var(--error)' }}>
                    {safeToOp ? '✅ Vehicle safe to operate' : '🛑 Vehicle NOT safe to operate'}
                  </div>
                  <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 1 }}>
                    {safeToOp ? 'Driver certifies unit is roadworthy' : 'Do not dispatch — defects require repair'}
                  </div>
                </div>
              </label>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '.75rem 1.1rem 1.4rem', borderTop: '1px solid var(--border)' }}>
          {failCount > 0 && (
            <div style={{ fontSize: '.72rem', color: 'var(--warn)', fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>
              ⚠️ Save will prompt to log a compliance event for defects
            </div>
          )}
          {saveError && (
            <div style={{ marginBottom: '.6rem', padding: '.6rem .75rem', borderRadius: 10, background: 'rgba(232,64,0,.12)', color: 'var(--error)', fontSize: '.8rem', fontWeight: 700 }}>
              ⚠️ {saveError}
            </div>
          )}
          <button onClick={handleSave} disabled={saving || saved} style={{
            width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
            background: saved ? 'var(--success)' : failCount > 0 ? 'var(--error)' : 'var(--primary)',
            color: failCount > 0 && !saved ? '#fff' : '#000',
            fontWeight: 900, fontSize: '1rem',
            cursor: saving || saved ? 'default' : 'pointer', opacity: saving ? .7 : 1, transition: 'all .2s',
          }}>
            {saved    ? '✅ Saved'
            : saving  ? 'Saving…'
            : failCount > 0 ? `❌ Save — ${failCount} Defect${failCount > 1 ? 's' : ''} Found`
            : '✅ Sign Off — Vehicle Clear'}
          </button>
        </div>
      </div>
    </>
  )
}
