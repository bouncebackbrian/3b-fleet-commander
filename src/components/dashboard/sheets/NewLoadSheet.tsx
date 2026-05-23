'use client'
/**
 * NewLoadSheet — 6-step load intake wizard
 *
 * Step 1: Basic load info  (load #, broker, rate, miles, BOL scan)
 * Step 2: Pickup stop      (origin, shipper, phone, appt, ref)
 * Step 3: Delivery stops   (multi-stop manager — add / duplicate / reorder)
 * Step 4: Equipment        (trailer, tractor, route preference)
 * Step 5: Review + save    (summary → writes localStorage + Supabase)
 *
 * Persistence:
 *   • Auto-saves draft after each step (3b-intake-draft)
 *   • On final save → supabaseFleetStore.saveLoad() + saveStops()
 *   • Calls onSave(mission) for dashboard to activate the mission
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { getDieselPrice } from '@/lib/scoreLoad'
import type { LoadMission, MissionStop, StopType, RoutePreference } from '@/lib/dashboard/types'
import { todayISO } from '@/lib/dashboard/helpers'
import { computeRouteRisk, ROUTE_PREF_META, ROUTE_RISK_META } from '@/lib/dashboard/routePreference'
import { generateOrderNumber } from '@/lib/dashboard/orderUtils'
import {
  saveLoad, saveStops, saveIntakeDraft, getIntakeDraft, clearIntakeDraft,
  type FleetLoad, type FleetStop,
} from '@/lib/supabaseFleetStore'

// ── Constants ─────────────────────────────────────────────────────────────────

const STOP_TYPES: { type: StopType; emoji: string; label: string }[] = [
  { type: 'pickup',   emoji: '📦', label: 'Pickup'   },
  { type: 'delivery', emoji: '🏪', label: 'Delivery' },
  { type: 'relay',    emoji: '🔄', label: 'Relay'    },
  { type: 'fuel',     emoji: '⛽', label: 'Fuel'     },
  { type: 'yard',     emoji: '🏠', label: 'Yard'     },
  { type: 'rest',     emoji: '💤', label: 'Rest'     },
  { type: 'scale',    emoji: '⚖️', label: 'Scale'    },
]

const PREFS: RoutePreference[] = ['main_corridors', 'fastest', 'fuel_saver', 'avoid_cities', 'manual_review']

const STEPS = [
  { num: 1, label: 'Load Info',   emoji: '📋' },
  { num: 2, label: 'Pickup',      emoji: '📦' },
  { num: 3, label: 'Deliveries',  emoji: '🏪' },
  { num: 4, label: 'Equipment',   emoji: '🚛' },
  { num: 5, label: 'Review',      emoji: '✅' },
]

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open:    boolean
  onClose: () => void
  onSave:  (mission: LoadMission) => void | Promise<void>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStop(seq: number, type: StopType = 'delivery'): FleetStop {
  return {
    id:       crypto.randomUUID(),
    sequence: seq,
    type,
    name:     '',
    address:  '',
    city:     '',
    state:    '',
  }
}

function fmtAppt(iso?: string) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }
  catch { return iso }
}

// ── Shared input style ────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', padding: '.55rem .75rem', borderRadius: 9,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box',
}
const label: React.CSSProperties = {
  fontSize: '.58rem', fontWeight: 800, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4,
}
const sectionHead: React.CSSProperties = {
  fontSize: '.6rem', fontWeight: 800, color: 'var(--primary)',
  textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.5rem',
}

// ── StopEditor ────────────────────────────────────────────────────────────────

function StopEditor({
  stop, index, total, onChange, onRemove, onMoveUp, onMoveDown, onDuplicate,
}: {
  stop: FleetStop; index: number; total: number
  onChange:   (id: string, p: Partial<FleetStop>) => void
  onRemove:   (id: string) => void
  onMoveUp:   (id: string) => void
  onMoveDown: (id: string) => void
  onDuplicate:(id: string) => void
}) {
  const [expanded, setExpanded] = useState(index === 0)
  const u = (k: keyof FleetStop, v: string | boolean) => onChange(stop.id, { [k]: v })
  const typeMeta   = STOP_TYPES.find(t => t.type === stop.type) ?? STOP_TYPES[1]
  const displayName = stop.name || stop.city || `Stop ${stop.sequence}`

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', overflow: 'hidden' }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '.6rem .8rem', cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ fontSize: '.9rem' }}>{typeMeta.emoji}</span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: '.82rem' }}>
          {stop.sequence}. {typeMeta.label} — {displayName}
        </span>
        {stop.appointmentStart && (
          <span style={{ fontSize: '.6rem', color: 'var(--primary)', fontWeight: 700 }}>
            {fmtAppt(stop.appointmentStart)}
          </span>
        )}
        {/* Controls */}
        <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
          {index > 0 && (
            <button onClick={() => onMoveUp(stop.id)} style={ctrlBtn}>↑</button>
          )}
          {index < total - 1 && (
            <button onClick={() => onMoveDown(stop.id)} style={ctrlBtn}>↓</button>
          )}
          <button onClick={() => onDuplicate(stop.id)} title="Duplicate stop" style={ctrlBtn}>⧉</button>
          <button onClick={() => onRemove(stop.id)} style={{ ...ctrlBtn, borderColor: 'rgba(232,64,0,.2)', color: 'var(--error)' }}>✕</button>
        </div>
        <span style={{ fontSize: '.65rem', color: 'var(--muted)' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '.75rem .8rem', borderTop: '1px solid var(--border)', display: 'grid', gap: 8 }}>
          {/* Type pills */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {STOP_TYPES.map(t => (
              <button key={t.type} onClick={() => u('type', t.type)} style={{
                fontSize: '.62rem', fontWeight: 700, padding: '.2rem .45rem', borderRadius: 6, cursor: 'pointer',
                border: stop.type === t.type ? '1px solid rgba(0,232,176,.45)' : '1px solid var(--border)',
                background: stop.type === t.type ? 'rgba(0,232,176,.1)' : 'transparent',
                color: stop.type === t.type ? 'var(--primary)' : 'var(--muted)',
              }}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>

          {/* Name + address */}
          <input value={stop.name}    onChange={e => u('name', e.target.value)}    placeholder="Facility / store name" style={inp} />
          <input value={stop.address ?? ''} onChange={e => u('address', e.target.value)} placeholder="Street address (optional)" style={inp} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 6 }}>
            <input value={stop.city  ?? ''} onChange={e => u('city',  e.target.value)} placeholder="City"  style={inp} />
            <input value={stop.state ?? ''} onChange={e => u('state', e.target.value)} placeholder="ST" maxLength={2} style={{ ...inp, textTransform: 'uppercase' }} />
          </div>
          <input value={stop.phone ?? ''} onChange={e => u('phone', e.target.value)} placeholder="Phone (optional)" style={inp} />

          {/* Appointment + REF */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div>
              <span style={label}>Appointment</span>
              <input type="datetime-local" value={stop.appointmentStart ?? ''} onChange={e => u('appointmentStart', e.target.value)} style={inp} />
            </div>
            <div>
              <span style={label}>REF / BOL #</span>
              <input value={stop.reference ?? ''} onChange={e => u('reference', e.target.value)} placeholder="Optional" style={inp} />
            </div>
          </div>

          {/* Notes */}
          <input value={stop.notes ?? ''} onChange={e => u('notes', e.target.value)}
            placeholder="Dock hours, dock #, restrictions, lumper info…" style={inp} />
        </div>
      )}
    </div>
  )
}

