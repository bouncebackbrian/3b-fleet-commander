'use client'
/**
 * TireDepthPressureSheet — Tire depth & pressure log by position
 *
 * 18 tire positions: steer (2) + drive axle 1 (4) + drive axle 2 (4) + trailer axle 1 (4) + trailer axle 2 (4)
 * Per tire: PSI, depth (32nds), condition (good/worn/critical/replace), notes
 * Color-coded by condition. Critical/replace tires → offer compliance event.
 *
 * Saves TireLog → localStorage (3b-tire-logs) → Supabase async
 */
import { useState, useEffect, useRef } from 'react'
import {
  captureGPS,
  type TireReading,
  type TirePosition,
  type TireLog,
} from '@/lib/complianceEvents'
import { logTimelineEvent } from '@/lib/timeline'
import type { LoadMission } from '@/lib/dashboard/types'

// ── Tire position catalogue ───────────────────────────────────────────────────

interface TirePositionDef {
  id:     TirePosition
  label:  string
  short:  string
  axle:   string
}

const POSITIONS: TirePositionDef[] = [
  // Steer
  { id: 'steer_left',             label: 'Steer Left',              short: 'SL',  axle: 'Steer Axle' },
  { id: 'steer_right',            label: 'Steer Right',             short: 'SR',  axle: 'Steer Axle' },
  // Drive 1
  { id: 'drive1_left_outer',      label: 'Drive 1 Left Outer',      short: 'D1LO', axle: 'Drive Axle 1' },
  { id: 'drive1_left_inner',      label: 'Drive 1 Left Inner',      short: 'D1LI', axle: 'Drive Axle 1' },
  { id: 'drive1_right_inner',     label: 'Drive 1 Right Inner',     short: 'D1RI', axle: 'Drive Axle 1' },
  { id: 'drive1_right_outer',     label: 'Drive 1 Right Outer',     short: 'D1RO', axle: 'Drive Axle 1' },
  // Drive 2
  { id: 'drive2_left_outer',      label: 'Drive 2 Left Outer',      short: 'D2LO', axle: 'Drive Axle 2' },
  { id: 'drive2_left_inner',      label: 'Drive 2 Left Inner',      short: 'D2LI', axle: 'Drive Axle 2' },
  { id: 'drive2_right_inner',     label: 'Drive 2 Right Inner',     short: 'D2RI', axle: 'Drive Axle 2' },
  { id: 'drive2_right_outer',     label: 'Drive 2 Right Outer',     short: 'D2RO', axle: 'Drive Axle 2' },
  // Trailer 1
  { id: 'trailer1_left_outer',    label: 'Trailer 1 Left Outer',    short: 'T1LO', axle: 'Trailer Axle 1' },
  { id: 'trailer1_left_inner',    label: 'Trailer 1 Left Inner',    short: 'T1LI', axle: 'Trailer Axle 1' },
  { id: 'trailer1_right_inner',   label: 'Trailer 1 Right Inner',   short: 'T1RI', axle: 'Trailer Axle 1' },
  { id: 'trailer1_right_outer',   label: 'Trailer 1 Right Outer',   short: 'T1RO', axle: 'Trailer Axle 1' },
  // Trailer 2
  { id: 'trailer2_left_outer',    label: 'Trailer 2 Left Outer',    short: 'T2LO', axle: 'Trailer Axle 2' },
  { id: 'trailer2_left_inner',    label: 'Trailer 2 Left Inner',    short: 'T2LI', axle: 'Trailer Axle 2' },
  { id: 'trailer2_right_inner',   label: 'Trailer 2 Right Inner',   short: 'T2RI', axle: 'Trailer Axle 2' },
  { id: 'trailer2_right_outer',   label: 'Trailer 2 Right Outer',   short: 'T2RO', axle: 'Trailer Axle 2' },
]

const AXLE_GROUPS = ['Steer Axle', 'Drive Axle 1', 'Drive Axle 2', 'Trailer Axle 1', 'Trailer Axle 2'] as const
type AxleGroup = typeof AXLE_GROUPS[number]

type Condition = 'good' | 'worn' | 'critical' | 'replace'
const CONDITION_META: Record<Condition, { label: string; color: string; psi_min?: number; depth_min?: number }> = {
  good:     { label: 'Good',     color: 'var(--success)', psi_min: 90,  depth_min: 8 },
  worn:     { label: 'Worn',     color: 'var(--warn)',    psi_min: 75,  depth_min: 4 },
  critical: { label: 'Critical', color: 'var(--error)',   psi_min: 60,  depth_min: 2 },
  replace:  { label: 'Replace',  color: '#ff3860'                                      },
}

