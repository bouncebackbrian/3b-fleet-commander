'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import { supabase } from '@/lib/supabase'
import { scoreLoad, getDieselPrice, getMpgDefault } from '@/lib/scoreLoad'
import type { RigType, MarginFlag, ScoreVerdict } from '@/lib/scoreLoad'

// ─── Types ───────────────────────────────────────────────────────────────────
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
  hos: { driverName: string | null; status: string | null; statusSince: string | null; driveRemainingHrs: number; shiftRemainingHrs: number; breakInHrs: number | null; cycleRemainingHrs: number } | null
  location: { lat: number | null; lng: number | null; speedMph: number | null; address: string | null; updatedAt: string | null; vehicleName: string | null } | null
  todayMiles: number | null; updatedAt: string; error?: string
}
type ActiveTrip = {
  origin: { query: string; lat?: number; lon?: number; lng?: number }
  destination: { query: string; lat?: number; lon?: number; lng?: number }
  totalMiles: number; departTime: string; estArrival: string; estDriveHours: string
  loadNumber: string | null
  stops: { name: string; city: string; state: string; miFromOrigin: number; eta: string; stopType: string; diesel: number | null; showers: { available: number; total: number } | null; recommended: boolean }[]
}
type Expense = {
  id: string; date: string; category: string; amount: number
  description: string; location: string; loadNumber: string
  deductPct: number; isDeductible: boolean; createdAt: string
}
type WeatherData = {
  temp: number; windSpeed: number; code: number; precip: number; lat: number; lng: number
}

