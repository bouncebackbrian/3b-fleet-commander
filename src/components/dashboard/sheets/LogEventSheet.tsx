'use client'
import { useState } from 'react'
import type { EventType, EventSeverity, LoadMission } from '@/lib/dashboard/types'

// ── Event preset definitions ──────────────────────────────────────────────────
type Preset = { type: EventType; label: string; emoji: string; severity: EventSeverity }

const PRESETS: Preset[] = [
  { type: 'receiver_delay',     label: 'Receiver Delay',  emoji: '📦', severity: 'warn'     },
  { type: 'parking_issue',      label: 'Parking Full',    emoji: '🅿️', severity: 'warn'     },
  { type: 'traffic_delay',      label: 'Heavy Traffic',   emoji: '🚦', severity: 'info'     },
  { type: 'fuel_issue',         label: 'Reefer Fuel',     emoji: '⛽', severity: 'info'     },
  { type: 'scale_issue',        label: 'Scale Backup',    emoji: '⚖️', severity: 'info'     },
  { type: 'weather_delay',      label: 'Weather Delay',   emoji: '🌧️', severity: 'warn'     },
]

const ALL_TYPES: { type: EventType; label: string; emoji: string; severity: EventSeverity }[] = [
  ...PRESETS,
  { type: 'detention',          label: 'Detention',        emoji: '⏱',  severity: 'warn'     },
  { type: 'breakdown',          label: 'Breakdown',        emoji: '🔧', severity: 'critical' },
  { type: 'route_problem',      label: 'Route Problem',    emoji: '🗺',  severity: 'warn'     },
  { type: 'successful_delivery',label: 'Clean Delivery',   emoji: '✅',  severity: 'info'     },
]

// ── Severity colour helpers ───────────────────────────────────────────────────
function severityStyle(s: EventSeverity): { bg: string; border: string; color: string } {
  if (s === 'critical') return { bg: 'rgba(232,64,0,.1)',   border: 'rgba(232,64,0,.3)',   color: 'var(--error)' }
  if (s === 'warn')     return { bg: 'rgba(245,194,0,.09)', border: 'rgba(245,194,0,.28)', color: 'var(--warn)' }
  return                       { bg: 'rgba(0,232,176,.07)', border: 'rgba(0,232,176,.22)', color: 'var(--primary)' }
}

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  open:     boolean
  onClose:  () => void
  mission:  LoadMission | null
  onLog:    (type: EventType, severity: EventSeverity, notes?: string, location?: string) => Promise<{ error: string | null }>
}

