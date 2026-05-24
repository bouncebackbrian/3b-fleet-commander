'use client'
/**
 * TireReinspectionSheet — Roadside tire recheck quick-tap UX
 *
 * Opens over an active TireLog. For each flagged tire position the driver
 * taps: ✅ Same  /  ⚠️ Worse  /  👍 Better  /  📸 Photo (stub)
 *
 * On save:
 *  1. Writes a TireReinspection to localStorage + Supabase async
 *  2. Computes overallStatus via computeMonitorStatus
 *  3. Returns the saved record so the parent can refresh its monitor banner
 */
import { useState, useEffect } from 'react'
import {
  getLastTireLog,
  saveReinspection,
  computeMonitorStatus,
  getActiveContext,
  TIRE_POSITION_META,
  type TireComparison,
  type TireMonitorStatus,
  type TirePosition,
  type TireReading,
  type TireReinspection,
} from '@/lib/trailerIntelligence'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  const d    = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hrs  = Math.floor(diff / 3600000)
  if (mins < 2)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hrs  < 24) return `${hrs}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const COMPARISON_META: Record<TireComparison, { label: string; emoji: string; color: string; bg: string }> = {
  better: { label: 'Better', emoji: '👍', color: 'var(--success)', bg: 'rgba(0,232,176,.12)' },
  same:   { label: 'Same',   emoji: '✅', color: 'var(--primary)', bg: 'rgba(0,232,176,.08)' },
  worse:  { label: 'Worse',  emoji: '⚠️', color: 'var(--warn)',    bg: 'rgba(245,194,0,.10)'  },
}

const COND_COLOR: Record<string, string> = {
  good:      'var(--success)',
  worn:      'var(--warn)',
  low_tread: 'var(--warn)',
  flat:      'var(--error)',
  bulge:     'var(--error)',
  replace:   '#ff3860',
}

const MONITOR_META: Record<TireMonitorStatus, { label: string; color: string; emoji: string }> = {
  stable_monitoring: { label: 'Stable — Monitor', color: 'var(--primary)', emoji: '🔵' },
  worsening:         { label: 'Worsening',         color: 'var(--warn)',    emoji: '⚠️'  },
  service_needed:    { label: 'Service Needed',    color: 'var(--error)',   emoji: '🛑'  },
  resolved:          { label: 'Resolved',          color: 'var(--success)', emoji: '✅'  },
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open:           boolean
  onClose:        () => void
  onSaved:        (r: TireReinspection) => void
  trailerNumber?: string
  truckNumber?:   string
  loadId?:        string
}

interface RowState {
  reading:    TireReading
  comparison: TireComparison | null
  note:       string
}

export default function TireReinspectionSheet({
  open, onClose, onSaved, trailerNumber, truckNumber, loadId,
}: Props) {
  const [rows,       setRows]       = useState<RowState[]>([])
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [baseLogId,  setBaseLogId]  = useState('')
  const [baseLogAt,  setBaseLogAt]  = useState('')
  const [truckNum,   setTruckNum]   = useState('')
  const [trailerNum, setTrailerNum] = useState('')

  useEffect(() => {
    if (!open) return
    const ctx = getActiveContext()
    const tn  = trailerNumber ?? ctx.trailerNumber
    const tk  = truckNumber  ?? ctx.truckNumber
    setTruckNum(tk)
    setTrailerNum(tn)
    const baseLog = getLastTireLog(tn)
    if (!baseLog) { setRows([]); return }
    setBaseLogId(baseLog.id)
    setBaseLogAt(baseLog.createdAt)
    // Pre-populate flagged positions; allow tapping any of them
    const flagged = baseLog.readings.filter(r => r.condition !== 'good')
    setRows(flagged.map(r => ({ reading: r, comparison: null, note: '' })))
    setNotes('')
    setSaved(false)
    setSaving(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  function setComparison(pos: TirePosition, comp: TireComparison) {
    setRows(prev => prev.map(r =>
      r.reading.position === pos ? { ...r, comparison: comp } : r,
    ))
  }

  function setNote(pos: TirePosition, note: string) {
    setRows(prev => prev.map(r =>
      r.reading.position === pos ? { ...r, note } : r,
    ))
  }

  const checkedRows  = rows.filter(r => r.comparison !== null)
  const canSave      = checkedRows.length > 0 && !saving && !saved

  // Derive the worst overall status from checked positions
  function deriveOverall(): TireMonitorStatus {
    const statuses = checkedRows.map(r => {
      const { status } = computeMonitorStatus(r.reading, r.comparison ? [r.comparison] : [])
      return status
    })
    if (statuses.includes('service_needed'))   return 'service_needed'
    if (statuses.includes('worsening'))        return 'worsening'
    if (statuses.every(s => s === 'resolved')) return 'resolved'
    return 'stable_monitoring'
  }

  async function handleSave() {
    if (!canSave || !baseLogId) return
    setSaving(true)
    try {
      const overall = deriveOverall()
      const saved   = await saveReinspection({
        truckNumber:   truckNum,
        trailerNumber: trailerNum,
        loadId,
        baseTireLogId: baseLogId,
        readings: checkedRows.map(r => ({
          position:   r.reading.position,
          comparison: r.comparison!,
          note:       r.note || undefined,
        })),
        overallStatus: overall,
        notes,
      })
      setSaved(true)
      onSaved(saved)
      setTimeout(() => {
        onClose()
        setSaved(false)
      }, 900)
    } catch {
      setSaving(false)
    }
  }

  const overallPreview = checkedRows.length > 0 ? deriveOverall() : null
  const overallMeta    = overallPreview ? MONITOR_META[overallPreview] : null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 310, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(2px)' }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 311,
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        maxHeight: '92dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '.6rem 1.1rem .5rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>🔁 Roadside Tire Recheck</div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 10 }}>
                {truckNum   && <span>🚛 {truckNum}</span>}
                {trailerNum && <span>🚚 {trailerNum}</span>}
                {baseLogAt  && <span>Base log: {fmtTime(baseLogAt)}</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--muted)' }}>✕</button>
          </div>

          {/* Overall status preview */}
          {overallMeta && (
            <div style={{
              marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
              background: `${overallMeta.color}14`, border: `1.5px solid ${overallMeta.color}40`,
              borderRadius: 10, padding: '.45rem .75rem',
            }}>
              <span style={{ fontSize: '1rem' }}>{overallMeta.emoji}</span>
              <span style={{ fontSize: '.8rem', fontWeight: 800, color: overallMeta.color }}>
                {overallMeta.label}
              </span>
              <span style={{ fontSize: '.72rem', color: 'var(--muted)', marginLeft: 'auto' }}>
                {checkedRows.length} of {rows.length} checked
              </span>
            </div>
          )}
        </div>

        {/* Empty state */}
        {rows.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '2rem' }}>
            <span style={{ fontSize: '2.5rem' }}>✅</span>
            <div style={{ fontWeight: 800, fontSize: '.95rem', color: 'var(--text)', textAlign: 'center' }}>
              No flagged tires in last log
            </div>
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', textAlign: 'center' }}>
              Run a Tire PSI + Tread Log first to enable roadside comparisons.
            </div>
          </div>
        )}

        {/* Tire rows */}
        {rows.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem' }}>
            <div style={{ fontSize: '.68rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Compare each tire to last logged condition
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map(row => {
                const meta     = TIRE_POSITION_META[row.reading.position]
                const condColor = COND_COLOR[row.reading.condition] ?? 'var(--muted)'
                const sel      = row.comparison

                return (
                  <div key={row.reading.position} style={{
                    background: 'var(--surface-2)', borderRadius: 12, padding: '.75rem .9rem',
                    borderLeft: `4px solid ${sel ? COMPARISON_META[sel].color : condColor}`,
                    transition: 'border-color .15s',
                  }}>
                    {/* Tire label + base condition */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <span style={{ fontWeight: 800, fontSize: '.9rem' }}>{meta.label}</span>
                        {row.reading.treadDepth !== undefined && (
                          <span style={{ fontSize: '.68rem', color: 'var(--muted)', marginLeft: 8 }}>
                            {row.reading.treadDepth}/32"
                          </span>
                        )}
                        {row.reading.psi !== undefined && (
                          <span style={{ fontSize: '.68rem', color: 'var(--muted)', marginLeft: 6 }}>
                            {row.reading.psi} PSI
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontSize: '.65rem', fontWeight: 800,
                        color: condColor, background: `${condColor}18`,
                        padding: '2px 8px', borderRadius: 20, border: `1px solid ${condColor}44`,
                        textTransform: 'capitalize',
                      }}>
                        {row.reading.condition.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Quick-tap buttons */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: sel ? 8 : 0 }}>
                      {(['better', 'same', 'worse'] as TireComparison[]).map(c => {
                        const cm      = COMPARISON_META[c]
                        const isSelected = sel === c
                        return (
                          <button
                            key={c}
                            onClick={() => setComparison(row.reading.position, c)}
                            style={{
                              flex: 1, padding: '.55rem .3rem', borderRadius: 10,
                              border: `2px solid ${isSelected ? cm.color : 'var(--border)'}`,
                              background: isSelected ? cm.bg : 'var(--surface)',
                              color: isSelected ? cm.color : 'var(--muted)',
                              fontWeight: isSelected ? 900 : 600,
                              fontSize: '.75rem', cursor: 'pointer',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                              transition: 'all .12s',
                            }}
                          >
                            <span style={{ fontSize: '1.1rem' }}>{cm.emoji}</span>
                            <span>{cm.label}</span>
                          </button>
                        )
                      })}

                      {/* Photo stub */}
                      <button
                        onClick={() => {/* photo capture hook — future */ }}
                        style={{
                          flex: '0 0 52px', padding: '.55rem .3rem', borderRadius: 10,
                          border: '2px solid var(--border)', background: 'var(--surface)',
                          color: 'var(--muted)', fontSize: '.75rem', cursor: 'pointer',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                        }}
                      >
                        <span style={{ fontSize: '1.1rem' }}>📸</span>
                        <span>Photo</span>
                      </button>
                    </div>

                    {/* Inline note when a comparison is selected */}
                    {sel && (
                      <input
                        placeholder="Note (optional)"
                        value={row.note}
                        onChange={e => setNote(row.reading.position, e.target.value)}
                        style={{
                          width: '100%', padding: '.4rem .6rem', borderRadius: 8,
                          border: '1px solid var(--border)', background: 'var(--surface)',
                          color: 'var(--text)', fontSize: '.82rem', outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Global notes */}
            <div style={{ marginTop: 14 }}>
              <input
                placeholder="Overall notes (optional)"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{
                  width: '100%', padding: '.55rem .75rem', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Alert engine legend */}
            <div style={{ marginTop: 12, background: 'var(--surface-2)', borderRadius: 10, padding: '.65rem .85rem' }}>
              <div style={{ fontSize: '.62rem', fontWeight: 900, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Alert Engine Logic
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { icon: '🔵', text: 'Same → Same — preventative reminder, continue monitoring' },
                  { icon: '⚠️', text: 'Same → Worse — worsening trend, plan service soon' },
                  { icon: '🛑', text: 'Worse → Worse — urgent escalation, service needed' },
                  { icon: '✅', text: 'Any → Better — resolved, no longer monitored' },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '.75rem', flexShrink: 0 }}>{row.icon}</span>
                    <span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>{row.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '.75rem 1.1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
          {overallPreview === 'service_needed' && (
            <div style={{ fontSize: '.72rem', color: 'var(--error)', fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>
              🛑 Service needed — log a compliance event after saving
            </div>
          )}
          {overallPreview === 'worsening' && (
            <div style={{ fontSize: '.72rem', color: 'var(--warn)', fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>
              ⚠️ Condition worsening — plan service at next stop
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
              background: saved
                ? 'var(--success)'
                : !canSave
                  ? 'var(--surface-2)'
                  : overallPreview === 'service_needed'
                    ? 'var(--error)'
                    : overallPreview === 'worsening'
                      ? 'rgba(245,194,0,.2)'
                      : 'rgba(0,232,176,.15)',
              color: saved
                ? '#000'
                : !canSave
                  ? 'var(--muted)'
                  : overallPreview === 'service_needed'
                    ? '#fff'
                    : overallPreview === 'worsening'
                      ? 'var(--warn)'
                      : 'var(--primary)',
              fontWeight: 900, fontSize: '1rem',
              cursor: canSave ? 'pointer' : 'not-allowed',
              transition: 'all .2s',
            }}
          >
            {saved   ? '✅ Recheck Saved'
            : saving ? 'Saving…'
            : checkedRows.length > 0
              ? `🔁 Save ${checkedRows.length} Recheck${checkedRows.length !== 1 ? 's' : ''}`
              : 'Tap a tire condition to begin'}
          </button>
        </div>
      </div>
    </>
  )
}
