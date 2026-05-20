'use client'
import { useState } from 'react'
import Link from 'next/link'
import { getDieselPrice } from '@/lib/scoreLoad'
import type { LoadMission } from '@/lib/dashboard/types'
import { todayISO } from '@/lib/dashboard/helpers'

interface Props {
  open:    boolean
  onClose: () => void
  onSave:  (mission: LoadMission) => void | Promise<void>
}

export default function NewLoadSheet({ open, onClose, onSave }: Props) {
  const [origin,  setOrigin]  = useState('')
  const [dest,    setDest]    = useState('')
  const [rate,    setRate]    = useState('')
  const [miles,   setMiles]   = useState('')
  const [saving,  setSaving]  = useState(false)

  if (!open) return null

  const canSave = origin.trim() !== '' && dest.trim() !== ''

  const handleSave = () => {
    if (!canSave) return
    setSaving(true)
    const nm: LoadMission = {
      id:                  crypto.randomUUID(),
      loadNumber:          '',
      broker:              undefined,
      origin:              origin.trim(),
      destination:         dest.trim(),
      date:                todayISO(),
      dispatchMiles:       parseInt(miles) || 0,
      deadheadMiles:       0,
      grossRate:           parseFloat(rate) || 0,
      fuelPrice:           getDieselPrice(origin.trim()),
      rigType:             'semi-solo',
      waitHours:           0,
      reloadKnown:         false,
      reloadAreaStrength:  2,
      hasOvernightParking: false,
      loadType:            'FTL',
    }
    try { localStorage.setItem('3b-latest-load', JSON.stringify(nm)) } catch { /* ignore */ }
    onSave(nm)
    setOrigin(''); setDest(''); setRate(''); setMiles('')
    setSaving(false)
    onClose()
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,13,11,.7)' }} onClick={onClose} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, background: 'var(--surface)', borderTop: '2px solid rgba(0,232,176,.25)', borderRadius: '20px 20px 0 0', padding: '1.5rem 1.5rem 2.5rem', maxHeight: '90dvh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>⚡ Quick Load Intake</div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>Origin + dest required — full details in Loads</div>
          </div>
          <button onClick={onClose} style={{ padding: '.4rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.85rem' }}>✕</button>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Origin *</label>
              <input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="City, ST"
                style={{ width: '100%', padding: '.65rem .8rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.9rem', fontWeight: 600 }} />
            </div>
            <div>
              <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Destination *</label>
              <input value={dest} onChange={e => setDest(e.target.value)} placeholder="City, ST"
                style={{ width: '100%', padding: '.65rem .8rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.9rem', fontWeight: 600 }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Gross Rate</label>
              <input type="number" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} placeholder="$0.00"
                style={{ width: '100%', padding: '.65rem .8rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.9rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} />
            </div>
            <div>
              <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Loaded Miles</label>
              <input type="number" inputMode="numeric" value={miles} onChange={e => setMiles(e.target.value)} placeholder="0 mi"
                style={{ width: '100%', padding: '.65rem .8rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.9rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginTop: 4 }}>
            <button onClick={handleSave} disabled={saving || !canSave}
              style={{ padding: '1rem', borderRadius: 12, border: 'none', background: !canSave ? 'var(--surface-2)' : 'rgba(0,232,176,.15)', color: !canSave ? 'var(--muted)' : 'var(--primary)', fontWeight: 800, fontSize: '1rem', cursor: !canSave ? 'not-allowed' : 'pointer', minHeight: 56 }}>
              {saving ? 'Saving…' : '✓ Save Load'}
            </button>
            <Link href="/loads" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem 1.25rem', borderRadius: 12, border: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 700, fontSize: '.85rem', textDecoration: 'none', minHeight: 56 }}>
              Full Form →
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
