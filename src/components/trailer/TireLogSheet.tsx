'use client'
/**
 * TireLogSheet — PSI + tread depth input grid for all 18 tire positions.
 *
 * Uses trailerIntelligence.ts types and saveTireLog().
 * Groups by axle: Steer / Drive 1 / Drive 2 / Trailer 1 / Trailer 2.
 * Auto-rates condition from DOT thresholds. Color-coded alerts.
 * Writes to fleet_tire_logs via Supabase async (write-through).
 */
import { useState, useEffect } from 'react'
import {
  TIRE_POSITION_META,
  saveTireLog,
  getActiveContext,
  type TirePosition,
  type TireReading,
} from '@/lib/trailerIntelligence'

interface Props {
  open:           boolean
  onClose:        () => void
  trailerNumber?: string
  truckNumber?:   string
  loadId?:        string
}

// ── Position groups ───────────────────────────────────────────────────────────

const AXLE_GROUPS: { id: string; label: string; positions: TirePosition[] }[] = [
  { id: 'steer',  label: 'Steer',     positions: ['steer_L', 'steer_R'] },
  { id: 'drive1', label: 'Drive 1',   positions: ['drive1_LO', 'drive1_LI', 'drive1_RI', 'drive1_RO'] },
  { id: 'drive2', label: 'Drive 2',   positions: ['drive2_LO', 'drive2_LI', 'drive2_RI', 'drive2_RO'] },
  { id: 'trail1', label: 'Trailer 1', positions: ['trail1_LO', 'trail1_LI', 'trail1_RI', 'trail1_RO'] },
  { id: 'trail2', label: 'Trailer 2', positions: ['trail2_LO', 'trail2_LI', 'trail2_RI', 'trail2_RO'] },
]

type Condition = TireReading['condition']

const COND_META: Record<Condition, { label: string; color: string }> = {
  good:      { label: 'Good',    color: 'var(--success)'  },
  worn:      { label: 'Worn',    color: 'var(--warn)'     },
  low_tread: { label: 'Low',     color: 'var(--warn)'     },
  flat:      { label: 'Flat',    color: 'var(--error)'    },
  bulge:     { label: 'Bulge',   color: 'var(--error)'    },
  replace:   { label: 'Replace', color: '#ff3860'         },
}

interface Row {
  position:  TirePosition
  psi:       string
  tread:     string
  condition: Condition
  note:      string
  manual:    boolean  // condition manually overridden
}

function makeRows(): Row[] {
  return (Object.keys(TIRE_POSITION_META) as TirePosition[]).map(pos => ({
    position:  pos,
    psi:       '',
    tread:     '',
    condition: 'good',
    note:      '',
    manual:    false,
  }))
}

function autoCondition(pos: TirePosition, tread: string, psi: string): Condition {
  const meta   = TIRE_POSITION_META[pos]
  const t      = tread ? parseFloat(tread) : null
  const p      = psi   ? parseFloat(psi)   : null

  if (t !== null) {
    if (t <= 2)              return 'replace'
    if (t <= meta.minTread)  return 'low_tread'
    if (t <= meta.minTread + 2) return 'worn'
  }
  if (p !== null) {
    if (p < meta.targetPsi * 0.70) return 'flat'
    if (p < meta.targetPsi * 0.80) return 'worn'
  }
  return 'good'
}

