'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import { getDieselPrice } from '@/lib/scoreLoad'
import type { LoadMission, RoutePreference, MissionStop, StopType } from '@/lib/dashboard/types'
import { todayISO } from '@/lib/dashboard/helpers'
import { computeRouteRisk, ROUTE_PREF_META, ROUTE_RISK_META } from '@/lib/dashboard/routePreference'
import { generateOrderNumber, getTimezone } from '@/lib/dashboard/orderUtils'

interface Props {
  open:    boolean
  onClose: () => void
  onSave:  (mission: LoadMission) => void | Promise<void>
}

const PREFS: RoutePreference[] = ['main_corridors', 'fastest', 'fuel_saver', 'avoid_cities', 'manual_review']

const STOP_TYPES: { type: StopType; emoji: string; label: string }[] = [
  { type: 'pickup',   emoji: '📦', label: 'Pickup'   },
  { type: 'delivery', emoji: '🏪', label: 'Delivery' },
  { type: 'relay',    emoji: '🔄', label: 'Relay'    },
  { type: 'fuel',     emoji: '⛽', label: 'Fuel'     },
  { type: 'yard',     emoji: '🏠', label: 'Yard'     },
]

function makeStop(seq: number, type: StopType = 'delivery'): MissionStop {
  return { id: crypto.randomUUID(), sequence: seq, type, name: '', address: '', city: '', state: '' }
}