export default function LogEventSheet({ open, onClose, mission, onLog }: Props) {
  const [selected,  setSelected]  = useState<EventType | null>(null)
  const [severity,  setSeverity]  = useState<EventSeverity>('info')
  const [notes,     setNotes]     = useState('')
  const [location,  setLocation]  = useState('')
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [saveErr,   setSaveErr]   = useState<string | null>(null)
  const [showMore,  setShowMore]  = useState(false)

  if (!open) return null

  const handlePreset = (p: Preset) => {
    setSelected(p.type)
    setSeverity(p.severity)
    setSaveErr(null)
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    setSaveErr(null)
    const { error } = await onLog(selected, severity, notes, location)
    setSaving(false)
    if (error) { setSaveErr(error); return }
    setSaved(true)
    setTimeout(() => {
      setSaved(false); setSelected(null); setNotes(''); setLocation('')
      onClose()
    }, 900)
  }

  const handleClose = () => {
    setSelected(null); setNotes(''); setLocation(''); setSaveErr(null)
    onClose()
  }

  const sel = ALL_TYPES.find(t => t.type === selected)
  const ss  = sel ? severityStyle(sel.severity) : null

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,13,11,.7)' }} onClick={handleClose} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, background: 'var(--surface)', borderTop: '2px solid rgba(0,232,176,.2)', borderRadius: '20px 20px 0 0', padding: '1.5rem 1.5rem 2.5rem', maxHeight: '90dvh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>📋 Log Event</div>
            {mission && (
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
                {mission.origin.split(',')[0]} → {mission.destination.split(',')[0]}
                {mission.loadNumber ? ` · #${mission.loadNumber}` : ''}
              </div>
            )}
          </div>
          <button onClick={handleClose} style={{ padding: '.4rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Preset grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: '1rem' }}>
          {PRESETS.map(p => {
            const active = selected === p.type
            const ps = severityStyle(p.severity)
            return (
              <button key={p.type} onClick={() => handlePreset(p)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 5, minHeight: 72, borderRadius: 14, cursor: 'pointer', fontWeight: 700, fontSize: '.82rem',
                  background:  active ? ps.bg     : 'var(--surface-2)',
                  border:      `2px solid ${active ? ps.border : 'var(--border)'}`,
                  color:       active ? ps.color  : 'var(--muted)',
                  transition:  'all .12s',
                }}>
                <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{p.emoji}</span>
                <span style={{ textAlign: 'center', lineHeight: 1.2, letterSpacing: '.01em' }}>{p.label}</span>
              </button>
            )
          })}
        </div>

        {/* Show more types */}
        <button onClick={() => setShowMore(v => !v)}
          style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 700, padding: '.3rem .6rem', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', marginBottom: showMore ? '1rem' : '.65rem' }}>
          {showMore ? '▲ Fewer types' : '▼ More types'}
        </button>

        {showMore && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: '1rem' }}>
            {ALL_TYPES.slice(PRESETS.length).map(p => {
              const active = selected === p.type
              const ps = severityStyle(p.severity)
              return (
                <button key={p.type} onClick={() => handlePreset(p as Preset)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '.65rem .85rem',
                    borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '.85rem', minHeight: 52,
                    background: active ? ps.bg    : 'var(--surface-2)',
                    border:     `2px solid ${active ? ps.border : 'var(--border)'}`,
                    color:      active ? ps.color : 'var(--muted)',
                  }}>
                  <span style={{ fontSize: '1.25rem' }}>{p.emoji}</span>
                  <span>{p.label}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Detail fields — appear once a type is selected */}
        {selected && (
          <div style={{ display: 'grid', gap: 10, marginTop: '.25rem' }}>
            {/* Severity override */}
            <div>
              <div style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Severity</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['info', 'warn', 'critical'] as EventSeverity[]).map(s => {
                  const sv = severityStyle(s)
                  return (
                    <button key={s} onClick={() => setSeverity(s)}
                      style={{
                        flex: 1, padding: '.45rem', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '.78rem',
                        background: severity === s ? sv.bg    : 'transparent',
                        border:     `1px solid ${severity === s ? sv.border : 'var(--border)'}`,
                        color:      severity === s ? sv.color : 'var(--muted)',
                      }}>
                      {s === 'info' ? '🟢 Info' : s === 'warn' ? '🟡 Warn' : '🔴 Critical'}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Location (optional) */}
            <div>
              <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Location (optional)</label>
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. TA Dallas, dock 4, I-40 MM 142"
                style={{ width: '100%', padding: '.6rem .8rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.9rem' }} />
            </div>

            {/* Notes (optional) */}
            <div>
              <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Details for future reference…" rows={2}
                style={{ width: '100%', padding: '.6rem .8rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.9rem', resize: 'none' }} />
            </div>

            {saveErr && (
              <div style={{ fontSize: '.78rem', color: 'var(--error)', padding: '.4rem .7rem', background: 'rgba(232,64,0,.08)', borderRadius: 8 }}>
                ⚠️ Saved locally — cloud sync failed
              </div>
            )}

            {/* Save button */}
            {ss && (
              <button onClick={handleSave} disabled={saving || saved}
                style={{
                  padding: '1rem', borderRadius: 14, fontWeight: 900, fontSize: '1rem',
                  background: saved ? 'rgba(40,192,72,.15)' : ss.bg,
                  color:      saved ? 'var(--success)'      : ss.color,
                  cursor: saving || saved ? 'default' : 'pointer', minHeight: 56,
                  border: `1px solid ${saved ? 'rgba(40,192,72,.3)' : ss.border}`,
                  transition: 'all .15s',
                } as React.CSSProperties}>
                {saved ? '✅ Logged' : saving ? 'Saving…' : `${sel?.emoji} Log ${sel?.label}`}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
