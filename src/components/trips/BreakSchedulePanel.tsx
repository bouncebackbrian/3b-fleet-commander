'use client'
/**
 * BreakSchedulePanel — Interactive break schedule for the trip planner
 *
 * Shows breaks every 3h (adjustable ±1h), mandatory 30-min DOT break,
 * fuel stops, and 10-hr rest. User can:
 *   • Slide each break ±1 hour from its base
 *   • Mark as Taken (logs timestamp)
 *   • Skip (greyed out)
 *   • Add a custom break
 *
 * Saves break log to localStorage (3b-break-log) per load number.
 * Running totals: planned / taken / skipped + total break time.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  readBreakLog,
  saveBreakEntry,
  deleteBreakEntry,
  generateBreakSchedule,
  summarizeBreaks,
  type BreakEntry,
  type BreakType,
} from '@/lib/loadKpi'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtHour(h: number): string {
  const hrs  = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  if (mins === 0) return `${hrs}h`
  return `${hrs}h ${mins}m`
}

function fmtMins(m: number): string {
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ''}`
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000
  if (diff < 1)  return 'just now'
  if (diff < 60) return `${Math.round(diff)}m ago`
  return `${Math.round(diff / 60)}h ago`
}

const TYPE_COLOR: Record<BreakType, string> = {
  stretch:   '#e8af34',
  mandatory: 'var(--error)',
  rest10:    'var(--error)',
  fuel:      'var(--warn)',
  custom:    'var(--primary)',
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** Total drive hours from the trip plan */
  driveHours:    number
  /** The load number — used to namespace the break log */
  loadNumber?:   string
  /** If true, collapse to a summary chip by default */
  collapsed?:    boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BreakSchedulePanel({ driveHours, loadNumber, collapsed = false }: Props) {
  const [breaks,       setBreaks]       = useState<BreakEntry[]>([])
  const [open,         setOpen]         = useState(!collapsed)
  const [intervalHrs,  setIntervalHrs]  = useState(3)
  const [addingCustom, setAddingCustom] = useState(false)
  const [customHour,   setCustomHour]   = useState('')
  const [customLabel,  setCustomLabel]  = useState('')

  // Load or generate break schedule
  const load = useCallback(() => {
    const saved = readBreakLog(loadNumber)
    if (saved.length > 0) {
      setBreaks(saved)
    } else if (driveHours > 0) {
      // Auto-generate from drive hours
      const generated = generateBreakSchedule(driveHours, intervalHrs, loadNumber)
      generated.forEach(saveBreakEntry)
      setBreaks(generated)
    }
  }, [driveHours, intervalHrs, loadNumber])

  useEffect(() => { load() }, [load])

  // Regenerate when interval changes (only if no taken breaks exist)
  function regenerate(interval: number) {
    setIntervalHrs(interval)
    const hasTaken = breaks.some(b => b.status === 'taken')
    if (hasTaken) return   // don't wipe taken breaks
    // Delete old planned entries
    breaks.forEach(b => deleteBreakEntry(b.id))
    const generated = generateBreakSchedule(driveHours, interval, loadNumber)
    generated.forEach(saveBreakEntry)
    setBreaks(generated)
  }

  function adjustBreak(id: string, delta: number) {
    const entry = breaks.find(b => b.id === id)
    if (!entry) return
    // Clamp: ±1 hour from base, min 0.5h
    const newAdj     = Math.max(-1, Math.min(1, entry.adjustment + delta))
    const newAdjHour = Math.max(0.5, entry.baseHour + newAdj)
    const updated    = { ...entry, adjustment: newAdj, adjustedHour: newAdjHour }
    saveBreakEntry(updated)
    setBreaks(prev => prev.map(b => b.id === id ? updated : b))
  }

  function markTaken(id: string) {
    const entry = breaks.find(b => b.id === id)
    if (!entry || entry.status === 'taken') return
    const updated: BreakEntry = {
      ...entry,
      status:  'taken',
      takenAt: new Date().toISOString(),
    }
    saveBreakEntry(updated)
    setBreaks(prev => prev.map(b => b.id === id ? updated : b))
  }

  function markSkipped(id: string) {
    const entry = breaks.find(b => b.id === id)
    if (!entry) return
    const updated = { ...entry, status: 'skipped' as const }
    saveBreakEntry(updated)
    setBreaks(prev => prev.map(b => b.id === id ? updated : b))
  }

  function restoreBreak(id: string) {
    const entry = breaks.find(b => b.id === id)
    if (!entry) return
    const updated = { ...entry, status: 'planned' as const, takenAt: undefined }
    saveBreakEntry(updated)
    setBreaks(prev => prev.map(b => b.id === id ? updated : b))
  }

  function addCustomBreak() {
    const h = parseFloat(customHour)
    if (!h || h <= 0) return
    const entry: BreakEntry = {
      id:           crypto.randomUUID(),
      loadNumber,
      type:         'custom',
      label:        customLabel || `🕐 Custom Break at ${fmtHour(h)}`,
      baseHour:     h,
      adjustedHour: h,
      adjustment:   0,
      durationMins: 15,
      status:       'planned',
      createdAt:    new Date().toISOString(),
    }
    saveBreakEntry(entry)
    setBreaks(prev => [...prev, entry].sort((a, b) => a.adjustedHour - b.adjustedHour))
    setCustomHour(''); setCustomLabel(''); setAddingCustom(false)
  }

  const sorted  = [...breaks].sort((a, b) => a.adjustedHour - b.adjustedHour)
  const summary = summarizeBreaks(breaks)

  // ── Collapsed chip ────────────────────────────────────────────────────────

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        width: '100%', textAlign: 'left',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '.75rem 1rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.1rem' }}>⏸</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: '.9rem' }}>Break Schedule</div>
            <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>
              {summary.taken}/{summary.planned + summary.taken} taken · {fmtMins(summary.totalTaken)} rest logged
            </div>
          </div>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>▼</span>
      </button>
    )
  }

  // ── Expanded ──────────────────────────────────────────────────────────────

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '.85rem 1rem .6rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.15rem' }}>⏸</span>
            <div>
              <div style={{ fontWeight: 900, fontSize: '.95rem' }}>Break Schedule</div>
              <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>
                {driveHours > 0 ? `${driveHours.toFixed(1)}h drive` : 'Enter miles to plan'} · {intervalHrs}h intervals
              </div>
            </div>
          </div>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem' }}>▲</button>
        </div>

        {/* Interval selector */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Break every:</span>
          {[2, 3, 4].map(h => (
            <button key={h} onClick={() => regenerate(h)} style={{
              padding: '.25rem .6rem', borderRadius: 20, fontSize: '.72rem', fontWeight: intervalHrs === h ? 900 : 600,
              border: `1.5px solid ${intervalHrs === h ? 'var(--primary)' : 'var(--border)'}`,
              background: intervalHrs === h ? 'rgba(0,232,176,.1)' : 'var(--surface-2)',
              color: intervalHrs === h ? 'var(--primary)' : 'var(--muted)', cursor: 'pointer',
            }}>
              {h}h
            </button>
          ))}
          <span style={{ fontSize: '.62rem', color: 'var(--faint)', marginLeft: 2 }}>±1h adjust per stop</span>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {[
          { label: 'Planned',  value: summary.planned,      color: 'var(--muted)'    },
          { label: 'Taken',    value: summary.taken,        color: 'var(--success)'  },
          { label: 'Skipped',  value: summary.skipped,      color: 'var(--faint)'    },
          { label: 'Rest Time',value: fmtMins(summary.totalTaken), color: 'var(--primary)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ flex: 1, padding: '.5rem .4rem', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontSize: '1rem', fontWeight: 900, color }}>{value}</div>
            <div style={{ fontSize: '.55rem', color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Break list */}
      <div style={{ padding: '.75rem .9rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.length === 0 && (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--faint)', fontSize: '.82rem' }}>
            Enter trip miles to auto-generate break schedule
          </div>
        )}

        {sorted.map((b, i) => {
          const color  = TYPE_COLOR[b.type]
          const isTaken   = b.status === 'taken'
          const isSkipped = b.status === 'skipped'

          return (
            <div key={b.id} style={{
              borderRadius: 12,
              border: `1px solid ${isTaken ? 'var(--success)' : isSkipped ? 'var(--border)' : color + '40'}`,
              borderLeft: `4px solid ${isTaken ? 'var(--success)' : isSkipped ? 'var(--faint)' : color}`,
              background: isTaken ? 'rgba(0,200,100,.06)' : isSkipped ? 'var(--surface-2)' : 'var(--surface-2)',
              padding: '.6rem .75rem',
              opacity: isSkipped ? .55 : 1,
            }}>
              {/* Row 1: label + hour badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '.78rem', fontWeight: 800, color: isTaken ? 'var(--success)' : isSkipped ? 'var(--muted)' : color }}>
                    {b.label}
                  </span>
                  {b.type === 'mandatory' && (
                    <span style={{ fontSize: '.58rem', fontWeight: 900, background: 'var(--error)', color: '#fff', padding: '1px 5px', borderRadius: 20 }}>DOT REQ</span>
                  )}
                  {isTaken && <span style={{ fontSize: '.7rem' }}>✅</span>}
                  {isSkipped && <span style={{ fontSize: '.7rem' }}>—</span>}
                </div>
                <span style={{
                  fontSize: '.68rem', fontWeight: 800,
                  color: b.adjustment !== 0 ? 'var(--warn)' : 'var(--muted)',
                }}>
                  +{fmtHour(b.adjustedHour)}
                  {b.adjustment !== 0 && <span style={{ fontSize: '.58rem', marginLeft: 3, color: 'var(--warn)' }}>({b.adjustment > 0 ? '+' : ''}{b.adjustment}h)</span>}
                </span>
              </div>

              {/* Row 2: duration + ±1h controls + action */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '.65rem', color: 'var(--faint)', minWidth: 40 }}>
                  {fmtMins(b.durationMins)}
                </span>

                {/* ±1h adjustment — only on planned */}
                {!isTaken && !isSkipped && (
                  <>
                    <button onClick={() => adjustBreak(b.id, -1)}
                      disabled={b.adjustment <= -1}
                      style={adjBtn(b.adjustment <= -1)}>−1h</button>
                    <button onClick={() => adjustBreak(b.id, +1)}
                      disabled={b.adjustment >= 1}
                      style={adjBtn(b.adjustment >= 1)}>+1h</button>
                  </>
                )}

                <div style={{ flex: 1 }} />

                {/* Status action buttons */}
                {!isTaken && !isSkipped && (
                  <>
                    <button onClick={() => markSkipped(b.id)} style={{
                      padding: '.22rem .6rem', borderRadius: 20, fontSize: '.65rem', fontWeight: 700,
                      border: '1px solid var(--border)', background: 'var(--surface)',
                      color: 'var(--muted)', cursor: 'pointer',
                    }}>Skip</button>
                    <button onClick={() => markTaken(b.id)} style={{
                      padding: '.22rem .7rem', borderRadius: 20, fontSize: '.65rem', fontWeight: 800,
                      border: `1px solid ${color}`, background: `${color}18`,
                      color, cursor: 'pointer',
                    }}>✅ Taken</button>
                  </>
                )}

                {(isTaken || isSkipped) && (
                  <button onClick={() => restoreBreak(b.id)} style={{
                    padding: '.22rem .6rem', borderRadius: 20, fontSize: '.62rem', fontWeight: 600,
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    color: 'var(--faint)', cursor: 'pointer',
                  }}>Undo</button>
                )}
              </div>

              {/* Taken timestamp */}
              {isTaken && b.takenAt && (
                <div style={{ fontSize: '.62rem', color: 'var(--success)', marginTop: 4 }}>
                  Taken {timeAgo(b.takenAt)}
                </div>
              )}
            </div>
          )
        })}

        {/* Add custom break */}
        {addingCustom ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '.5rem .75rem', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <input
              type="number"
              placeholder="Hour (e.g. 4.5)"
              value={customHour}
              onChange={e => setCustomHour(e.target.value)}
              style={{ width: 90, padding: '.4rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '.82rem', outline: 'none' }}
            />
            <input
              placeholder="Label (optional)"
              value={customLabel}
              onChange={e => setCustomLabel(e.target.value)}
              style={{ flex: 1, padding: '.4rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '.82rem', outline: 'none' }}
            />
            <button onClick={addCustomBreak} style={{ padding: '.4rem .75rem', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#000', fontWeight: 800, fontSize: '.78rem', cursor: 'pointer' }}>Add</button>
            <button onClick={() => setAddingCustom(false)} style={{ padding: '.4rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontSize: '.78rem', cursor: 'pointer' }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setAddingCustom(true)} style={{
            width: '100%', padding: '.5rem', borderRadius: 10, border: '1px dashed var(--border)',
            background: 'none', color: 'var(--muted)', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer',
          }}>
            + Add custom break
          </button>
        )}
      </div>
    </div>
  )
}

// ── Micro styles ──────────────────────────────────────────────────────────────

function adjBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '.2rem .5rem', borderRadius: 20, fontSize: '.65rem', fontWeight: 800,
    border: `1px solid ${disabled ? 'var(--border)' : 'var(--warn)'}`,
    background: disabled ? 'var(--surface)' : 'rgba(245,194,0,.1)',
    color: disabled ? 'var(--faint)' : 'var(--warn)',
    cursor: disabled ? 'default' : 'pointer',
  }
}