// Active mission — latest load with operational meta
type LoadMission = {
  id: string; loadNumber: string; broker?: string
  origin: string; destination: string; date: string
  dispatchMiles: number; deadheadMiles: number
  grossRate: number; fuelPrice: number; rigType: RigType
  waitHours: number; reloadKnown: boolean; reloadAreaStrength: 1|2|3
  hasOvernightParking: boolean; loadType: string
  pickup?: string; delivery?: string; commodity?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMission(row: any): LoadMission {
  const notes = row.notes ?? ''
  let meta: Record<string, unknown> = {}
  try { const m = notes.match(/\[META:(.*?)\]$/); if (m) meta = JSON.parse(m[1]) } catch { /* ignore */ }
  return {
    id:                  row.id,
    loadNumber:          row.load_number   ?? '',
    broker:              row.broker        ?? undefined,
    origin:              row.origin        ?? '',
    destination:         row.destination   ?? '',
    date:                row.date          ?? '',
    dispatchMiles:       Number(row.dispatch_miles)  || 0,
    deadheadMiles:       Number(row.deadhead_miles)  || 0,
    grossRate:           Number(meta.grossRate)       || 0,
    fuelPrice:           parseFloat(String(meta.fuelPrice)) || getDieselPrice(row.origin ?? ''),
    rigType:             (meta.rigType as RigType)    || 'semi-solo',
    waitHours:           Number(row.wait_hours)       || 0,
    reloadKnown:         Boolean(meta.reloadKnown),
    reloadAreaStrength:  (meta.reloadAreaStrength as 1|2|3) || 2,
    hasOvernightParking: Boolean(meta.hasOvernightParking),
    loadType:            String(meta.loadType || 'FTL'),
    pickup:              meta.pickup  as string | undefined,
    delivery:            meta.delivery as string | undefined,
    commodity:           meta.commodity as string | undefined,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const todayISO = () => new Date().toISOString().slice(0, 10)

function weatherInfo(code: number): { label: string; emoji: string; severe: boolean; color: string } {
  if (code === 0)              return { label: 'Clear sky',      emoji: '☀️',  severe: false, color: '#f5c200' }
  if (code <= 3)               return { label: 'Partly cloudy',  emoji: '⛅',  severe: false, color: 'var(--muted)' }
  if (code === 45 || code === 48) return { label: 'Foggy',       emoji: '🌫️', severe: true,  color: 'var(--warn)' }
  if (code <= 55)              return { label: 'Drizzle',         emoji: '🌦️', severe: false, color: '#6c9bd2' }
  if (code <= 65)              return { label: 'Rain',            emoji: '🌧️', severe: code >= 63, color: code >= 63 ? 'var(--warn)' : '#6c9bd2' }
  if (code <= 77)              return { label: 'Snow / Ice',      emoji: '❄️',  severe: code >= 71, color: code >= 71 ? 'var(--error)' : '#6c9bd2' }
  if (code <= 82)              return { label: 'Rain showers',    emoji: '🌧️', severe: code === 82, color: '#6c9bd2' }
  if (code <= 86)              return { label: 'Snow showers',    emoji: '❄️',  severe: true,  color: 'var(--error)' }
  if (code >= 95)              return { label: 'Thunderstorm',    emoji: '⛈️',  severe: true,  color: 'var(--error)' }
  return                              { label: 'Overcast',        emoji: '☁️',  severe: false, color: 'var(--muted)' }
}

// ─── Quick-add categories ─────────────────────────────────────────────────────
const QUICK_CATS = [
  { id: 'fuel',    label: 'Fuel',    emoji: '⛽', deductPct: 100 },
  { id: 'parking', label: 'Parking', emoji: '🅿️', deductPct: 100 },
  { id: 'meals',   label: 'Meals',   emoji: '🍔', deductPct: 80  },
  { id: 'tolls',   label: 'Tolls',   emoji: '🛣️', deductPct: 100 },
  { id: 'repairs', label: 'Repairs', emoji: '🔧', deductPct: 100 },
  { id: 'other',   label: 'Other',   emoji: '📄', deductPct: 100 },
]

// ─── HOSBar ───────────────────────────────────────────────────────────────────
function HOSBar({ label, used, total, color }: { label: string; used: number; total: number; color: string }) {
  const pct = Math.min(100, (used / total) * 100)
  const rem = Math.max(0, total - used)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: '.72rem', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
          {rem.toFixed(1)}h left
        </span>
      </div>
      <div style={{ height: 8, background: 'var(--surface-off)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width .5s ease', boxShadow: pct > 85 ? `0 0 8px ${color}` : 'none' }} />
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [liveClock,    setLiveClock]    = useState('')
  const [liveDate,     setLiveDate]     = useState('')
  const [vehicle,      setVehicle]      = useState<VehicleSetup | null>(null)
  const [activeTrip,   setActiveTrip]   = useState<ActiveTrip | null>(null)
  const [hos,          setHos]          = useState<HOSData | null>(null)
  const [hosScanning,  setHosScanning]  = useState(false)
  const [hosError,     setHosError]     = useState('')
  const [eldMode,      setEldMode]      = useState<EldMode>('screenshot')
  const [samsara,      setSamsara]      = useState<SamsaraData | null>(null)
  const [samsaraLoad,  setSamsaraLoad]  = useState(false)
  const hosInputRef = useRef<HTMLInputElement>(null)

  // Expenses
  const [todayExpenses,  setTodayExpenses]  = useState<Expense[]>([])
  const [showQuickAdd,   setShowQuickAdd]   = useState(false)
  const [qaCategory,     setQaCategory]     = useState('fuel')
  const [qaAmount,       setQaAmount]       = useState('')
  const [qaDesc,         setQaDesc]         = useState('')
  const [qaAdding,       setQaAdding]       = useState(false)

  // Weather
  const [weather,        setWeather]        = useState<WeatherData | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  // Active mission (latest load from Supabase or localStorage)
  const [mission,        setMission]        = useState<LoadMission | null>(null)

  // ── Live clock ──
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setLiveClock(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }))
      setLiveDate(now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Load localStorage ──
  useEffect(() => {
    try { const v = localStorage.getItem('3b-vehicle');    if (v) setVehicle(JSON.parse(v)) }    catch { /* ignore */ }
    try { const t = localStorage.getItem('3b-active-trip');if (t) setActiveTrip(JSON.parse(t)) } catch { /* ignore */ }
    try { const h = localStorage.getItem('3b-hos-data');   if (h) setHos(JSON.parse(h)) }        catch { /* ignore */ }
    try { const m = localStorage.getItem('3b-eld-mode') as EldMode|null; if (m) setEldMode(m) }  catch { /* ignore */ }
  }, [])

  // ── Load latest mission from Supabase (or localStorage fallback) ──
  useEffect(() => {
    if (!supabase) {
      // localStorage fallback — written by loads/page on save
      try {
        const raw = localStorage.getItem('3b-latest-load')
        if (raw) setMission(JSON.parse(raw))
      } catch { /* ignore */ }
      return
    }
    supabase
      .from('loads')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setMission(parseMission(data))
      })
  }, [])

  // ── Load today's expenses ──
  const refreshExpenses = useCallback(() => {
    try {
      const raw = localStorage.getItem('3b-expenses')
      if (!raw) return
      const all: Expense[] = JSON.parse(raw)
      setTodayExpenses(all.filter(e => e.date === todayISO()))
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { refreshExpenses() }, [refreshExpenses])

  // ── Fetch weather via geolocation + Open-Meteo ──
  useEffect(() => {
    if (!navigator.geolocation) return
    setWeatherLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lng } = pos.coords
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,weather_code,precipitation&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=auto`
          const res = await fetch(url)
          const json = await res.json()
          setWeather({
            lat, lng,
            temp:      Math.round(json.current.temperature_2m),
            windSpeed: Math.round(json.current.wind_speed_10m),
            code:      json.current.weather_code,
            precip:    json.current.precipitation ?? 0,
          })
        } catch { /* weather unavailable */ }
        finally { setWeatherLoading(false) }
      },
      () => setWeatherLoading(false),
      { timeout: 8000, maximumAge: 300_000 }
    )
  }, [])

  // ── Samsara polling ──
  useEffect(() => {
    if (eldMode !== 'samsara') return
    const poll = async () => {
      setSamsaraLoad(true)
      try {
        const tok = localStorage.getItem('samsara-api-token') ?? ''
        const headers: HeadersInit = tok ? { 'x-samsara-token': tok } : {}
        const res = await fetch('/api/samsara', { headers })
        setSamsara(await res.json())
      }
      catch { /* ignore */ } finally { setSamsaraLoad(false) }
    }
    poll()
    const id = setInterval(poll, 30_000)
    return () => clearInterval(id)
  }, [eldMode])

  const handleScanHos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
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

  // ── Quick-add expense ──
  const handleQuickAdd = () => {
    const amt = parseFloat(qaAmount)
    if (!amt || amt <= 0) return
    setQaAdding(true)
    const cat = QUICK_CATS.find(c => c.id === qaCategory) ?? QUICK_CATS[0]
    const expense: Expense = {
      id: crypto.randomUUID(),
      date: todayISO(),
      category: cat.id,
      amount: amt,
      description: qaDesc.trim(),
      location: '',
      loadNumber: activeTrip?.loadNumber ?? '',
      deductPct: cat.deductPct,
      isDeductible: true,
      createdAt: new Date().toISOString(),
    }
    try {
      const raw = localStorage.getItem('3b-expenses')
      const all: Expense[] = raw ? JSON.parse(raw) : []
      all.unshift(expense)
      localStorage.setItem('3b-expenses', JSON.stringify(all))
    } catch { /* ignore */ }
    setQaAmount('')
    setQaDesc('')
    setQaAdding(false)
    setShowQuickAdd(false)
    refreshExpenses()
  }

  // ── Derived values ──
  const now = Date.now()
  const nextStop = activeTrip?.stops.find(s => new Date(s.eta).getTime() > now)
  const tripProgress = activeTrip ? (() => {
    const depart = new Date(activeTrip.departTime).getTime()
    const arrive = new Date(activeTrip.estArrival).getTime()
    return Math.round(Math.min(100, Math.max(0, ((now - depart) / (arrive - depart)) * 100)))
  })() : 0

  const todayTotal    = todayExpenses.reduce((s, e) => s + e.amount, 0)
  const todayDeduct   = todayExpenses.reduce((s, e) => s + e.amount * e.deductPct / 100, 0)
  const todayTaxSave  = Math.round(todayDeduct * 0.25)

  const hosDisplay = (() => {
    if (eldMode === 'samsara' && samsara?.hos) {
      const h = samsara.hos
      return { driveUsed: Math.max(0, 11 - h.driveRemainingHrs), driveRem: h.driveRemainingHrs, shiftUsed: Math.max(0, 14 - h.shiftRemainingHrs), shiftRem: h.shiftRemainingHrs, cycleRem: h.cycleRemainingHrs, breakIn: h.breakInHrs, status: h.status, source: 'samsara' as const }
    }
    if (hos) {
      const driveUsed = hos.driveUsedHrs ?? Math.max(0, 11 - (hos.driveRemainingHrs ?? 11))
      const shiftUsed = hos.onDutyUsedHrs ?? Math.max(0, 14 - (hos.shiftRemainingHrs ?? 14))
      return { driveUsed, driveRem: hos.driveRemainingHrs ?? Math.max(0, 11 - driveUsed), shiftUsed, shiftRem: hos.shiftRemainingHrs ?? Math.max(0, 14 - shiftUsed), cycleRem: hos.cycleRemainingHrs, breakIn: hos.breakInHrs, status: hos.status, source: 'screenshot' as const }
    }
    return null
  })()

  const driveColor = !hosDisplay ? 'var(--primary)' : hosDisplay.driveRem <= 2 ? 'var(--error)' : hosDisplay.driveRem <= 4 ? 'var(--warn)' : 'var(--primary)'
  const shiftColor = !hosDisplay ? '#6c9bd2'        : hosDisplay.shiftRem <= 2 ? 'var(--error)' : hosDisplay.shiftRem <= 4 ? 'var(--warn)' : '#6c9bd2'

  const statusMap: Record<string, string> = { Driving: 'var(--primary)', driving: 'var(--primary)', 'Off Duty': 'var(--muted)', offDuty: 'var(--muted)', 'On Duty': 'var(--warn)', onDutyNotDriving: 'var(--warn)', 'Sleeper Berth': 'var(--muted)', sleeperBed: 'var(--muted)' }
  const statusLabelMap: Record<string, string> = { driving: 'Driving', offDuty: 'Off Duty', onDutyNotDriving: 'On Duty', sleeperBed: 'Sleeper Berth' }
  const statusLabel = hosDisplay?.status ? (statusLabelMap[hosDisplay.status] ?? hosDisplay.status) : null
  const statusColor = hosDisplay?.status ? (statusMap[hosDisplay.status] ?? 'var(--text)') : 'var(--muted)'

  // ── Mission score (computed from latest load) ────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const missionScore = useMemo(() => {
    if (!mission || (!mission.dispatchMiles && !mission.grossRate)) return null
    return scoreLoad({
      loadedMiles:         mission.dispatchMiles,
      deadheadMiles:       mission.deadheadMiles,
      loadType:            mission.loadType,
      waitHours:           mission.waitHours,
      reloadKnown:         mission.reloadKnown,
      reloadAreaStrength:  mission.reloadAreaStrength,
      hasOvernightParking: mission.hasOvernightParking,
      grossRate:           mission.grossRate,
      mpg:                 getMpgDefault(mission.rigType),
      fuelPrice:           mission.fuelPrice,
      rigType:             mission.rigType,
    })
  }, [mission])

  const QUICK_ACTIONS = [
    { href: '/trips',    icon: '🗺',  label: 'Plan Trip' },
    { href: '/dispatch', icon: '💬',  label: 'Dispatch'  },
    { href: '/expenses', icon: '💵',  label: 'Expenses'  },
    { href: '/loads',    icon: '📦',  label: 'Log Load'  },
    { href: '/fuel',     icon: '⛽',  label: 'Fuel'      },
    { href: '/delays',   icon: '⏱',  label: 'Delay'     },
  ]

  const wx = weather ? weatherInfo(weather.code) : null

  return (
    <>
      <input ref={hosInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleScanHos} />

      <TopBar title="Command Center" module="mis" subtitle={liveDate} />

      <main style={{ padding: '1rem', display: 'grid', gap: '1rem', maxWidth: 900, margin: '0 auto' }}>

        {/* ── LIVE CLOCK ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.4rem 1.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, boxShadow: '0 2px 16px rgba(0,0,0,.2)' }}>
          <div>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontSize: 'clamp(1.8rem,6vw,2.8rem)', letterSpacing: '-.03em', color: 'var(--text)', lineHeight: 1 }}>{liveClock}</div>
            <div style={{ fontSize: '.75rem', color: 'var(--muted)', fontWeight: 600, marginTop: 4 }}>{liveDate}</div>
          </div>
          {/* Asset chips */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {vehicle?.truckNum && (
              <div style={{ background: 'rgba(0,232,176,.07)', border: '1px solid rgba(0,232,176,.18)', borderRadius: 10, padding: '.4rem .85rem', textAlign: 'center' }}>
                <div style={{ fontSize: '.55rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--primary)' }}>Tractor</div>
                <div style={{ fontWeight: 900, fontSize: '.95rem', fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>#{vehicle.truckNum}</div>
              </div>
            )}
            {vehicle?.trailerNum && (
              <div style={{ background: 'rgba(0,232,176,.07)', border: '1px solid rgba(0,232,176,.18)', borderRadius: 10, padding: '.4rem .85rem', textAlign: 'center' }}>
                <div style={{ fontSize: '.55rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--primary)' }}>Trailer</div>
                <div style={{ fontWeight: 900, fontSize: '.95rem', fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>#{vehicle.trailerNum}</div>
              </div>
            )}
            {activeTrip?.loadNumber && (
              <div style={{ background: 'rgba(40,192,72,.07)', border: '1px solid rgba(40,192,72,.2)', borderRadius: 10, padding: '.4rem .85rem', textAlign: 'center' }}>
                <div style={{ fontSize: '.55rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--success)' }}>Order</div>
                <div style={{ fontWeight: 900, fontSize: '.95rem', color: 'var(--success)', marginTop: 1 }}>{activeTrip.loadNumber}</div>
              </div>
            )}
            {!vehicle && (
              <Link href="/trips" style={{ padding: '.4rem .85rem', borderRadius: 10, border: '1px solid var(--border)', fontSize: '.75rem', color: 'var(--muted)', textDecoration: 'none', fontWeight: 700 }}>
                🚛 Set up truck →
              </Link>
            )}
          </div>
        </div>

        {/* ── WEATHER + TODAY'S EXPENSES (2-col on desktop) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>

          {/* WEATHER CARD */}
          <div style={{ background: 'var(--surface)', border: `1px solid ${wx?.severe ? 'rgba(232,128,0,.3)' : 'var(--border)'}`, borderRadius: 20, padding: '1.1rem 1.3rem', display: 'flex', flexDirection: 'column', gap: '.6rem', boxShadow: wx?.severe ? '0 2px 16px rgba(232,128,0,.12)' : '0 2px 12px rgba(0,0,0,.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)' }}>Weather</div>
              {weather && (
                <span style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 600 }}>
                  📍 Current location
                </span>
              )}
            </div>

            {weatherLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: '.75rem' }}>
                <div style={{ width: 14, height: 14, border: '2px solid rgba(0,232,176,.3)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                Getting location…
              </div>
            )}

            {!weatherLoading && !weather && (
              <div style={{ fontSize: '.75rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                Allow location access to see live weather conditions at your current position.
              </div>
            )}

            {weather && wx && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '2.5rem', lineHeight: 1 }}>{wx.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: '2rem', fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: wx.color }}>{weather.temp}°F</div>
                    <div style={{ fontSize: '.72rem', color: wx.color, fontWeight: 700, marginTop: 2 }}>{wx.label}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: '.85rem' }}>💨</span>
                    <span style={{ fontSize: '.72rem', color: weather.windSpeed >= 40 ? 'var(--error)' : weather.windSpeed >= 25 ? 'var(--warn)' : 'var(--muted)', fontWeight: 700 }}>
                      {weather.windSpeed} mph {weather.windSpeed >= 40 ? '⚠️ HIGH WIND' : weather.windSpeed >= 25 ? 'breezy' : 'wind'}
                    </span>
                  </div>
                  {weather.precip > 0 && (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: '.85rem' }}>🌧️</span>
                      <span style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 600 }}>{weather.precip.toFixed(1)} mm precip</span>
                    </div>
                  )}
                </div>
                {wx.severe && (
                  <div style={{ padding: '.45rem .7rem', borderRadius: 8, background: 'rgba(232,64,0,.1)', border: '1px solid rgba(232,64,0,.25)', fontSize: '.7rem', color: 'var(--error)', fontWeight: 700 }}>
                    ⚠️ Hazardous conditions — drive with caution
                  </div>
                )}
                {!wx.severe && weather.windSpeed >= 40 && (
                  <div style={{ padding: '.45rem .7rem', borderRadius: 8, background: 'rgba(245,194,0,.08)', border: '1px solid rgba(245,194,0,.2)', fontSize: '.7rem', color: 'var(--warn)', fontWeight: 700 }}>
                    💨 High winds — watch trailer handling
                  </div>
                )}
              </>
            )}

            {weather && (
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <Link href="/dispatch" style={{ fontSize: '.68rem', color: 'var(--muted)', textDecoration: 'none', fontWeight: 600, padding: '.25rem .6rem', border: '1px solid var(--border)', borderRadius: 6 }}>
                  Full route weather →
                </Link>
              </div>
            )}
          </div>

          {/* TODAY'S EXPENSES CARD */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.1rem 1.3rem', display: 'flex', flexDirection: 'column', gap: '.6rem', boxShadow: '0 2px 12px rgba(0,0,0,.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)' }}>Today&apos;s Expenses</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setShowQuickAdd(v => !v)}
                  style={{ fontSize: '.68rem', fontWeight: 700, padding: '.28rem .65rem', borderRadius: 7, border: '1px solid rgba(0,232,176,.3)', background: showQuickAdd ? 'rgba(0,232,176,.12)' : 'rgba(0,232,176,.06)', color: 'var(--primary)', cursor: 'pointer' }}>
                  {showQuickAdd ? '✕ Cancel' : '➕ Add'}
                </button>
                <Link href="/expenses" style={{ fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600, padding: '.28rem .55rem', border: '1px solid var(--border)', borderRadius: 7, textDecoration: 'none' }}>
                  All →
                </Link>
              </div>
            </div>

            {/* Summary row */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>Spent</div>
                <div style={{ fontWeight: 900, fontSize: '1.5rem', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, color: todayTotal > 0 ? 'var(--text)' : 'var(--faint)' }}>
                  ${todayTotal.toFixed(2)}
                </div>
              </div>
              {todayDeduct > 0 && (
                <>
                  <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />
                  <div>
                    <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>Deductible</div>
                    <div style={{ fontWeight: 800, fontSize: '1.3rem', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, color: 'var(--primary)' }}>
                      ${todayDeduct.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />
                  <div>
                    <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>~25% Tax Save</div>
                    <div style={{ fontWeight: 800, fontSize: '1.3rem', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, color: 'var(--success)' }}>
                      ${todayTaxSave}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Recent expenses */}
            {todayExpenses.length > 0 && !showQuickAdd && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {todayExpenses.slice(0, 3).map(e => {
                  const cat = QUICK_CATS.find(c => c.id === e.category)
                  return (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.35rem .55rem', borderRadius: 8, background: 'rgba(0,0,0,.15)' }}>
                      <span style={{ fontSize: '.72rem', color: 'var(--text)' }}>
                        {cat?.emoji ?? '📄'} {e.description || cat?.label || e.category}
                      </span>
                      <span style={{ fontSize: '.72rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>${e.amount.toFixed(2)}</span>
                    </div>
                  )
                })}
                {todayExpenses.length > 3 && (
                  <div style={{ fontSize: '.65rem', color: 'var(--muted)', textAlign: 'center', paddingTop: 2 }}>
                    +{todayExpenses.length - 3} more — <Link href="/expenses" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 700 }}>view all</Link>
                  </div>
                )}
              </div>
            )}

            {todayExpenses.length === 0 && !showQuickAdd && (
              <div style={{ fontSize: '.75rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                No expenses logged today. Tap <strong>➕ Add</strong> to quickly log a receipt.
              </div>
            )}

            {/* Quick-add form */}
            {showQuickAdd && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '.75rem', borderRadius: 12, background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.12)' }}>
                {/* Category pills */}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {QUICK_CATS.map(c => (
                    <button key={c.id} onClick={() => setQaCategory(c.id)}
                      style={{ fontSize: '.65rem', fontWeight: 700, padding: '.25rem .5rem', borderRadius: 6, border: '1px solid', cursor: 'pointer', transition: 'all .12s',
                        background: qaCategory === c.id ? 'rgba(0,232,176,.15)' : 'transparent',
                        borderColor: qaCategory === c.id ? 'rgba(0,232,176,.4)' : 'var(--border)',
                        color: qaCategory === c.id ? 'var(--primary)' : 'var(--muted)',
                      }}>
                      {c.emoji} {c.label}
                    </button>
                  ))}
                </div>
                {/* Amount + description */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="number" inputMode="decimal" placeholder="Amount $"
                    value={qaAmount} onChange={e => setQaAmount(e.target.value)}
                    style={{ flex: '0 0 100px', padding: '.45rem .65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.8rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                  />
                  <input
                    type="text" placeholder="Note (optional)"
                    value={qaDesc} onChange={e => setQaDesc(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
                    style={{ flex: 1, padding: '.45rem .65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-off)', color: 'var(--text)', fontSize: '.8rem' }}
                  />
                </div>
                {/* Deduct note */}
                {qaCategory && (
                  <div style={{ fontSize: '.62rem', color: 'var(--muted)' }}>
                    {QUICK_CATS.find(c => c.id === qaCategory)?.deductPct}% tax deductible
                    {qaCategory === 'meals' ? ' (IRS 80% meals rule)' : ''}
                  </div>
                )}
                <button
                  onClick={handleQuickAdd} disabled={qaAdding || !qaAmount}
                  style={{ padding: '.5rem', borderRadius: 9, border: 'none', background: !qaAmount ? 'var(--surface-off)' : 'rgba(0,232,176,.15)', color: !qaAmount ? 'var(--muted)' : 'var(--primary)', fontWeight: 800, fontSize: '.78rem', cursor: !qaAmount ? 'not-allowed' : 'pointer', transition: 'all .15s' }}>
                  {qaAdding ? 'Saving…' : '✓ Save Expense'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── HOS STATUS ── */}
        <div style={{ background: 'var(--surface)', border: `1px solid ${hosDisplay ? 'rgba(0,232,176,.2)' : 'var(--border)'}`, borderRadius: 20, padding: '1.2rem 1.4rem', display: 'grid', gap: '1rem', boxShadow: '0 2px 12px rgba(0,0,0,.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: 'var(--text)' }}>HOS Status</div>
              {statusLabel && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '.2rem .6rem', borderRadius: 6, background: `${statusColor}15`, border: `1px solid ${statusColor}30` }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
                  <span style={{ fontSize: '.68rem', fontWeight: 800, color: statusColor }}>{statusLabel}</span>
                </div>
              )}
              {hosDisplay?.source === 'samsara' && (
                <span style={{ fontSize: '.6rem', color: 'var(--success)', fontWeight: 700, padding: '.15rem .45rem', borderRadius: 4, background: 'rgba(40,192,72,.1)', border: '1px solid rgba(40,192,72,.2)' }}>LIVE</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ display: 'flex', background: 'var(--surface-off)', borderRadius: 7, padding: 2, gap: 2 }}>
                {(['screenshot', 'samsara'] as EldMode[]).map(m => (
                  <button key={m} onClick={() => { setEldMode(m); localStorage.setItem('3b-eld-mode', m) }}
                    style={{ fontSize: '.65rem', fontWeight: 700, padding: '.22rem .55rem', borderRadius: 5, border: 'none', cursor: 'pointer', background: eldMode === m ? 'var(--surface)' : 'transparent', color: eldMode === m ? 'var(--primary)' : 'var(--muted)', transition: 'all .15s' }}>
                    {m === 'screenshot' ? '📷 Scan' : '📡 Samsara'}
                  </button>
                ))}
              </div>
              {eldMode === 'screenshot' && (
                <button onClick={() => hosInputRef.current?.click()} disabled={hosScanning}
                  style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--primary)', padding: '.3rem .7rem', borderRadius: 8, border: '1px solid rgba(0,232,176,.3)', background: 'rgba(0,232,176,.06)', cursor: hosScanning ? 'not-allowed' : 'pointer', opacity: hosScanning ? .6 : 1, whiteSpace: 'nowrap' }}>
                  {hosScanning ? '⏳ Scanning…' : '📷 Scan HOS'}
                </button>
              )}
              {hosDisplay && (
                <button onClick={() => { localStorage.removeItem('3b-hos-data'); setHos(null); setSamsara(null) }}
                  style={{ fontSize: '.65rem', color: 'var(--muted)', padding: '.25rem .5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}>Clear</button>
              )}
            </div>
          </div>

          {hosError && <div style={{ fontSize: '.72rem', color: 'var(--error)', padding: '.4rem .7rem', background: 'rgba(232,64,0,.08)', borderRadius: 8 }}>{hosError}</div>}

          {hosDisplay ? (
            <div style={{ display: 'grid', gap: '.75rem' }}>
              <HOSBar label={`Drive — ${hosDisplay.driveUsed.toFixed(1)}h used of 11h`} used={hosDisplay.driveUsed} total={11} color={driveColor} />
              <HOSBar label={`On-duty window — ${hosDisplay.shiftUsed.toFixed(1)}h used of 14h`} used={hosDisplay.shiftUsed} total={14} color={shiftColor} />
              {hosDisplay.cycleRem != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '.35rem', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 600 }}>70-hr cycle remaining</span>
                  <span style={{ fontSize: '.7rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{hosDisplay.cycleRem.toFixed(1)}h</span>
                </div>
              )}
              {hosDisplay.breakIn != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '.5rem .75rem', borderRadius: 8, background: hosDisplay.breakIn < 1 ? 'rgba(232,64,0,.08)' : 'rgba(245,194,0,.06)', border: `1px solid ${hosDisplay.breakIn < 1 ? 'rgba(232,64,0,.2)' : 'rgba(245,194,0,.15)'}` }}>
                  <span style={{ fontSize: '.7rem', color: hosDisplay.breakIn < 1 ? 'var(--error)' : 'var(--warn)', fontWeight: 700 }}>⏸ 30-min break required in</span>
                  <span style={{ fontSize: '.7rem', fontWeight: 900, color: hosDisplay.breakIn < 1 ? 'var(--error)' : 'var(--warn)', fontVariantNumeric: 'tabular-nums' }}>{hosDisplay.breakIn.toFixed(1)}h</span>
                </div>
              )}
              {eldMode === 'samsara' && samsara?.location?.address && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '.35rem', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 4 }}>
                  <span style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 600 }}>📍 Location</span>
                  <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text)', textAlign: 'right' }}>{samsara.location.address}</span>
                </div>
              )}
              {eldMode === 'samsara' && samsara?.location?.speedMph != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '.7rem', color: 'var(--muted)', fontWeight: 600 }}>🚛 Speed</span>
                  <span style={{ fontSize: '.7rem', fontWeight: 800 }}>{Math.round(samsara.location.speedMph)} mph</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '.65rem', opacity: .5 }}>
              <HOSBar label="Drive — 0h used of 11h" used={0} total={11} color="var(--primary)" />
              <HOSBar label="On-duty window — 0h used of 14h" used={0} total={14} color="#6c9bd2" />
              <p style={{ fontSize: '.72rem', color: 'var(--faint)', marginTop: 4 }}>
                {eldMode === 'screenshot'
                  ? 'Tap "Scan HOS" to upload your ELD screenshot and auto-fill your hours.'
                  : 'Add SAMSARA_API_TOKEN to your environment variables for live HOS data.'}
              </p>
            </div>
          )}
        </div>

        {/* ── ACTIVE TRIP ── */}
        <div style={{ background: 'var(--surface)', border: `1px solid ${activeTrip ? 'rgba(0,232,176,.18)' : 'var(--border)'}`, borderRadius: 20, padding: '1.2rem 1.4rem', display: 'grid', gap: '.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {activeTrip && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 8px var(--primary)' }} />}
              <span style={{ fontWeight: 800, fontSize: 'var(--text-sm)' }}>
                {activeTrip ? `Active Trip${activeTrip.loadNumber ? ` — Load #${activeTrip.loadNumber}` : ''}` : 'No Active Trip'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {activeTrip && (
                <>
                  <Link href="/trips" style={{ padding: '.3rem .65rem', borderRadius: 7, border: '1px solid rgba(0,232,176,.3)', fontSize: '.7rem', color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>View plan</Link>
                  <Link href="/dispatch" style={{ padding: '.3rem .65rem', borderRadius: 7, border: '1px solid var(--border)', fontSize: '.7rem', color: 'var(--text)', fontWeight: 700, textDecoration: 'none' }}>Messages</Link>
                  <button onClick={() => { localStorage.removeItem('3b-active-trip'); setActiveTrip(null) }}
                    style={{ padding: '.3rem .65rem', borderRadius: 7, border: '1px solid var(--border)', fontSize: '.7rem', color: 'var(--muted)', cursor: 'pointer', background: 'none' }}>Clear</button>
                </>
              )}
              {!activeTrip && (
                <Link href="/trips" style={{ padding: '.35rem .85rem', borderRadius: 8, border: '1px solid rgba(0,232,176,.3)', background: 'rgba(0,232,176,.06)', fontSize: '.75rem', color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>
                  🗺 Plan a trip →
                </Link>
              )}
            </div>
          </div>

          {activeTrip ? (
            <>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: '.9rem', color: 'var(--text)' }}>{activeTrip.origin.query}</span>
                  <div style={{ flex: 1, minWidth: 60, position: 'relative', height: 8, background: 'var(--surface-off)', borderRadius: 4, margin: '0 2px' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${tripProgress}%`, background: 'linear-gradient(90deg,var(--primary),rgba(40,192,72,.8))', borderRadius: 4, transition: 'width 1s ease', boxShadow: tripProgress > 0 ? '0 0 8px rgba(0,232,176,.35)' : 'none' }} />
                    {tripProgress > 5 && tripProgress < 98 && (
                      <div style={{ position: 'absolute', top: -4, left: `${tripProgress}%`, width: 16, height: 16, background: 'var(--primary)', borderRadius: '50%', transform: 'translateX(-50%)', boxShadow: '0 0 8px var(--primary)', border: '2px solid var(--surface)', display: 'grid', placeItems: 'center', fontSize: '.55rem' }}>🚛</div>
                    )}
                  </div>
                  <span style={{ fontWeight: 800, fontSize: '.9rem', color: 'var(--text)' }}>{activeTrip.destination.query}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.7rem', color: 'var(--muted)', flexWrap: 'wrap', gap: 4 }}>
                  <span>{activeTrip.totalMiles} mi · ~{activeTrip.estDriveHours}h drive · <strong style={{ color: 'var(--primary)' }}>{tripProgress}% complete</strong></span>
                  <span>ETA {fmtDate(activeTrip.estArrival)} {fmtTime(activeTrip.estArrival)}</span>
                </div>
              </div>

              {nextStop && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.12)', borderRadius: 12, padding: '.6rem .9rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '.9rem' }}>⛽</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '.78rem' }}>Next: {nextStop.name}{nextStop.city ? `, ${nextStop.city}` : ''}{nextStop.state ? ` ${nextStop.state}` : ''}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '.68rem', marginTop: 1 }}>{nextStop.miFromOrigin} mi · {fmtTime(nextStop.eta)} · {nextStop.stopType}</div>
                  </div>
                  {nextStop.diesel != null && <span style={{ fontSize: '.72rem', color: 'var(--warn)', fontWeight: 800 }}>⛽ ${nextStop.diesel.toFixed(3)}/gal</span>}
                </div>
              )}
              {!nextStop && tripProgress > 0 && (
                <div style={{ fontSize: '.75rem', color: 'var(--success)', fontWeight: 700 }}>✅ All stops cleared — final leg to {activeTrip.destination.query}</div>
              )}
            </>
          ) : (
            <p style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              Build a route in Trip Planner and it will show here with a live progress bar, ETA, and next stop. Perfect for keeping on your phone mount while driving.
            </p>
          )}
        </div>

        {/* ── ACTIVE MISSION ── */}
        <div style={{ background: 'var(--surface)', border: `1px solid ${mission ? 'rgba(0,232,176,.2)' : 'var(--border)'}`, borderRadius: 20, padding: '1.2rem 1.4rem', display: 'grid', gap: '.85rem', boxShadow: mission ? '0 2px 16px rgba(0,232,176,.06)' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {mission && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 8px var(--primary)', animation: 'pulse 2s infinite' }} />}
              <span style={{ fontWeight: 800, fontSize: 'var(--text-sm)' }}>
                {mission ? `Active Mission${mission.loadNumber ? ` — ${mission.loadNumber}` : ''}` : 'No Active Mission'}
              </span>
              {mission?.date && <span style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 600 }}>{mission.date}</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {mission && (
                <>
                  <Link href="/loads" style={{ padding: '.3rem .65rem', borderRadius: 7, border: '1px solid rgba(0,232,176,.3)', fontSize: '.7rem', color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>Open Intake →</Link>
                  <Link href="/dispatch" style={{ padding: '.3rem .65rem', borderRadius: 7, border: '1px solid var(--border)', fontSize: '.7rem', color: 'var(--text)', fontWeight: 700, textDecoration: 'none' }}>Messages</Link>
                </>
              )}
              {!mission && (
                <Link href="/loads" style={{ padding: '.35rem .85rem', borderRadius: 8, border: '1px solid rgba(0,232,176,.3)', background: 'rgba(0,232,176,.06)', fontSize: '.75rem', color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>
                  ⚡ New Load →
                </Link>
              )}
            </div>
          </div>

          {mission ? (
            <>
              {/* Route strip */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: '.88rem', color: 'var(--text)' }}>
                  {mission.origin.split(',')[0]}
                </span>
                <span style={{ color: 'var(--primary)', fontWeight: 900, fontSize: '.9rem' }}>→</span>
                <span style={{ fontWeight: 800, fontSize: '.88rem', color: 'var(--text)' }}>
                  {mission.destination.split(',')[0]}
                </span>
                {mission.broker && (
                  <span style={{ fontSize: '.65rem', color: 'var(--muted)', padding: '.15rem .45rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5 }}>
                    {mission.broker}
                  </span>
                )}
                {mission.commodity && (
                  <span style={{ fontSize: '.65rem', color: 'var(--muted)' }}>· {mission.commodity}</span>
                )}
              </div>

              {missionScore ? (
                <>
                  {/* Score + margin row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '1rem', alignItems: 'center' }}>
                    {/* Score */}
                    <div style={{ textAlign: 'center', minWidth: 64 }}>
                      <div style={{ fontSize: '.58rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 3 }}>Score</div>
                      <div style={{ fontWeight: 900, fontSize: '1.6rem', lineHeight: 1, color: missionScore.verdictColor, fontVariantNumeric: 'tabular-nums' }}>
                        {missionScore.score}
                        <span style={{ fontSize: '.75rem', color: 'var(--muted)', fontWeight: 600 }}>/12</span>
                      </div>
                      <span style={{
                        display: 'inline-flex', padding: '.15rem .45rem', borderRadius: 5, fontWeight: 800,
                        fontSize: '.58rem', letterSpacing: '.06em', marginTop: 4,
                        background: (missionScore.verdict as ScoreVerdict) === 'TAKE' ? 'rgba(40,192,72,.12)' : (missionScore.verdict as ScoreVerdict) === 'AVOID' ? 'rgba(232,64,0,.12)' : 'rgba(245,194,0,.12)',
                        color: (missionScore.verdict as ScoreVerdict) === 'TAKE' ? 'var(--success)' : (missionScore.verdict as ScoreVerdict) === 'AVOID' ? 'var(--error)' : 'var(--warn)',
                        border: `1px solid ${(missionScore.verdict as ScoreVerdict) === 'TAKE' ? 'rgba(40,192,72,.2)' : (missionScore.verdict as ScoreVerdict) === 'AVOID' ? 'rgba(232,64,0,.2)' : 'rgba(245,194,0,.2)'}`,
                      }}>
                        {missionScore.verdict}
                      </span>
                    </div>

                    {/* Score bar + financials */}
                    <div style={{ display: 'grid', gap: '.5rem' }}>
                      <div style={{ height: 8, background: 'var(--surface-off)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(missionScore.score / 12) * 100}%`, background: missionScore.verdictColor, borderRadius: 4, transition: 'width .5s ease', boxShadow: `0 0 6px ${missionScore.verdictColor}` }} />
                      </div>
                      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                        {([
                          ['Miles',    `${mission.dispatchMiles} mi`,                             'var(--text)'],
                          ['Net RPM',  `$${missionScore.netRpm.toFixed(2)}/mi`,                   missionScore.marginColor],
                          ['Fuel Est', `$${missionScore.fuelCost.toFixed(0)}`,                    'var(--warn)'],
                          ['Net Est',  `$${missionScore.netMargin.toFixed(0)}`,                    missionScore.netMargin >= 0 ? 'var(--success)' : 'var(--error)'],
                        ] as [string,string,string][]).map(([lbl, val, clr]) => (
                          <div key={lbl} style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
                            <span style={{ fontSize: '.58rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 700 }}>{lbl}</span>
                            <span style={{ fontSize: '.72rem', fontWeight: 800, color: clr, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Margin badge */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '.58rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 5 }}>Margin</div>
                      <span style={{
                        display: 'inline-flex', padding: '.3rem .6rem', borderRadius: 7, fontWeight: 900,
                        fontSize: '.68rem', letterSpacing: '.06em',
                        background: (missionScore.marginFlag as MarginFlag) === 'STRONG' ? 'rgba(40,192,72,.12)' : (missionScore.marginFlag as MarginFlag) === 'OK' ? 'rgba(0,232,176,.1)' : (missionScore.marginFlag as MarginFlag) === 'MARGINAL' ? 'rgba(245,194,0,.12)' : 'rgba(232,64,0,.12)',
                        color: missionScore.marginColor,
                        border: `1px solid ${missionScore.marginColor}30`,
                      }}>
                        {missionScore.marginFlag}
                      </span>
                    </div>
                  </div>

                  {/* Flags row */}
                  {(missionScore.highDeadhead || missionScore.counterOffer) && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {missionScore.highDeadhead && (
                        <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--warn)', padding: '.2rem .6rem', borderRadius: 6, background: 'rgba(245,194,0,.08)', border: '1px solid rgba(245,194,0,.2)' }}>
                          ⚠️ High DH {missionScore.deadheadRatio.toFixed(0)}%
                        </div>
                      )}
                      {missionScore.counterOffer && (
                        <div style={{ fontSize: '.65rem', fontWeight: 700, color: (missionScore.marginFlag as MarginFlag) === 'REJECT' ? 'var(--error)' : 'var(--warn)', padding: '.2rem .6rem', borderRadius: 6, background: (missionScore.marginFlag as MarginFlag) === 'REJECT' ? 'rgba(232,64,0,.08)' : 'rgba(245,194,0,.08)', border: `1px solid ${(missionScore.marginFlag as MarginFlag) === 'REJECT' ? 'rgba(232,64,0,.2)' : 'rgba(245,194,0,.2)'}` }}>
                          💬 {missionScore.counterOffer.slice(0, 60)}{missionScore.counterOffer.length > 60 ? '…' : ''}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                // Load exists but no rate/miles entered yet
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.75rem', color: 'var(--muted)' }}>
                  <span>{mission.dispatchMiles > 0 ? `${mission.dispatchMiles} mi` : '—'}</span>
                  <span>·</span>
                  <Link href="/loads" style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>
                    Add rate + miles to score this load →
                  </Link>
                </div>
              )}
            </>
          ) : (
            <p style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              Your latest load appears here with live score analysis, net RPM, margin flag, and risk alerts — straight from the Load Intake.
            </p>
          )}
        </div>

        {/* ── QUICK ACTIONS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.65rem' }}>
          {QUICK_ACTIONS.map(a => (
            <Link key={a.href} href={a.href}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '1rem .5rem', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', textDecoration: 'none', transition: 'border-color .18s, background .18s', color: 'var(--text)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,232,176,.25)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
              <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{a.icon}</span>
              <span style={{ fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', textAlign: 'center' }}>{a.label}</span>
            </Link>
          ))}
        </div>

        {/* ── STATUS FOOTER ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.6rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, flexWrap: 'wrap', gap: 6, marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 6px var(--primary)' }} />
            <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--primary)', letterSpacing: '.07em' }}>MIS ACTIVE</span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link href="/mis" style={{ fontSize: '.68rem', color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}>📊 MIS Overview →</Link>
            <Link href="/audit" style={{ fontSize: '.68rem', color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}>📋 Settlement →</Link>
          </div>
        </div>

      </main>

      {/* Spinner animation */}
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }
      `}</style>
    </>
  )
}