// Auto-compute condition from depth (32nds) — DOT thresholds
function autoCondition(depth: number | null, psi: number | null): Condition {
  if (depth === null && psi === null) return 'good'
  // DOT minimum: 4/32nds steer, 2/32nds other
  if (depth !== null) {
    if (depth <= 2)  return 'replace'
    if (depth <= 4)  return 'critical'
    if (depth <= 6)  return 'worn'
  }
  if (psi !== null) {
    if (psi < 60)   return 'replace'
    if (psi < 75)   return 'critical'
    if (psi < 90)   return 'worn'
  }
  return 'good'
}

// ── localStorage for tire logs ────────────────────────────────────────────────

const LS_KEY = '3b-tire-logs'
const MAX_LOGS = 500

function saveTireLog(log: TireLog): void {
  try {
    const existing: TireLog[] = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
    existing.unshift(log)
    localStorage.setItem(LS_KEY, JSON.stringify(existing.slice(0, MAX_LOGS)))
  } catch { /* storage full */ }
}

// ── Reading row ───────────────────────────────────────────────────────────────

interface ReadingRow {
  position:    TirePosition
  psi:         string
  depth:       string
  condition:   Condition
  notes:       string
  auto:        boolean   // condition was auto-computed
}

function mkRows(): ReadingRow[] {
  return POSITIONS.map(p => ({
    position:  p.id,
    psi:       '',
    depth:     '',
    condition: 'good',
    notes:     '',
    auto:      true,
  }))
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open:              boolean
  onClose:           () => void
  mission?:          LoadMission | null
  onNeedsCompliance?: () => void
}

