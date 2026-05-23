'use client'
/**
 * TrailerInspectionSheet — Pickup / Drop / Hook inspection with damage logging.
 *
 * Event types: pickup, drop, empty_hook, inspection, damage_found
 * Records seal #, reefer fuel/temp, per-area condition, damage items.
 * Saves TrailerEvent → saveTrailerEvent() → Supabase async.
 */
import { useState, useEffect } from 'react'
import {
  DAMAGE_AREA_META,
  saveTrailerEvent,
  getActiveContext,
  type TrailerEventType,
  type DamageItem,
  type CheckResult,
} from '@/lib/trailerIntelligence'

interface Props {
  open:           boolean
  onClose:        () => void
  eventType?:     TrailerEventType
  trailerNumber?: string
  truckNumber?:   string
  loadId?:        string
  loadNumber?:    string
  isReefer?:      boolean
}

type Area = DamageItem['area']
type DamageType = DamageItem['type']
type Severity = DamageItem['severity']

const AREAS: Area[] = ['front','rear','left_side','right_side','roof','floor','doors','landing_gear','other']

const EVENT_META: Record<TrailerEventType, { label: string; emoji: string; color: string }> = {
  pickup:        { label: 'Trailer Pickup',     emoji: '🔗', color: 'var(--primary)' },
  drop:          { label: 'Trailer Drop',       emoji: '📍', color: '#60c8ff' },
  empty_hook:    { label: 'Empty Hook',         emoji: '🚛', color: 'var(--warn)' },
  inspection:    { label: 'Visual Inspection',  emoji: '🔍', color: 'var(--success)' },
  damage_found:  { label: 'Damage Found',       emoji: '⚠️', color: 'var(--error)' },
  damage_cleared:{ label: 'Damage Cleared',     emoji: '✅', color: 'var(--success)' },
  reefer_check:  { label: 'Reefer Check',       emoji: '❄️', color: '#60d4ff' },
  seal_verified: { label: 'Seal Verified',      emoji: '🔒', color: 'var(--success)' },
  fuel_added:    { label: 'Reefer Fuel Added',  emoji: '⛽', color: 'var(--warn)' },
}

const CONDITION_COLORS: Record<CheckResult, string> = {
  pass: 'var(--success)',
  fail: 'var(--error)',
  na:   'var(--border)',
}

function uid() { return `te-${Date.now()}-${Math.random().toString(36).slice(2,7)}` }