const ctrlBtn: React.CSSProperties = {
  fontSize: '.65rem', padding: '.15rem .3rem', borderRadius: 4,
  border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer',
}

// ── Step progress bar ─────────────────────────────────────────────────────────

function StepBar({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: '1.25rem' }}>
      {STEPS.map(s => (
        <div
          key={s.num}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          }}
        >
          <div style={{
            width: '100%', height: 3, borderRadius: 3,
            background: s.num <= current ? 'var(--primary)' : 'var(--border)',
            transition: 'background .2s',
          }} />
          <span style={{
            fontSize: '.52rem', fontWeight: 700,
            color: s.num === current ? 'var(--primary)' : s.num < current ? 'var(--muted)' : 'var(--border)',
            letterSpacing: '.04em', whiteSpace: 'nowrap',
          }}>
            {s.emoji} {s.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function NewLoadSheet({ open, onClose, onSave }: Props) {

  // ── Step state ───────────────────────────────────────────────────────────────
  const [step, setStep] = useState(1)

  // ── Step 1: Basic load info ──────────────────────────────────────────────────
  const [loadNumber, setLoadNumber] = useState('')
  const [broker,     setBroker]     = useState('')
  const [rate,       setRate]       = useState('')
  const [miles,      setMiles]      = useState('')

  // BOL scan
  const [bolScanning, setBolScanning] = useState(false)
  const [bolMsg,      setBolMsg]      = useState<{ text: string; ok: boolean } | null>(null)
  const bolInputRef = useRef<HTMLInputElement>(null)

  // ── Step 2: Pickup stop ──────────────────────────────────────────────────────
  const [pickup, setPickup] = useState<FleetStop>(makeStop(1, 'pickup'))

  // ── Step 3: Delivery stops ───────────────────────────────────────────────────
  const [deliveries, setDeliveries] = useState<FleetStop[]>([makeStop(2, 'delivery')])

  // ── Step 4: Equipment ────────────────────────────────────────────────────────
  const [trailerNum,   setTrailerNum]   = useState('')
  const [trailerPlate, setTrailerPlate] = useState('')
  const [trailerType,  setTrailerType]  = useState('')
  const [tractorId,    setTractorId]    = useState('')
  const [routePref,    setRoutePref]    = useState<RoutePreference>('main_corridors')
  const [routeNotes,   setRouteNotes]   = useState('')

  // ── Saving ───────────────────────────────────────────────────────────────────
  const [saving,      setSaving]      = useState(false)
  const [saveResult,  setSaveResult]  = useState<{ ok: boolean; msg: string } | null>(null)

  // ── Resume draft on open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const draft = getIntakeDraft()
    if (!draft) {
      // Pre-fill tractor from settings
      try {
        const raw = localStorage.getItem('3b-fleet-settings')
        if (raw) {
          const s = JSON.parse(raw)
          if (s?.truckNum) setTractorId(s.truckNum)
        }
      } catch { /* ignore */ }
      return
    }

    // Restore draft state
    if (draft.loadNumber)    setLoadNumber(draft.loadNumber)
    if (draft.broker)        setBroker(draft.broker)
    if (draft.grossRate)     setRate(String(draft.grossRate))
    if (draft.dispatchMiles) setMiles(String(draft.dispatchMiles))
    if (draft.trailerNum)    setTrailerNum(draft.trailerNum)
    if (draft.trailerPlate)  setTrailerPlate(draft.trailerPlate ?? '')
    if (draft.trailerType)   setTrailerType(draft.trailerType ?? '')
    if (draft.tractorId)     setTractorId(draft.tractorId ?? '')
    if (draft.routePreference) setRoutePref(draft.routePreference as RoutePreference)
    if (draft.routeNotes)    setRouteNotes(draft.routeNotes ?? '')
    if (draft.intakeStep)    setStep(draft.intakeStep)
    if (draft.stops && draft.stops.length > 0) {
      const pick = draft.stops.find(s => s.type === 'pickup')
      const dels = draft.stops.filter(s => s.type !== 'pickup')
      if (pick) setPickup(pick)
      if (dels.length > 0) setDeliveries(dels)
    }
  }, [open])

  // ── Auto-save draft on every step change ─────────────────────────────────────
  const persistDraft = useCallback((currentStep: number) => {
    saveIntakeDraft({
      loadNumber:     loadNumber || undefined,
      broker:         broker     || undefined,
      grossRate:      parseFloat(rate) || 0,
      dispatchMiles:  parseInt(miles)  || 0,
      trailerNum:     trailerNum || undefined,
      trailerPlate:   trailerPlate || undefined,
      trailerType:    trailerType  || undefined,
      tractorId:      tractorId    || undefined,
      routePreference: routePref,
      routeNotes:     routeNotes || undefined,
      intakeStep:     currentStep,
      stops:          [pickup, ...deliveries],
    })
  }, [loadNumber, broker, rate, miles, trailerNum, trailerPlate, trailerType, tractorId, routePref, routeNotes, pickup, deliveries])

  function goStep(n: number) { persistDraft(n); setStep(n) }

  // ── Reset ────────────────────────────────────────────────────────────────────
  function reset() {
    setStep(1)
    setLoadNumber(''); setBroker(''); setRate(''); setMiles('')
    setPickup(makeStop(1, 'pickup'))
    setDeliveries([makeStop(2, 'delivery')])
    setTrailerNum(''); setTrailerPlate(''); setTrailerType(''); setTractorId('')
    setRoutePref('main_corridors'); setRouteNotes('')
    setBolMsg(null); setSaveResult(null)
    clearIntakeDraft()
  }

  function handleClose() { reset(); onClose() }

  // ── BOL scan ─────────────────────────────────────────────────────────────────
  const handleBolScan = async (file: File) => {
    setBolScanning(true); setBolMsg(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch('/api/bol-scan', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || data.error) { setBolMsg({ text: data.error ?? 'Scan failed', ok: false }); return }

      const filled: string[] = []
      if (data.origin)      { setPickup(p => ({ ...p, city: data.origin })); filled.push('origin') }
      if (data.shipper)     { setPickup(p => ({ ...p, name: data.shipper })); filled.push('shipper') }
      if (data.originPhone) { setPickup(p => ({ ...p, phone: data.originPhone })); filled.push('phone') }
      if (data.destination) { setDeliveries(d => d.map((s, i) => i === 0 ? { ...s, city: data.destination } : s)); filled.push('destination') }
      if (data.consignee)   { setDeliveries(d => d.map((s, i) => i === 0 ? { ...s, name: data.consignee } : s)); filled.push('consignee') }
      if (data.grossRate)   { setRate(String(data.grossRate));  filled.push('rate') }
      if (data.miles)       { setMiles(String(data.miles));     filled.push('miles') }
      if (data.loadNumber)  { setLoadNumber(String(data.loadNumber)); filled.push('load #') }

      // Multi-stop from BOL
      if (Array.isArray(data.stops) && data.stops.length >= 2) {
        const seeded = data.stops.map((s: Record<string, unknown>, i: number) => ({
          ...makeStop(i + 1, (s.type as StopType) ?? (i === 0 ? 'pickup' : 'delivery')),
          name:             (s.name as string)      ?? '',
          city:             (s.city as string)      ?? '',
          state:            (s.state as string)     ?? '',
          address:          (s.address as string)   ?? '',
          phone:            (s.phone as string)     ?? '',
          reference:        (s.reference as string) ?? '',
          appointmentStart: (s.appt as string)      ?? '',
        }))
        const [first, ...rest] = seeded
        setPickup(first)
        setDeliveries(rest.length > 0 ? rest : [makeStop(2, 'delivery')])
        filled.push(`${seeded.length} stops`)
      }

      setBolMsg({ text: filled.length > 0 ? `✅ Filled: ${filled.join(', ')} — verify before saving` : '⚠️ No fields detected', ok: filled.length > 0 })
    } catch {
      setBolMsg({ text: '❌ Network error — check connection', ok: false })
    } finally {
      setBolScanning(false)
      if (bolInputRef.current) bolInputRef.current.value = ''
    }
  }

  // ── Delivery stop management ──────────────────────────────────────────────────
  const addDelivery = (type: StopType = 'delivery') =>
    setDeliveries(prev => [...prev, makeStop(prev.length + 2, type)])

  const removeDelivery = (id: string) =>
    setDeliveries(prev => prev.filter(s => s.id !== id).map((s, i) => ({ ...s, sequence: i + 2 })))

  const changeDelivery = (id: string, patch: Partial<FleetStop>) =>
    setDeliveries(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))

  const duplicateDelivery = (id: string) => {
    setDeliveries(prev => {
      const idx = prev.findIndex(s => s.id === id)
      if (idx === -1) return prev
      const copy = { ...prev[idx], id: crypto.randomUUID(), sequence: prev.length + 2 }
      return [...prev, copy].map((s, i) => ({ ...s, sequence: i + 2 }))
    })
  }

  const moveDeliveryUp = (id: string) => {
    setDeliveries(prev => {
      const i = prev.findIndex(s => s.id === id); if (i <= 0) return prev
      const next = [...prev]; [next[i-1], next[i]] = [next[i], next[i-1]]
      return next.map((s, idx) => ({ ...s, sequence: idx + 2 }))
    })
  }
  const moveDeliveryDown = (id: string) => {
    setDeliveries(prev => {
      const i = prev.findIndex(s => s.id === id); if (i >= prev.length - 1) return prev
      const next = [...prev]; [next[i], next[i+1]] = [next[i+1], next[i]]
      return next.map((s, idx) => ({ ...s, sequence: idx + 2 }))
    })
  }

  // ── Derived values ────────────────────────────────────────────────────────────
  const allStops   = [pickup, ...deliveries]
  const originCity = [pickup.city ?? '', pickup.state ?? ''].filter(Boolean).join(', ')
  const lastDel    = [...deliveries].reverse()[0] as FleetStop | undefined
  const destCity   = lastDel ? [lastDel.city ?? '', lastDel.state ?? ''].filter(Boolean).join(', ') : ''
  const routeRisk  = computeRouteRisk(routeNotes, routePref)
  const riskMeta   = ROUTE_RISK_META[routeRisk.level]
  const prefMeta   = ROUTE_PREF_META[routePref]
  const driverName = (() => {
    try { const s = JSON.parse(localStorage.getItem('3b-fleet-settings') ?? '{}'); return s.driverName ?? '' } catch { return '' }
  })()

  // ── Step validation ───────────────────────────────────────────────────────────
  const step1Valid = rate.trim() !== '' && miles.trim() !== ''
  const step2Valid = (pickup.city ?? '').trim() !== ''
  const step3Valid = deliveries.length > 0 && (deliveries[0].city ?? '').trim() !== ''
  const step4Valid = true  // equipment is optional

  // ── Final save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (saving) return
    setSaving(true); setSaveResult(null)

    const now         = new Date().toISOString()
    const orderNumber = generateOrderNumber()
    const origin      = originCity || pickup.name || 'Origin TBD'
    const destination = destCity   || lastDel?.name || 'Destination TBD'

    // Build FleetLoad for Supabase
    const fleetLoad: FleetLoad = {
      loadNumber:       loadNumber || `LD-${Date.now()}`,
      orderNumber,
      broker:           broker       || undefined,
      origin,
      destination,
      originName:       pickup.name  || undefined,
      destName:         lastDel?.name || undefined,
      tractorId:        tractorId    || undefined,
      trailerNum:       trailerNum   || undefined,
      trailerPlate:     trailerPlate || undefined,
      trailerType:      trailerType  || undefined,
      rigType:          'semi-solo',
      grossRate:        parseFloat(rate)  || 0,
      dispatchMiles:    parseInt(miles)   || 0,
      deadheadMiles:    0,
      fuelPrice:        getDieselPrice(origin),
      loadDate:         todayISO(),
      pickupAppt:       pickup.appointmentStart || undefined,
      deliveryAppt:     lastDel?.appointmentStart || undefined,
      status:           'active',
      routePreference:  routePref,
      routeNotes:       routeNotes || undefined,
      driverName:       driverName || undefined,
      metadata:         { orderCreatedAt: now },
      intakeStep:       5,
      isDraft:          false,
    }

    const { ok, id: loadId, load, error } = await saveLoad(fleetLoad)

    if (ok && loadId) {
      // Save stops
      const stopsToSave = allStops.map((s, i) => ({ ...s, loadId, sequence: i + 1 }))
      await saveStops(loadId, load.loadNumber, stopsToSave)
    }

    // Build LoadMission for dashboard (existing shape)
    const mission: LoadMission = {
      id:              loadId ?? crypto.randomUUID(),
      loadNumber:      load.loadNumber,
      broker:          broker     || undefined,
      origin,
      destination,
      date:            todayISO(),
      dispatchMiles:   parseInt(miles)  || 0,
      deadheadMiles:   0,
      grossRate:       parseFloat(rate) || 0,
      fuelPrice:       getDieselPrice(origin),
      rigType:         'semi-solo',
      waitHours:       0,
      reloadKnown:     false,
      reloadAreaStrength: 2,
      hasOvernightParking: false,
      loadType:        'FTL',
      routePreference: routePref,
      routeNotes:      routeNotes.trim() || undefined,
      stops:           allStops,
      orderNumber,
      driverName:      driverName || undefined,
      tractorId:       tractorId  || undefined,
      trailerNum:      trailerNum || undefined,
      trailerPlate:    trailerPlate || undefined,
      timestamps:      { orderCreatedAt: now, lastUpdatedAt: now },
    }

    try { localStorage.setItem('3b-latest-load', JSON.stringify(mission)) } catch { /* ignore */ }
    setSaveResult({ ok, msg: ok ? '✅ Load saved to Supabase' : `⚠️ Saved locally — sync pending (${error})` })
    clearIntakeDraft()
    onSave(mission)

    setTimeout(() => { reset(); onClose() }, ok ? 1200 : 2500)
  }

  if (!open) return null

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,13,11,.75)' }} onClick={handleClose} />
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
          background: 'var(--surface)', borderTop: '2px solid rgba(0,232,176,.22)',
          borderRadius: '20px 20px 0 0',
          padding: '1.25rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom))',
          maxHeight: '94dvh', overflowY: 'auto',
          boxShadow: '0 -8px 40px rgba(0,0,0,.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div style={{ width: 36, height: 3, borderRadius: 2, background: 'var(--border)', margin: '0 auto .9rem' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.85rem' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.15rem' }}>
              {STEPS[step - 1].emoji} {STEPS[step - 1].label}
            </div>
            <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 2 }}>
              Step {step} of {STEPS.length} · {hasDraft() ? '📌 Draft restored' : 'New load'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => persistDraft(step)} style={secondaryBtn}>💾 Save Draft</button>
            <button onClick={handleClose} style={secondaryBtn}>✕</button>
          </div>
        </div>

        {/* Step bar */}
        <StepBar current={step} />

        {/* ── STEP 1: Basic load info ── */}
        {step === 1 && (
          <div style={{ display: 'grid', gap: 10 }}>
            {/* BOL scan */}
            <div style={{ background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.15)', borderRadius: 12, padding: '.8rem .9rem', display: 'grid', gap: 7 }}>
              <div style={{ fontWeight: 800, fontSize: '.75rem', color: 'var(--primary)' }}>📷 Scan BOL / Rate Confirmation</div>
              <div style={{ fontSize: '.62rem', color: 'var(--muted)' }}>
                Take a photo — AI fills load #, rate, miles &amp; stops automatically
              </div>
              <input ref={bolInputRef} type="file" accept="image/*,application/pdf" capture="environment"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleBolScan(f) }} />
              <button
                onClick={() => bolInputRef.current?.click()}
                disabled={bolScanning}
                style={{ padding: '.55rem .9rem', borderRadius: 9, border: '1px solid rgba(0,232,176,.3)', background: 'rgba(0,232,176,.08)', color: 'var(--primary)', fontWeight: 700, fontSize: '.82rem', cursor: 'pointer', opacity: bolScanning ? .6 : 1 }}
              >
                {bolScanning ? '⏳ Scanning…' : '📷 Open Camera / Upload File'}
              </button>
              {bolMsg && (
                <div style={{ fontSize: '.72rem', padding: '.45rem .7rem', borderRadius: 8, background: bolMsg.ok ? 'rgba(0,232,176,.07)' : 'rgba(232,64,0,.07)', color: bolMsg.ok ? 'var(--primary)' : 'var(--error)', fontWeight: 600 }}>
                  {bolMsg.text}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <span style={label}>Load / Order #</span>
                <input value={loadNumber} onChange={e => setLoadNumber(e.target.value)} placeholder="0241482" style={inp} />
              </div>
              <div>
                <span style={label}>Broker / Customer</span>
                <input value={broker} onChange={e => setBroker(e.target.value)} placeholder="Echo, Coyote…" style={inp} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <span style={label}>Gross Rate ($) *</span>
                <input type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="2400.00" style={inp} />
              </div>
              <div>
                <span style={label}>Dispatch Miles *</span>
                <input type="number" value={miles} onChange={e => setMiles(e.target.value)} placeholder="420" style={inp} />
              </div>
            </div>

            {rate && miles && (
              <div style={{ background: 'rgba(0,232,176,.05)', border: '1px solid rgba(0,232,176,.12)', borderRadius: 9, padding: '.6rem .8rem', display: 'flex', gap: 20 }}>
                <div>
                  <div style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>RPM</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--primary)' }}>
                    ${(parseFloat(rate) / Math.max(parseInt(miles) || 1, 1)).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>Gross Rate</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>${parseFloat(rate).toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>Miles</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>{parseInt(miles).toLocaleString()}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Pickup stop ── */}
        {step === 2 && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={sectionHead}>📦 Pickup / Origin</div>
            <input value={pickup.name}    onChange={e => setPickup(p => ({ ...p, name: e.target.value }))}    placeholder="Shipper / facility name" style={inp} />
            <input value={pickup.address ?? ''} onChange={e => setPickup(p => ({ ...p, address: e.target.value }))} placeholder="Street address (optional)" style={inp} />
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
              <div>
                <span style={label}>City *</span>
                <input value={pickup.city}  onChange={e => setPickup(p => ({ ...p, city: e.target.value }))}  placeholder="Memphis" style={inp} />
              </div>
              <div>
                <span style={label}>State *</span>
                <input value={pickup.state ?? ''} onChange={e => setPickup(p => ({ ...p, state: e.target.value.toUpperCase() }))} placeholder="TN" maxLength={2} style={inp} />
              </div>
            </div>
            <input value={pickup.phone ?? ''} onChange={e => setPickup(p => ({ ...p, phone: e.target.value }))} placeholder="Facility phone (optional)" style={inp} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <span style={label}>Pickup Appointment</span>
                <input type="datetime-local" value={pickup.appointmentStart ?? ''} onChange={e => setPickup(p => ({ ...p, appointmentStart: e.target.value }))} style={inp} />
              </div>
              <div>
                <span style={label}>REF / BOL #</span>
                <input value={pickup.reference ?? ''} onChange={e => setPickup(p => ({ ...p, reference: e.target.value }))} placeholder="Optional" style={inp} />
              </div>
            </div>
            <input value={pickup.notes ?? ''} onChange={e => setPickup(p => ({ ...p, notes: e.target.value }))} placeholder="Dock hours, dock #, lumper info, parking notes…" style={inp} />
          </div>
        )}

        {/* ── STEP 3: Delivery stops ── */}
        {step === 3 && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={sectionHead}>🏪 Delivery Stops ({deliveries.length})</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => addDelivery('delivery')} style={addStopBtn}>+ Delivery</button>
                <button onClick={() => addDelivery('relay')}    style={{ ...addStopBtn, borderColor: 'rgba(74,196,255,.3)', color: 'var(--blue)' }}>+ Relay</button>
              </div>
            </div>

            {deliveries.map((stop, idx) => (
              <StopEditor
                key={stop.id}
                stop={stop}
                index={idx}
                total={deliveries.length}
                onChange={changeDelivery}
                onRemove={removeDelivery}
                onMoveUp={moveDeliveryUp}
                onMoveDown={moveDeliveryDown}
                onDuplicate={duplicateDelivery}
              />
            ))}

            {deliveries.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '.82rem' }}>
                No delivery stops yet — tap "+ Delivery" to add one
              </div>
            )}

            <div style={{ background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.12)', borderRadius: 9, padding: '.65rem .85rem', fontSize: '.72rem', color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--text)' }}>Tip:</strong> Use ⧉ to duplicate a stop with same facility (e.g. multiple drops at same chain). Use ↑ ↓ to reorder.
            </div>
          </div>
        )}

        {/* ── STEP 4: Equipment + Route ── */}
        {step === 4 && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={sectionHead}>🚛 Equipment</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <span style={label}>Trailer #</span>
                <input value={trailerNum} onChange={e => setTrailerNum(e.target.value)} placeholder="260692" style={inp} />
              </div>
              <div>
                <span style={label}>Trailer Plate</span>
                <input value={trailerPlate} onChange={e => setTrailerPlate(e.target.value)} placeholder="NV·123456" style={inp} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <span style={label}>Trailer Type</span>
                <input value={trailerType} onChange={e => setTrailerType(e.target.value)} placeholder="Dry van, Reefer, Flatbed…" style={inp} />
              </div>
              <div>
                <span style={label}>Tractor / Unit #</span>
                <input value={tractorId} onChange={e => setTractorId(e.target.value)} placeholder="Unit 1" style={inp} />
              </div>
            </div>

            <div style={{ marginTop: 4, ...sectionHead }}>🗺️ Route Preference</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PREFS.map(p => {
                const m = ROUTE_PREF_META[p]
                return (
                  <button key={p} onClick={() => setRoutePref(p)} style={{
                    padding: '.4rem .7rem', borderRadius: 9, fontSize: '.72rem', fontWeight: 700, cursor: 'pointer',
                    border: routePref === p ? '1px solid rgba(0,232,176,.45)' : '1px solid var(--border)',
                    background: routePref === p ? 'rgba(0,232,176,.1)' : 'var(--surface-2)',
                    color: routePref === p ? 'var(--primary)' : 'var(--muted)',
                  }}>
                    {m.emoji} {m.label}
                  </button>
                )
              })}
            </div>

            {routeRisk.showWarning && (
              <div style={{ padding: '.6rem .8rem', borderRadius: 9, background: riskMeta.bg, border: `1px solid ${riskMeta.border}`, color: riskMeta.color, fontSize: '.75rem', fontWeight: 700 }}>
                ⚠️ {routeRisk.disclaimer}
              </div>
            )}

            <div>
              <span style={label}>Route notes (optional)</span>
              <textarea value={routeNotes} onChange={e => setRouteNotes(e.target.value)}
                placeholder="Avoid I-10 near Phoenix, take US-60 instead…"
                rows={2} style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} />
            </div>
          </div>
        )}

        {/* ── STEP 5: Review ── */}
        {step === 5 && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={sectionHead}>✅ Review Before Saving</div>

            {/* Load summary */}
            <div style={reviewCard}>
              <div style={reviewRow}>
                <span style={reviewKey}>Load #</span>
                <span style={reviewVal}>{loadNumber || <em style={{ color: 'var(--muted)' }}>Auto-assigned</em>}</span>
              </div>
              <div style={reviewRow}>
                <span style={reviewKey}>Broker</span>
                <span style={reviewVal}>{broker || '—'}</span>
              </div>
              <div style={reviewRow}>
                <span style={reviewKey}>Gross Rate</span>
                <span style={{ ...reviewVal, color: 'var(--primary)', fontWeight: 900 }}>${parseFloat(rate || '0').toFixed(2)}</span>
              </div>
              <div style={reviewRow}>
                <span style={reviewKey}>Miles</span>
                <span style={reviewVal}>{parseInt(miles || '0').toLocaleString()} mi</span>
              </div>
              <div style={reviewRow}>
                <span style={reviewKey}>RPM</span>
                <span style={reviewVal}>${(parseFloat(rate || '0') / Math.max(parseInt(miles || '1') || 1, 1)).toFixed(2)}</span>
              </div>
            </div>

            {/* Stops summary */}
            <div style={reviewCard}>
              <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                {allStops.length} Stop{allStops.length !== 1 ? 's' : ''}
              </div>
              {allStops.map((s, i) => {
                const m = STOP_TYPES.find(t => t.type === s.type) ?? STOP_TYPES[1]
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '.4rem 0', borderBottom: i < allStops.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: '.85rem', flexShrink: 0 }}>{m.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.8rem', fontWeight: 700 }}>{i + 1}. {m.label}{s.name ? ` — ${s.name}` : ''}</div>
                      <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>
                        {[s.city, s.state].filter(Boolean).join(', ')}
                        {s.appointmentStart ? ` · ${fmtAppt(s.appointmentStart)}` : ''}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Equipment */}
            <div style={reviewCard}>
              <div style={reviewRow}><span style={reviewKey}>Trailer</span><span style={reviewVal}>{trailerNum || '—'}</span></div>
              <div style={reviewRow}><span style={reviewKey}>Tractor</span><span style={reviewVal}>{tractorId || '—'}</span></div>
              <div style={reviewRow}><span style={reviewKey}>Route</span><span style={reviewVal}>{ROUTE_PREF_META[routePref].emoji} {ROUTE_PREF_META[routePref].label}</span></div>
            </div>

            {saveResult && (
              <div style={{
                padding: '.65rem .85rem', borderRadius: 10, fontWeight: 700, fontSize: '.82rem',
                background: saveResult.ok ? 'rgba(0,232,176,.07)' : 'rgba(232,64,0,.07)',
                color: saveResult.ok ? 'var(--primary)' : 'var(--error)',
                border: `1px solid ${saveResult.ok ? 'rgba(0,232,176,.2)' : 'rgba(232,64,0,.2)'}`,
              }}>
                {saveResult.msg}
              </div>
            )}

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%', padding: '1rem', borderRadius: 14, border: 'none', cursor: saving ? 'wait' : 'pointer',
                background: 'var(--primary)', color: '#061210',
                fontWeight: 900, fontSize: '1.05rem',
                boxShadow: '0 4px 20px rgba(0,232,176,.3)',
                opacity: saving ? .7 : 1,
              }}
            >
              {saving ? '⏳ Saving…' : '🚛 Save Load & Start Mission'}
            </button>
          </div>
        )}

        {/* ── Navigation ── */}
        <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem' }}>
          {step > 1 && (
            <button onClick={() => goStep(step - 1)} style={{ ...secondaryBtn, flex: 1, padding: '.75rem' }}>
              ← Back
            </button>
          )}
          {step < STEPS.length && (
            <button
              onClick={() => { if (step === 1 && !step1Valid) return; if (step === 2 && !step2Valid) return; goStep(step + 1) }}
              disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
              style={{
                flex: 2, padding: '.75rem', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'var(--primary)', color: '#061210', fontWeight: 800, fontSize: '.95rem',
                opacity: (step === 1 && !step1Valid) || (step === 2 && !step2Valid) ? .45 : 1,
              }}
            >
              {step === STEPS.length - 1 ? '→ Review' : `→ ${STEPS[step].label}`}
            </button>
          )}
        </div>

        {/* Required field hint */}
        {step === 1 && !step1Valid && (
          <div style={{ textAlign: 'center', fontSize: '.65rem', color: 'var(--muted)', marginTop: 8 }}>
            Enter rate and miles to continue
          </div>
        )}
        {step === 2 && !step2Valid && (
          <div style={{ textAlign: 'center', fontSize: '.65rem', color: 'var(--muted)', marginTop: 8 }}>
            Enter pickup city to continue
          </div>
        )}
      </div>
    </>
  )
}

// ── Style tokens ──────────────────────────────────────────────────────────────

const secondaryBtn: React.CSSProperties = {
  padding: '.4rem .75rem', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--muted)', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer',
}

const addStopBtn: React.CSSProperties = {
  padding: '.3rem .6rem', borderRadius: 8,
  border: '1px solid rgba(0,232,176,.3)', background: 'rgba(0,232,176,.06)',
  color: 'var(--primary)', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer',
}

const reviewCard: React.CSSProperties = {
  background: 'var(--surface-2)', borderRadius: 12,
  border: '1px solid var(--border)', padding: '.75rem .85rem',
  display: 'grid', gap: 0,
}
const reviewRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '.3rem 0', borderBottom: '1px solid var(--border)',
}
const reviewKey: React.CSSProperties = {
  fontSize: '.68rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em',
}
const reviewVal: React.CSSProperties = {
  fontSize: '.82rem', fontWeight: 700, color: 'var(--text)',
}

// ── Utility ───────────────────────────────────────────────────────────────────

function hasDraft(): boolean {
  try { return Boolean(localStorage.getItem('3b-intake-draft')) } catch { return false }
}
