'use client'
import { useState } from 'react'
import Link from 'next/link'
import { getDieselPrice } from '@/lib/scoreLoad'
import type { LoadMission, RoutePreference } from '@/lib/dashboard/types'
import { todayISO } from '@/lib/dashboard/helpers'
import { computeRouteRisk, ROUTE_PREF_META, ROUTE_RISK_META } from '@/lib/dashboard/routePreference'

interface Props {
  open:    boolean
  onClose: () => void
  onSave:  (mission: LoadMission) => void | Promise<void>
}

const PREFS: RoutePreference[] = ['main_corridors', 'fastest', 'fuel_saver', 'avoid_cities', 'manual_review']

export default function NewLoadSheet({ open, onClose, onSave }: Props) {
  const [origin,      setOrigin]      = useState('')
  const [dest,        setDest]        = useState('')
  const [rate,        setRate]        = useState('')
  const [miles,       setMiles]       = useState('')
  const [routePref,   setRoutePref]   = useState<RoutePreference>('main_corridors')
  const [routeNotes,  setRouteNotes]  = useState('')
  const [saving,      setSaving]      = useState(false)

  if (!open) return null

  const canSave   = origin.trim() !== '' && dest.trim() !== ''
  const routeRisk = computeRouteRisk(routeNotes, routePref)

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
      routePreference:     routePref,
      routeNotes:          routeNotes.trim() || undefined,
    }
    try { localStorage.setItem('3b-latest-load', JSON.stringify(nm)) } catch { /* ignore */ }
    onSave(nm)
    setOrigin(''); setDest(''); setRate(''); setMiles('')
    setRoutePref('main_corridors'); setRouteNotes('')
    setSaving(false)
    onClose()
  }

  const prefMeta    = ROUTE_PREF_META[routePref]
  const riskMeta    = ROUTE_RISK_META[routeRisk.level]

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,13,11,.7)' }} onClick={onClose} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, background: 'var(--surface)', borderTop: '2px solid rgba(0,232,176,.25)', borderRadius: '20px 20px 0 0', padding: '1.5rem 1.5rem 2.5rem', maxHeight: '92dvh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>⚡ Quick Load Intake</div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>Origin + dest required — full details in Loads</div>
          </div>
          <button onClick={onClose} style={{ padding: '.4rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.85rem' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>

          {/* Origin / Destination */}
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

          {/* Rate / Miles */}
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

          {/* ── Route Preference ── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Route Preference</label>
              {/* Live risk badge — updates as notes change */}
              {(routeNotes.trim() || routePref === 'manual_review') && (
                <span style={{ fontSize: '.6rem', fontWeight: 800, padding: '.15rem .5rem', borderRadius: 5, background: riskMeta.bg, color: riskMeta.color, border: `1px solid ${riskMeta.border}` }}>
                  {riskMeta.label}
                </span>
              )}
            </div>
            {/* Pill selector */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {PREFS.map(p => {
                const m = ROUTE_PREF_META[p]
                const active = routePref === p
                return (
                  <button key={p} onClick={() => setRoutePref(p)} style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '.38rem .65rem',
                    borderRadius: 8, border: active ? '1px solid rgba(0,232,176,.5)' : '1px solid var(--border)',
                    background: active ? 'rgba(0,232,176,.1)' : 'var(--surface-2)',
                    color: active ? 'var(--primary)' : 'var(--muted)',
                    fontSize: '.72rem', fontWeight: 700, cursor: 'pointer',
                    transition: 'all .12s',
                  }}>
                    {m.emoji} {m.label}
                  </button>
                )
              })}
            </div>
            {/* Preference description */}
            <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
              {prefMeta.desc}
            </div>
          </div>

          {/* ── Route Notes (optional) ── */}
          <div>
            <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>
              Route Notes <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional — e.g. &quot;use I-40 westbound, avoid I-10&quot;)</span>
            </label>
            <input
              value={routeNotes}
              onChange={e => setRouteNotes(e.target.value)}
              placeholder="e.g. I-40 W to I-15 S — standard corridor"
              style={{ width: '100%', padding: '.65rem .8rem', borderRadius: 10, border: `1px solid ${routeRisk.showWarning ? riskMeta.border : 'var(--border)'}`, background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.85rem', fontWeight: 500 }}
            />
          </div>

          {/* ── Route Risk Warning (live) ── */}
          {routeRisk.showWarning && routeRisk.disclaimer && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '.65rem .85rem', borderRadius: 10, background: routeRisk.level === 'HIGH' ? 'rgba(232,64,0,.08)' : 'rgba(245,194,0,.08)', border: `1px solid ${riskMeta.border}` }}>
              <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>{routeRisk.level === 'HIGH' ? '🔴' : '🟡'}</span>
              <div>
                <div style={{ fontSize: '.75rem', fontWeight: 800, color: riskMeta.color, marginBottom: 2 }}>
                  {routeRisk.level === 'HIGH' ? 'High Route Risk' : 'Route Advisory'}
                </div>
                <div style={{ fontSize: '.72rem', color: riskMeta.color, lineHeight: 1.45 }}>
                  {routeRisk.disclaimer}
                </div>
                {routeRisk.reasons.map((r, i) => (
                  <div key={i} style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 3, lineHeight: 1.4 }}>• {r}</div>
                ))}
              </div>
            </div>
          )}

          {/* ── Save / Full Form ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginTop: 2 }}>
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
