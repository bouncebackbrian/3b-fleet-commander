'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import KpiCard from '@/components/ui/KpiCard'
import LoadBadge from '@/components/ui/LoadBadge'
import RedFlag from '@/components/ui/RedFlag'
import { supabase } from '@/lib/supabase'
import { SAMPLE_LOADS, SAMPLE_DELAYS, SAMPLE_FUEL, classify, calcMetrics } from '@/lib/store'
import { loadSettings, DEFAULT_SETTINGS, type AppSettings } from '@/lib/settings'
import type { Load, MoveType, LoadStatus, DelayEntry, FuelEntry } from '@/types'

type Period = 'today' | 'week' | 'month' | 'all'
type EldMode = 'screenshot' | 'samsara'
type VehicleSetup = { truckNum?: string; trailerNum?: string; year?: string; make?: string; model?: string; trailerType?: string }
type HOSData = {
  status: string | null
  driveRemainingHrs: number | null; shiftRemainingHrs: number | null
  breakInHrs: number | null; cycleRemainingHrs: number | null
  driveUsedHrs: number | null; onDutyUsedHrs: number | null
  lastBreakHrs: number | null; notes: string | null
  scannedAt: string
}
type SamsaraData = {
  hos: {
    driverName: string | null; status: string | null; statusSince: string | null
    driveRemainingHrs: number; shiftRemainingHrs: number
    breakInHrs: number | null; cycleRemainingHrs: number
  } | null
  location: {
    lat: number | null; lng: number | null
    speedMph: number | null; address: string | null; updatedAt: string | null
    vehicleName: string | null
  } | null
  todayMiles: number | null
  updatedAt: string
  error?: string
}
type ActiveTrip = {
  origin: { query: string; lat?: number; lon?: number; lng?: number }
  destination: { query: string; lat?: number; lon?: number; lng?: number }
  totalMiles: number; departTime: string; estArrival: string
  estDriveHours: string; loadNumber: string | null; stops: { name: string; city: string; state: string; miFromOrigin: number; eta: string; stopType: string; diesel: number | null; showers: { available: number; total: number } | null; recommended: boolean }[]
}

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtM = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadFromDB = (r: any): Load => ({
  id: r.id, date: r.date, loadNumber: r.load_number, bolRef: r.bol_ref ?? undefined,
  dispatcher: r.dispatcher, broker: r.broker ?? undefined, trailer: r.trailer ?? undefined,
  moveType: r.move_type as MoveType, origin: r.origin, destination: r.destination,
  status: 'Complete' as LoadStatus,
  dispatchMiles: Number(r.dispatch_miles) || 0, actualMiles: Number(r.actual_miles) || 0,
  deadheadMiles: Number(r.deadhead_miles) || 0, paidMiles: Number(r.paid_miles) || 0,
  cpmRate: Number(r.cpm_rate) || 0.55, fuelCost: Number(r.fuel_cost) || 0,
  waitHours: Number(r.wait_hours) || 0, detentionHours: Number(r.detention_hours) || 0,
  detentionPay: Number(r.detention_pay) || 0, settlementPay: Number(r.settlement_pay) || 0,
  notes: r.notes ?? undefined, proofSaved: Boolean(r.proof_saved),
  settlementVerified: Boolean(r.settlement_verified),
  createdAt: r.created_at, updatedAt: r.updated_at,
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delayFromDB = (r: any): DelayEntry => ({
  id: r.id, loadNumber: r.load_number, trailer: r.trailer ?? undefined,
  delayType: r.delay_type, location: r.location,
  totalHours: Number(r.total_hours) || 0,
  billable: r.billable as 'Yes' | 'No' | 'Review',
  detentionRate: r.detention_rate ? Number(r.detention_rate) : undefined,
  potentialPay: Number(r.potential_pay) || 0,
  dispatcherNotified: Boolean(r.dispatcher_notified),
  proofSaved: Boolean(r.proof_saved),
  notes: r.notes ?? undefined, createdAt: r.created_at,
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fuelFromDB = (r: any): FuelEntry => ({
  id: r.id, date: r.date, location: r.location,
  fuelType: r.fuel_type as FuelEntry['fuelType'],
  gallons: Number(r.gallons) || 0,
  pricePerGal: r.price_per_gal ? Number(r.price_per_gal) : undefined,
  totalCost: Number(r.total_cost) || 0,
  loadNumber: r.load_number ?? undefined,
  receiptSaved: Boolean(r.receipt_saved),
  notes: r.notes ?? undefined, createdAt: r.created_at,
})

function filterByPeriod<T extends { date?: string; createdAt?: string }>(items: T[], period: Period): T[] {
  if (period === 'all') return items
  const now = new Date()
  if (period === 'today') {
    const today = now.toISOString().slice(0, 10)
    return items.filter(i => (i.date || i.createdAt?.slice(0, 10)) === today)
  }
  if (period === 'week') {
    const day = now.getDay()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
    weekStart.setHours(0, 0, 0, 0)
    return items.filter(i => new Date(i.date || i.createdAt || '') >= weekStart)
  }
  if (period === 'month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    return items.filter(i => new Date(i.date || i.createdAt || '') >= monthStart)
  }
  return items
}

function HOSBars({ driveUsed, driveRem, shiftUsed, shiftRem, breakInHrs, cycleRem, empty }: {
  driveUsed: number; driveRem: number; shiftUsed: number; shiftRem: number
  breakInHrs: number | null; cycleRem: number | null; empty?: boolean
}) {
  return (
    <div style={{ display: 'grid', gap: '.6rem', opacity: empty ? .45 : 1 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Drive time</span>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: driveUsed > 9 ? 'var(--error)' : driveUsed > 7 ? 'var(--warn)' : 'var(--text)' }}>{empty ? '— ' : `${driveUsed.toFixed(1)}h used · `}{empty ? '' : `${driveRem.toFixed(1)}h left`}{empty ? '11h limit' : ''}</span>
        </div>
        <div style={{ height: 6, background: 'var(--surface-off)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, (driveUsed / 11) * 100)}%`, background: driveUsed > 9 ? 'var(--error)' : driveUsed > 7 ? 'var(--warn)' : 'var(--primary)', borderRadius: 3, transition: 'width .5s ease' }} />
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>On-duty window</span>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: shiftUsed > 12 ? 'var(--error)' : shiftUsed > 10 ? 'var(--warn)' : 'var(--text)' }}>{empty ? '— ' : `${shiftUsed.toFixed(1)}h used · `}{empty ? '' : `${shiftRem.toFixed(1)}h left`}{empty ? '14h limit' : ''}</span>
        </div>
        <div style={{ height: 6, background: 'var(--surface-off)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, (shiftUsed / 14) * 100)}%`, background: shiftUsed > 12 ? 'var(--error)' : shiftUsed > 10 ? 'var(--warn)' : '#6c9bd2', borderRadius: 3, transition: 'width .5s ease' }} />
        </div>
      </div>
      {breakInHrs != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '.6rem', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Break required in</span>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: breakInHrs < 1 ? 'var(--error)' : breakInHrs < 2 ? 'var(--warn)' : 'var(--text)' }}>{breakInHrs.toFixed(1)}h</span>
        </div>
      )}
      {cycleRem != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '.6rem', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>70-hr cycle remaining</span>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700 }}>{empty ? '—' : `${cycleRem.toFixed(1)}h`}</span>
        </div>
      )}
    </div>
  )
}