export default function TireDepthPressureSheet({ open, onClose, mission, onNeedsCompliance }: Props) {
  const [rows,         setRows]         = useState<ReadingRow[]>(mkRows())
  const [activeAxle,   setActiveAxle]   = useState<AxleGroup>('Steer Axle')
  const [gpsCapturing, setGpsCapturing] = useState(false)
  const [gpsPos,       setGpsPos]       = useState<{ lat: number; lng: number } | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [globalNotes,  setGlobalNotes]  = useState('')

  useEffect(() => {
    if (!open) return
    setRows(mkRows())
    setActiveAxle('Steer Axle')
    setSaved(false); setSaving(false); setGlobalNotes('')
    setGpsPos(null)

    setGpsCapturing(true)
    captureGPS().then(pos => {
      setGpsCapturing(false)
      setGpsPos(pos)
    })
  }, [open])

  if (!open) return null

  function updateRow(pos: TirePosition, field: keyof ReadingRow, value: string | Condition | boolean) {
    setRows(prev => prev.map(r => {
      if (r.position !== pos) return r
      const updated = { ...r, [field]: value }
      // Recompute condition if PSI or depth changed and still in auto mode
      if ((field === 'psi' || field === 'depth') && r.auto) {
        updated.condition = autoCondition(
          field === 'depth' ? (value ? parseFloat(value as string) : null) : (r.depth ? parseFloat(r.depth) : null),
          field === 'psi'   ? (value ? parseFloat(value as string) : null) : (r.psi   ? parseFloat(r.psi)   : null),
        )
      }
      if (field === 'condition') {
        updated.auto = false   // manual override disables auto
      }
      return updated
    }))
  }

  function bulkSetAll(condition: Condition) {
    setRows(prev => prev.map(r => ({ ...r, condition, auto: false })))
  }

  const axleRows = rows.filter(r => {
    const def = POSITIONS.find(p => p.id === r.position)!
    return def.axle === activeAxle
  })

  const criticalOrReplace = rows.filter(r => r.condition === 'critical' || r.condition === 'replace')
  const filledCount = rows.filter(r => r.psi !== '' || r.depth !== '').length

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const readings: TireReading[] = rows
        .filter(r => r.psi !== '' || r.depth !== '' || r.notes !== '')
        .map(r => ({
          position:    r.position,
          depthThirty: r.depth ? parseFloat(r.depth) : null,
          pressurePsi: r.psi   ? parseFloat(r.psi)   : null,
          condition:   r.condition,
          notes:       r.notes || undefined,
        }))

      const log: TireLog = {
        id:            crypto.randomUUID(),
        truckNumber:   mission?.tractorId,
        trailerNumber: mission?.trailerNum,
        loadId:        mission?.id,
        readings,
        notes:         globalNotes,
        gpsLat:        gpsPos?.lat,
        gpsLng:        gpsPos?.lng,
        createdAt:     new Date().toISOString(),
      }

      saveTireLog(log)

      // Log timeline event
      void logTimelineEvent(
        'inspection_verified',
        'compliance_command',
        {
          type:          'tire_log',
          readingCount:  readings.length,
          criticalCount: criticalOrReplace.length,
          truckNumber:   mission?.tractorId,
          trailerNumber: mission?.trailerNum,
        },
        mission?.id,
      )

      setSaved(true)
      setTimeout(() => {
        onClose()
        setSaved(false)
        if (criticalOrReplace.length > 0 && onNeedsCompliance) {
          onNeedsCompliance()
        }
      }, 900)
    } catch {
      setSaving(false)
    }
  }

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
              <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>🛞 Tire Depth & Pressure</div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 1, display: 'flex', gap: 10 }}>
                {mission?.tractorId   && <span>🚛 {mission.tractorId}</span>}
                {mission?.trailerNum  && <span>🚚 {mission.trailerNum}</span>}
                {gpsCapturing && <span style={{ color: 'var(--primary)' }}>📍 locating…</span>}
                {!gpsCapturing && gpsPos && <span style={{ color: 'var(--success)' }}>📍 GPS locked</span>}
                {filledCount > 0 && <span style={{ color: 'var(--primary)' }}>{filledCount} tire{filledCount > 1 ? 's' : ''} logged</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--muted)' }}>✕</button>
          </div>

          {/* Status chips */}
          {criticalOrReplace.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {rows.filter(r => r.condition === 'replace').length > 0 && (
                <span style={{ fontSize: '.68rem', fontWeight: 800, color: '#fff', background: '#ff3860', padding: '2px 8px', borderRadius: 20 }}>
                  {rows.filter(r => r.condition === 'replace').length} REPLACE
                </span>
              )}
              {rows.filter(r => r.condition === 'critical').length > 0 && (
                <span style={{ fontSize: '.68rem', fontWeight: 800, color: '#fff', background: 'var(--error)', padding: '2px 8px', borderRadius: 20 }}>
                  {rows.filter(r => r.condition === 'critical').length} CRITICAL
                </span>
              )}
              {rows.filter(r => r.condition === 'worn').length > 0 && (
                <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--warn)', background: 'rgba(245,194,0,.12)', padding: '2px 8px', borderRadius: 20, border: '1px solid var(--warn)' }}>
                  {rows.filter(r => r.condition === 'worn').length} WORN
                </span>
              )}
            </div>
          )}
        </div>

        {/* Axle tabs */}
        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {AXLE_GROUPS.map(axle => {
            const axleRowsForAxle = rows.filter(r => {
              const def = POSITIONS.find(p => p.id === r.position)!
              return def.axle === axle
            })
            const hasCrit = axleRowsForAxle.some(r => r.condition === 'critical' || r.condition === 'replace')
            const hasWorn = axleRowsForAxle.some(r => r.condition === 'worn')
            const sel = activeAxle === axle
            return (
              <button key={axle} onClick={() => setActiveAxle(axle)} style={{
                padding: '.5rem .75rem', background: 'none', border: 'none', flexShrink: 0,
                borderBottom: `2px solid ${sel ? (hasCrit ? 'var(--error)' : hasWorn ? 'var(--warn)' : 'var(--primary)') : 'transparent'}`,
                color: sel ? (hasCrit ? 'var(--error)' : hasWorn ? 'var(--warn)' : 'var(--primary)') : 'var(--muted)',
                fontSize: '.72rem', fontWeight: sel ? 800 : 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                {axle}
                {(hasCrit || hasWorn) && (
                  <span style={{
                    marginLeft: 4, fontSize: '.6rem', padding: '1px 5px', borderRadius: 20,
                    background: hasCrit ? 'var(--error)' : 'var(--warn)', color: '#fff', fontWeight: 900,
                  }}>!</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Bulk actions */}
        <div style={{ display: 'flex', gap: 6, padding: '.6rem 1.1rem .4rem', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
          <span style={{ fontSize: '.68rem', color: 'var(--muted)', fontWeight: 700, paddingTop: 2, whiteSpace: 'nowrap' }}>Bulk:</span>
          {(Object.keys(CONDITION_META) as Condition[]).map(c => (
            <button key={c} onClick={() => bulkSetAll(c)} style={{
              padding: '.22rem .6rem', borderRadius: 20, fontSize: '.68rem', fontWeight: 700,
              border: `1px solid ${CONDITION_META[c].color}`, background: `${CONDITION_META[c].color}18`,
              color: CONDITION_META[c].color, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              All {CONDITION_META[c].label}
            </button>
          ))}
        </div>

        {/* Tire grid for active axle */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {axleRows.map(row => {
              const def  = POSITIONS.find(p => p.id === row.position)!
              const cond = CONDITION_META[row.condition]
              return (
                <div key={row.position} style={{
                  background: 'var(--surface-2)', borderRadius: 12,
                  borderLeft: `4px solid ${cond.color}`,
                  padding: '.7rem .85rem',
                }}>
                  {/* Tire label + condition pill */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: '.88rem' }}>{def.short}</span>
                      <span style={{ fontSize: '.72rem', color: 'var(--muted)', marginLeft: 6 }}>{def.label}</span>
                    </div>
                    {/* Condition select */}
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(Object.keys(CONDITION_META) as Condition[]).map(c => {
                        const cm  = CONDITION_META[c]
                        const sel = row.condition === c
                        return (
                          <button key={c} onClick={() => updateRow(row.position, 'condition', c)} style={{
                            padding: '.18rem .45rem', borderRadius: 20, fontSize: '.62rem', fontWeight: sel ? 800 : 600,
                            border: `1px solid ${sel ? cm.color : 'var(--border)'}`,
                            background: sel ? `${cm.color}22` : 'var(--surface)',
                            color: sel ? cm.color : 'var(--muted)', cursor: 'pointer',
                          }}>
                            {cm.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Inputs */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>PSI</div>
                      <input
                        type="number"
                        placeholder="e.g. 105"
                        value={row.psi}
                        onChange={e => updateRow(row.position, 'psi', e.target.value)}
                        style={{
                          width: '100%', padding: '.45rem .6rem', borderRadius: 8,
                          border: `1px solid ${row.psi && parseFloat(row.psi) < 75 ? 'var(--error)' : 'var(--border)'}`,
                          background: 'var(--surface)', color: 'var(--text)', fontSize: '.85rem',
                          outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Depth (32nds)</div>
                      <input
                        type="number"
                        placeholder="e.g. 10"
                        value={row.depth}
                        onChange={e => updateRow(row.position, 'depth', e.target.value)}
                        style={{
                          width: '100%', padding: '.45rem .6rem', borderRadius: 8,
                          border: `1px solid ${row.depth && parseFloat(row.depth) <= 4 ? 'var(--error)' : 'var(--border)'}`,
                          background: 'var(--surface)', color: 'var(--text)', fontSize: '.85rem',
                          outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Notes</div>
                      <input
                        placeholder="Damage, etc."
                        value={row.notes}
                        onChange={e => updateRow(row.position, 'notes', e.target.value)}
                        style={{
                          width: '100%', padding: '.45rem .6rem', borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--surface)', color: 'var(--text)', fontSize: '.82rem',
                          outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  {/* DOT threshold hint */}
                  {row.depth && parseFloat(row.depth) <= 4 && (
                    <div style={{ fontSize: '.65rem', color: 'var(--error)', fontWeight: 700, marginTop: 4 }}>
                      ⚠️ Below DOT minimum ({parseFloat(row.depth) <= 2 ? '≤ 2/32" — replace immediately' : '≤ 4/32" — steer tire limit'})
                    </div>
                  )}
                  {row.psi && parseFloat(row.psi) < 75 && (
                    <div style={{ fontSize: '.65rem', color: 'var(--error)', fontWeight: 700, marginTop: 4 }}>
                      ⚠️ Low pressure — check for leak / inflate to spec
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Global notes + axle nav */}
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              placeholder="Overall notes (optional)"
              value={globalNotes}
              onChange={e => setGlobalNotes(e.target.value)}
              style={{
                width: '100%', padding: '.55rem .75rem', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box',
              }}
            />
            {/* DOT reference */}
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '.65rem .85rem' }}>
              <div style={{ fontSize: '.65rem', fontWeight: 900, color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>DOT Minimums</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>🔴 Steer: <strong style={{ color: 'var(--text)' }}>4/32"</strong></span>
                <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>🔴 Other: <strong style={{ color: 'var(--text)' }}>2/32"</strong></span>
                <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>💨 PSI: <strong style={{ color: 'var(--text)' }}>per mfg spec</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '.75rem 1.1rem 1.4rem', borderTop: '1px solid var(--border)' }}>
          {criticalOrReplace.length > 0 && (
            <div style={{ fontSize: '.72rem', color: 'var(--error)', fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>
              🛑 {criticalOrReplace.length} tire{criticalOrReplace.length > 1 ? 's' : ''} critical/replace — compliance event recommended
            </div>
          )}
          <button onClick={handleSave} disabled={saving || saved} style={{
            width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
            background: saved ? 'var(--success)' : criticalOrReplace.length > 0 ? 'var(--error)' : 'var(--primary)',
            color: criticalOrReplace.length > 0 && !saved ? '#fff' : '#000',
            fontWeight: 900, fontSize: '1rem',
            cursor: saving || saved ? 'default' : 'pointer', opacity: saving ? .7 : 1, transition: 'all .2s',
          }}>
            {saved   ? '✅ Saved'
            : saving ? 'Saving…'
            : filledCount > 0
              ? `🛞 Save ${filledCount} Reading${filledCount > 1 ? 's' : ''}`
              : '🛞 Save Tire Log'}
          </button>
        </div>
      </div>
    </>
  )
}