// ── Inline stop editor ────────────────────────────────────────────────────────
function StopEditor({
  stop, index, total,
  onChange, onRemove, onMoveUp, onMoveDown,
}: {
  stop: MissionStop; index: number; total: number
  onChange: (id: string, updates: Partial<MissionStop>) => void
  onRemove: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(index === 0)
  const u = (k: keyof MissionStop, v: string | boolean) => onChange(stop.id, { [k]: v })

  const label = STOP_TYPES.find(t => t.type === stop.type) ?? STOP_TYPES[1]
  const displayName = stop.name || stop.city || `Stop ${stop.sequence}`

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', overflow: 'hidden' }}>
      {/* Collapsed header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '.6rem .8rem', cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ fontSize: '.88rem' }}>{label.emoji}</span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: '.82rem', color: 'var(--text)' }}>
          {stop.sequence}. {label.label} — {displayName || 'Enter details…'}
        </span>
        {stop.appointmentStart && (
          <span style={{ fontSize: '.65rem', color: 'var(--muted)', fontWeight: 600 }}>
            {new Date(stop.appointmentStart).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
          </span>
        )}
        {/* Reorder arrows */}
        <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
          {index > 0 && (
            <button onClick={() => onMoveUp(stop.id)} style={{ fontSize: '.7rem', padding: '.1rem .3rem', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>↑</button>
          )}
          {index < total - 1 && (
            <button onClick={() => onMoveDown(stop.id)} style={{ fontSize: '.7rem', padding: '.1rem .3rem', borderRadius: 4, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>↓</button>
          )}
          <button onClick={() => onRemove(stop.id)} style={{ fontSize: '.7rem', padding: '.1rem .35rem', borderRadius: 4, border: '1px solid rgba(232,64,0,.2)', background: 'rgba(232,64,0,.05)', color: 'var(--error)', cursor: 'pointer' }}>✕</button>
        </div>
        <span style={{ fontSize: '.7rem', color: 'var(--muted)', marginLeft: 2 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded fields */}
      {expanded && (
        <div style={{ padding: '.75rem .8rem', borderTop: '1px solid var(--border)', display: 'grid', gap: 8 }}>
          {/* Stop type pills */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {STOP_TYPES.map(t => (
              <button key={t.type} onClick={() => u('type', t.type)} style={{
                fontSize: '.65rem', fontWeight: 700, padding: '.22rem .5rem', borderRadius: 6, cursor: 'pointer',
                border: stop.type === t.type ? '1px solid rgba(0,232,176,.5)' : '1px solid var(--border)',
                background: stop.type === t.type ? 'rgba(0,232,176,.1)' : 'transparent',
                color: stop.type === t.type ? 'var(--primary)' : 'var(--muted)',
              }}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
          {/* Name + address + phone */}
          <div style={{ display: 'grid', gap: 6 }}>
            <input value={stop.name} onChange={e => u('name', e.target.value)} placeholder="Facility / store name"
              style={{ width: '100%', padding: '.5rem .7rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.82rem', fontWeight: 600 }} />
            <input value={stop.address ?? ''} onChange={e => u('address', e.target.value)} placeholder="Street address (optional)"
              style={{ width: '100%', padding: '.5rem .7rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.82rem' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 6 }}>
              <input value={stop.city ?? ''} onChange={e => u('city', e.target.value)} placeholder="City"
                style={{ padding: '.5rem .7rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.82rem' }} />
              <input value={stop.state ?? ''} onChange={e => u('state', e.target.value)} placeholder="ST" maxLength={2}
                style={{ padding: '.5rem .7rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.82rem', textTransform: 'uppercase' }} />
            </div>
            <input type="text" inputMode="tel" value={stop.phone ?? ''} onChange={e => u('phone', e.target.value)} placeholder="Phone number (optional)"
              style={{ width: '100%', padding: '.5rem .7rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.82rem' }} />
          </div>
          {/* Appointment + reference */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div>
              <label style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 3 }}>Appointment</label>
              <input type="datetime-local" value={stop.appointmentStart ?? ''} onChange={e => u('appointmentStart', e.target.value)}
                style={{ width: '100%', padding: '.5rem .7rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.78rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 3 }}>REF / BOL #</label>
              <input value={stop.reference ?? ''} onChange={e => u('reference', e.target.value)} placeholder="Optional"
                style={{ width: '100%', padding: '.5rem .7rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.78rem' }} />
            </div>
          </div>
          {/* Notes */}
          <input value={stop.notes ?? ''} onChange={e => u('notes', e.target.value)} placeholder="Stop notes (dock hours, dock #, restrictions…)"
            style={{ width: '100%', padding: '.5rem .7rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.78rem' }} />
        </div>
      )}
    </div>
  )
}

// ── Main sheet ────────────────────────────────────────────────────────────────
export default function NewLoadSheet({ open, onClose, onSave }: Props) {
  const [origin,        setOrigin]        = useState('')
  const [originName,    setOriginName]    = useState('')
  const [originPhone,   setOriginPhone]   = useState('')
  const [dest,          setDest]          = useState('')
  const [destName,      setDestName]      = useState('')
  const [destPhone,     setDestPhone]     = useState('')
  const [rate,          setRate]          = useState('')
  const [miles,         setMiles]         = useState('')
  const [routePref,     setRoutePref]     = useState<RoutePreference>('main_corridors')
  const [routeNotes,    setRouteNotes]    = useState('')
  const [multiStop,     setMultiStop]     = useState(false)
  const [stops,         setStops]         = useState<MissionStop[]>([])
  const [saving,        setSaving]        = useState(false)
  // Per-order trailer assignment
  const [orderTrailerNum,   setOrderTrailerNum]   = useState('')
  const [orderTrailerPlate, setOrderTrailerPlate] = useState('')
  // BOL scan
  const [bolScanning, setBolScanning] = useState(false)
  const [bolMsg,      setBolMsg]      = useState<{ text: string; ok: boolean } | null>(null)
  const bolInputRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  // ── BOL / Rate Confirmation scan ─────────────────────────────────────────────
  const handleBolScan = async (file: File) => {
    setBolScanning(true)
    setBolMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch('/api/bol-scan', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || data.error) {
        setBolMsg({ text: data.error ?? 'Scan failed — try again', ok: false })
        return
      }
      // Fill any field that came back with a value
      const filled: string[] = []
      if (data.origin)      { setOrigin(data.origin);           filled.push('origin') }
      if (data.shipper)     { setOriginName(data.shipper);       filled.push('shipper') }
      if (data.originPhone) { setOriginPhone(data.originPhone);  filled.push('origin phone') }
      if (data.destination) { setDest(data.destination);         filled.push('destination') }
      if (data.consignee)   { setDestName(data.consignee);       filled.push('consignee') }
      if (data.destPhone)   { setDestPhone(data.destPhone);      filled.push('dest phone') }
      if (data.grossRate)   { setRate(data.grossRate);            filled.push('rate') }
      if (data.miles)       { setMiles(data.miles);               filled.push('miles') }

      // If BOL has multi-stop data, enable multi-stop and seed stops
      if (Array.isArray(data.stops) && data.stops.length >= 2) {
        setMultiStop(true)
        const seeded: MissionStop[] = data.stops.map((s: { sequence: number; type: StopType; name?: string; address?: string; city?: string; state?: string; phone?: string; reference?: string; appt?: string }, i: number) => ({
          id:               crypto.randomUUID(),
          sequence:         s.sequence ?? (i + 1),
          type:             (s.type as StopType) ?? (i === 0 ? 'pickup' : 'delivery'),
          name:             s.name ?? '',
          address:          s.address ?? '',
          city:             s.city ?? '',
          state:            s.state ?? '',
          phone:            s.phone ?? '',
          reference:        s.reference ?? '',
          appointmentStart: s.appt ?? '',
        }))
        setStops(seeded)
        filled.push(`${seeded.length} stops`)
      } else if (multiStop && stops.length > 0 && data.originAddress) {
        // Single-stop BOL — seed origin stop address/name if multi-stop already on
        changeStop(stops[0].id, {
          address: data.originAddress,
          name:    data.shipper ?? stops[0].name,
          phone:   data.originPhone ?? stops[0].phone,
        })
      }
      setBolMsg({
        text: filled.length > 0
          ? `✅ Filled: ${filled.join(', ')} — verify before saving`
          : '⚠️ No fields detected — try a clearer photo',
        ok: filled.length > 0,
      })
    } catch {
      setBolMsg({ text: '❌ Network error — check connection', ok: false })
    } finally {
      setBolScanning(false)
      // Reset file input so the same file can trigger onChange again
      if (bolInputRef.current) bolInputRef.current.value = ''
    }
  }

  // ── Stop management ──────────────────────────────────────────────────────────
  const addStop = (type: StopType = 'delivery') => {
    setStops(prev => [...prev, makeStop(prev.length + 1, type)])
  }

  const removeStop = (id: string) => {
    setStops(prev => {
      const next = prev.filter(s => s.id !== id)
      return next.map((s, i) => ({ ...s, sequence: i + 1 }))
    })
  }

  const changeStop = (id: string, updates: Partial<MissionStop>) => {
    setStops(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  const moveUp = (id: string) => {
    setStops(prev => {
      const i = prev.findIndex(s => s.id === id)
      if (i <= 0) return prev
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next.map((s, idx) => ({ ...s, sequence: idx + 1 }))
    })
  }

  const moveDown = (id: string) => {
    setStops(prev => {
      const i = prev.findIndex(s => s.id === id)
      if (i >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      return next.map((s, idx) => ({ ...s, sequence: idx + 1 }))
    })
  }

  const enableMultiStop = () => {
    setMultiStop(true)
    if (stops.length === 0) {
      // Seed with a pickup + delivery
      const pickup   = makeStop(1, 'pickup')
      const delivery = makeStop(2, 'delivery')
      // Pre-fill from origin/dest and name/phone if already entered
      if (origin.trim()) {
        pickup.name  = originName.trim() || ''
        pickup.city  = origin.split(',')[0].trim()
        pickup.state = origin.split(',')[1]?.trim() ?? ''
        if (originPhone.trim()) pickup.phone = originPhone.trim()
      }
      if (dest.trim()) {
        delivery.name  = destName.trim() || ''
        delivery.city  = dest.split(',')[0].trim()
        delivery.state = dest.split(',')[1]?.trim() ?? ''
        if (destPhone.trim()) delivery.phone = destPhone.trim()
      }
      setStops([pickup, delivery])
    }
  }

  // Auto-derive destination from last delivery stop
  const lastDelivery = [...stops].reverse().find(s => s.type === 'delivery' || s.type === 'relay')
  const effectiveDest = multiStop && lastDelivery
    ? [lastDelivery.city, lastDelivery.state].filter(Boolean).join(', ') || dest
    : dest

  const canSave   = origin.trim() !== '' && (effectiveDest.trim() !== '' || !multiStop && dest.trim() !== '')
  const routeRisk = computeRouteRisk(routeNotes, routePref)
  const riskMeta  = ROUTE_RISK_META[routeRisk.level]
  const prefMeta  = ROUTE_PREF_META[routePref]

  const handleSave = () => {
    if (!canSave) return
    setSaving(true)
    const finalDest = effectiveDest.trim() || dest.trim()
    const now       = new Date().toISOString()
    const orderNumber = generateOrderNumber()
    // Snapshot driver/tractor from settings for this order
    let driverName = '', tractorId = ''
    try {
      const raw = localStorage.getItem('3b-fleet-settings')
      if (raw) { const s = JSON.parse(raw); driverName = s.driverName ?? ''; tractorId = s.truckNum ?? '' }
    } catch { /* ignore */ }

    // Stamp stops with mission context
    const stampedStops = (multiStop && stops.length > 0 ? stops : undefined)?.map((s, i) => ({
      ...s,
      loggedAt:    s.loggedAt    ?? now,
    }))

    const nm: LoadMission = {
      id:                  crypto.randomUUID(),
      loadNumber:          '',
      broker:              undefined,
      origin:              origin.trim(),
      destination:         finalDest,
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
      stops:               stampedStops,
      // ── Phase 5C: order identity ──────────────────────────────────────────
      orderNumber,
      driverName:          driverName || undefined,
      tractorId:           tractorId  || undefined,
      trailerNum:          orderTrailerNum.trim()   || undefined,
      trailerPlate:        orderTrailerPlate.trim() || undefined,
      timestamps: {
        orderCreatedAt: now,
        lastUpdatedAt:  now,
      },
    }
    try { localStorage.setItem('3b-latest-load', JSON.stringify(nm)) } catch { /* ignore */ }
    onSave(nm)
    // Reset
    setOrigin(''); setOriginName(''); setOriginPhone('')
    setDest('');   setDestName('');   setDestPhone('')
    setRate('');   setMiles('')
    setRoutePref('main_corridors'); setRouteNotes('')
    setMultiStop(false); setStops([])
    setOrderTrailerNum(''); setOrderTrailerPlate('')
    setSaving(false)
    onClose()
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,13,11,.7)' }} onClick={onClose} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, background: 'var(--surface)', borderTop: '2px solid rgba(0,232,176,.25)', borderRadius: '20px 20px 0 0', padding: '1.5rem 1.5rem 2.5rem', maxHeight: '94dvh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>⚡ Quick Load Intake</div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
              {multiStop ? `Multi-stop · ${stops.length} stop${stops.length !== 1 ? 's' : ''}` : 'Single destination — full details in Loads'}
            </div>
          </div>
          <button onClick={onClose} style={{ padding: '.4rem .75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.85rem' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>

          {/* ── BOL / Rate Confirmation Scan ── */}
          <div style={{ background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.15)', borderRadius: 12, padding: '.8rem .9rem', display: 'grid', gap: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '.75rem', color: 'var(--primary)' }}>📷 Scan BOL / Rate Confirmation</div>
                <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 2 }}>
                  Take a photo — AI fills origin, destination, rate &amp; miles automatically
                </div>
              </div>
            </div>
            {/* Hidden file input — opens camera on mobile */}
            <input
              ref={bolInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleBolScan(file)
              }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Camera button — primary */}
              <button
                type="button"
                disabled={bolScanning}
                onClick={() => bolInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '.55rem 1rem', borderRadius: 9,
                  background: bolScanning ? 'var(--surface-2)' : 'var(--primary)',
                  color: bolScanning ? 'var(--muted)' : '#061210',
                  border: 'none', fontWeight: 800, fontSize: '.78rem',
                  cursor: bolScanning ? 'default' : 'pointer', opacity: bolScanning ? .7 : 1,
                }}
              >
                {bolScanning ? '⏳ Scanning…' : '📷 Scan Document'}
              </button>
              {/* Gallery / file fallback (no capture attribute) */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '.5rem .85rem', borderRadius: 9,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--muted)', fontWeight: 700, fontSize: '.72rem', cursor: 'pointer',
              }}>
                🖼 Choose File
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleBolScan(file)
                  }}
                />
              </label>
            </div>
            {bolMsg && (
              <div style={{
                fontSize: '.7rem', fontWeight: 600, padding: '.4rem .65rem', borderRadius: 7,
                background: bolMsg.ok ? 'rgba(40,192,72,.08)' : 'rgba(245,194,0,.08)',
                border: `1px solid ${bolMsg.ok ? 'rgba(40,192,72,.2)' : 'rgba(245,194,0,.2)'}`,
                color: bolMsg.ok ? 'var(--success)' : 'var(--warn)',
                lineHeight: 1.4,
              }}>
                {bolMsg.text}
              </div>
            )}
          </div>

          {/* Origin */}
          <div style={{ display: 'grid', gap: 6, padding: '.6rem .7rem', borderRadius: 10, background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.15)' }}>
            <div style={{ fontSize: '.58rem', fontWeight: 900, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.1em' }}>📍 Origin</div>
            <div>
              <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Facility / Location Name</label>
              <input value={originName} onChange={e => setOriginName(e.target.value)} placeholder="Shipper name, facility…"
                style={{ width: '100%', padding: '.55rem .75rem', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.85rem', fontWeight: 600 }} />
            </div>
            <div>
              <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Address / City, ST *</label>
              <input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="City, ST or full address"
                style={{ width: '100%', padding: '.55rem .75rem', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.85rem', fontWeight: 600 }} />
            </div>
            <div>
              <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Phone Number</label>
              <input type="text" inputMode="tel" value={originPhone} onChange={e => setOriginPhone(e.target.value)} placeholder="(800) 555-0100"
                style={{ width: '100%', padding: '.55rem .75rem', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.85rem' }} />
            </div>
          </div>

          {/* Destination — hidden in multi-stop mode (auto-derived) */}
          {!multiStop && (
            <div style={{ display: 'grid', gap: 6, padding: '.6rem .7rem', borderRadius: 10, background: 'rgba(40,192,72,.04)', border: '1px solid rgba(40,192,72,.15)' }}>
              <div style={{ fontSize: '.58rem', fontWeight: 900, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '.1em' }}>🏁 Destination</div>
              <div>
                <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Facility / Location Name</label>
                <input value={destName} onChange={e => setDestName(e.target.value)} placeholder="Receiver, DC name…"
                  style={{ width: '100%', padding: '.55rem .75rem', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.85rem', fontWeight: 600 }} />
              </div>
              <div>
                <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Address / City, ST *</label>
                <input value={dest} onChange={e => setDest(e.target.value)} placeholder="City, ST or full address"
                  style={{ width: '100%', padding: '.55rem .75rem', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.85rem', fontWeight: 600 }} />
              </div>
              <div>
                <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Phone Number</label>
                <input type="text" inputMode="tel" value={destPhone} onChange={e => setDestPhone(e.target.value)} placeholder="(800) 555-0100"
                  style={{ width: '100%', padding: '.55rem .75rem', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.85rem' }} />
              </div>
            </div>
          )}

          {/* Add Destination — shortcut to enable multi-stop when user wants multiple drops */}
          {!multiStop && (
            <button
              onClick={enableMultiStop}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '.45rem', borderRadius: 9, border: '1px dashed rgba(40,192,72,.3)', background: 'rgba(40,192,72,.03)', color: 'var(--success)', fontWeight: 700, fontSize: '.75rem', cursor: 'pointer' }}
            >
              ➕ Add Destination / Multi-Stop
            </button>
          )}

          {/* Rate / Miles */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Gross Rate</label>
              <input type="text" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} placeholder="0.00"
                style={{ width: '100%', padding: '.65rem .8rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.9rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} />
            </div>
            <div>
              <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Total Miles</label>
              <input type="text" inputMode="numeric" value={miles} onChange={e => setMiles(e.target.value)} placeholder="0"
                style={{ width: '100%', padding: '.65rem .8rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.9rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} />
            </div>
          </div>

          {/* ── Multi-Stop Section ── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: multiStop ? 8 : 0 }}>
              <div>
                <div style={{ fontSize: '.7rem', fontWeight: 800, color: multiStop ? 'var(--primary)' : 'var(--muted)' }}>
                  🛑 Multi-Stop Load
                </div>
                {!multiStop && (
                  <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 1 }}>Retail, relay, multi-delivery</div>
                )}
              </div>
              <button onClick={multiStop ? () => { setMultiStop(false); setStops([]) } : enableMultiStop} style={{
                fontSize: '.7rem', fontWeight: 800, padding: '.3rem .7rem', borderRadius: 7, cursor: 'pointer',
                border: multiStop ? '1px solid rgba(0,232,176,.4)' : '1px solid var(--border)',
                background: multiStop ? 'rgba(0,232,176,.1)' : 'var(--surface-2)',
                color: multiStop ? 'var(--primary)' : 'var(--muted)',
              }}>
                {multiStop ? '✓ Multi-stop ON' : '+ Enable'}
              </button>
            </div>

            {multiStop && (
              <div style={{ display: 'grid', gap: 7 }}>
                {stops.map((stop, i) => (
                  <StopEditor
                    key={stop.id}
                    stop={stop} index={i} total={stops.length}
                    onChange={changeStop} onRemove={removeStop}
                    onMoveUp={moveUp} onMoveDown={moveDown}
                  />
                ))}
                {/* Add stop buttons */}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {STOP_TYPES.slice(0, 4).map(t => (
                    <button key={t.type} onClick={() => addStop(t.type)} style={{
                      fontSize: '.65rem', fontWeight: 700, padding: '.28rem .6rem', borderRadius: 7, cursor: 'pointer',
                      border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--muted)',
                    }}>
                      + {t.emoji} {t.label}
                    </button>
                  ))}
                </div>
                {/* Auto-derived destination pill */}
                {lastDelivery && (
                  <div style={{ fontSize: '.65rem', color: 'var(--muted)', padding: '.3rem .6rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7 }}>
                    📍 Final destination auto-set: <strong style={{ color: 'var(--text)' }}>{effectiveDest}</strong>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Route Preference ── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Route Preference</label>
              {(routeNotes.trim() || routePref === 'manual_review') && (
                <span style={{ fontSize: '.6rem', fontWeight: 800, padding: '.15rem .5rem', borderRadius: 5, background: riskMeta.bg, color: riskMeta.color, border: `1px solid ${riskMeta.border}` }}>
                  {riskMeta.label}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {PREFS.map(p => {
                const m = ROUTE_PREF_META[p]
                const active = routePref === p
                return (
                  <button key={p} onClick={() => setRoutePref(p)} style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '.38rem .65rem', borderRadius: 8,
                    border: active ? '1px solid rgba(0,232,176,.5)' : '1px solid var(--border)',
                    background: active ? 'rgba(0,232,176,.1)' : 'var(--surface-2)',
                    color: active ? 'var(--primary)' : 'var(--muted)',
                    fontSize: '.72rem', fontWeight: 700, cursor: 'pointer', transition: 'all .12s',
                  }}>
                    {m.emoji} {m.label}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>{prefMeta.desc}</div>
          </div>

          {/* ── Route Notes ── */}
          <div>
            <label style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>
              Route Notes <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <input value={routeNotes} onChange={e => setRouteNotes(e.target.value)}
              placeholder="e.g. I-80 W to I-15 N — avoid I-10 corridor"
              style={{ width: '100%', padding: '.65rem .8rem', borderRadius: 10, border: `1px solid ${routeRisk.showWarning ? riskMeta.border : 'var(--border)'}`, background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.85rem', fontWeight: 500 }} />
          </div>

          {/* Route risk warning */}
          {routeRisk.showWarning && routeRisk.disclaimer && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '.65rem .85rem', borderRadius: 10, background: routeRisk.level === 'HIGH' ? 'rgba(232,64,0,.08)' : 'rgba(245,194,0,.08)', border: `1px solid ${riskMeta.border}` }}>
              <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>{routeRisk.level === 'HIGH' ? '🔴' : '🟡'}</span>
              <div>
                <div style={{ fontSize: '.75rem', fontWeight: 800, color: riskMeta.color, marginBottom: 2 }}>
                  {routeRisk.level === 'HIGH' ? 'High Route Risk' : 'Route Advisory'}
                </div>
                <div style={{ fontSize: '.72rem', color: riskMeta.color, lineHeight: 1.45 }}>{routeRisk.disclaimer}</div>
                {routeRisk.reasons.map((r, i) => (
                  <div key={i} style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 3, lineHeight: 1.4 }}>• {r}</div>
                ))}
              </div>
            </div>
          )}

          {/* ── Trailer Assignment (per-order) ── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ fontSize: '.62rem', fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 7 }}>
              🚛 Trailer — This Order
            </div>
            <div style={{ fontSize: '.62rem', color: 'var(--muted)', marginBottom: 8, lineHeight: 1.4 }}>
              Overrides your default trailer for this order only. Leave blank to use settings trailer.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 3 }}>Trailer #</label>
                <input
                  value={orderTrailerNum}
                  onChange={e => setOrderTrailerNum(e.target.value)}
                  placeholder="e.g. 260692"
                  style={{ width: '100%', padding: '.5rem .65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.85rem', fontWeight: 600 }}
                />
              </div>
              <div>
                <label style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 3 }}>Plate</label>
                <input
                  value={orderTrailerPlate}
                  onChange={e => setOrderTrailerPlate(e.target.value.toUpperCase())}
                  placeholder="e.g. TX-TR1234"
                  style={{ width: '100%', padding: '.5rem .65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.85rem', textTransform: 'uppercase' }}
                />
              </div>
            </div>
          </div>

          {/* ── Save / Full Form ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginTop: 2 }}>
            <button onClick={handleSave} disabled={saving || !canSave}
              style={{ padding: '1rem', borderRadius: 12, border: 'none', background: !canSave ? 'var(--surface-2)' : 'rgba(0,232,176,.15)', color: !canSave ? 'var(--muted)' : 'var(--primary)', fontWeight: 800, fontSize: '1rem', cursor: !canSave ? 'not-allowed' : 'pointer', minHeight: 56 }}>
              {saving ? 'Saving…' : `✓ Save${multiStop ? ` (${stops.length} stop${stops.length !== 1 ? 's' : ''})` : ''}`}
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