const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
]

export default function Dashboard() {
  const [loads, setLoads] = useState<Load[]>([])
  const [delays, setDelays] = useState<DelayEntry[]>([])
  const [fuel, setFuel] = useState<FuelEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [cfg, setCfg] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [period, setPeriod] = useState<Period>('week')
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null)
  const [vehicle, setVehicle] = useState<VehicleSetup | null>(null)
  const [liveClock, setLiveClock] = useState('')
  const [eldMode, setEldMode] = useState<EldMode>('screenshot')
  const [hos, setHos] = useState<HOSData | null>(null)
  const [hosScanning, setHosScanning] = useState(false)
  const [hosError, setHosError] = useState('')
  const hosInputRef = useRef<HTMLInputElement>(null)
  const [samsara, setSamsara] = useState<SamsaraData | null>(null)
  const [samsaraLoading, setSamsaraLoading] = useState(false)

  useEffect(() => {
    setCfg(loadSettings())
    try {
      const raw = localStorage.getItem('3b-active-trip')
      if (raw) setActiveTrip(JSON.parse(raw))
    } catch { /* ignore */ }
    try {
      const v = localStorage.getItem('3b-vehicle')
      if (v) setVehicle(JSON.parse(v))
    } catch { /* ignore */ }
    try {
      const mode = localStorage.getItem('3b-eld-mode') as EldMode | null
      if (mode === 'samsara' || mode === 'screenshot') setEldMode(mode)
    } catch { /* ignore */ }
    // Live clock
    const tick = () => {
      const now = new Date()
      setLiveClock(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }))
    }
    tick()
    const clockId = setInterval(tick, 1000)
    return () => clearInterval(clockId)
  }, [])

  // Load persisted HOS data
  useEffect(() => {
    try {
      const raw = localStorage.getItem('3b-hos-data')
      if (raw) setHos(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  // Samsara polling — only when that mode is active
  useEffect(() => {
    if (eldMode !== 'samsara') return
    const poll = async () => {
      setSamsaraLoading(true)
      try {
        const res = await fetch('/api/samsara')
        const data: SamsaraData = await res.json()
        setSamsara(data)
      } catch { /* network error */ } finally {
        setSamsaraLoading(false)
      }
    }
    poll()
    const id = setInterval(poll, 30_000)
    return () => clearInterval(id)
  }, [eldMode])

  useEffect(() => {
    if (!supabase) {
      setLoads(SAMPLE_LOADS); setDelays(SAMPLE_DELAYS); setFuel(SAMPLE_FUEL)
      setLoading(false); return
    }
    Promise.all([
      supabase.from('loads').select('*').order('date', { ascending: false }),
      supabase.from('delays').select('*').order('created_at', { ascending: false }),
      supabase.from('fuel_entries').select('*').order('date', { ascending: false }),
    ]).then(([l, d, f]) => {
      if (!l.error && l.data) setLoads(l.data.map(loadFromDB))
      if (!d.error && d.data) setDelays(d.data.map(delayFromDB))
      if (!f.error && f.data) setFuel(f.data.map(fuelFromDB))
      setLoading(false)
    })
  }, [])

  const filteredLoads = filterByPeriod(loads, period)
  const filteredFuel = filterByPeriod(fuel, period)
  const filteredDelays = filterByPeriod(delays, period)

  const m = calcMetrics(filteredLoads)
  const totalFuel = filteredFuel.reduce((a, f) => a + f.totalCost, 0)

  const flags = [
    ...filteredLoads.filter(l => !l.actualMiles).map(l => `Load ${l.loadNumber}: actual ELD miles not entered — cannot verify settlement.`),
    ...filteredLoads.filter(l => l.waitHours > 0 && !l.detentionPay).map(l => `Load ${l.loadNumber}: ${l.waitHours.toFixed(2)}h wait — detention not documented.`),
    ...filteredDelays.filter(d => d.billable === 'Review').map(d => `Load ${d.loadNumber} — "${d.delayType}" billable status needs a decision.`),
    ...filteredFuel.filter(f => !f.receiptSaved && f.totalCost > 0).map(f => `Fuel at ${f.location}: receipt not saved.`),
    ...filteredLoads.filter(l => !l.settlementVerified && l.settlementPay === 0).map(l => `Load ${l.loadNumber}: settlement not verified.`),
  ]

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ loads, delays, fuel }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = '3b-fleet-export.json'; a.click()
  }

  const now = Date.now()
  const nextStop = activeTrip?.stops.find(s => new Date(s.eta).getTime() > now)

  const tripProgress = activeTrip ? (() => {
    const gpsLat = samsara?.location?.lat
    const gpsLng = samsara?.location?.lng
    if (gpsLat != null && gpsLng != null && activeTrip.origin && activeTrip.destination) {
      const oLat = activeTrip.origin.lat, oLng = activeTrip.origin.lng ?? activeTrip.origin.lon ?? 0
      const dLat = activeTrip.destination.lat, dLng = activeTrip.destination.lng ?? activeTrip.destination.lon ?? 0
      if (oLat && dLat) {
        const dx = dLng - oLng, dy = dLat - oLat
        const len2 = dx * dx + dy * dy
        if (len2 > 0) return Math.round(Math.min(100, Math.max(0, (((gpsLng - oLng) * dx + (gpsLat - oLat) * dy) / len2) * 100)))
      }
    }
    const depart = new Date(activeTrip.departTime).getTime()
    const arrive = new Date(activeTrip.estArrival).getTime()
    return Math.round(Math.min(100, Math.max(0, ((now - depart) / (arrive - depart)) * 100)))
  })() : 0

  const handleScanHos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setHosScanning(true); setHosError('')
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/extract-hos', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const data: HOSData = await res.json()
      data.scannedAt = new Date().toISOString()
      localStorage.setItem('3b-hos-data', JSON.stringify(data))
      setHos(data)
    } catch (err) {
      setHosError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setHosScanning(false)
      if (hosInputRef.current) hosInputRef.current.value = ''
    }
  }

  return (
    <>
      <TopBar title="Fleet Dashboard" module="mis"
        subtitle={loading ? 'Loading…' : `${today} · ${m.totalLoads} loads${cfg.dispatcher ? ` · Dispatcher: ${cfg.dispatcher}` : ''}`}
        onExport={handleExport} />
      <main style={{ padding: '1.4rem', display: 'grid', gap: '1.4rem' }}>

        {/* ── Live header: clock + assets + trip overview ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.2rem 1.4rem', display: 'grid', gap: '1rem', boxShadow: '0 2px 12px rgba(0,0,0,.18)' }}>

          {/* Top row: clock + assets */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: '2rem', letterSpacing: '-.03em', color: 'var(--text)', lineHeight: 1 }}>{liveClock}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 600 }}>{today}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {vehicle?.truckNum && (
                <div style={{ background: 'rgba(79,152,163,.08)', border: '1px solid rgba(79,152,163,.2)', borderRadius: 10, padding: '.35rem .75rem' }}>
                  <div style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--primary)', marginBottom: 2 }}>Tractor</div>
                  <div style={{ fontWeight: 900, fontSize: 'var(--text-sm)', fontVariantNumeric: 'tabular-nums' }}>#{vehicle.truckNum}</div>
                </div>
              )}
              {vehicle?.trailerNum && (
                <div style={{ background: 'rgba(79,152,163,.08)', border: '1px solid rgba(79,152,163,.2)', borderRadius: 10, padding: '.35rem .75rem' }}>
                  <div style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--primary)', marginBottom: 2 }}>Trailer</div>
                  <div style={{ fontWeight: 900, fontSize: 'var(--text-sm)', fontVariantNumeric: 'tabular-nums' }}>#{vehicle.trailerNum}</div>
                </div>
              )}
              {vehicle && (vehicle.year || vehicle.make) && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '.35rem .75rem' }}>
                  <div style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 2 }}>Unit</div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-xs)' }}>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}</div>
                </div>
              )}
              {!vehicle && (
                <Link href="/trip" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '.35rem .75rem', fontSize: 'var(--text-xs)', color: 'var(--muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                  🚛 Set up truck
                </Link>
              )}
              {activeTrip?.loadNumber && (
                <div style={{ background: 'rgba(109,170,69,.08)', border: '1px solid rgba(109,170,69,.2)', borderRadius: 10, padding: '.35rem .75rem' }}>
                  <div style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--success)', marginBottom: 2 }}>Order #</div>
                  <div style={{ fontWeight: 900, fontSize: 'var(--text-sm)', color: 'var(--success)' }}>{activeTrip.loadNumber}</div>
                </div>
              )}
            </div>
          </div>

          {/* Active trip section */}
          {activeTrip ? (
            <>
              <div style={{ height: 1, background: 'var(--border)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 8px var(--primary)', flexShrink: 0 }} />
                  <span style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: 'var(--primary)' }}>Active Trip{activeTrip.loadNumber ? ` — Load #${activeTrip.loadNumber}` : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Link href="/trip" style={{ padding: '.3rem .7rem', borderRadius: 8, border: '1px solid rgba(79,152,163,.35)', fontSize: 'var(--text-xs)', color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>View plan</Link>
                  <Link href="/dispatch" style={{ padding: '.3rem .7rem', borderRadius: 8, border: '1px solid var(--border)', fontSize: 'var(--text-xs)', color: 'var(--text)', fontWeight: 700, textDecoration: 'none' }}>📨 Messages</Link>
                  <button onClick={() => { localStorage.removeItem('3b-active-trip'); setActiveTrip(null) }}
                    style={{ padding: '.3rem .7rem', borderRadius: 8, border: '1px solid var(--border)', fontSize: 'var(--text-xs)', color: 'var(--muted)', cursor: 'pointer', background: 'none' }}>Clear</button>
                </div>
              </div>

              {/* Route + progress bar */}
              <div style={{ display: 'grid', gap: '.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800 }}>{activeTrip.origin.query}</span>
                  <div style={{ flex: 1, minWidth: 80, position: 'relative', height: 6, background: 'var(--surface-off)', borderRadius: 3, margin: '0 4px' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${tripProgress}%`, background: 'linear-gradient(90deg,var(--primary),rgba(109,170,69,.9))', borderRadius: 3, transition: 'width 1s ease', boxShadow: tripProgress > 0 ? '0 0 8px rgba(79,152,163,.4)' : 'none' }} />
                    {tripProgress > 0 && tripProgress < 100 && (
                      <div style={{ position: 'absolute', top: -3, left: `${tripProgress}%`, width: 12, height: 12, background: 'var(--primary)', borderRadius: '50%', transform: 'translateX(-50%)', boxShadow: '0 0 6px var(--primary)', border: '2px solid var(--bg)' }} />
                    )}
                  </div>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800 }}>{activeTrip.destination.query}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
                  <span>{activeTrip.totalMiles} mi · ~{activeTrip.estDriveHours}h drive · {tripProgress}% complete</span>
                  <span>ETA {fmtDate(activeTrip.estArrival)} · {fmtTime(activeTrip.estArrival)}</span>
                </div>
              </div>

              {/* Trip detail chips */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { label: 'Departed', val: fmtTime(activeTrip.departTime) },
                  { label: 'Est. ETA', val: fmtTime(activeTrip.estArrival) },
                  { label: 'Progress', val: `${tripProgress}%`, color: 'var(--primary)' },
                  ...(activeTrip.stops.length ? [{ label: 'Stops', val: String(activeTrip.stops.length) }] : []),
                ].map(c => (
                  <div key={c.label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '.3rem .65rem', display: 'flex', gap: 5, alignItems: 'baseline' }}>
                    <span style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>{c.label}</span>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: c.color ?? 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{c.val}</span>
                  </div>
                ))}
              </div>

              {/* Next stop */}
              {nextStop && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(79,152,163,.05)', border: '1px solid rgba(79,152,163,.15)', borderRadius: 12, padding: '.65rem 1rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '.9rem' }}>⛽</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 'var(--text-xs)' }}>Next: {nextStop.name}{nextStop.city ? `, ${nextStop.city}` : ''}{nextStop.state ? ` ${nextStop.state}` : ''}</span>
                    <span style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)', marginLeft: 8 }}>{nextStop.miFromOrigin} mi · {fmtTime(nextStop.eta)} · {nextStop.stopType}</span>
                  </div>
                  {nextStop.diesel && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--warn)', fontWeight: 700 }}>⛽ ${nextStop.diesel.toFixed(3)}</span>}
                  {nextStop.showers && <span style={{ fontSize: 'var(--text-xs)', color: nextStop.showers.available > 0 ? 'var(--success)' : 'var(--error)', fontWeight: 700 }}>🚿 {nextStop.showers.available}/{nextStop.showers.total}</span>}
                </div>
              )}
              {!nextStop && tripProgress > 0 && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', fontWeight: 700 }}>✅ All stops complete — final leg to {activeTrip.destination.query}</div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>No active trip — build a route in the Trip Planner</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link href="/trip" style={{ padding: '.4rem .9rem', borderRadius: 8, border: '1px solid rgba(79,152,163,.35)', fontSize: 'var(--text-xs)', color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>🗺 Plan a trip</Link>
                <Link href="/dispatch" style={{ padding: '.4rem .9rem', borderRadius: 8, border: '1px solid var(--border)', fontSize: 'var(--text-xs)', color: 'var(--text)', fontWeight: 700, textDecoration: 'none' }}>📨 Messages</Link>
              </div>
            </div>
          )}
        </div>

        {/* Period selector */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PERIOD_LABELS.map(({ key, label }) => (
            <button key={key} onClick={() => setPeriod(key)}
              style={{ padding: '.45rem 1rem', borderRadius: 10, border: `1px solid ${period === key ? 'var(--primary)' : 'var(--border)'}`, background: period === key ? 'rgba(79,152,163,.12)' : 'none', color: period === key ? 'var(--primary)' : 'var(--muted)', fontWeight: period === key ? 700 : 500, fontSize: 'var(--text-xs)', transition: 'all var(--transition)' }}>
              {label}
            </button>
          ))}
        </div>

        {/* KPIs */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(210px,100%),1fr))', gap: '1rem' }}>
          <KpiCard label="Dispatch miles" value={fmt(m.dispatchMiles)} note="All booked moves" />
          <KpiCard label="Actual miles" value={m.actualMiles ? fmt(m.actualMiles) : '—'} note="Enter ELD miles" color={m.actualMiles ? undefined : 'warn'} />
          <KpiCard label="Paid miles" value={m.paidMiles ? fmt(m.paidMiles) : '—'} note="Settlement baseline" color={m.paidMiles ? undefined : 'warn'} />
          <KpiCard label={`Est. pay @ ${cfg.cpmHigh.toFixed(3)}`} value={fmtM(m.estPay)} note="Dispatch × CPM" color="primary" />
          <KpiCard label="Fuel cost" value={fmtM(totalFuel)} note="From fuel log" color={totalFuel > 0 ? 'warn' : undefined} />
          <KpiCard label="Net (est.)" value={fmtM(m.estPay - totalFuel)} note="Before deductions" color="success" />
          <KpiCard label="Wait hours" value={m.waitHours.toFixed(2) + 'h'} note="Total drag" color={m.waitHours > 1 ? 'warn' : undefined} />
          <KpiCard label="Unpaid miles" value={fmt(m.unpaidMiles)} note="Actual − paid" color={m.unpaidMiles > 25 ? 'error' : undefined} />
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.4rem', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Load log</h2>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'auto', boxShadow: 'var(--shadow-sm)' }}>
              {loading
                ? <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>
                : filteredLoads.length === 0
                  ? <div style={{ padding: '2.5rem', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>No loads in this period — add one in the Load Log.</div>
                  : (
                    <table>
                      <thead>
                        <tr>{['Load #', 'Move', 'Origin → Dest.', 'Disp. mi', 'Est. pay', 'Fuel', 'Wait h', 'Grade'].map(h => (
                          <th key={h} style={{ padding: '.85rem 1rem', fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>{filteredLoads.map(l => {
                        const c = classify(l)
                        return (
                          <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '.85rem 1rem', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                              {l.loadNumber}
                              {l.trailer && <div style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 'var(--text-xs)' }}>{l.trailer}</div>}
                            </td>
                            <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-xs)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{l.moveType}</td>
                            <td style={{ padding: '.85rem 1rem', fontSize: 'var(--text-sm)', maxWidth: 200 }}>
                              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.origin}</div>
                              <div style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>&rarr; {l.destination}</div>
                            </td>
                            <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)' }}>{fmt(l.dispatchMiles)}</td>
                            <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--primary)' }}>{fmtM(l.dispatchMiles * l.cpmRate)}</td>
                            <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)', color: l.fuelCost > 0 ? 'var(--warn)' : 'var(--faint)' }}>{l.fuelCost > 0 ? fmtM(l.fuelCost) : '—'}</td>
                            <td style={{ padding: '.85rem 1rem', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)', color: l.waitHours > 1 ? 'var(--warn)' : 'var(--text)' }}>{l.waitHours || '—'}</td>
                            <td style={{ padding: '.85rem 1rem' }}><LoadBadge label={c.label} color={c.color} /></td>
                          </tr>
                        )
                      })}</tbody>
                    </table>
                  )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.2rem', display: 'grid', gap: '.9rem' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Red flags</h2>
              {loading
                ? <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading…</p>
                : flags.length === 0
                  ? <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>No flags — all clear.</p>
                  : flags.map((f, i) => <RedFlag key={i} message={f} />)}
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.2rem', display: 'grid', gap: '.8rem' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Pay analysis</h2>
              {[
                [`@ $${cfg.cpmLow.toFixed(3)} CPM`, fmtM(m.dispatchMiles * cfg.cpmLow)],
                [`@ $${cfg.cpmHigh.toFixed(3)} CPM`, fmtM(m.dispatchMiles * cfg.cpmHigh)],
                ['Fuel (fuel log)', '− ' + fmtM(totalFuel)],
                [`Net @ ${cfg.cpmHigh.toFixed(3)}`, fmtM(m.dispatchMiles * cfg.cpmHigh - totalFuel)],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '.8rem', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{l}</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)' }}>{v}</strong>
                </div>
              ))}
            </div>

            {/* ELD Intelligence — dual mode */}
            <div style={{ background: 'var(--surface)', border: `1px solid ${(eldMode === 'screenshot' ? hos : samsara && !samsara.error) ? 'rgba(79,152,163,.3)' : 'var(--border)'}`, borderRadius: 18, padding: '1.2rem', display: 'grid', gap: '.75rem' }}>
              <input ref={hosInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleScanHos} />

              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>ELD Intelligence</h2>
                {/* Mode toggle */}
                <div style={{ display: 'flex', background: 'var(--surface-off)', borderRadius: 8, padding: 2, gap: 2 }}>
                  {(['screenshot', 'samsara'] as EldMode[]).map(m => (
                    <button key={m} onClick={() => { setEldMode(m); localStorage.setItem('3b-eld-mode', m) }}
                      style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '.25rem .65rem', borderRadius: 6, border: 'none', cursor: 'pointer', background: eldMode === m ? 'var(--surface)' : 'transparent', color: eldMode === m ? 'var(--primary)' : 'var(--muted)', boxShadow: eldMode === m ? '0 1px 3px rgba(0,0,0,.2)' : 'none', transition: 'all var(--transition)' }}>
                      {m === 'screenshot' ? 'Screenshot' : 'Samsara API'}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Screenshot mode ── */}
              {eldMode === 'screenshot' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    {hos && (
                      <button onClick={() => { localStorage.removeItem('3b-hos-data'); setHos(null) }}
                        style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', padding: '.2rem .5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'none' }}>Clear</button>
                    )}
                    <button onClick={() => hosInputRef.current?.click()} disabled={hosScanning}
                      style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--primary)', padding: '.3rem .7rem', borderRadius: 8, border: '1px solid rgba(79,152,163,.4)', background: 'rgba(79,152,163,.08)', cursor: hosScanning ? 'not-allowed' : 'pointer', opacity: hosScanning ? .6 : 1 }}>
                      {hosScanning ? 'Scanning…' : 'Scan HOS screenshot'}
                    </button>
                  </div>
                  {hosError && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--error)', padding: '.4rem .7rem', background: 'rgba(220,53,69,.08)', borderRadius: 8 }}>{hosError}</div>}
                  {hos ? (() => {
                    const driveUsed = hos.driveUsedHrs ?? Math.max(0, 11 - (hos.driveRemainingHrs ?? 11))
                    const shiftUsed = hos.onDutyUsedHrs ?? Math.max(0, 14 - (hos.shiftRemainingHrs ?? 14))
                    const driveRem = hos.driveRemainingHrs ?? Math.max(0, 11 - driveUsed)
                    const shiftRem = hos.shiftRemainingHrs ?? Math.max(0, 14 - shiftUsed)
                    const statusColors: Record<string, string> = { Driving: 'var(--primary)', 'Off Duty': 'var(--muted)', 'On Duty': 'var(--warn)', 'Sleeper Berth': 'var(--muted)' }
                    const statusColor = statusColors[hos.status ?? ''] ?? 'var(--text)'
                    return (
                      <>
                        {hos.status && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} /><span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: statusColor }}>{hos.status}</span></div>}
                        <HOSBars driveUsed={driveUsed} driveRem={driveRem} shiftUsed={shiftUsed} shiftRem={shiftRem} breakInHrs={hos.breakInHrs} cycleRem={hos.cycleRemainingHrs} />
                        {hos.notes && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', fontStyle: 'italic' }}>{hos.notes}</div>}
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--faint)', textAlign: 'right' }}>Scanned {fmtTime(hos.scannedAt)}</div>
                      </>
                    )
                  })() : (
                    <div style={{ display: 'grid', gap: '.5rem' }}>
                      <HOSBars driveUsed={0} driveRem={11} shiftUsed={0} shiftRem={14} breakInHrs={null} cycleRem={70} empty />
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--faint)', marginTop: 4 }}>Take a screenshot of your ELD HOS screen and tap &ldquo;Scan HOS screenshot&rdquo; above.</p>
                    </div>
                  )}
                </>
              )}

              {/* ── Samsara API mode ── */}
              {eldMode === 'samsara' && (
                <>
                  {samsara?.error === 'not_configured' || (!samsara && !samsaraLoading) ? (
                    <div style={{ padding: '1rem', background: 'var(--surface-off)', borderRadius: 10, display: 'grid', gap: '.5rem' }}>
                      <p style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>Samsara API not configured</p>
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', lineHeight: 1.5 }}>Add <code style={{ background: 'var(--surface-2)', padding: '.1rem .35rem', borderRadius: 4 }}>SAMSARA_API_TOKEN</code> to your environment variables to enable live HOS, GPS location, and ELD miles.</p>
                    </div>
                  ) : samsaraLoading && !samsara ? (
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Connecting to Samsara…</p>
                  ) : samsara?.error ? (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--error)', padding: '.4rem .7rem', background: 'rgba(220,53,69,.08)', borderRadius: 8 }}>Samsara error: {samsara.error}</div>
                  ) : samsara ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', fontWeight: 700 }}>Samsara live</span>
                        {samsaraLoading && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--faint)' }}>· Updating…</span>}
                        {samsara.hos?.driverName && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>· {samsara.hos.driverName}</span>}
                      </div>
                      {samsara.hos && (() => {
                        const h = samsara.hos!
                        const driveUsed = Math.max(0, 11 - h.driveRemainingHrs)
                        const shiftUsed = Math.max(0, 14 - h.shiftRemainingHrs)
                        const statusMap: Record<string, string> = { offDuty: 'Off Duty', driving: 'Driving', onDutyNotDriving: 'On Duty', sleeperBed: 'Sleeper Berth' }
                        const statusLabel = statusMap[h.status ?? ''] ?? h.status ?? '—'
                        const statusColors: Record<string, string> = { driving: 'var(--primary)', offDuty: 'var(--muted)', onDutyNotDriving: 'var(--warn)', sleeperBed: 'var(--muted)' }
                        const statusColor = statusColors[h.status ?? ''] ?? 'var(--text)'
                        return (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} /><span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: statusColor }}>{statusLabel}</span></div>
                            <HOSBars driveUsed={driveUsed} driveRem={h.driveRemainingHrs} shiftUsed={shiftUsed} shiftRem={h.shiftRemainingHrs} breakInHrs={h.breakInHrs} cycleRem={h.cycleRemainingHrs} />
                          </>
                        )
                      })()}
                      {samsara.location?.address && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '.6rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 4 }}>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Location</span>
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textAlign: 'right', maxWidth: 200 }}>{samsara.location.address}</span>
                        </div>
                      )}
                      {samsara.location?.speedMph != null && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '.6rem', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Speed</span>
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700 }}>{Math.round(samsara.location.speedMph)} mph</span>
                        </div>
                      )}
                      {samsara.todayMiles != null && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '.6rem', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>ELD miles today</span>
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--primary)' }}>{fmt(samsara.todayMiles)} mi</span>
                        </div>
                      )}
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--faint)', textAlign: 'right' }}>Updated {fmtTime(samsara.updatedAt)}</div>
                    </>
                  ) : null}
                </>
              )}
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.2rem', display: 'grid', gap: '.75rem' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Delays</h2>
              {loading
                ? <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading…</p>
                : filteredDelays.length === 0
                  ? <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>No delays in this period.</p>
                  : filteredDelays.slice(0, 5).map(d => (
                    <div key={d.id} style={{ paddingBottom: '.75rem', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 'var(--text-sm)' }}>{d.delayType}</strong>
                        <LoadBadge label={d.billable} color={d.billable === 'Review' ? 'warn' : d.billable === 'Yes' ? 'error' : 'muted'} />
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 3 }}>Load {d.loadNumber} &middot; {d.totalHours ? d.totalHours + 'h' : 'TBD'}</div>
                      {d.notes && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--faint)', marginTop: 2 }}>{d.notes}</div>}
                    </div>
                  ))}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