export default function TireLogSheet({ open, onClose, trailerNumber, truckNumber, loadId }: Props) {
  const [rows,        setRows]        = useState<Row[]>(makeRows())
  const [activeAxle,  setActiveAxle]  = useState(0)
  const [globalNotes, setGlobalNotes] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [truckNum,    setTruckNum]    = useState('')
  const [trailerNum,  setTrailerNum]  = useState('')

  useEffect(() => {
    if (!open) return
    const ctx = getActiveContext()
    setTruckNum(truckNumber ?? ctx.truckNumber)
    setTrailerNum(trailerNumber ?? ctx.trailerNumber)
    setRows(makeRows())
    setActiveAxle(0)
    setGlobalNotes('')
    setSaved(false)
    setSaving(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  function updateRow(pos: TirePosition, field: 'psi' | 'tread' | 'note', value: string) {
    setRows(prev => prev.map(r => {
      if (r.position !== pos) return r
      const updated = { ...r, [field]: value }
      if (!r.manual && (field === 'psi' || field === 'tread')) {
        updated.condition = autoCondition(pos, field === 'tread' ? value : r.tread, field === 'psi' ? value : r.psi)
      }
      return updated
    }))
  }

  function setCondition(pos: TirePosition, condition: Condition) {
    setRows(prev => prev.map(r => r.position === pos ? { ...r, condition, manual: true } : r))
  }

  const axle    = AXLE_GROUPS[activeAxle]
  const axleRows = rows.filter(r => axle.positions.includes(r.position))

  const critRows    = rows.filter(r => r.condition === 'flat' || r.condition === 'replace' || r.condition === 'bulge')
  const warnRows    = rows.filter(r => r.condition === 'worn' || r.condition === 'low_tread')
  const filledCount = rows.filter(r => r.psi || r.tread).length

  function axleHasCrit(a: typeof AXLE_GROUPS[0]) {
    return rows.filter(r => a.positions.includes(r.position)).some(r => r.condition === 'flat' || r.condition === 'replace' || r.condition === 'bulge')
  }
  function axleHasWarn(a: typeof AXLE_GROUPS[0]) {
    return rows.filter(r => a.positions.includes(r.position)).some(r => r.condition === 'worn' || r.condition === 'low_tread')
  }

  async function handleSave() {
    if (saving || saved) return
    setSaving(true)
    try {
      const readings: TireReading[] = rows
        .filter(r => r.psi || r.tread || r.note || r.condition !== 'good')
        .map(r => ({
          position:   r.position,
          treadDepth: r.tread ? parseFloat(r.tread) : undefined,
          psi:        r.psi   ? parseFloat(r.psi)   : undefined,
          condition:  r.condition,
          note:       r.note || undefined,
        }))

      await saveTireLog({
        truckNumber:   truckNum,
        trailerNumber: trailerNum,
        loadId:        loadId,
        readings,
        notes:         globalNotes,
      })

      setSaved(true)
      setTimeout(() => {
        onClose()
        setSaved(false)
      }, 900)
    } catch {
      setSaving(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        maxHeight: '95dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '.6rem 1.1rem .5rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>🔵 Tire PSI + Tread Log</div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 10 }}>
                {truckNum   && <span>🚛 {truckNum}</span>}
                {trailerNum && <span>🚚 {trailerNum}</span>}
                {filledCount > 0 && <span style={{ color: 'var(--primary)' }}>{filledCount} tire{filledCount !== 1 ? 's' : ''} logged</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--muted)' }}>✕</button>
          </div>

          {/* Alert chips */}
          {(critRows.length > 0 || warnRows.length > 0) && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {critRows.length > 0 && (
                <span style={{ fontSize: '.65rem', fontWeight: 900, color: '#fff', background: 'var(--error)', padding: '2px 8px', borderRadius: 20 }}>
                  🛑 {critRows.length} CRITICAL
                </span>
              )}
              {warnRows.length > 0 && (
                <span style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--warn)', background: 'rgba(245,194,0,.12)', padding: '2px 8px', borderRadius: 20, border: '1px solid var(--warn)' }}>
                  ⚠️ {warnRows.length} WARN
                </span>
              )}
            </div>
          )}
        </div>

        {/* Axle tabs */}
        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {AXLE_GROUPS.map((a, idx) => {
            const hasCrit = axleHasCrit(a)
            const hasWarn = axleHasWarn(a)
            const sel     = activeAxle === idx
            return (
              <button key={a.id} onClick={() => setActiveAxle(idx)} style={{
                padding: '.5rem .75rem', background: 'none', border: 'none', flexShrink: 0,
                borderBottom: `2px solid ${sel ? (hasCrit ? 'var(--error)' : hasWarn ? 'var(--warn)' : 'var(--primary)') : 'transparent'}`,
                color: sel ? (hasCrit ? 'var(--error)' : hasWarn ? 'var(--warn)' : 'var(--primary)') : 'var(--muted)',
                fontSize: '.72rem', fontWeight: sel ? 800 : 600, cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {a.label}
                {(hasCrit || hasWarn) && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: hasCrit ? 'var(--error)' : 'var(--warn)', display: 'inline-block', flexShrink: 0 }} />
                )}
              </button>
            )
          })}
        </div>

        {/* Tire rows */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {axleRows.map(row => {
              const meta = TIRE_POSITION_META[row.position]
              const cond = COND_META[row.condition]
              const isCrit = row.condition === 'flat' || row.condition === 'replace' || row.condition === 'bulge'
              return (
                <div key={row.position} style={{
                  background: 'var(--surface-2)', borderRadius: 12, padding: '.75rem .9rem',
                  borderLeft: `4px solid ${cond.color}`,
                }}>
                  {/* Label + condition pills */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: '.9rem' }}>{meta.label}</span>
                      <span style={{ fontSize: '.65rem', color: 'var(--muted)', marginLeft: 6 }}>
                        target {meta.targetPsi} PSI · min {meta.minTread}/32"
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {(['good','worn','low_tread','flat','bulge','replace'] as Condition[]).map(c => {
                        const cm  = COND_META[c]
                        const sel = row.condition === c
                        return (
                          <button key={c} onClick={() => setCondition(row.position, c)} style={{
                            padding: '.15rem .4rem', borderRadius: 20, fontSize: '.6rem', fontWeight: sel ? 900 : 600,
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

                  {/* Input row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>PSI</div>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder={`~${meta.targetPsi}`}
                        value={row.psi}
                        onChange={e => updateRow(row.position, 'psi', e.target.value)}
                        style={{
                          width: '100%', padding: '.45rem .55rem', borderRadius: 8,
                          border: `1px solid ${row.psi && parseFloat(row.psi) < meta.targetPsi * 0.8 ? 'var(--error)' : 'var(--border)'}`,
                          background: 'var(--surface)', color: 'var(--text)', fontSize: '.88rem',
                          outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Tread (32nds)</div>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder={`min ${meta.minTread}`}
                        value={row.tread}
                        onChange={e => updateRow(row.position, 'tread', e.target.value)}
                        style={{
                          width: '100%', padding: '.45rem .55rem', borderRadius: 8,
                          border: `1px solid ${row.tread && parseFloat(row.tread) <= meta.minTread ? 'var(--error)' : 'var(--border)'}`,
                          background: 'var(--surface)', color: 'var(--text)', fontSize: '.88rem',
                          outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Note</div>
                      <input
                        placeholder="Damage, bulge…"
                        value={row.note}
                        onChange={e => updateRow(row.position, 'note', e.target.value)}
                        style={{
                          width: '100%', padding: '.45rem .55rem', borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--surface)', color: 'var(--text)', fontSize: '.82rem',
                          outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  {/* Threshold warnings */}
                  {isCrit && (
                    <div style={{ marginTop: 6, fontSize: '.65rem', fontWeight: 800, color: 'var(--error)' }}>
                      🛑 {row.condition === 'flat' ? 'Flat tire — do not drive' : row.condition === 'bulge' ? 'Bulge — replace immediately' : `${row.tread}/32" — below DOT minimum`}
                    </div>
                  )}
                  {!isCrit && row.tread && parseFloat(row.tread) <= meta.minTread + 2 && (
                    <div style={{ marginTop: 6, fontSize: '.65rem', fontWeight: 700, color: 'var(--warn)' }}>
                      ⚠️ {parseFloat(row.tread)}/32" — approaching DOT minimum ({meta.minTread}/32")
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Global notes + DOT reference */}
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

            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '.65rem .85rem' }}>
              <div style={{ fontSize: '.62rem', fontWeight: 900, color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>DOT Minimums</div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>Steer: <strong style={{ color: 'var(--text)' }}>4/32"</strong></span>
                <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>Other: <strong style={{ color: 'var(--text)' }}>2/32"</strong></span>
                <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>Steer PSI: <strong style={{ color: 'var(--text)' }}>110</strong></span>
                <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>Drive/Trail: <strong style={{ color: 'var(--text)' }}>100</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '.75rem 1.1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
          {critRows.length > 0 && (
            <div style={{ fontSize: '.72rem', color: 'var(--error)', fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>
              🛑 {critRows.length} tire{critRows.length !== 1 ? 's' : ''} critical — log compliance event
            </div>
          )}
          <button onClick={handleSave} disabled={saving || saved} style={{
            width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
            background: saved ? 'var(--success)' : critRows.length > 0 ? 'var(--error)' : 'var(--primary)',
            color: (critRows.length > 0 && !saved) ? '#fff' : '#000',
            fontWeight: 900, fontSize: '1rem',
            cursor: saving || saved ? 'default' : 'pointer', opacity: saving ? .7 : 1, transition: 'all .2s',
          }}>
            {saved   ? '✅ Saved'
            : saving ? 'Saving…'
            : filledCount > 0
              ? `🔵 Save ${filledCount} Reading${filledCount !== 1 ? 's' : ''}`
              : '🔵 Save Tire Log'}
          </button>
        </div>
      </div>
    </>
  )
}
