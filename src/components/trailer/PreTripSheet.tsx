'use client'
/**
 * PreTripSheet — Pre-trip inspection using trailerIntelligence data layer.
 *
 * Uses makeDefaultChecklist() for the item template.
 * Saves to fleet_pretrip_records via savePreTrip().
 * Writes to Supabase async (write-through).
 */
import { useState, useEffect } from 'react'
import {
  makeDefaultChecklist,
  savePreTrip,
  getActiveContext,
  type CheckCategory,
  type CheckResult,
} from '@/lib/trailerIntelligence'

interface Props {
  open:           boolean
  onClose:        () => void
  trailerNumber?: string
  truckNumber?:   string
  loadId?:        string
  loadNumber?:    string
  isReefer?:      boolean
}

function ResultPill({ current, target, onClick }: {
  current: CheckResult; target: CheckResult; onClick: () => void
}) {
  const META: Record<CheckResult, { label: string; color: string; bg: string }> = {
    pass: { label: '✅ Pass', color: 'var(--success)', bg: 'rgba(0,200,100,.13)' },
    fail: { label: '❌ Fail', color: 'var(--error)',   bg: 'rgba(232,64,0,.13)'  },
    na:   { label: 'N/A',    color: 'var(--muted)',    bg: 'var(--surface)'       },
  }
  const m   = META[target]
  const sel = current === target
  return (
    <button onClick={onClick} style={{
      padding: '.22rem .5rem', borderRadius: 20, fontSize: '.68rem', fontWeight: sel ? 900 : 600,
      border: `1.5px solid ${sel ? m.color : 'var(--border)'}`,
      background: sel ? m.bg : 'var(--surface-2)',
      color: sel ? m.color : 'var(--muted)',
      cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {m.label}
    </button>
  )
}

export default function PreTripSheet({ open, onClose, trailerNumber, truckNumber, loadId, loadNumber, isReefer }: Props) {
  const [categories,  setCategories]  = useState<CheckCategory[]>([])
  const [activeCat,   setActiveCat]   = useState(0)
  const [itemNotes,   setItemNotes]   = useState<Record<string, string>>({})
  const [globalNotes, setGlobalNotes] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [truckNum,    setTruckNum]    = useState('')
  const [trailerNum,  setTrailerNum]  = useState('')
  const [signedOff,   setSignedOff]   = useState(true)

  useEffect(() => {
    if (!open) return
    const ctx = getActiveContext()
    setTruckNum(truckNumber ?? ctx.truckNumber)
    setTrailerNum(trailerNumber ?? ctx.trailerNumber)
    setCategories(makeDefaultChecklist(isReefer ?? false))
    setActiveCat(0)
    setItemNotes({})
    setGlobalNotes('')
    setSaved(false)
    setSaving(false)
    setSignedOff(true)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  function setResult(catId: string, itemId: string, result: CheckResult) {
    setCategories(prev => prev.map(cat =>
      cat.id !== catId ? cat : {
        ...cat,
        items: cat.items.map(item => item.id !== itemId ? item : { ...item, result }),
      }
    ))
    if (result === 'fail') setSignedOff(false)
  }

  const allItems   = categories.flatMap(c => c.items)
  const failItems  = allItems.filter(i => i.result === 'fail')
  const passItems  = allItems.filter(i => i.result === 'pass')
  const failCount  = failItems.length
  const passCount  = passItems.length
  const totalDone  = passCount + failCount + allItems.filter(i => i.result === 'na').length

  function catFails(cat: CheckCategory) {
    return cat.items.filter(i => i.result === 'fail').length
  }

  async function handleSave() {
    if (saving || saved) return
    setSaving(true)
    try {
      const finalCats = categories.map(cat => ({
        ...cat,
        items: cat.items.map(item => ({
          ...item,
          note: itemNotes[item.id] || undefined,
        })),
      }))

      const result: 'pass' | 'fail' | 'conditional' =
        failCount === 0 ? 'pass' : signedOff ? 'conditional' : 'fail'

      await savePreTrip({
        truckNumber:   truckNum,
        trailerNumber: trailerNum,
        loadId:        loadId,
        loadNumber:    loadNumber,
        categories:    finalCats,
        result,
        failCount,
        notes:         globalNotes,
        signedOff,
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

  const cat = categories[activeCat]

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        maxHeight: '95dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '.6rem 1.1rem .5rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>🚛 Pre-Trip Inspection</div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {truckNum   && <span>🚛 {truckNum}</span>}
                {trailerNum && <span>🚚 {trailerNum}</span>}
                {isReefer   && <span style={{ color: '#60d4ff' }}>❄️ Reefer</span>}
                {loadNumber && <span>📦 Load #{loadNumber}</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--muted)', padding: '2px 0' }}>✕</button>
          </div>

          {/* Progress bar */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, transition: 'width .3s',
                width: `${(totalDone / Math.max(allItems.length, 1)) * 100}%`,
                background: failCount > 0 ? 'var(--error)' : 'var(--success)',
              }} />
            </div>
            <span style={{ fontSize: '.68rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              {totalDone}/{allItems.length}
            </span>
            {failCount > 0 && (
              <span style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--error)', whiteSpace: 'nowrap' }}>
                ❌ {failCount} fail{failCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {categories.map((c, idx) => {
            const fails = catFails(c)
            const sel   = activeCat === idx
            return (
              <button key={c.id} onClick={() => setActiveCat(idx)} style={{
                padding: '.5rem .75rem', background: 'none', border: 'none', flexShrink: 0,
                borderBottom: `2px solid ${sel ? (fails > 0 ? 'var(--error)' : 'var(--primary)') : 'transparent'}`,
                color: sel ? (fails > 0 ? 'var(--error)' : 'var(--primary)') : 'var(--muted)',
                fontSize: '.72rem', fontWeight: sel ? 800 : 600,
                cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span>{c.emoji}</span>
                <span>{c.label}</span>
                {fails > 0 && (
                  <span style={{ fontSize: '.58rem', background: 'var(--error)', color: '#fff', borderRadius: 20, padding: '1px 5px', fontWeight: 900 }}>
                    {fails}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Items list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.1rem' }}>
          {cat && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cat.items.map(item => (
                <div key={item.id} style={{
                  background: 'var(--surface-2)', borderRadius: 12, padding: '.7rem .85rem',
                  borderLeft: `3px solid ${item.result === 'fail' ? 'var(--error)' : item.result === 'pass' ? 'var(--success)' : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{
                      fontSize: '.88rem', fontWeight: 700, flex: 1,
                      color: item.result === 'fail' ? 'var(--error)' : item.result === 'pass' ? 'var(--text)' : 'var(--muted)',
                    }}>
                      {item.label}
                    </span>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <ResultPill current={item.result} target="pass" onClick={() => setResult(cat.id, item.id, 'pass')} />
                      <ResultPill current={item.result} target="fail" onClick={() => setResult(cat.id, item.id, 'fail')} />
                      <ResultPill current={item.result} target="na"   onClick={() => setResult(cat.id, item.id, 'na')}   />
                    </div>
                  </div>
                  {item.result === 'fail' && (
                    <input
                      placeholder="Describe defect…"
                      value={itemNotes[item.id] ?? ''}
                      onChange={e => setItemNotes(p => ({ ...p, [item.id]: e.target.value }))}
                      style={{
                        marginTop: 8, width: '100%', padding: '.42rem .6rem', borderRadius: 8,
                        border: '1px solid var(--error)', background: 'rgba(232,64,0,.06)',
                        color: 'var(--text)', fontSize: '.82rem', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Prev / Next */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              disabled={activeCat === 0}
              onClick={() => setActiveCat(p => Math.max(0, p - 1))}
              style={{
                flex: 1, padding: '.6rem', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--surface-2)', color: activeCat === 0 ? 'var(--faint)' : 'var(--text)',
                fontWeight: 700, fontSize: '.82rem', cursor: activeCat === 0 ? 'default' : 'pointer',
              }}
            >← Prev</button>
            <button
              disabled={activeCat === categories.length - 1}
              onClick={() => setActiveCat(p => Math.min(categories.length - 1, p + 1))}
              style={{
                flex: 1, padding: '.6rem', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--surface-2)', color: activeCat === categories.length - 1 ? 'var(--faint)' : 'var(--text)',
                fontWeight: 700, fontSize: '.82rem', cursor: activeCat === categories.length - 1 ? 'default' : 'pointer',
              }}
            >Next →</button>
          </div>

          {/* Sign-off section (last tab) */}
          {activeCat === categories.length - 1 && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {failCount > 0 && (
                <div style={{ background: 'rgba(232,64,0,.08)', border: '1.5px solid var(--error)', borderRadius: 12, padding: '.75rem .9rem' }}>
                  <div style={{ fontWeight: 800, color: 'var(--error)', fontSize: '.88rem', marginBottom: 6 }}>
                    ❌ {failCount} Defect{failCount !== 1 ? 's' : ''} Found
                  </div>
                  {failItems.map(i => (
                    <div key={i.id} style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: 2 }}>
                      • {i.label}{itemNotes[i.id] ? `: ${itemNotes[i.id]}` : ''}
                    </div>
                  ))}
                </div>
              )}

              <textarea
                placeholder="Overall notes (optional)…"
                rows={2}
                value={globalNotes}
                onChange={e => setGlobalNotes(e.target.value)}
                style={{
                  width: '100%', padding: '.55rem .75rem', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--text)', fontSize: '.88rem', outline: 'none',
                  boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit',
                }}
              />

              <label style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '.65rem .85rem', borderRadius: 12, cursor: 'pointer',
                border: `1.5px solid ${signedOff ? 'var(--success)' : 'var(--error)'}`,
                background: signedOff ? 'rgba(0,200,100,.08)' : 'rgba(232,64,0,.06)',
              }}>
                <input
                  type="checkbox"
                  checked={signedOff}
                  onChange={e => setSignedOff(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: signedOff ? 'var(--success)' : 'var(--error)' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '.88rem', color: signedOff ? 'var(--success)' : 'var(--error)' }}>
                    {signedOff ? '✅ Vehicle safe to operate' : '🛑 Vehicle NOT safe to operate'}
                  </div>
                  <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 1 }}>
                    {signedOff ? 'Driver certifies unit is roadworthy' : 'Do not dispatch — repair required'}
                  </div>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, padding: '.75rem 1.1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
          <button onClick={handleSave} disabled={saving || saved} style={{
            width: '100%', padding: '1rem', borderRadius: 14, border: 'none',
            background: saved ? 'var(--success)' : failCount > 0 ? 'var(--error)' : 'var(--primary)',
            color: (failCount > 0 && !saved) ? '#fff' : '#000',
            fontWeight: 900, fontSize: '1rem',
            cursor: saving || saved ? 'default' : 'pointer', opacity: saving ? .7 : 1, transition: 'all .2s',
          }}>
            {saved   ? '✅ Saved'
            : saving ? 'Saving…'
            : failCount > 0
              ? `❌ Save — ${failCount} Defect${failCount !== 1 ? 's' : ''} Found`
              : '✅ Sign Off — Vehicle Clear'}
          </button>
        </div>
      </div>
    </>
  )
}