export default function TrailerInspectionSheet({ open, onClose, eventType: initType, trailerNumber, truckNumber, loadId, loadNumber, isReefer }: Props) {
  const [evType,       setEvType]       = useState<TrailerEventType>(initType ?? 'pickup')
  const [trailerNum,   setTrailerNum]   = useState('')
  const [truckNum,     setTruckNum]     = useState('')
  const [loadNum,      setLoadNum]      = useState('')
  const [sealNumber,   setSealNumber]   = useState('')
  const [sealVerified, setSealVerified] = useState(false)
  const [bolAttached,  setBolAttached]  = useState(false)
  const [reeferFuel,   setReeferFuel]   = useState('')
  const [reeferTemp,   setReeferTemp]   = useState('')
  const [location,     setLocation]     = useState('')
  const [notes,        setNotes]        = useState('')
  const [driverAck,    setDriverAck]    = useState(false)

  // Per-area condition
  const [areaCondition, setAreaCondition] = useState<Record<Area, CheckResult>>({
    front: 'pass', rear: 'pass', left_side: 'pass', right_side: 'pass',
    roof: 'pass', floor: 'pass', doors: 'pass', landing_gear: 'pass', other: 'na',
  })

  // Damage items
  const [damages,   setDamages]   = useState<DamageItem[]>([])
  const [addingDmg, setAddingDmg] = useState(false)
  const [dmgArea,   setDmgArea]   = useState<Area>('other')
  const [dmgType,   setDmgType]   = useState<DamageType>('scratch')
  const [dmgSev,    setDmgSev]    = useState<Severity>('minor')
  const [dmgNote,   setDmgNote]   = useState('')
  const [dmgPreEx,  setDmgPreEx]  = useState(false)

  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => {
    if (!open) return
    const ctx = getActiveContext()
    setEvType(initType ?? 'pickup')
    setTrailerNum(trailerNumber ?? ctx.trailerNumber)
    setTruckNum(truckNumber ?? ctx.truckNumber)
    setLoadNum(loadNumber ?? ctx.loadNumber)
    setSealNumber(''); setSealVerified(false); setBolAttached(false)
    setReeferFuel(''); setReeferTemp('')
    setLocation(''); setNotes('')
    setDamages([]); setAddingDmg(false)
    setDriverAck(false); setSaved(false); setSaving(false)
    setAreaCondition({
      front: 'pass', rear: 'pass', left_side: 'pass', right_side: 'pass',
      roof: 'pass', floor: 'pass', doors: 'pass', landing_gear: 'pass', other: 'na',
    })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  function addDamage() {
    const item: DamageItem = {
      id:          uid(),
      area:        dmgArea,
      type:        dmgType,
      severity:    dmgSev,
      note:        dmgNote || undefined,
      preExisting: dmgPreEx,
      loggedAt:    new Date().toISOString(),
      loadNumber:  loadNum || undefined,
    }
    setDamages(prev => [...prev, item])
    // Auto-fail area condition
    setAreaCondition(prev => ({ ...prev, [dmgArea]: 'fail' }))
    setDmgNote(''); setDmgPreEx(false); setAddingDmg(false)
  }

  function removeDamage(id: string) {
    setDamages(prev => prev.filter(d => d.id !== id))
  }

  async function handleSave() {
    if (saving || saved || !driverAck) return
    setSaving(true)
    try {
      await saveTrailerEvent({
        eventType:     evType,
        trailerNumber: trailerNum,
        tractorId:     truckNum || undefined,
        loadId:        loadId   || undefined,
        loadNumber:    loadNum  || undefined,
        locationLabel: location || undefined,
        sealNumber:    sealNumber || undefined,
        sealVerified,
        bolAttached,
        reeferFuelPct: reeferFuel ? parseFloat(reeferFuel) : undefined,
        reeferTempSet: reeferTemp ? parseFloat(reeferTemp) : undefined,
        condition:     areaCondition,
        damageItems:   damages,
        photoIds:      [],
        notes,
        driverAck,
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

  const meta       = EVENT_META[evType]
  const failAreas  = AREAS.filter(a => areaCondition[a] === 'fail')
  const showReefer = isReefer || evType === 'reefer_check' || evType === 'fuel_added'

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
              <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>
                {meta.emoji} {meta.label}
              </div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {trailerNum && <span>🚚 {trailerNum}</span>}
                {truckNum   && <span>🚛 {truckNum}</span>}
                {loadNum    && <span>📦 #{loadNum}</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--muted)' }}>✕</button>
          </div>

          {/* Event type selector */}
          <div style={{ display: 'flex', gap: 5, marginTop: 8, overflowX: 'auto', paddingBottom: 2 }}>
            {(Object.keys(EVENT_META) as TrailerEventType[]).map(t => {
              const m   = EVENT_META[t]
              const sel = evType === t
              return (
                <button key={t} onClick={() => setEvType(t)} style={{
                  padding: '.25rem .6rem', borderRadius: 20, fontSize: '.65rem', fontWeight: sel ? 800 : 600,
                  border: `1.5px solid ${sel ? m.color : 'var(--border)'}`,
                  background: sel ? `${m.color}18` : 'var(--surface-2)',
                  color: sel ? m.color : 'var(--muted)',
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {m.emoji} {m.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem' }}>

          {/* Quick fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Trailer #</div>
              <input value={trailerNum} onChange={e => setTrailerNum(e.target.value)}
                placeholder="e.g. 48201"
                style={{ width: '100%', padding: '.5rem .65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Location</div>
              <input value={location} onChange={e => setLocation(e.target.value)}
                placeholder="Facility name / city"
                style={{ width: '100%', padding: '.5rem .65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Seal #</div>
              <input value={sealNumber} onChange={e => setSealNumber(e.target.value)}
                placeholder="Seal number"
                style={{ width: '100%', padding: '.5rem .65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={sealVerified} onChange={e => setSealVerified(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
                <span style={{ fontSize: '.78rem', fontWeight: 700 }}>Seal Verified</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={bolAttached} onChange={e => setBolAttached(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
                <span style={{ fontSize: '.78rem', fontWeight: 700 }}>BOL Attached</span>
              </label>
            </div>
          </div>

          {/* Reefer section */}
          {showReefer && (
            <div style={{ background: 'rgba(96,212,255,.08)', border: '1px solid rgba(96,212,255,.25)', borderRadius: 12, padding: '.75rem .9rem', marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: '.82rem', color: '#60d4ff', marginBottom: 8 }}>❄️ Reefer Unit</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Fuel %</div>
                  <input type="number" value={reeferFuel} onChange={e => setReeferFuel(e.target.value)}
                    placeholder="e.g. 75"
                    style={{ width: '100%', padding: '.5rem .65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Temp Set (°F)</div>
                  <input type="number" value={reeferTemp} onChange={e => setReeferTemp(e.target.value)}
                    placeholder="e.g. 34"
                    style={{ width: '100%', padding: '.5rem .65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              {reeferFuel && parseFloat(reeferFuel) < 25 && (
                <div style={{ marginTop: 6, fontSize: '.68rem', color: 'var(--error)', fontWeight: 700 }}>
                  ⚠️ Reefer fuel below 25% — fill before departure
                </div>
              )}
            </div>
          )}

          {/* Area condition grid */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '.68rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Condition by Area
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {AREAS.map(area => {
                const am  = DAMAGE_AREA_META[area]
                const res = areaCondition[area]
                return (
                  <button key={area} onClick={() => {
                    const next: CheckResult = res === 'pass' ? 'fail' : res === 'fail' ? 'na' : 'pass'
                    setAreaCondition(p => ({ ...p, [area]: next }))
                  }} style={{
                    padding: '.5rem .4rem', borderRadius: 10, textAlign: 'center',
                    border: `1.5px solid ${CONDITION_COLORS[res]}`,
                    background: res === 'pass' ? 'rgba(0,200,100,.08)' : res === 'fail' ? 'rgba(232,64,0,.08)' : 'var(--surface-2)',
                    cursor: 'pointer',
                  }}>
                    <div style={{ fontSize: '1rem' }}>{am.emoji}</div>
                    <div style={{ fontSize: '.6rem', fontWeight: 700, color: CONDITION_COLORS[res], marginTop: 2 }}>
                      {am.label}
                    </div>
                    <div style={{ fontSize: '.58rem', color: CONDITION_COLORS[res], fontWeight: 600 }}>
                      {res === 'pass' ? '✓ OK' : res === 'fail' ? '✗ Issue' : 'N/A'}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Damage items */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: '.68rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Damage Items {damages.length > 0 && `(${damages.length})`}
              </div>
              <button onClick={() => setAddingDmg(true)} style={{
                padding: '.25rem .7rem', borderRadius: 20, fontSize: '.68rem', fontWeight: 800,
                border: '1.5px solid var(--primary)', background: 'rgba(0,232,176,.1)',
                color: 'var(--primary)', cursor: 'pointer',
              }}>
                + Add Damage
              </button>
            </div>

            {/* Add damage form */}
            {addingDmg && (
              <div style={{ background: 'rgba(232,64,0,.06)', border: '1.5px solid var(--error)', borderRadius: 12, padding: '.75rem .9rem', marginBottom: 8 }}>
                <div style={{ fontWeight: 800, fontSize: '.82rem', color: 'var(--error)', marginBottom: 8 }}>Log Damage Item</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Area</div>
                    <select value={dmgArea} onChange={e => setDmgArea(e.target.value as Area)}
                      style={{ width: '100%', padding: '.45rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.82rem', outline: 'none' }}>
                      {AREAS.map(a => <option key={a} value={a}>{DAMAGE_AREA_META[a].emoji} {DAMAGE_AREA_META[a].label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>Type</div>
                    <select value={dmgType} onChange={e => setDmgType(e.target.value as DamageType)}
                      style={{ width: '100%', padding: '.45rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.82rem', outline: 'none' }}>
                      {(['dent','scratch','hole','crack','broken_light','torn_seal','flat_tire','other'] as DamageType[]).map(t =>
                        <option key={t} value={t}>{t.replace(/_/g,' ')}</option>
                      )}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {(['minor','moderate','major'] as Severity[]).map(s => (
                    <button key={s} onClick={() => setDmgSev(s)} style={{
                      flex: 1, padding: '.35rem', borderRadius: 8, fontSize: '.7rem', fontWeight: dmgSev === s ? 900 : 600,
                      border: `1.5px solid ${dmgSev === s ? (s === 'major' ? 'var(--error)' : s === 'moderate' ? 'var(--warn)' : 'var(--muted)') : 'var(--border)'}`,
                      background: dmgSev === s ? (s === 'major' ? 'rgba(232,64,0,.12)' : s === 'moderate' ? 'rgba(245,194,0,.12)' : 'var(--surface-2)') : 'var(--surface-2)',
                      color: dmgSev === s ? (s === 'major' ? 'var(--error)' : s === 'moderate' ? 'var(--warn)' : 'var(--text)') : 'var(--muted)',
                      cursor: 'pointer',
                    }}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>

                <input placeholder="Note (optional)" value={dmgNote} onChange={e => setDmgNote(e.target.value)}
                  style={{ width: '100%', padding: '.45rem .6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: '.82rem', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={dmgPreEx} onChange={e => setDmgPreEx(e.target.checked)} style={{ accentColor: 'var(--warn)' }} />
                  <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--warn)' }}>Pre-existing damage (not from this load)</span>
                </label>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setAddingDmg(false)} style={{ flex: 1, padding: '.5rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)', fontWeight: 700, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={addDamage} style={{ flex: 2, padding: '.5rem', borderRadius: 8, border: 'none', background: 'var(--error)', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>
                    Add Damage
                  </button>
                </div>
              </div>
            )}

            {/* Damage list */}
            {damages.map(d => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(232,64,0,.06)', borderRadius: 10, padding: '.55rem .75rem', marginBottom: 6,
                border: '1px solid rgba(232,64,0,.2)',
              }}>
                <div>
                  <span style={{ fontWeight: 800, fontSize: '.82rem', color: 'var(--error)' }}>
                    {DAMAGE_AREA_META[d.area].emoji} {DAMAGE_AREA_META[d.area].label} — {d.type.replace(/_/g,' ')}
                  </span>
                  <span style={{ fontSize: '.68rem', color: 'var(--muted)', marginLeft: 6 }}>
                    {d.severity}{d.preExisting ? ' · pre-existing' : ''}
                  </span>
                  {d.note && <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>{d.note}</div>}
                </div>
                <button onClick={() => removeDamage(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: '1rem', padding: '0 .25rem' }}>✕</button>
              </div>
            ))}

            {failAreas.length > 0 && damages.length === 0 && (
              <div style={{ fontSize: '.72rem', color: 'var(--warn)', fontWeight: 700, marginTop: 4 }}>
                ⚠️ {failAreas.length} area{failAreas.length !== 1 ? 's' : ''} flagged — add damage items for documentation
              </div>
            )}
          </div>

          {/* Notes */}
          <textarea
            placeholder="Overall notes (optional)…"
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{
              width: '100%', padding: '.55rem .75rem', borderRadius: 10, marginBottom: 12,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text)', fontSize: '.88rem', outline: 'none',
              boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit',
            }}
          />

          {/* Driver acknowledgement */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '.65rem .85rem', borderRadius: 12, cursor: 'pointer',
            border: `1.5px solid ${driverAck ? 'var(--primary)' : 'var(--border)'}`,
            background: driverAck ? 'rgba(0,232,176,.08)' : 'var(--surface-2)',
          }}>
            <input
              type="checkbox"
              checked={driverAck}
              onChange={e => setDriverAck(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--primary)' }}
            />
            <div>
              <div style={{ fontWeight: 800, fontSize: '.88rem', color: driverAck ? 'var(--primary)' : 'var(--text)' }}>
                Driver acknowledgement
              </div>
              <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 1 }}>
                I confirm this inspection is accurate
              </div>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '.75rem 1.1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
          {!driverAck && (
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', textAlign: 'center', marginBottom: 6 }}>
              Check driver acknowledgement to save
            </div>
          )}
          <button onClick={handleSave} disabled={saving || saved || !driverAck} style={{
            width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
            background: saved ? 'var(--success)' : damages.length > 0 ? 'var(--error)' : meta.color,
            color: damages.length > 0 && !saved ? '#fff' : '#000',
            fontWeight: 900, fontSize: '1rem',
            cursor: (saving || saved || !driverAck) ? 'default' : 'pointer',
            opacity: (saving || !driverAck) ? .6 : 1, transition: 'all .2s',
          }}>
            {saved   ? `✅ ${meta.label} Logged`
            : saving ? 'Saving…'
            : damages.length > 0
              ? `⚠️ Save — ${damages.length} Damage Item${damages.length !== 1 ? 's' : ''}`
              : `${meta.emoji} Save ${meta.label}`}
          </button>
        </div>
      </div>
    </>
  )
}
