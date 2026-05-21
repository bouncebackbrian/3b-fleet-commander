'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import TopBar from '@/components/layout/TopBar'
import { loadSettings } from '@/lib/settings'
import StopTimeline from '@/components/dashboard/cards/StopTimeline'
import AddStopSheet  from '@/components/dashboard/sheets/AddStopSheet'
import type { MissionStop } from '@/lib/dashboard/types'
import { useMission } from '@/hooks/useMission'

// Leaflet must be client-side only
const RouteMap = dynamic(() => import('@/components/map/RouteMap'), { ssr: false })

// ─── Types ────────────────────────────────────────────────────────────────────
type InputTab  = 'form' | 'paste' | 'file' | 'ai' | 'playbooks' | 'scale'

type AIResult = {
  recommendation: 'ACCEPT' | 'DENY' | 'REVIEW'
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  summary: string
  parsed: {
    origin: string | null; dest: string | null; miles: number | null
    cpm: number | null; weight: number | null; loadNum: string | null
    broker: string | null; commodity: string | null; depart: string | null
    deadhead: number | null; totalPay: number | null
  }
  financials: {
    grossPay: number | null; fuelCost: number | null; netPay: number | null
    cpm: number | null; profitScore: number; ratePerMile: number | null
  }
  hos: { legal: boolean; driveNeeded: number | null; driveAvailable: number | null; note: string }
  legal: { weightOk: boolean | null; heightOk: boolean | null; notes: string[] }
  redFlags: string[]
  greenFlags: string[]
  reasons: string[]
  suggestedReply: string
}
type StopType  = 'start' | 'delivery' | 'fuel' | 'break30' | 'rest10' | 'stretch' | 'pet'

type Truck = {
  truckNum: string; year: string; make: string; model: string; vin: string; hp: string
  mpgLoaded: number; mpgEmpty: number; tankGal: number; fuelPrice: number
  truckHeight: number; trailerNum: string; trailerType: string
  trailerLen: number; trailerHeight: number; axles: string
  maxWeight: number; gvwr: number; cdlClass: string; endorsements: string
}

type TripOptions = { pet: boolean; team: boolean; haz: boolean }

type Stop = {
  type: StopType; icon: string; color: string; label: string
  location: string; address?: string; eta: string; dur: string
  mi: number; hosStr: string; note: string; tag?: string
}

type GPSStop = {
  order: number; typeLabel: string; icon: string
  name: string; address: string; eta: string; mi: number; tag?: string
}

type LegalCheck = {
  label: string; val: string; legal: string; ok: boolean; warn: boolean
}

type Plan = {
  stops: Stop[]; gpsStops: GPSStop[]; warnings: string[]
  hos_compliant: boolean; total_miles: number
  drive_time: string; trip_time: string; eta: string; depart_display: string
  fuel_cost: number; est_pay: number; net: number; cpm: number
  origin: string; dest: string; loadNum: string; broker: string
  commodity: string; weight: number; deadhead: number; deadheadCost: number
  legalChecks: LegalCheck[] | null
}

type Parsed = {
  origin?: string; dest?: string; miles?: string; loadNum?: string
  cpm?: string; weight?: string; broker?: string; commodity?: string; depart?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_TRUCK: Truck = {
  truckNum: '', year: '', make: '', model: '', vin: '', hp: '',
  mpgLoaded: 6.2, mpgEmpty: 8.0, tankGal: 120, fuelPrice: 3.85,
  truckHeight: 13.5, trailerNum: '', trailerType: '53dry',
  trailerLen: 53, trailerHeight: 13.5, axles: '5',
  maxWeight: 80000, gvwr: 80000, cdlClass: 'A', endorsements: '',
}

const FUEL_STOPS = [
  { name: "Love's #478",        loc: 'Tonopah, NV',        address: '1170 US-95, Tonopah, NV 89049',                     range: [70,  100] as [number,number] },
  { name: "Love's #255",        loc: 'Winnemucca, NV',     address: '4844 W Winnemucca Blvd, Winnemucca, NV 89445',      range: [200, 240] as [number,number] },
  { name: 'Pilot Flying J #347',loc: 'Battle Mountain, NV',address: '650 W Front St, Battle Mountain, NV 89820',         range: [245, 275] as [number,number] },
  { name: 'TA Travel Center',   loc: 'Fernley, NV',        address: '1451 Newlands Dr E, Fernley, NV 89408',             range: [280, 300] as [number,number] },
  { name: 'Petro Iron Skillet', loc: 'Sparks, NV',         address: '1015 Greg St, Sparks, NV 89431',                    range: [320, 350] as [number,number] },
  { name: 'Pilot Flying J',     loc: 'Las Vegas, NV',      address: '5390 Boulder Hwy, Las Vegas, NV 89122',             range: [120, 145] as [number,number] },
]

const SAVED_LANES = [
  { label: 'Amargosa → Walmart DC Sparks',     origin: 'Amargosa Valley, NV',      dest: 'Walmart DC Sparks, NV',       miles: 335 },
  { label: 'PetSmart DC41 → Spice Island',     origin: 'PetSmart DC41, McCarran, NV', dest: 'Spice Island, Sparks, NV',  miles: 20  },
]

const LEGAL = { maxHeight: 13.5, maxLength: 53, grossWeight: 80000 }

// ─── HOS Engine ───────────────────────────────────────────────────────────────
const fmtMins = (m: number) =>
  m < 60 ? `${Math.round(m)}m` : `${Math.floor(m/60)}h${Math.round(m%60) > 0 ? ` ${Math.round(m%60)}m` : ''}`

const minsToTime = (m: number) => {
  const n = ((m % 1440) + 1440) % 1440
  const h = Math.floor(n/60), min = Math.floor(n%60)
  const ap = h >= 12 ? 'PM' : 'AM', h12 = h%12 || 12
  return `${h12}:${String(min).padStart(2,'0')} ${ap}`
}

const hosLabel = (hosMin: number) =>
  `${Math.floor(hosMin/60)}h ${Math.round(hosMin%60)}m / 11h`

const getFuelStop = (mi: number) => {
  const f = FUEL_STOPS.find(s => mi >= s.range[0] && mi <= s.range[1])
  return f
    ? { label: `${f.name} — ${f.loc}`, address: f.address }
    : { label: `Mile ~${Math.round(mi)} — verify on Trucker Path`, address: '' }
}

function buildPlan(inputs: {
  origin: string; dest: string; totalMiles: number; departMin: number
  cpm: number; hasPet: boolean; truck: Truck | null
}): Plan {
  const { origin, dest, totalMiles, departMin, cpm, hasPet, truck } = inputs
  const mpg       = truck?.mpgLoaded  ?? 6.2
  const fuelPrice = truck?.fuelPrice  ?? 3.85
  const tankGal   = truck?.tankGal    ?? 120
  const MPM       = 60 / 58                      // minutes per mile @ 58 mph avg

  const stops: Stop[] = []
  const warnings: string[] = []
  let clock = departMin, drive = 0, hos = 0, onDuty = 0, miles = 0
  let nextStretch = 120, nextPet = hasPet ? 120 : 999999

  const rangePerTank  = tankGal * mpg
  const numFuel       = Math.max(1, Math.ceil(totalMiles / (rangePerTank * 0.85)))
  const fuelMiles     = Array.from({ length: numFuel }, (_, i) =>
    Math.round(totalMiles / (numFuel + 1) * (i + 1)))

  stops.push({
    type: 'start', icon: '🚛', color: 'var(--primary)',
    label: 'Departure — Pre-trip inspection', location: origin,
    eta: minsToTime(clock), dur: '—', mi: 0, hosStr: '0h driving',
    note: 'Check lights, tires, brakes, fluids, cargo securement. Log on-duty not driving.',
  })

  while (miles < totalMiles) {
    const rem = totalMiles - miles
    const candidates = [
      nextStretch - drive, 480 - drive, 660 - hos, 840 - onDuty,
      hasPet ? nextPet - drive : 999999, rem * MPM,
    ].filter(x => x > 0)
    const dt = Math.min(...candidates)
    const dm = Math.min(dt / MPM, rem)
    miles += dm; clock += dt; drive += dt; hos += dt; onDuty += dt
    if (miles >= totalMiles - 0.5) break

    // Fuel stop
    const fi = fuelMiles.findIndex(f => Math.abs(f - miles) < 15)
    if (fi !== -1) {
      fuelMiles.splice(fi, 1)
      const fs = getFuelStop(miles)
      stops.push({
        type: 'fuel', icon: '⛽', color: 'var(--warn)',
        label: '⛽ Fuel Stop', location: fs.label, address: fs.address,
        eta: minsToTime(clock), dur: '15–20 min', mi: Math.round(miles),
        hosStr: hosLabel(hos),
        note: `Fill up. Check oil/coolant, tire pressure. Approx $${fuelPrice.toFixed(3)}/gal.`,
      })
      clock += 18; onDuty += 18; continue
    }

    // Mandatory 30-min break (after 8h consecutive drive)
    if (drive >= 480) {
      stops.push({
        type: 'break30', icon: '⏸', color: 'var(--error)',
        label: '⏸ Mandatory 30-min Break',
        location: `Mile ~${Math.round(miles)} — rest area or truck stop`,
        eta: minsToTime(clock), dur: '30 min', mi: Math.round(miles),
        hosStr: hosLabel(hos),
        note: 'FMCSA §395.3(a)(3): Required before 8h consecutive drive. Log off-duty or sleeper berth.',
        tag: 'DOT REQUIRED — log in ELD',
      })
      clock += 30; onDuty += 30; drive = 0; nextStretch = 120
      if (hasPet) nextPet = 120
      continue
    }

    // 11-hour driving limit → 10-hr rest
    if (hos >= 660) {
      warnings.push(`11-hour HOS limit reached at mile ~${Math.round(miles)}. 10-hr rest required.`)
      stops.push({
        type: 'rest10', icon: '🛑', color: 'var(--error)',
        label: '🛑 10-Hour Rest — 11h Driving Limit',
        location: `Mile ~${Math.round(miles)} — secure truck stop`,
        eta: minsToTime(clock), dur: '10 hrs minimum', mi: Math.round(miles),
        hosStr: '11h — LIMIT',
        note: 'FMCSA §395.3: 11h driving reached. Must rest 10 consecutive off-duty hours before resuming.',
        tag: 'HOS VIOLATION RISK',
      })
      clock += 600; hos = 0; drive = 0; onDuty = 0; nextStretch = 120
      if (hasPet) nextPet = 120
      continue
    }

    // 14-hour on-duty window → 10-hr rest
    if (onDuty >= 840) {
      warnings.push(`14-hour on-duty window at mile ~${Math.round(miles)}.`)
      stops.push({
        type: 'rest10', icon: '🛑', color: 'var(--error)',
        label: '🛑 14-Hour Window Reached',
        location: `Mile ~${Math.round(miles)} — secure parking`,
        eta: minsToTime(clock), dur: '10 hrs minimum', mi: Math.round(miles),
        hosStr: '14h window — STOP',
        note: 'FMCSA §395.3(b): 14-hour on-duty window expired. No driving until 10-hr off-duty complete.',
        tag: '14-HR WINDOW EXPIRED',
      })
      clock += 600; hos = 0; drive = 0; onDuty = 0; nextStretch = 120
      if (hasPet) nextPet = 120
      continue
    }

    // Stretch every 2h
    if (drive >= nextStretch) {
      stops.push({
        type: 'stretch', icon: '🚶', color: '#e8af34',
        label: '🚶 Stretch Break',
        location: `Mile ~${Math.round(miles)} — exit or rest area`,
        eta: minsToTime(clock), dur: '10–15 min', mi: Math.round(miles),
        hosStr: hosLabel(hos),
        note: 'Recommended every 2h: stretch, hydrate, walk the trailer. Quick visual cargo inspection.',
      })
      clock += 12; onDuty += 12; nextStretch = drive + 120
      if (hasPet) nextPet = drive + 60
      continue
    }

    // Pet break
    if (hasPet && drive >= nextPet) {
      stops.push({
        type: 'pet', icon: '🐾', color: '#fdab43',
        label: '🐾 Pet Break',
        location: `Mile ~${Math.round(miles)} — pet-friendly rest area`,
        eta: minsToTime(clock), dur: '15–20 min', mi: Math.round(miles),
        hosStr: hosLabel(hos),
        note: 'Walk, water, waste. Never leave pet in cab above 70°F ambient. Use rest areas with grass.',
      })
      clock += 20; onDuty += 20; nextPet = drive + 120
      continue
    }
    break
  }

  stops.push({
    type: 'delivery', icon: '✅', color: 'var(--success)',
    label: '✅ Arrival — Delivery', location: dest,
    eta: minsToTime(clock), dur: '—', mi: totalMiles,
    hosStr: hosLabel(hos),
    note: 'Check in at guard shack. Document arrival — detention clock starts if not unloaded in 2h. Get lumper receipt.',
  })

  // GPS stop list (actionable stops only)
  const GPS_TYPES: StopType[] = ['start','fuel','break30','rest10','delivery']
  const gpsStops: GPSStop[] = stops
    .filter(s => GPS_TYPES.includes(s.type))
    .map((s, i) => ({
      order: i + 1,
      typeLabel:
        s.type === 'start'    ? 'ORIGIN'               :
        s.type === 'delivery' ? 'DESTINATION'           :
        s.type === 'fuel'     ? 'FUEL STOP'             :
        s.type === 'break30'  ? 'MANDATORY 30-MIN BREAK':
                                '10-HR REST STOP',
      icon:    s.icon,
      name:    s.location,
      address: s.address ?? '',
      eta:     s.eta,
      mi:      s.mi,
      tag:     s.tag,
    }))

  const driveMin = Math.round(totalMiles / 58 * 60)
  const totalFuel = (totalMiles / mpg) * fuelPrice

  return {
    stops, gpsStops, warnings,
    hos_compliant: warnings.length === 0,
    total_miles: totalMiles,
    drive_time: fmtMins(driveMin),
    trip_time:  fmtMins(clock - departMin),
    eta:        minsToTime(clock),
    depart_display: minsToTime(departMin),
    fuel_cost: totalFuel,
    est_pay:   totalMiles * cpm,
    net:       totalMiles * cpm - totalFuel,
    cpm, origin, dest,
    loadNum: '', broker: '', commodity: '',
    weight: 0, deadhead: 0, deadheadCost: 0,
    legalChecks: null,
  }
}

function checkLegal(truck: Truck, weight: number, haz: boolean): LegalCheck[] {
  const maxH = Math.max(truck.truckHeight, truck.trailerHeight)
  const checks: LegalCheck[] = [
    {
      label: 'Height', val: `${maxH}′`, legal: `${LEGAL.maxHeight}′ max`,
      ok: maxH <= LEGAL.maxHeight, warn: maxH > 13.0 && maxH <= LEGAL.maxHeight,
    },
    {
      label: 'Trailer length', val: `${truck.trailerLen}′`, legal: `${LEGAL.maxLength}′ max`,
      ok: truck.trailerLen <= LEGAL.maxLength, warn: false,
    },
  ]
  if (weight > 0) checks.push({
    label: 'Gross weight', val: `${weight.toLocaleString()} lbs`,
    legal: `${LEGAL.grossWeight.toLocaleString()} lbs max`,
    ok: weight <= LEGAL.grossWeight, warn: weight > 75000 && weight <= LEGAL.grossWeight,
  })
  if (haz) checks.push({
    label: 'Hazmat routing', val: 'Active', legal: 'Restricted tunnels/routes',
    ok: false, warn: true,
  })
  return checks
}

function parseText(txt: string): Parsed {
  const r: Parsed = {}
  const mi = txt.match(/(\d[\d,]+)\s*(loaded\s+)?miles?/i)
  if (mi) r.miles = mi[1].replace(/,/g,'')
  const ln = txt.match(/(?:load|order|ref)\s*[#:]?\s*([A-Z0-9\-]{4,20})/i)
  if (ln) r.loadNum = ln[1]
  const cp = txt.match(/\$?\s*([0-9]+\.[0-9]+)\s*(?:\/\s*mi|cpm|per\s+mile)/i)
  if (cp) r.cpm = cp[1]
  const wt = txt.match(/([\d,]+)\s*(?:lbs?|pounds?)/i)
  if (wt) r.weight = wt[1].replace(/,/g,'')
  for (const p of [/pickup\s*[:\-]\s*([^\n;—]+(?:,\s*[A-Z]{2})?)/i, /from\s*[:\-]?\s*([^\n;—]+(?:,\s*[A-Z]{2})?)/i, /origin\s*[:\-]\s*([^\n;—]+)/i]) {
    const m = txt.match(p); if (m) { r.origin = m[1].trim(); break }
  }
  for (const p of [/deliver(?:y|to)?\s*[:\-]\s*([^\n;—]+(?:,\s*[A-Z]{2})?)/i, /to\s*[:\-]?\s*([^\n;—]+(?:,\s*[A-Z]{2})?)/i, /destination\s*[:\-]\s*([^\n;—]+)/i]) {
    const m = txt.match(p); if (m) { r.dest = m[1].trim(); break }
  }
  const brk = txt.match(/(?:broker|carrier)\s*[:\-]\s*([^\n]{2,40})/i)
  if (brk) r.broker = brk[1].trim()
  const com = txt.match(/(?:commodity|freight|cargo)\s*[:\-]\s*([^\n]{2,50})/i)
  if (com) r.commodity = com[1].trim()
  const tm = txt.match(/(?:pickup\s+time|depart|departure)[:\s]+(\d{1,2}:\d{2}\s*[ap]m?|\d{1,2}\s*[ap]m)/i)
  if (tm) {
    const hm = tm[1].trim().toLowerCase().match(/(\d{1,2}):?(\d{2})?\s*([ap]m?)/)
    if (hm) {
      let h = parseInt(hm[1]); const mn = hm[2] || '00'
      if (hm[3] === 'pm' && h < 12) h += 12; if (hm[3] === 'am' && h === 12) h = 0
      r.depart = `${String(h).padStart(2,'0')}:${mn}`
    }
  }
  return r
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const S = {
  card:   { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:'1.2rem', boxShadow:'0 2px 8px rgba(0,0,0,.2)' } as React.CSSProperties,
  inp:    { width:'100%', padding:'.55rem .85rem', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', fontSize:'var(--text-sm)', outline:'none', boxSizing:'border-box' as const },
  lbl:    { display:'block', fontSize:'var(--text-xs)', color:'var(--muted)', fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'.08em', marginBottom:5 },
  sec:    { fontSize:'var(--text-xs)', fontWeight:800, textTransform:'uppercase' as const, letterSpacing:'.1em', color:'var(--primary)', paddingBottom:'.5rem', borderBottom:'1px solid var(--border)', marginBottom:'.9rem' },
  btn:    { padding:'.6rem 1rem', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', fontWeight:700, fontSize:'var(--text-xs)', cursor:'pointer' } as React.CSSProperties,
  btnPri: { padding:'.6rem 1rem', borderRadius:8, border:'1px solid var(--primary)', background:'var(--primary)', color:'#fff', fontWeight:700, fontSize:'var(--text-xs)', cursor:'pointer', boxShadow:'0 3px 12px rgba(79,152,163,.35)' } as React.CSSProperties,
}

const money = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })

// ─── Countdown Timer ─────────────────────────────────────────────────────────
function CountdownTimer({ targetISO, label }: { targetISO: string; label: string }) {
  const [diff, setDiff] = useState(0)
  useEffect(() => {
    const target = new Date(targetISO).getTime()
    const tick = () => setDiff(target - Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetISO])

  const past = diff < 0
  const abs  = Math.abs(diff)
  const hh   = Math.floor(abs / 3600000)
  const mm   = Math.floor((abs % 3600000) / 60000)
  const ss   = Math.floor((abs % 60000) / 1000)
  const fmt  = `${hh}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
  const color = past ? 'var(--error)' : hh < 1 ? 'var(--warn)' : 'var(--primary)'

  return (
    <div style={{ background: past ? 'rgba(232,64,0,.07)' : 'rgba(0,232,176,.05)', border: `1px solid ${past ? 'rgba(232,64,0,.2)' : 'rgba(0,232,176,.18)'}`, borderRadius: 14, padding: '1rem 1.2rem', textAlign: 'center' }}>
      <div style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--muted)', marginBottom: 6 }}>
        {past ? `⏰ ${label} — PAST DUE` : `⏳ Time until ${label}`}
      </div>
      <div style={{ fontSize: '2.4rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em', color, lineHeight: 1, fontFamily: 'ui-monospace,monospace' }}>
        {past ? '+' : ''}{fmt}
      </div>
      <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: 6 }}>
        {new Date(targetISO).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}

// ─── Scale / Weight checker ───────────────────────────────────────────────────
const AXLE_LIMITS = {
  steer:  { label: 'Steer',          max: 12000,  warn: 11500 },
  drives: { label: 'Drive tandem',   max: 34000,  warn: 33000 },
  trail:  { label: 'Trailer tandem', max: 34000,  warn: 33000 },
  gross:  { label: 'Gross',          max: 80000,  warn: 79000 },
}
type AxleKey = keyof typeof AXLE_LIMITS

function axleColor(val: number, key: AxleKey) {
  const { max, warn } = AXLE_LIMITS[key]
  if (val > max)  return 'var(--error)'
  if (val >= warn) return 'var(--warn)'
  return 'var(--success)'
}
function axleIcon(val: number, key: AxleKey) {
  const { max, warn } = AXLE_LIMITS[key]
  if (val > max)  return '🚫'
  if (val >= warn) return '⚠️'
  return '✅'
}

function ScaleWeightTab({ truck, origin, dest }: { truck: Truck | null; origin: string; dest: string }) {
  const [mode,   setMode]   = useState<'simple'|'detail'>('simple')
  const [steer,  setSteer]  = useState('')
  const [d1,     setD1]     = useState('')
  const [d2,     setD2]     = useState('')
  const [t1,     setT1]     = useState('')
  const [t2,     setT2]     = useState('')
  const [gross,  setGross]  = useState('')
  const [result, setResult] = useState<null | {
    steer: number; drives: number; trail: number; gross: number
    recs: string[]; alerts: string[]
  }>(null)

  const analyze = () => {
    const s   = parseFloat(steer)  || 0
    const drv = mode === 'detail'
      ? (parseFloat(d1) || 0) + (parseFloat(d2) || 0)
      : parseFloat(d1) || 0
    const tr  = mode === 'detail'
      ? (parseFloat(t1) || 0) + (parseFloat(t2) || 0)
      : parseFloat(t1) || 0
    const g   = parseFloat(gross) || (s + drv + tr)

    const recs: string[] = []
    const alerts: string[] = []

    // Overweight flags
    if (g > AXLE_LIMITS.gross.max) {
      alerts.push(`🚨 GROSS OVERWEIGHT by ${(g - 80000).toLocaleString()} lbs — load must be reduced before moving. No tandem adjustment will fix this.`)
    }

    // Drive tandem over
    if (drv > AXLE_LIMITS.drives.max) {
      const over = drv - 34000
      const holesNeeded = Math.ceil(over / 400)   // ~400 lbs per 4" hole
      if (tr + over <= 34000) {
        recs.push(`🔁 Drive tandem over by ${over.toLocaleString()} lbs → slide trailer tandems BACKWARD ~${holesNeeded} hole${holesNeeded > 1 ? 's' : ''} (${holesNeeded * 4}") to transfer ~${(holesNeeded * 400).toLocaleString()} lbs to trailer axle.`)
        recs.push(`   After adjustment: drives ~${(drv - holesNeeded * 400).toLocaleString()} lbs · trailer ~${(tr + holesNeeded * 400).toLocaleString()} lbs`)
      } else {
        recs.push(`🔁 Drive tandem over by ${over.toLocaleString()} lbs. Slide trailer tandem backward but note trailer will also approach limit.`)
        recs.push(`   May need to reduce overall load weight.`)
      }
      if (s + Math.ceil(over / 2) <= 12000) {
        recs.push(`   Also consider: slide 5th wheel FORWARD ~${Math.ceil(over / 200)}" to shift some weight from drives to steer (if steer has capacity).`)
      }
    }

    // Steer over
    if (s > AXLE_LIMITS.steer.max) {
      const over = s - 12000
      const inchesNeeded = Math.ceil(over / 150)
      recs.push(`🔁 Steer axle over by ${over.toLocaleString()} lbs → slide 5th wheel BACKWARD ~${inchesNeeded}" to shift weight from steer to drive tandem.`)
      recs.push(`   After: steer ~${(s - inchesNeeded * 150).toLocaleString()} lbs · drives ~${(drv + inchesNeeded * 150).toLocaleString()} lbs`)
      if (drv + inchesNeeded * 150 > 34000) {
        recs.push(`   ⚠️ Drives may then exceed limit — verify drives can absorb the transfer before sliding.`)
      }
    }

    // Trailer over
    if (tr > AXLE_LIMITS.trail.max) {
      const over = tr - 34000
      const holesNeeded = Math.ceil(over / 400)
      if (drv + over <= 34000) {
        recs.push(`🔁 Trailer tandem over by ${over.toLocaleString()} lbs → slide trailer tandems FORWARD ~${holesNeeded} hole${holesNeeded > 1 ? 's' : ''} to transfer weight to drive tandem.`)
        recs.push(`   After: drives ~${(drv + holesNeeded * 400).toLocaleString()} lbs · trailer ~${(tr - holesNeeded * 400).toLocaleString()} lbs`)
      } else {
        recs.push(`🔁 Trailer over by ${over.toLocaleString()} lbs but drives are near limit. Reduce load weight.`)
      }
    }

    // Steer too light (risk of floating steer)
    if (s < 10000 && s > 0) {
      recs.push(`💡 Steer axle is light (${s.toLocaleString()} lbs). Slide 5th wheel FORWARD to increase steer weight — helps stability and steering response.`)
    }

    // Bridge formula note for long loads
    if (recs.length === 0 && alerts.length === 0 && g > 0) {
      alerts.push('✅ All axle groups within federal limits. Verify state-specific limits along your route.')
    }

    // Route-specific state notes
    const routeText = `${origin} ${dest}`.toLowerCase()
    if (routeText.includes('california') || routeText.includes(', ca')) {
      alerts.push('📋 California: Some state routes limited to 65,000 lbs. Verify your route via CA DMV.')
    }

    setResult({ steer: s, drives: drv, trail: tr, gross: g, recs, alerts })
  }

  return (
    <div style={{ display: 'grid', gap: '.75rem' }}>
      {/* CAT Scale info */}
      <div style={{ ...S.card, border: '1px solid rgba(245,194,0,.2)', background: 'rgba(245,194,0,.04)' }}>
        <div style={{ ...S.sec, color: 'var(--warn)' }}>⚖️ Scale Weight Checker</div>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: '.75rem', lineHeight: 1.6 }}>
          Enter your weigh ticket data to check axle limits and get tandem slide recommendations.
          <br /><br />
          <strong style={{ color: 'var(--text)' }}>CAT Scale:</strong> No public API — use the <strong>Weigh My Truck</strong> app (by CAT Scale) for digital tickets, then enter your numbers here. Scale receipt cost → log in{' '}
          <a href="/expenses" style={{ color: 'var(--primary)', fontWeight: 700 }}>Expense Tracker</a>.
        </p>

        {/* Mode toggle */}
        <div style={{ display: 'flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, padding: 3, gap: 2, marginBottom: '.85rem' }}>
          {(['simple', 'detail'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: '.4rem', borderRadius: 7, fontSize: 'var(--text-xs)', fontWeight: 700, border: mode === m ? '1px solid var(--border)' : '1px solid transparent', background: mode === m ? 'var(--surface)' : 'transparent', color: mode === m ? 'var(--text)' : 'var(--muted)', cursor: 'pointer' }}>
              {m === 'simple' ? '3-Group (Steer/Drives/Trailer)' : '5-Axle Individual'}
            </button>
          ))}
        </div>

        {/* Weight inputs */}
        <div style={{ display: 'grid', gap: '.65rem', marginBottom: '.85rem' }}>
          <div>
            <label style={S.lbl}>Steer Axle (lbs) — max 12,000</label>
            <input style={{ ...S.inp, fontVariantNumeric: 'tabular-nums', fontWeight: 800 }} type="number" value={steer} onChange={e => setSteer(e.target.value)} placeholder="e.g. 11200" />
          </div>
          {mode === 'simple' ? (
            <>
              <div>
                <label style={S.lbl}>Drive Tandem Total (lbs) — max 34,000</label>
                <input style={{ ...S.inp, fontVariantNumeric: 'tabular-nums', fontWeight: 800 }} type="number" value={d1} onChange={e => setD1(e.target.value)} placeholder="e.g. 33600" />
              </div>
              <div>
                <label style={S.lbl}>Trailer Tandem Total (lbs) — max 34,000</label>
                <input style={{ ...S.inp, fontVariantNumeric: 'tabular-nums', fontWeight: 800 }} type="number" value={t1} onChange={e => setT1(e.target.value)} placeholder="e.g. 31800" />
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem' }}>
                <div>
                  <label style={S.lbl}>Drive Axle 1 (lbs)</label>
                  <input style={{ ...S.inp, fontVariantNumeric: 'tabular-nums', fontWeight: 800 }} type="number" value={d1} onChange={e => setD1(e.target.value)} placeholder="e.g. 16800" />
                </div>
                <div>
                  <label style={S.lbl}>Drive Axle 2 (lbs)</label>
                  <input style={{ ...S.inp, fontVariantNumeric: 'tabular-nums', fontWeight: 800 }} type="number" value={d2} onChange={e => setD2(e.target.value)} placeholder="e.g. 16800" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem' }}>
                <div>
                  <label style={S.lbl}>Trailer Axle 1 (lbs)</label>
                  <input style={{ ...S.inp, fontVariantNumeric: 'tabular-nums', fontWeight: 800 }} type="number" value={t1} onChange={e => setT1(e.target.value)} placeholder="e.g. 15900" />
                </div>
                <div>
                  <label style={S.lbl}>Trailer Axle 2 (lbs)</label>
                  <input style={{ ...S.inp, fontVariantNumeric: 'tabular-nums', fontWeight: 800 }} type="number" value={t2} onChange={e => setT2(e.target.value)} placeholder="e.g. 15900" />
                </div>
              </div>
            </>
          )}
          <div>
            <label style={S.lbl}>Gross (lbs) — max 80,000 <span style={{ color: 'var(--faint)', fontWeight: 400 }}>(auto-calc if blank)</span></label>
            <input style={{ ...S.inp, fontVariantNumeric: 'tabular-nums', fontWeight: 800 }} type="number" value={gross} onChange={e => setGross(e.target.value)} placeholder="leave blank to calculate" />
          </div>
        </div>

        <button onClick={analyze} style={{ ...S.btnPri, width: '100%', padding: '.85rem', textAlign: 'center', background: 'var(--warn)', borderColor: 'transparent', color: '#1a0f00' }}>
          ⚖️ Analyze Weights
        </button>
      </div>

      {/* Results */}
      {result && (
        <div style={S.card}>
          <div style={S.sec}>Analysis Results</div>

          {/* Axle gauges */}
          <div style={{ display: 'grid', gap: '.5rem', marginBottom: '.9rem' }}>
            {(Object.entries(AXLE_LIMITS) as [AxleKey, typeof AXLE_LIMITS[AxleKey]][]).map(([key, lim]) => {
              const val = result[key]
              if (val === 0) return null
              const pct = Math.min(100, Math.round(val / lim.max * 100))
              const col = axleColor(val, key)
              return (
                <div key={key} style={{ background: 'var(--surface-2)', border: `1px solid ${val > lim.max ? 'rgba(232,64,0,.25)' : 'var(--border)'}`, borderRadius: 10, padding: '.65rem .8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text)' }}>
                      {axleIcon(val, key)} {lim.label}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 900, color: col, fontVariantNumeric: 'tabular-nums' }}>
                      {val.toLocaleString()} / {lim.max.toLocaleString()} lbs
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-off)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 4, transition: 'width .4s cubic-bezier(.16,1,.3,1)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                    <span style={{ fontSize: '.6rem', color: 'var(--faint)' }}>{pct}% of limit</span>
                    {val > lim.max
                      ? <span style={{ fontSize: '.6rem', color: 'var(--error)', fontWeight: 800 }}>OVER by {(val - lim.max).toLocaleString()} lbs</span>
                      : <span style={{ fontSize: '.6rem', color: 'var(--success)' }}>{(lim.max - val).toLocaleString()} lbs remaining</span>
                    }
                  </div>
                </div>
              )
            })}
          </div>

          {/* Alerts & recommendations */}
          {result.alerts.map((a, i) => (
            <div key={i} style={{ marginBottom: '.5rem', padding: '.6rem .8rem', borderRadius: 9, background: a.startsWith('✅') ? 'rgba(40,192,72,.07)' : a.startsWith('🚨') ? 'rgba(232,64,0,.08)' : 'rgba(79,152,163,.07)', border: `1px solid ${a.startsWith('✅') ? 'rgba(40,192,72,.2)' : a.startsWith('🚨') ? 'rgba(232,64,0,.2)' : 'rgba(79,152,163,.2)'}`, fontSize: 'var(--text-xs)', color: a.startsWith('✅') ? 'var(--success)' : a.startsWith('🚨') ? 'var(--error)' : 'var(--text)', lineHeight: 1.55 }}>
              {a}
            </div>
          ))}

          {result.recs.length > 0 && (
            <div style={{ marginTop: '.5rem' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--warn)', marginBottom: '.5rem' }}>⚙️ Recommended Adjustments</div>
              {result.recs.map((r, i) => (
                <div key={i} style={{ fontSize: 'var(--text-xs)', color: r.startsWith('   ') ? 'var(--faint)' : 'var(--text)', lineHeight: 1.65, marginBottom: '.3rem', paddingLeft: r.startsWith('   ') ? '1rem' : 0 }}>
                  {r.trim()}
                </div>
              ))}
            </div>
          )}

          {/* Tandem slide cheat sheet */}
          <div style={{ marginTop: '.9rem', padding: '.65rem .8rem', background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.15)', borderRadius: 10 }}>
            <div style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '.4rem' }}>📐 Tandem Slide Quick Reference</div>
            <div style={{ fontSize: '.62rem', color: 'var(--muted)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text)' }}>Trailer tandem BACKWARD</strong> → less weight on drives, more on trailer<br />
              <strong style={{ color: 'var(--text)' }}>Trailer tandem FORWARD</strong> → more weight on drives, less on trailer<br />
              <strong style={{ color: 'var(--text)' }}>5th wheel BACKWARD</strong> → less weight on steer, more on drives<br />
              <strong style={{ color: 'var(--text)' }}>5th wheel FORWARD</strong> → more weight on steer, less on drives<br />
              <span style={{ color: 'var(--faint)' }}>Rule of thumb: ~400 lbs per tandem hole (4") · ~150 lbs per inch of 5th wheel</span>
            </div>
          </div>

          {/* Log expense link */}
          <a href="/expenses?category=parking&desc=CAT+Scale+weigh+ticket" style={{ display: 'block', marginTop: '.75rem', padding: '.6rem .85rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, fontSize: 'var(--text-xs)', color: 'var(--muted)', textDecoration: 'none', textAlign: 'center', fontWeight: 700 }}>
            🧾 Log scale receipt → Expense Tracker
          </a>
        </div>
      )}

      {/* Federal limits reference */}
      <div style={{ ...S.card, padding: '.85rem' }}>
        <div style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.5rem' }}>Federal Axle Limits (5-Axle Semi)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.3rem .8rem', fontSize: '.65rem', color: 'var(--muted)', lineHeight: 1.8 }}>
          <span>Steer axle: <strong style={{ color: 'var(--text)' }}>12,000 lbs</strong></span>
          <span>Single drive: <strong style={{ color: 'var(--text)' }}>20,000 lbs</strong></span>
          <span>Drive tandem: <strong style={{ color: 'var(--text)' }}>34,000 lbs</strong></span>
          <span>Trailer tandem: <strong style={{ color: 'var(--text)' }}>34,000 lbs</strong></span>
          <span>Gross vehicle: <strong style={{ color: 'var(--text)' }}>80,000 lbs</strong></span>
          <span>Width: <strong style={{ color: 'var(--text)' }}>102" (8'6")</strong></span>
        </div>
        <div style={{ marginTop: '.5rem', fontSize: '.6rem', color: 'var(--faint)', lineHeight: 1.5 }}>
          Bridge formula applies to axle spacing. Some states allow higher weights with permits. Always verify with state DOT for your route.
        </div>
      </div>
    </div>
  )
}

// ─── Playbooks tab ─────────────────────────────────────────────────────────────
type PlaybookAlert = { icon: string; level: 'info'|'warn'|'critical'; text: string }

function detectAlerts(plan: Plan | null, origin: string, dest: string): PlaybookAlert[] {
  const alerts: PlaybookAlert[] = []
  const route = `${origin} ${dest}`.toLowerCase()

  const hasState = (...names: string[]) => names.some(n => route.includes(n))

  if (hasState('wyoming', ', wy', ' wy ')) {
    alerts.push({ icon: '💨', level: 'warn', text: 'Wyoming I-80 crosswind corridor on route. Winds regularly exceed 40–60 mph. Check WYDOT 511.wyo.gov before departure.' })
  }
  if (hasState('colorado', ', co', 'montana', ', mt', 'oregon', ', or', 'idaho', ', id', 'washington', ', wa')) {
    alerts.push({ icon: '⛓️', level: 'warn', text: 'Mountain route detected. Chain laws may be active on passes. Carry chains Oct–Apr. Check state DOT before crossing.' })
  }
  if (plan?.warnings && plan.warnings.length > 0) {
    alerts.push({ icon: '⏱️', level: 'critical', text: `${plan.warnings.length} HOS warning${plan.warnings.length > 1 ? 's' : ''}: ${plan.warnings[0]}` })
  }
  if (plan?.stops.some(s => s.type === 'rest10')) {
    alerts.push({ icon: '🛑', level: 'warn', text: 'Mandatory 10-hour rest stop in plan. Pre-identify 2–3 parking locations along route. Lots fill by 4 PM.' })
  }
  if (plan) {
    const etaMatch = plan.eta.match(/(\d+):(\d+)\s*(AM|PM)/i)
    if (etaMatch) {
      let h = parseInt(etaMatch[1])
      if (etaMatch[3].toUpperCase() === 'PM' && h < 12) h += 12
      if (h >= 20 || h <= 4) alerts.push({ icon: '🅿️', level: 'warn', text: `Late arrival ETA (${plan.eta}) — truck parking fills by 4 PM in most corridors. Plan parking now.` })
    }
  }
  if (plan && plan.total_miles > 500) {
    alerts.push({ icon: '😴', level: 'info', text: `Long haul ${plan.total_miles} mi. Monitor fatigue. Build 1-hour buffers. Watch for 2–6 AM low-energy window.` })
  }
  return alerts
}

const PLAYBOOKS = [
  {
    id: 'crosswind', icon: '💨', title: 'Crosswind', trigger: 'Winds >25 mph sustained or >40 mph gusts',
    levels: [
      { n: 1, action: 'Reduce speed 10–15 mph below posted limit. Move to right lane. Increase following distance.' },
      { n: 2, action: 'Seek sheltered parking if gusts >35 mph. Notify dispatch of delay.' },
      { n: 3, action: 'Emergency stop at protected location. Secure vehicle. Do not resume until gusts <35 mph.' },
      { n: 4, action: 'Route abandonment. Full safety shutdown. Contact dispatch for alternate routing.' },
    ],
    msgs: {
      driver:   'High crosswinds. Reduce speed to [X mph], move right. Stop at first sheltered location if worse.',
      dispatch: 'Crosswind conditions. Speed reduced, monitoring for safe parking. ETA adjusted ~[X hrs].',
      customer: 'High wind safety protocols active. Delivery delayed ~[X hrs]. Vehicle stability is priority.',
    },
  },
  {
    id: 'chain', icon: '⛓️', title: 'Chain Control', trigger: 'Snow/ice on pass, chain law active, chain inspection point ahead',
    levels: [
      { n: 1, action: 'Monitor chain law status. Prepare chains. Allow 30–45 min for installation.' },
      { n: 2, action: 'Stop at designated chain-up area. Install chains. Call dispatch.' },
      { n: 3, action: 'If unable to chain, seek safe parking and wait for conditions.' },
      { n: 4, action: 'Reroute to avoid chain requirements if legal bypass exists.' },
    ],
    msgs: {
      driver:   'Chain control active in [area]. Stop at [facility] for installation. Allow 30–45 min. Call if issues.',
      dispatch: 'Chain requirements encountered. Chaining at [location]. Additional delay: [X hrs]. HOS monitored.',
      customer: 'Chain control law requires equipment installation. Delivery delayed [X hrs] for safety compliance.',
    },
  },
  {
    id: 'parking', icon: '🅿️', title: 'Parking Full', trigger: 'All spots within 50 mi >95% capacity, HOS running low',
    levels: [
      { n: 1, action: 'Search 3 backup locations (have them pre-identified). Check Truckstop.com / 511 apps.' },
      { n: 2, action: 'Contact dispatch for parking priority. Consider early delivery if customer allows.' },
      { n: 3, action: 'Emergency parking declaration. Safe shoulder parking if HOS is critical.' },
      { n: 4, action: 'Load rebooking consideration. Do NOT violate HOS for any delivery.' },
    ],
    msgs: {
      driver:   'Parking full. Check emergency network at [coordinates]. If unavailable, find safe location and call.',
      dispatch: 'Parking crisis. Driver unable to secure spot. HOS remaining: [time]. Need immediate assistance.',
      customer: 'Unprecedented parking congestion. Delivery delayed [X hrs]. Safety protocols require secure parking.',
    },
  },
  {
    id: 'receiver', icon: '⏳', title: 'Receiver Delay', trigger: 'Facility not ready, dock delay >30 min, no receiving personnel',
    levels: [
      { n: 1, action: 'Document arrival time. Contact receiver. Assess HOS impact. Start detention clock at 2h.' },
      { n: 2, action: 'Notify dispatch. Explore rebooking. Take first 2-hr sleeper break if HOS allows.' },
      { n: 3, action: 'Full load hold. Emergency parking at facility or nearby.' },
      { n: 4, action: 'Reject load. Return to shipper with documentation.' },
    ],
    msgs: {
      driver:   'Document all wait times. Do not leave without dispatch approval.',
      dispatch: 'Receiver unable to accept. Wait time: [X hrs]. HOS: [time]. Need rebooking or diversion.',
      customer: 'Arrived on time. Facility not ready. Wait time: [X hrs]. Detention clock running. Please advise.',
    },
  },
  {
    id: 'winter', icon: '❄️', title: 'Winter Shutdown', trigger: 'Temp <−10°F, snow >2", visibility <¼ mile, ice formation',
    levels: [
      { n: 1, action: 'Monitor conditions. Adjust ETA +2–4 hrs. Carry emergency weather supplies.' },
      { n: 2, action: 'Secure parking. Winterization check. Notify customer of 12–24 hr delay.' },
      { n: 3, action: 'Equipment shutdown. Full load rebooking. Stay with truck.' },
      { n: 4, action: 'Emergency declaration. Safety first. Do not move until roads treated and visibility >¼ mile.' },
    ],
    msgs: {
      driver:   'Conditions require shutdown. Find secure parking immediately. Do not move until visibility >¼ mi.',
      dispatch: 'Winter shutdown at [location]. HOS: [remaining]. Customer notified. Awaiting improvement.',
      customer: 'Severe winter conditions in [location]. Safety protocols active. ETA extended [X hrs].',
    },
  },
  {
    id: 'metro', icon: '🌆', title: 'Overnight Metro', trigger: 'Metro delivery after 6 PM, no overnight parking at facility',
    levels: [
      { n: 1, action: 'Adjust arrival to business hours. Reserve metro parking in advance.' },
      { n: 2, action: 'Coordinate with local partners. Confirm parking reservation.' },
      { n: 3, action: 'Emergency parking search. Delay delivery. Notify customer.' },
      { n: 4, action: 'Load rejection. Return to origin if no viable parking solution.' },
    ],
    msgs: {
      driver:   'Metro overnight delivery. Confirm parking at [location] before proceeding.',
      dispatch: 'Metro delivery planned. Parking secured at [location]. HOS reset available.',
      customer: 'Metro parking constraints — delivery rescheduled for business hours tomorrow.',
    },
  },
]

const PATTERNS = [
  { icon: '⛽', title: 'Fuel Optimization', tips: ['Fuel prices vary >$0.50/gal regionally — use apps before stopping', 'First station you see is rarely best price', 'Plan stops at Love\'s, TA, Pilot on your specific route', 'Keep emergency fuel reserve — never below ¼ tank in remote areas'] },
  { icon: '😴', title: 'Fatigue Signals', tips: ['2–6 AM: natural low-energy window — most dangerous hours', 'Response time >30 min is a fatigue signal', 'Take breaks BEFORE mandatory, not at the limit', 'Missing check-in times = early warning sign'] },
  { icon: '🔀', title: 'Split Sleeper Strategy', tips: ['Works best: long haul >400 mi with receiver delay', 'Take first 2-hr break immediately on arrival at facility', 'Calculate exact timing before starting — don\'t wing it', 'Know your state-specific split sleeper rules'] },
]

function PlaybooksTab({ plan, origin, dest }: { plan: Plan | null; origin: string; dest: string }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null)
  const alerts = detectAlerts(plan, origin, dest)

  const copyMsg = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedMsg(id); setTimeout(() => setCopiedMsg(null), 2000)
  }

  const alertColor = (level: PlaybookAlert['level']) =>
    level === 'critical' ? 'rgba(232,64,0,' : level === 'warn' ? 'rgba(245,194,0,' : 'rgba(79,152,163,'

  return (
    <div style={{ display: 'grid', gap: '.75rem' }}>
      {/* Context alerts */}
      {alerts.length > 0 && (
        <div style={S.card}>
          <div style={{ ...S.sec, color: 'var(--warn)' }}>⚠️ Route Alerts for This Trip</div>
          {alerts.map((a, i) => (
            <div key={i} style={{ marginBottom: '.5rem', padding: '.6rem .8rem', borderRadius: 9, background: `${alertColor(a.level)}.07)`, border: `1px solid ${alertColor(a.level)}.2)`, fontSize: 'var(--text-xs)', color: a.level === 'info' ? 'var(--muted)' : a.level === 'warn' ? 'var(--warn)' : 'var(--error)', lineHeight: 1.55 }}>
              <span style={{ marginRight: 6 }}>{a.icon}</span>{a.text}
            </div>
          ))}
        </div>
      )}

      {!plan && (
        <div style={{ padding: '.75rem 1rem', background: 'rgba(79,152,163,.07)', border: '1px solid rgba(79,152,163,.2)', borderRadius: 12, fontSize: 'var(--text-xs)', color: 'var(--muted)', lineHeight: 1.6 }}>
          💡 Build a trip plan first to see route-specific alerts. All playbooks are always available below as a reference library.
        </div>
      )}

      {/* Playbooks */}
      <div style={S.card}>
        <div style={S.sec}>📋 Operational Playbooks</div>
        <div style={{ display: 'grid', gap: '.5rem' }}>
          {PLAYBOOKS.map(pb => (
            <div key={pb.id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <button onClick={() => setExpanded(expanded === pb.id ? null : pb.id)}
                style={{ width: '100%', padding: '.75rem .9rem', background: expanded === pb.id ? 'rgba(0,232,176,.06)' : 'var(--surface-2)', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text)' }}>
                <span style={{ fontWeight: 800, fontSize: 'var(--text-xs)' }}>{pb.icon} {pb.title}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '.6rem', color: 'var(--faint)' }}>{pb.trigger}</span>
                  <span style={{ color: 'var(--muted)', fontSize: '.7rem' }}>{expanded === pb.id ? '▲' : '▼'}</span>
                </div>
              </button>

              {expanded === pb.id && (
                <div style={{ padding: '.75rem .9rem', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                  {/* Escalation levels */}
                  <div style={{ marginBottom: '.75rem' }}>
                    <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.4rem' }}>Escalation Steps</div>
                    {pb.levels.map(lv => (
                      <div key={lv.n} style={{ display: 'flex', gap: 8, marginBottom: '.4rem', alignItems: 'start' }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: lv.n === 4 ? 'rgba(232,64,0,.15)' : lv.n === 3 ? 'rgba(245,194,0,.12)' : 'rgba(0,232,176,.1)', border: `1px solid ${lv.n === 4 ? 'rgba(232,64,0,.3)' : lv.n === 3 ? 'rgba(245,194,0,.25)' : 'rgba(0,232,176,.25)'}`, display: 'grid', placeItems: 'center', fontSize: '.58rem', fontWeight: 900, color: lv.n === 4 ? 'var(--error)' : lv.n === 3 ? 'var(--warn)' : 'var(--primary)', flexShrink: 0, marginTop: 1 }}>
                          {lv.n}
                        </div>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text)', lineHeight: 1.55 }}>{lv.action}</span>
                      </div>
                    ))}
                  </div>

                  {/* Copy-ready messages */}
                  <div style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.4rem' }}>Ready-to-send Messages</div>
                  {Object.entries(pb.msgs).map(([role, text]) => (
                    <div key={role} style={{ marginBottom: '.45rem', background: 'var(--surface-2)', borderRadius: 8, padding: '.5rem .7rem', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>→ {role}</span>
                        <button onClick={() => copyMsg(`${pb.id}-${role}`, text)}
                          style={{ padding: '.15rem .5rem', borderRadius: 5, border: '1px solid var(--border)', background: copiedMsg === `${pb.id}-${role}` ? 'rgba(40,192,72,.1)' : 'var(--surface)', color: copiedMsg === `${pb.id}-${role}` ? 'var(--success)' : 'var(--muted)', fontSize: '.55rem', fontWeight: 700, cursor: 'pointer' }}>
                          {copiedMsg === `${pb.id}-${role}` ? '✅' : '📋 Copy'}
                        </button>
                      </div>
                      <div style={{ fontSize: '.65rem', color: 'var(--text)', lineHeight: 1.55 }}>{text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Patterns & signals */}
      <div style={S.card}>
        <div style={S.sec}>📊 Operational Patterns</div>
        <div style={{ display: 'grid', gap: '.5rem' }}>
          {PATTERNS.map(p => (
            <div key={p.title} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '.65rem .85rem', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 800, fontSize: 'var(--text-xs)', color: 'var(--text)', marginBottom: '.4rem' }}>{p.icon} {p.title}</div>
              {p.tips.map((t, i) => <div key={i} style={{ fontSize: '.65rem', color: 'var(--muted)', lineHeight: 1.65, marginBottom: '.2rem' }}>• {t}</div>)}
            </div>
          ))}
        </div>
      </div>

      {/* Learned from postmortems */}
      <div style={{ ...S.card, border: '1px solid rgba(79,152,163,.2)', background: 'rgba(79,152,163,.03)' }}>
        <div style={{ ...S.sec, color: 'rgba(79,152,163,1)' }}>📖 Lessons from the Road</div>
        {[
          { title: 'Blizzard Denver — Late Load', lesson: 'No advance weather intel delayed the decision. Weather monitoring should have triggered load postponement before departure. Communicate hourly during shutdowns.' },
          { title: 'Wyoming I-80 Parking Failure', lesson: 'Original parking intelligence was outdated. Always have 2–3 backups per stop. Real-time apps (511, Truckstop.com) are the only reliable source during peak season.' },
          { title: 'Receiver Delay — Split Sleeper Win', lesson: 'Took first 2-hr sleeper break immediately on arrival delay. Used remaining time productively. Completed delivery same day. Split sleeper is the move during facility waits.' },
        ].map(({ title, lesson }) => (
          <div key={title} style={{ marginBottom: '.6rem', paddingBottom: '.6rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 800, fontSize: 'var(--text-xs)', color: 'var(--text)', marginBottom: 3 }}>📌 {title}</div>
            <div style={{ fontSize: '.65rem', color: 'var(--muted)', lineHeight: 1.65 }}>{lesson}</div>
          </div>
        ))}
        <div style={{ fontSize: '.6rem', color: 'var(--faint)', lineHeight: 1.5 }}>Based on driver postmortems and scenario analysis from 3B Fleet operational history.</div>
      </div>
    </div>
  )
}

// ─── Truck field — defined OUTSIDE modal to prevent focus-loss on re-render ───
function TruckField({ label, k, form, onChange, type='text', step, ph }: {
  label:string; k:keyof Truck; form:Truck; onChange:(k:keyof Truck,v:string|number)=>void
  type?:string; step?:string; ph?:string
}) {
  return (
    <div>
      <label style={S.lbl}>{label}</label>
      <input style={S.inp} type={type} step={step} placeholder={ph}
        value={String(form[k])}
        onChange={e => onChange(k, type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)} />
    </div>
  )
}

// ─── Truck Setup Modal ────────────────────────────────────────────────────────
function TruckModal({ form, onChange, onSave, onClose }: {
  form: Truck; onChange: (k: keyof Truck, v: string | number) => void
  onSave: () => void; onClose: () => void
}) {
  const Field = ({ label, k, type='text', step, ph }: { label:string; k:keyof Truck; type?:string; step?:string; ph?:string }) => (
    <TruckField label={label} k={k} form={form} onChange={onChange} type={type} step={step} ph={ph} />
  )
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:24, padding:'1.6rem', width:'100%', maxWidth:640, maxHeight:'90dvh', overflowY:'auto', boxShadow:'0 8px 32px rgba(0,0,0,.5)', display:'grid', gap:'.9rem' }}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start' }}>
          <div>
            <div style={{ fontWeight:900, fontSize:'var(--text-lg)' }}>Truck &amp; Trailer Setup</div>
            <div style={{ fontSize:'var(--text-xs)', color:'var(--muted)', marginTop:3 }}>Used for legal checks, fuel calc, and profitability</div>
          </div>
          <button onClick={onClose} style={S.btn}>✕</button>
        </div>

        {/* Tractor */}
        <div style={S.sec}>Tractor</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>
          <Field label="Truck number" k="truckNum" ph="T-001" />
          <Field label="Year" k="year" type="number" ph="2022" />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>
          <div>
            <label style={S.lbl}>Make</label>
            <select style={S.inp} value={form.make} onChange={e => onChange('make', e.target.value)}>
              <option value="">Select make</option>
              {['Peterbilt','Kenworth','Freightliner','International','Mack','Volvo','Western Star','Other'].map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
          <Field label="Model" k="model" ph="389, T680, Cascadia" />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>
          <Field label="VIN (last 8)" k="vin" ph="optional" />
          <Field label="Horsepower" k="hp" ph="550" />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'.75rem' }}>
          <Field label="MPG loaded"     k="mpgLoaded"  type="number" step="0.1" />
          <Field label="MPG empty"      k="mpgEmpty"   type="number" step="0.1" />
          <Field label="Tank (gal)"     k="tankGal"    type="number" step="1"   />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>
          <Field label="Fuel price ($/gal)" k="fuelPrice"    type="number" step="0.01" />
          <Field label="Truck height (ft)"  k="truckHeight"  type="number" step="0.1"  />
        </div>

        {/* Trailer */}
        <div style={{ ...S.sec, marginTop:'.25rem' }}>Trailer</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>
          <Field label="Trailer number" k="trailerNum" ph="260692" />
          <div>
            <label style={S.lbl}>Trailer type</label>
            <select style={S.inp} value={form.trailerType} onChange={e => onChange('trailerType', e.target.value)}>
              {[["53dry","53′ Dry Van"],["48dry","48′ Dry Van"],["53reefer","53′ Reefer"],["flatbed","Flatbed"],["stepdeck","Step Deck"],["lowboy","Lowboy"],["tanker","Tanker"],["doubles","Doubles/Pups"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'.75rem' }}>
          <Field label="Trailer length (ft)"  k="trailerLen"    type="number" />
          <Field label="Trailer height (ft)"  k="trailerHeight" type="number" step="0.1" />
          <div>
            <label style={S.lbl}>Axles</label>
            <select style={S.inp} value={form.axles} onChange={e => onChange('axles', e.target.value)}>
              {[["5","5-axle (std)"],["6","6-axle"],["7","7-axle"],["3","3-axle bobtail"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>
          <Field label="Max legal weight (lbs)" k="maxWeight" type="number" />
          <Field label="GVWR (lbs)"             k="gvwr"      type="number" />
        </div>

        {/* Licensing */}
        <div style={{ ...S.sec, marginTop:'.25rem' }}>Licensing</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>
          <div>
            <label style={S.lbl}>CDL class</label>
            <select style={S.inp} value={form.cdlClass} onChange={e => onChange('cdlClass', e.target.value)}>
              <option value="A">Class A</option><option value="B">Class B</option>
            </select>
          </div>
          <Field label="Endorsements" k="endorsements" ph="H, N, T, X" />
        </div>

        <button onClick={onSave} style={{ ...S.btnPri, padding:'.85rem', fontSize:'var(--text-sm)', marginTop:'.25rem', textAlign:'center' }}>
          💾 Save truck &amp; trailer
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TripPlanner() {
  const router    = useRouter()
  const fileRef   = useRef<HTMLInputElement>(null)

  // Input
  const [tab,       setTab]       = useState<InputTab>('form')
  const [origin,    setOrigin]    = useState('')
  const [dest,      setDest]      = useState('')
  const [miles,     setMiles]     = useState('')
  const [depart,    setDepart]    = useState('07:00')
  const [loadNum,   setLoadNum]   = useState('')
  const [broker,    setBroker]    = useState('')
  const [commodity, setCommodity] = useState('')
  const [weight,    setWeight]    = useState('')
  const [cpm,       setCpm]       = useState('0.55')
  const [deadhead,  setDeadhead]  = useState('')
  const [paste,     setPaste]     = useState('')
  const [fileParsed,setFileParsed]= useState<Parsed | null>(null)
  const [fileName,  setFileName]  = useState('')

  // App state
  const [opts,      setOpts]      = useState<TripOptions>({ pet:false, team:false, haz:false })
  const [truck,     setTruck]     = useState<Truck | null>(null)
  const [truckForm, setTruckForm] = useState<Truck>(DEFAULT_TRUCK)
  const [showModal, setShowModal] = useState(false)
  const [plan,      setPlan]      = useState<Plan | null>(null)
  const [copiedGPS, setCopiedGPS] = useState(false)

  // Mission Stops — same persistence path as dashboard (localStorage + Supabase async)
  const { mission, addStop, updateStop } = useMission()
  const [showTripAddStop,  setShowTripAddStop]  = useState(false)

  // AI Load Prep
  const [aiText,    setAiText]    = useState('')
  const [aiResult,  setAiResult]  = useState<AIResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState('')
  const [copiedReply, setCopiedReply] = useState(false)

  useEffect(() => {
    try {
      // Try 3b-vehicle first (set by Trip Planner or Settings), then fall back to fleet-settings
      const raw = localStorage.getItem('3b-vehicle')
      if (raw) {
        const v = JSON.parse(raw)
        setTruck(v); setTruckForm(prev => ({ ...prev, ...v }))
      } else {
        // Pull from Settings if no dedicated vehicle entry yet
        const sRaw = localStorage.getItem('3b-fleet-settings')
        if (sRaw) {
          const sv = JSON.parse(sRaw)
          const mapped = {
            truckNum: sv.truckNum || '', year: sv.year || '', make: sv.make || '',
            model: sv.model || '', vin: sv.vin || '', hp: sv.hp || '',
            mpgLoaded: sv.mpgLoaded || DEFAULT_TRUCK.mpgLoaded,
            mpgEmpty:  sv.mpgEmpty  || DEFAULT_TRUCK.mpgEmpty,
            tankGal:   sv.tankGal   || DEFAULT_TRUCK.tankGal,
            fuelPrice: sv.fuelPrice || DEFAULT_TRUCK.fuelPrice,
            truckHeight:   sv.truckHeight   || DEFAULT_TRUCK.truckHeight,
            trailerNum:    sv.trailerNum    || '',
            trailerType:   sv.trailerType   || DEFAULT_TRUCK.trailerType,
            trailerLen:    sv.trailerLen    || DEFAULT_TRUCK.trailerLen,
            trailerHeight: sv.trailerHeight || DEFAULT_TRUCK.trailerHeight,
            axles:      sv.axles      || DEFAULT_TRUCK.axles,
            maxWeight:  sv.maxWeight  || DEFAULT_TRUCK.maxWeight,
            gvwr:       sv.gvwr       || DEFAULT_TRUCK.gvwr,
            cdlClass:   sv.cdlClass   || DEFAULT_TRUCK.cdlClass,
            endorsements: sv.endorsements || '',
          }
          setTruck(mapped); setTruckForm(mapped)
        }
      }
    } catch { /* ignore */ }
  }, [])

  // Mission stop handlers — routed through useMission for localStorage + Supabase parity with dashboard

  const fill = useCallback((f: Parsed) => {
    if (f.origin)    setOrigin(f.origin)
    if (f.dest)      setDest(f.dest)
    if (f.miles)     setMiles(f.miles)
    if (f.loadNum)   setLoadNum(f.loadNum)
    if (f.cpm)       setCpm(f.cpm)
    if (f.weight)    setWeight(f.weight)
    if (f.broker)    setBroker(f.broker)
    if (f.commodity) setCommodity(f.commodity)
    if (f.depart)    setDepart(f.depart)
  }, [])

  const runBuild = useCallback(() => {
    const totalMiles = parseFloat(miles)
    if (!origin || !dest || !totalMiles) return
    const [dh, dm] = depart.split(':').map(Number)
    const p = buildPlan({
      origin, dest, totalMiles,
      departMin: dh * 60 + (dm || 0),
      cpm: parseFloat(cpm) || 0.55,
      hasPet: opts.pet,
      truck,
    })
    p.loadNum    = loadNum
    p.broker     = broker
    p.commodity  = commodity
    p.weight     = parseFloat(weight) || 0
    p.deadhead   = parseFloat(deadhead) || 0
    p.deadheadCost = p.deadhead * p.cpm
    p.legalChecks = truck ? checkLegal(truck, p.weight, opts.haz) : null

    // Save active trip to localStorage for dashboard
    const today      = new Date().toISOString().slice(0,10)
    const departISO  = `${today}T${depart}:00`
    const arrMins    = dh * 60 + (dm||0) + Math.round((totalMiles/58)*60)
    const arrDate    = new Date(departISO)
    arrDate.setHours(Math.floor(((arrMins%1440)+1440)%1440/60), Math.floor(((arrMins%1440)+1440)%1440%60), 0, 0)
    if (arrDate < new Date(departISO)) arrDate.setDate(arrDate.getDate()+1)
    localStorage.setItem('3b-active-trip', JSON.stringify({
      origin:      { query: origin },
      destination: { query: dest },
      totalMiles, departTime: departISO,
      estArrival:  arrDate.toISOString(),
      estDriveHours: (totalMiles/58).toFixed(1),
      loadNumber:  loadNum || null,
      stops: p.stops.filter(s=>s.type==='fuel').map(s=>({
        name: s.location, city:'', state:'', miFromOrigin: s.mi,
        eta: arrDate.toISOString(), stopType: s.type,
        diesel: null, showers: null, recommended: false,
      })),
    }))
    setPlan(p)
  }, [origin, dest, miles, depart, cpm, loadNum, broker, commodity, weight, deadhead, opts, truck])

  const saveTruck = () => {
    setTruck(truckForm)
    localStorage.setItem('3b-vehicle', JSON.stringify(truckForm))
    setShowModal(false)
  }

  const acceptLoad = () => {
    if (!plan) return
    const params = new URLSearchParams({
      origin:        plan.origin,
      destination:   plan.dest,
      loadNumber:    plan.loadNum,
      broker:        plan.broker,
      dispatchMiles: String(plan.total_miles),
      cpmRate:       String(plan.cpm),
    })
    router.push(`/loads?new=1&${params}`)
  }

  const copyGPS = () => {
    if (!plan) return
    const text = [
      "TRUCKER'S PATH / GPS STOP PLAN",
      `${plan.origin} → ${plan.dest}`,
      `${plan.total_miles} miles · Depart ${plan.depart_display} · ETA ${plan.eta}`,
      plan.loadNum ? `Load #${plan.loadNum}` : '',
      '━'.repeat(44),
      '',
      ...plan.gpsStops.map(s => [
        `STOP ${s.order}: ${s.typeLabel}`,
        `  Name:    ${s.name}`,
        s.address ? `  Address: ${s.address}` : '',
        `  ETA:     ${s.eta}  |  Mile: ${s.mi}`,
        s.tag      ? `  ⚠ ${s.tag}` : '',
        '',
      ].filter(Boolean).join('\n')),
      '━'.repeat(44),
      'Generated by 3B Fleet Commander',
    ].filter(l => l !== '').join('\n')
    navigator.clipboard.writeText(text)
    setCopiedGPS(true)
    setTimeout(() => setCopiedGPS(false), 2500)
  }

  // ── Summary Sheet ─────────────────────────────────────────────────────────
  const generateSummaryHTML = (p: Plan, t: Truck | null): string => {
    const now = new Date().toLocaleString('en-US', { dateStyle:'long', timeStyle:'short' })
    const hosStatus = p.hos_compliant ? '✓ DOT COMPLIANT' : '⚠ HOS WARNINGS — SEE TIMELINE'
    const hosColor  = p.hos_compliant ? '#1a7c3e' : '#b91c1c'
    const profitPct = p.est_pay > 0 ? Math.round(p.net / p.est_pay * 100) : 0
    const profitColor = profitPct > 60 ? '#1a7c3e' : profitPct > 35 ? '#92700a' : '#b91c1c'

    const stopRows = p.stops.map(s => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:6px 8px;font-size:11px;white-space:nowrap;color:#6b7280;">${s.eta}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:center;">${s.icon}</td>
        <td style="padding:6px 8px;font-size:11px;font-weight:700;color:${s.type==='rest10'||s.type==='break30'?'#b91c1c':s.type==='delivery'?'#1a7c3e':'#111'}">${s.label}</td>
        <td style="padding:6px 8px;font-size:11px;color:#2563eb;">${s.location}</td>
        <td style="padding:6px 8px;font-size:11px;color:#6b7280;text-align:right;">mi ${s.mi}</td>
      </tr>`).join('')

    const legalRows = p.legalChecks ? p.legalChecks.map(c => `
      <tr>
        <td style="padding:5px 8px;font-size:11px;color:#374151;">${c.label}</td>
        <td style="padding:5px 8px;font-size:11px;font-weight:700;">${c.val}</td>
        <td style="padding:5px 8px;font-size:11px;color:#6b7280;">${c.legal}</td>
        <td style="padding:5px 8px;font-size:12px;text-align:center;">${c.ok&&!c.warn?'✅':c.warn?'⚠️':'🚫'}</td>
      </tr>`).join('') : ''

    const truckLine = t
      ? `${[t.year,t.make,t.model].filter(Boolean).join(' ')||'Truck'} #${t.truckNum||'—'} · Trailer: ${t.trailerNum||'—'} (${t.trailerType}) · ${t.mpgLoaded} MPG · $${t.fuelPrice}/gal`
      : 'No truck configured'

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Trip Summary — ${p.loadNum ? 'Load #'+p.loadNum+' · ' : ''}${p.origin} → ${p.dest}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#111;font-size:13px;line-height:1.5}
    .page{max-width:820px;margin:0 auto;padding:28px 32px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:3px solid #00b88a;margin-bottom:20px}
    .brand{display:flex;flex-direction:column}
    .brand-name{font-size:18px;font-weight:900;color:#00b88a;letter-spacing:-.02em}
    .brand-sub{font-size:9px;font-weight:700;color:#888;letter-spacing:.12em;text-transform:uppercase;margin-top:2px}
    .gen-date{font-size:10px;color:#888;text-align:right;line-height:1.6}
    .verdict{display:inline-block;padding:6px 16px;border-radius:6px;font-size:12px;font-weight:800;letter-spacing:.04em;margin-bottom:4px}
    h2{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#00b88a;margin-bottom:10px;padding-bottom:5px;border-bottom:1px solid #e5e7eb}
    .section{margin-bottom:20px}
    .route-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin-bottom:6px}
    .route-origin{font-size:16px;font-weight:900;color:#111}
    .route-arrow{font-size:12px;color:#6b7280;margin:4px 0}
    .route-dest{font-size:16px;font-weight:900;color:#111}
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:6px}
    .kpi{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;text-align:center}
    .kpi-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:4px}
    .kpi-val{font-size:16px;font-weight:900;font-variant-numeric:tabular-nums}
    .profit-bar{height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;margin:8px 0}
    .profit-fill{height:100%;border-radius:4px}
    table{width:100%;border-collapse:collapse}
    .timeline-table td{vertical-align:top}
    .legal-table td{vertical-align:middle}
    .warn-box{background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:11px;color:#92700a}
    .hos-box{border-radius:8px;padding:10px 14px;font-size:12px;font-weight:700}
    .notes-section{margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px}
    .notes-lines{margin-top:8px}
    .note-line{border-bottom:1px solid #e5e7eb;height:24px;margin-bottom:4px}
    .footer{margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:9px;color:#9ca3af}
    .truck-line{font-size:10px;color:#6b7280;margin-top:6px;padding:6px 10px;background:#f9fafb;border-radius:5px;border:1px solid #e5e7eb}
    @media print{
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .no-print{display:none!important}
      .page{padding:16px 20px}
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="brand">
      <div class="brand-name">3B FLEET COMMANDER</div>
      <div class="brand-sub">Mileage Intelligence System</div>
      <div style="margin-top:6px;font-size:11px;color:#374151;">
        <strong>TRIP SUMMARY SHEET</strong>${p.loadNum ? ' — Load #'+p.loadNum : ''}
      </div>
    </div>
    <div class="gen-date">
      Generated: ${now}<br/>
      ${p.hos_compliant
        ? '<span style="color:#1a7c3e;font-weight:800;">✓ DOT COMPLIANT</span>'
        : '<span style="color:#b91c1c;font-weight:800;">⚠ HOS WARNINGS</span>'}
    </div>
  </div>

  <!-- Route -->
  <div class="section">
    <h2>Route</h2>
    <div class="route-box">
      <div class="route-origin">📍 ${p.origin}</div>
      <div class="route-arrow">↓ ${p.total_miles} miles · Drive ${p.drive_time} · Total ${p.trip_time}</div>
      <div class="route-dest">🏁 ${p.dest}</div>
      <div style="display:flex;gap:20px;margin-top:8px;font-size:11px;color:#374151;">
        <span>🕐 Depart: <strong>${p.depart_display}</strong></span>
        <span>🏁 ETA: <strong style="color:#00b88a">${p.eta}</strong></span>
        ${p.loadNum   ? `<span>Load #: <strong>${p.loadNum}</strong></span>` : ''}
        ${p.broker    ? `<span>Broker: <strong>${p.broker}</strong></span>` : ''}
        ${p.commodity ? `<span>Commodity: <strong>${p.commodity}</strong></span>` : ''}
        ${p.weight    ? `<span>Weight: <strong>${p.weight.toLocaleString()} lbs</strong></span>` : ''}
        ${p.deadhead  ? `<span>Deadhead: <strong>${p.deadhead} mi</strong></span>` : ''}
      </div>
    </div>
    <div class="truck-line">🚛 ${truckLine}</div>
  </div>

  <!-- Financials -->
  <div class="section">
    <h2>Financials</h2>
    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">Gross Pay</div>
        <div class="kpi-val" style="color:#1a7c3e">${money(p.est_pay)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Fuel Cost</div>
        <div class="kpi-val" style="color:#92700a">${money(p.fuel_cost)}</div>
      </div>
      ${p.deadhead > 0 ? `<div class="kpi">
        <div class="kpi-label">Deadhead Cost</div>
        <div class="kpi-val" style="color:#92700a">${money(p.deadheadCost)}</div>
      </div>` : ''}
      <div class="kpi">
        <div class="kpi-label">Net Pay</div>
        <div class="kpi-val" style="color:${p.net>0?'#1a7c3e':'#b91c1c'}">${money(p.net)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">CPM Rate</div>
        <div class="kpi-val">$${p.cpm.toFixed(3)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Profit Score</div>
        <div class="kpi-val" style="color:${profitColor}">${profitPct}%</div>
      </div>
    </div>
    <div class="profit-bar"><div class="profit-fill" style="width:${Math.min(100,Math.max(0,profitPct))}%;background:${profitColor}"></div></div>
    <div style="font-size:10px;color:#6b7280">Net after fuel: ${money(p.net)} on ${money(p.est_pay)} gross${p.deadhead>0?' · '+money(p.deadheadCost)+' deadhead':''}</div>
  </div>

  <!-- HOS & Legal -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
    <div>
      <h2>HOS Status</h2>
      <div class="hos-box" style="background:${p.hos_compliant?'#f0fdf4':'#fef2f2'};border:1px solid ${p.hos_compliant?'#86efac':'#fca5a5'}">
        <div style="color:${hosColor};margin-bottom:4px;">${hosStatus}</div>
        <div style="font-size:10px;font-weight:400;color:#374151;">Drive: ${p.drive_time} est. · FMCSA §395.3 limits applied</div>
      </div>
      ${p.warnings.length > 0 ? `<div class="warn-box" style="margin-top:6px;">⚠ ${p.warnings.join(' · ')}</div>` : ''}
    </div>
    ${legalRows ? `<div>
      <h2>Legal Check</h2>
      <table class="legal-table">
        <tbody>${legalRows}</tbody>
      </table>
    </div>` : '<div></div>'}
  </div>

  <!-- Timeline -->
  <div class="section">
    <h2>DOT-Compliant Timeline</h2>
    <table class="timeline-table">
      <thead>
        <tr style="border-bottom:2px solid #e5e7eb;">
          <th style="padding:5px 8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;text-align:left">ETA</th>
          <th style="padding:5px 8px;"></th>
          <th style="padding:5px 8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;text-align:left">Stop</th>
          <th style="padding:5px 8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;text-align:left">Location</th>
          <th style="padding:5px 8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;text-align:right">Mile</th>
        </tr>
      </thead>
      <tbody>${stopRows}</tbody>
    </table>
  </div>

  <!-- Notes -->
  <div class="notes-section">
    <h2>Driver Notes / Dispatch Instructions</h2>
    <div class="notes-lines">
      ${Array.from({length:5}).map(()=>'<div class="note-line"></div>').join('')}
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>3B Fleet Commander · fleet.bouncebackbrian.com · Mileage Intelligence System</span>
    <span>Generated ${now}</span>
  </div>

  <!-- Print button (hidden when printing) -->
  <div class="no-print" style="margin-top:20px;display:flex;gap:10px;justify-content:center">
    <button onclick="window.print()" style="padding:10px 28px;background:#00b88a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">🖨 Print / Save as PDF</button>
    <button onclick="window.close()" style="padding:10px 20px;background:#f3f4f6;color:#111;border:1px solid #d1d5db;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">✕ Close</button>
  </div>

</div>
</body>
</html>`
  }

  const printSummary = () => {
    if (!plan) return
    const html = generateSummaryHTML(plan, truck)
    const w = window.open('', '_blank', 'width=900,height=800,scrollbars=yes')
    if (!w) { alert('Please allow pop-ups for this site to open the Summary Sheet.'); return }
    w.document.write(html)
    w.document.close()
  }

  const emailSummary = () => {
    if (!plan) return
    const subject = encodeURIComponent(`Trip Summary${plan.loadNum ? ' — Load #'+plan.loadNum : ''}: ${plan.origin} → ${plan.dest}`)
    const body = encodeURIComponent([
      '3B FLEET COMMANDER — TRIP SUMMARY',
      '═'.repeat(42),
      '',
      `ROUTE: ${plan.origin} → ${plan.dest}`,
      `Miles: ${plan.total_miles} loaded`,
      plan.loadNum   ? `Load #: ${plan.loadNum}`         : '',
      plan.broker    ? `Broker: ${plan.broker}`           : '',
      plan.commodity ? `Commodity: ${plan.commodity}`     : '',
      plan.weight    ? `Weight: ${plan.weight.toLocaleString()} lbs` : '',
      '',
      `SCHEDULE`,
      `─`.repeat(20),
      `Depart: ${plan.depart_display}`,
      `Drive time: ${plan.drive_time}`,
      `Total time: ${plan.trip_time}`,
      `ETA: ${plan.eta}`,
      '',
      `FINANCIALS`,
      `─`.repeat(20),
      `Gross pay:  ${money(plan.est_pay)}`,
      `Fuel cost:  ${money(plan.fuel_cost)}`,
      plan.deadhead > 0 ? `Deadhead:   ${money(plan.deadheadCost)}` : '',
      `Net pay:    ${money(plan.net)}`,
      `CPM rate:   $${plan.cpm.toFixed(3)}`,
      `Profit:     ${plan.est_pay>0?Math.round(plan.net/plan.est_pay*100):0}%`,
      '',
      `HOS STATUS: ${plan.hos_compliant ? '✓ DOT Compliant' : '⚠ Warnings — see timeline'}`,
      '',
      'TIMELINE',
      '─'.repeat(20),
      ...plan.stops.map(s => `  ${s.eta.padEnd(10)} ${s.label.padEnd(36)} ${s.location}`),
      '',
      plan.warnings.length ? 'WARNINGS:\n' + plan.warnings.map(w=>'  ⚠ '+w).join('\n') : '',
      '',
      '─'.repeat(42),
      'Generated by 3B Fleet Commander',
      'fleet.bouncebackbrian.com',
    ].filter(l => l !== undefined && l !== null).join('\n'))
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  const copyFullPlan = () => {
    if (!plan) return
    const text = [
      '3B FLEET COMMANDER — TRIP PLAN',
      '━'.repeat(40),
      `${plan.origin} → ${plan.dest}`,
      `Load #: ${plan.loadNum||'—'} | Broker: ${plan.broker||'—'}`,
      `Miles: ${plan.total_miles} | Drive: ${plan.drive_time} | ETA: ${plan.eta}`,
      `Est. pay: ${money(plan.est_pay)} | Fuel: ${money(plan.fuel_cost)} | Net: ${money(plan.net)}`,
      `HOS: ${plan.hos_compliant ? '✓ Compliant' : '⚠ Warnings'}`,
      '', 'TIMELINE:',
      ...plan.stops.map(s => `  ${s.eta.padEnd(10)} ${s.label.padEnd(38)} ${s.location}`),
      '', plan.warnings.length
        ? 'WARNINGS:\n' + plan.warnings.map(w=>'  ⚠ '+w).join('\n')
        : 'No HOS warnings.',
    ].join('\n')
    navigator.clipboard.writeText(text)
  }

  const analyzeLoad = async () => {
    if (!aiText.trim()) return
    setAiLoading(true); setAiError(''); setAiResult(null)
    try {
      // Read HOS from localStorage if available
      let hosPayload: Record<string, number | null> = { driveHoursRemaining: null, shiftHoursRemaining: null, cycleHoursRemaining: null }
      try {
        const raw = localStorage.getItem('3b-hos-data')
        if (raw) {
          const h = JSON.parse(raw)
          hosPayload = {
            driveHoursRemaining:  h.driveRemaining  ?? null,
            shiftHoursRemaining:  h.shiftRemaining  ?? null,
            cycleHoursRemaining:  h.cycleRemaining  ?? null,
          }
        }
      } catch { /* ignore */ }
      const res = await fetch('/api/load-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loadText: aiText,
          ...hosPayload,
          fuelPrice:     truck?.fuelPrice    ?? 3.85,
          mpg:           truck?.mpgLoaded    ?? 6.2,
          tankGal:       truck?.tankGal      ?? 120,
          truckHeight:   truck?.truckHeight  ?? 13.5,
          trailerHeight: truck?.trailerHeight ?? 13.5,
          trailerLen:    truck?.trailerLen    ?? 53,
          maxWeight:     truck?.maxWeight     ?? 80000,
        }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data: AIResult = await res.json()
      if ('error' in data) throw new Error((data as unknown as { error: string }).error)
      setAiResult(data)
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAiLoading(false)
    }
  }

  const fillFromAI = () => {
    if (!aiResult?.parsed) return
    const p = aiResult.parsed
    const mapped: Parsed = {
      origin:    p.origin    ?? undefined,
      dest:      p.dest      ?? undefined,
      miles:     p.miles     != null ? String(p.miles) : undefined,
      cpm:       p.cpm       != null ? String(p.cpm)   : undefined,
      weight:    p.weight    != null ? String(p.weight) : undefined,
      loadNum:   p.loadNum   ?? undefined,
      broker:    p.broker    ?? undefined,
      commodity: p.commodity ?? undefined,
    }
    if (p.depart) {
      const hm = p.depart.trim().toLowerCase().match(/(\d{1,2}):?(\d{2})?\s*([ap]m?)?/)
      if (hm) {
        let h = parseInt(hm[1]); const mn = hm[2] || '00'
        if (hm[3] === 'pm' && h < 12) h += 12
        if (hm[3] === 'am' && h === 12) h = 0
        mapped.depart = `${String(h).padStart(2,'0')}:${mn}`
      }
    }
    fill(mapped)
    setTab('form')
  }

  const truckLabel = truck
    ? `${[truck.year, truck.make, truck.model].filter(Boolean).join(' ')||'Truck'} · #${truck.truckNum||'—'}`
    : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mission Stops — Add Stop sheet */}
      <AddStopSheet
        open={showTripAddStop}
        onClose={() => setShowTripAddStop(false)}
        onAdd={(stop, position) => addStop(stop, position)}
      />

      <style>{`
        @media (max-width: 768px) {
          .trips-main { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {showModal && (
        <TruckModal
          form={truckForm}
          onChange={(k,v) => setTruckForm(p=>({...p,[k]:v}))}
          onSave={saveTruck}
          onClose={() => setShowModal(false)}
        />
      )}

      <TopBar
        title="Trip Planner"
        module="ops"
        subtitle={truckLabel ?? 'Set up your truck for legal & fuel checks'}
      />

      <main className="trips-main" style={{ display:'grid', gridTemplateColumns:'minmax(0,420px) 1fr', gap:'1.4rem', padding:'1.4rem', alignItems:'start' }}>

        {/* ── LEFT PANEL ── */}
        <div style={{ display:'grid', gap:'.75rem' }}>

          {/* Truck button */}
          <button onClick={()=>setShowModal(true)} style={{ ...S.btn, display:'flex', alignItems:'center', gap:10, padding:'.75rem 1rem', borderRadius:14, background: truck ? 'rgba(79,152,163,.07)' : 'var(--surface)', borderColor: truck ? 'rgba(79,152,163,.28)' : 'var(--border)' }}>
            <span style={{ fontSize:'1.35rem' }}>🚛</span>
            <div style={{ textAlign:'left', flex:1, minWidth:0 }}>
              <div style={{ fontSize:'var(--text-xs)', fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {truck ? truckLabel : 'Set up truck & trailer'}
              </div>
              <div style={{ fontSize:'.65rem', color:'var(--muted)', marginTop:1 }}>
                {truck ? `${truck.trailerType} · ${truck.mpgLoaded} mpg · $${truck.fuelPrice}/gal` : 'Required for legal checks & fuel calc'}
              </div>
            </div>
            <span style={{ fontSize:'var(--text-xs)', color:'var(--primary)', flexShrink:0 }}>⚙ Edit</span>
          </button>

          {/* Input tab bar — row 1: planning tabs */}
          <div style={{ display:'flex', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:11, padding:3, gap:2 }}>
            {([
              ['form',      '📋',  'Form'],
              ['paste',     '📝',  'Paste'],
              ['file',      '📂',  'File'],
              ['ai',        '🤖',  'AI'],
            ] as [InputTab, string, string][]).map(([t, emoji, label]) => {
              const isAI = t === 'ai'
              return (
                <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:'.45rem .2rem', borderRadius:8, fontSize:'.6rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', border: tab===t ? `1px solid ${isAI ? 'rgba(0,232,176,.35)' : 'var(--border)'}` : '1px solid transparent', background: tab===t ? (isAI ? 'rgba(0,232,176,.08)' : 'var(--surface-2)') : 'transparent', color: tab===t ? (isAI ? 'var(--primary)' : 'var(--text)') : 'var(--muted)', cursor:'pointer', boxShadow: tab===t ? '0 1px 4px rgba(0,0,0,.2)' : 'none' }}>
                  {emoji} {label}
                </button>
              )
            })}
          </div>
          {/* Row 2: ops tabs */}
          <div style={{ display:'flex', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:11, padding:3, gap:2 }}>
            {([
              ['scale',     '⚖️',  'Scales'],
              ['playbooks', '📋',  'Playbooks'],
            ] as [InputTab, string, string][]).map(([t, emoji, label]) => {
              const isScale = t === 'scale'
              return (
                <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:'.45rem .2rem', borderRadius:8, fontSize:'.6rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', border: tab===t ? `1px solid ${isScale ? 'rgba(245,194,0,.35)' : 'rgba(79,152,163,.35)'}` : '1px solid transparent', background: tab===t ? (isScale ? 'rgba(245,194,0,.08)' : 'rgba(79,152,163,.08)') : 'transparent', color: tab===t ? (isScale ? 'var(--warn)' : 'rgba(79,152,163,1)') : 'var(--muted)', cursor:'pointer', boxShadow: tab===t ? '0 1px 4px rgba(0,0,0,.2)' : 'none' }}>
                  {emoji} {label}
                </button>
              )
            })}
          </div>

          {/* ─ Form tab ─ */}
          {tab === 'form' && (
            <>
              <div style={S.card}>
                <div style={S.sec}>Route Details</div>
                <div style={{ display:'grid', gap:'.75rem' }}>
                  <div><label style={S.lbl}>Origin *</label><input style={S.inp} value={origin} onChange={e=>setOrigin(e.target.value)} placeholder="Amargosa Valley, NV" /></div>
                  <div><label style={S.lbl}>Destination *</label><input style={S.inp} value={dest} onChange={e=>setDest(e.target.value)} placeholder="Walmart DC Sparks, NV" /></div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>
                    <div><label style={S.lbl}>Total miles *</label><input style={S.inp} type="number" value={miles} onChange={e=>setMiles(e.target.value)} placeholder="335" /></div>
                    <div><label style={S.lbl}>Departure</label><input style={S.inp} type="time" value={depart} onChange={e=>setDepart(e.target.value)} /></div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>
                    <div><label style={S.lbl}>Load # / Order</label><input style={S.inp} value={loadNum} onChange={e=>setLoadNum(e.target.value)} placeholder="0241482" /></div>
                    <div><label style={S.lbl}>Broker / Carrier</label><input style={S.inp} value={broker} onChange={e=>setBroker(e.target.value)} placeholder="Walmart Fleet" /></div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>
                    <div><label style={S.lbl}>Commodity</label><input style={S.inp} value={commodity} onChange={e=>setCommodity(e.target.value)} placeholder="General merchandise" /></div>
                    <div><label style={S.lbl}>Load weight (lbs)</label><input style={S.inp} type="number" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="42000" /></div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>
                    <div><label style={S.lbl}>CPM rate ($)</label><input style={S.inp} type="number" step="0.01" value={cpm} onChange={e=>setCpm(e.target.value)} /></div>
                    <div><label style={S.lbl}>Deadhead miles</label><input style={S.inp} type="number" value={deadhead} onChange={e=>setDeadhead(e.target.value)} placeholder="0" /></div>
                  </div>
                </div>
              </div>

              {/* Driver options */}
              <div style={S.card}>
                <div style={S.sec}>Driver Options</div>
                {([['pet','🐾 Pet aboard — add breaks every 2h'],['team','👥 Team driving — split HOS'],['haz','⚠ Hazmat — restricted routes apply']] as [keyof TripOptions,string][]).map(([k,label]) => (
                  <label key={k} onClick={()=>setOpts(p=>({...p,[k]:!p[k]}))} style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontSize:'var(--text-sm)', marginBottom:'.7rem' }}>
                    <div style={{ width:40, height:22, background:opts[k]?'var(--primary)':'var(--border)', borderRadius:11, position:'relative', flexShrink:0, transition:'background .18s' }}>
                      <div style={{ position:'absolute', top:3, left:opts[k]?20:3, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left .18s', boxShadow:'0 1px 4px rgba(0,0,0,.4)' }} />
                    </div>
                    {label}
                  </label>
                ))}
              </div>

              {/* Saved lanes */}
              <div style={S.card}>
                <div style={S.sec}>Saved Lanes</div>
                {SAVED_LANES.map(l => (
                  <button key={l.label} onClick={()=>{ setOrigin(l.origin); setDest(l.dest); setMiles(String(l.miles)) }} style={{ ...S.btn, display:'block', width:'100%', textAlign:'left', marginBottom:'.4rem', padding:'.6rem .85rem' }}>
                    <strong style={{ fontSize:'var(--text-xs)' }}>{l.label}</strong>
                    <span style={{ color:'var(--muted)', fontSize:'var(--text-xs)', marginLeft:8 }}>{l.miles} mi</span>
                  </button>
                ))}
              </div>

              <button onClick={runBuild} style={{ ...S.btnPri, width:'100%', padding:'.9rem', fontSize:'var(--text-sm)', textAlign:'center' }}>
                🗺 Build trip plan
              </button>
            </>
          )}

          {/* ─ Paste tab ─ */}
          {tab === 'paste' && (
            <div style={S.card}>
              <div style={S.sec}>Paste dispatch info</div>
              <p style={{ fontSize:'var(--text-xs)', color:'var(--muted)', marginBottom:'.85rem', lineHeight:1.65 }}>
                Paste anything — rate confirmation, load board text, broker email. Extracts origin, destination, miles, load #, and CPM automatically.
              </p>
              <textarea style={{ ...S.inp, resize:'vertical', minHeight:180, lineHeight:1.6 }} value={paste} onChange={e=>setPaste(e.target.value)}
                placeholder={'Load #0241482\nPickup: Amargosa Valley, NV — 6:00 AM\nDeliver: Walmart DC Sparks, NV\n335 loaded miles\nRate: $0.55/mi'} />
              <button onClick={()=>{ fill(parseText(paste)); setTab('form'); setTimeout(runBuild, 80) }} style={{ ...S.btnPri, width:'100%', padding:'.75rem', marginTop:'.75rem' }}>
                Parse &amp; build plan →
              </button>
            </div>
          )}

          {/* ─ File tab ─ */}
          {tab === 'file' && (
            <div style={S.card}>
              <div style={S.sec}>Upload load file</div>
              <input ref={fileRef} type="file" accept=".txt,.md,.csv" style={{ display:'none' }}
                onChange={e=>{ const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>{ const p=parseText(ev.target?.result as string); setFileParsed(p); setFileName(f.name) }; r.readAsText(f) }} />
              <div onClick={()=>fileRef.current?.click()} style={{ border:'2px dashed var(--border)', borderRadius:12, padding:'1.6rem', textAlign:'center', cursor:'pointer', background:'var(--surface-2)' }}>
                <div style={{ fontSize:'2rem', marginBottom:'.5rem' }}>📂</div>
                <div style={{ fontSize:'var(--text-xs)', color:'var(--muted)' }}>Drop or click to upload<br /><strong>.txt · .md · .csv</strong><br />Rate con, dispatch sheet, route notes</div>
              </div>
              {fileParsed && (
                <div style={{ marginTop:'.75rem' }}>
                  <div style={{ ...S.sec, marginBottom:'.6rem' }}>Extracted from {fileName}</div>
                  {Object.entries({ Origin: fileParsed.origin, Destination: fileParsed.dest, Miles: fileParsed.miles, 'Load #': fileParsed.loadNum, CPM: fileParsed.cpm ? `$${fileParsed.cpm}` : undefined }).map(([k,v]) => (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'.3rem 0', borderBottom:'1px solid var(--border)' }}>
                      <span style={{ fontSize:'var(--text-xs)', color:'var(--muted)' }}>{k}</span>
                      <span style={{ fontSize:'var(--text-xs)', fontWeight:700, color:v?'var(--text)':'var(--faint)' }}>{v||'Not found'}</span>
                    </div>
                  ))}
                  <button onClick={()=>{ fill(fileParsed); setTab('form'); runBuild() }} style={{ ...S.btnPri, width:'100%', padding:'.75rem', marginTop:'.75rem' }}>
                    Build plan from file →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─ AI Load Prep tab ─ */}
          {tab === 'ai' && (
            <div style={{ display:'grid', gap:'.75rem' }}>
              <div style={S.card}>
                <div style={{ ...S.sec, color:'var(--primary)' }}>🤖 AI Load Prep</div>
                <p style={{ fontSize:'var(--text-xs)', color:'var(--muted)', marginBottom:'.85rem', lineHeight:1.65 }}>
                  Paste any load offer — rate confirmation, broker email, load board text. AI extracts fields, calculates net pay, checks your HOS &amp; legal limits, flags red flags, and gives a plain ACCEPT / DENY verdict.
                </p>
                <textarea
                  style={{ ...S.inp, resize:'vertical', minHeight:200, lineHeight:1.6 }}
                  value={aiText}
                  onChange={e => setAiText(e.target.value)}
                  placeholder={'Paste full load offer here...\n\nExample:\nLoad #0241482\nPickup: Amargosa Valley, NV — 6:00 AM\nDeliver: Walmart DC, Sparks, NV\n335 loaded miles\nRate: $0.55/mi\nWeight: 42,000 lbs\nCommodity: General merchandise\nBroker: Convoy'}
                />
                {aiError && (
                  <div style={{ marginTop:'.6rem', padding:'.6rem .85rem', borderRadius:8, background:'rgba(232,64,0,.08)', border:'1px solid rgba(232,64,0,.2)', fontSize:'var(--text-xs)', color:'var(--error)' }}>
                    ⚠ {aiError}
                  </div>
                )}
                <button
                  onClick={analyzeLoad}
                  disabled={aiLoading || !aiText.trim()}
                  style={{ ...S.btnPri, width:'100%', padding:'.85rem', marginTop:'.75rem', opacity: aiLoading || !aiText.trim() ? .55 : 1, fontSize:'var(--text-sm)' }}
                >
                  {aiLoading ? '⏳ Analyzing load...' : '🤖 Analyze load'}
                </button>
              </div>

              {/* AI Result */}
              {aiResult && (() => {
                const rec = aiResult.recommendation
                const recColor = rec === 'ACCEPT' ? 'var(--success)' : rec === 'DENY' ? 'var(--error)' : 'var(--warn)'
                const recBg    = rec === 'ACCEPT' ? 'rgba(40,192,72,.1)' : rec === 'DENY' ? 'rgba(232,64,0,.1)' : 'rgba(245,194,0,.1)'
                const recBorder= rec === 'ACCEPT' ? 'rgba(40,192,72,.25)' : rec === 'DENY' ? 'rgba(232,64,0,.25)' : 'rgba(245,194,0,.25)'
                const confColor= aiResult.confidence === 'HIGH' ? 'var(--success)' : aiResult.confidence === 'MEDIUM' ? 'var(--warn)' : 'var(--error)'
                const f = aiResult.financials
                const p = aiResult.parsed
                return (
                  <>
                    {/* Verdict banner */}
                    <div style={{ background: recBg, border: `1px solid ${recBorder}`, borderRadius:16, padding:'1.1rem 1.3rem' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                        <div style={{ fontSize:'2.2rem', lineHeight:1 }}>
                          {rec === 'ACCEPT' ? '✅' : rec === 'DENY' ? '🚫' : '🔍'}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                            <span style={{ fontWeight:900, fontSize:'1.25rem', color:recColor, letterSpacing:'-.01em' }}>{rec}</span>
                            <span style={{ fontSize:'var(--text-xs)', fontWeight:800, padding:'.2rem .5rem', borderRadius:5, background: recBg, color:recColor, border:`1px solid ${recBorder}`, textTransform:'uppercase', letterSpacing:'.06em' }}>
                              {aiResult.confidence} confidence
                            </span>
                            <span style={{ fontSize:'var(--text-xs)', color:confColor, fontWeight:700 }}></span>
                          </div>
                          <div style={{ fontSize:'var(--text-sm)', color:'var(--text)', marginTop:5, lineHeight:1.5 }}>{aiResult.summary}</div>
                        </div>
                      </div>
                    </div>

                    {/* Parsed fields */}
                    {(p.origin || p.dest || p.miles || p.cpm || p.weight || p.loadNum) && (
                      <div style={S.card}>
                        <div style={S.sec}>Extracted Fields</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.4rem .8rem' }}>
                          {([
                            ['Origin',    p.origin],
                            ['Dest',      p.dest],
                            ['Miles',     p.miles != null ? String(p.miles) : null],
                            ['CPM',       p.cpm   != null ? `$${p.cpm.toFixed(3)}` : null],
                            ['Weight',    p.weight != null ? `${p.weight.toLocaleString()} lbs` : null],
                            ['Load #',    p.loadNum],
                            ['Broker',    p.broker],
                            ['Commodity', p.commodity],
                            ['Total Pay', p.totalPay != null ? `$${p.totalPay.toLocaleString()}` : null],
                          ] as [string, string|null][]).filter(([,v]) => v).map(([k,v]) => (
                            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'.3rem 0', borderBottom:'1px solid var(--border)' }}>
                              <span style={{ fontSize:'var(--text-xs)', color:'var(--muted)' }}>{k}</span>
                              <span style={{ fontSize:'var(--text-xs)', fontWeight:700, color:'var(--text)', maxWidth:160, textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Financials */}
                    {(f.grossPay != null || f.netPay != null) && (
                      <div style={S.card}>
                        <div style={S.sec}>Financials</div>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(min(130px,100%),1fr))', gap:'.6rem' }}>
                          {([
                            ['Gross pay',  f.grossPay     != null ? `$${f.grossPay.toLocaleString(undefined,{minimumFractionDigits:2})}` : null, 'var(--success)'],
                            ['Fuel cost',  f.fuelCost     != null ? `$${f.fuelCost.toLocaleString(undefined,{minimumFractionDigits:2})}` : null, 'var(--warn)'],
                            ['Net pay',    f.netPay       != null ? `$${f.netPay.toLocaleString(undefined,{minimumFractionDigits:2})}`   : null, f.netPay != null && f.netPay > 0 ? 'var(--success)' : 'var(--error)'],
                            ['CPM',        f.cpm          != null ? `$${f.cpm.toFixed(3)}`   : null, ''],
                            ['Rate/mi',    f.ratePerMile  != null ? `$${f.ratePerMile.toFixed(3)}` : null, ''],
                            ['Profit %',   `${Math.round(f.profitScore)}%`, f.profitScore > 60 ? 'var(--success)' : f.profitScore > 35 ? 'var(--warn)' : 'var(--error)'],
                          ] as [string, string|null, string][]).filter(([,v]) => v).map(([label, val, col]) => (
                            <div key={label} style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:10, padding:'.7rem' }}>
                              <div style={{ fontSize:'var(--text-xs)', color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>{label}</div>
                              <div style={{ fontSize:'1.1rem', fontWeight:900, fontVariantNumeric:'tabular-nums', color: col || 'var(--text)' }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        {/* Profit score bar */}
                        {(() => {
                          const score = Math.min(100, Math.max(0, f.profitScore))
                          const col = score > 60 ? 'var(--success)' : score > 35 ? 'var(--warn)' : 'var(--error)'
                          return (
                            <div style={{ marginTop:'.75rem' }}>
                              <div style={{ height:8, borderRadius:4, background:'var(--surface-off)', overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${score}%`, background:col, borderRadius:4, transition:'width .5s cubic-bezier(.16,1,.3,1)' }} />
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    {/* HOS check */}
                    <div style={{ background: aiResult.hos.legal ? 'rgba(40,192,72,.07)' : 'rgba(232,64,0,.07)', border: `1px solid ${aiResult.hos.legal ? 'rgba(40,192,72,.2)' : 'rgba(232,64,0,.2)'}`, borderRadius:12, padding:'.85rem 1rem' }}>
                      <div style={{ fontWeight:800, fontSize:'var(--text-xs)', color: aiResult.hos.legal ? 'var(--success)' : 'var(--error)', marginBottom:'.3rem' }}>
                        {aiResult.hos.legal ? '✅ HOS — Legal' : '🚫 HOS — Exceeds Limit'}
                      </div>
                      {aiResult.hos.driveNeeded != null && (
                        <div style={{ fontSize:'var(--text-xs)', color:'var(--muted)', marginBottom:'.2rem' }}>
                          Drive needed: <strong style={{ color:'var(--text)' }}>{aiResult.hos.driveNeeded.toFixed(1)}h</strong>
                          {aiResult.hos.driveAvailable != null && <> · Available: <strong style={{ color:'var(--text)' }}>{aiResult.hos.driveAvailable.toFixed(1)}h</strong></>}
                        </div>
                      )}
                      <div style={{ fontSize:'var(--text-xs)', color:'var(--muted)', lineHeight:1.55 }}>{aiResult.hos.note}</div>
                    </div>

                    {/* Legal check */}
                    {aiResult.legal.notes.length > 0 && (
                      <div style={{ background:'rgba(245,194,0,.06)', border:'1px solid rgba(245,194,0,.18)', borderRadius:12, padding:'.85rem 1rem' }}>
                        <div style={{ fontWeight:800, fontSize:'var(--text-xs)', color:'var(--warn)', marginBottom:'.4rem' }}>⚠ Legal Notes</div>
                        {aiResult.legal.notes.map((n,i) => <div key={i} style={{ fontSize:'var(--text-xs)', color:'var(--muted)', lineHeight:1.6 }}>• {n}</div>)}
                      </div>
                    )}

                    {/* Red / Green flags */}
                    {(aiResult.redFlags.length > 0 || aiResult.greenFlags.length > 0) && (
                      <div style={S.card}>
                        <div style={S.sec}>Flags</div>
                        {aiResult.greenFlags.length > 0 && (
                          <div style={{ marginBottom: aiResult.redFlags.length ? '.75rem' : 0 }}>
                            {aiResult.greenFlags.map((f,i) => (
                              <div key={i} style={{ display:'flex', gap:8, alignItems:'start', marginBottom:'.4rem' }}>
                                <span style={{ color:'var(--success)', flexShrink:0, fontSize:'var(--text-sm)', lineHeight:1.4 }}>✅</span>
                                <span style={{ fontSize:'var(--text-xs)', color:'var(--text)', lineHeight:1.55 }}>{f}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {aiResult.redFlags.map((f,i) => (
                          <div key={i} style={{ display:'flex', gap:8, alignItems:'start', marginBottom:'.4rem' }}>
                            <span style={{ color:'var(--error)', flexShrink:0, fontSize:'var(--text-sm)', lineHeight:1.4 }}>🚩</span>
                            <span style={{ fontSize:'var(--text-xs)', color:'var(--text)', lineHeight:1.55 }}>{f}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reasons */}
                    {aiResult.reasons.length > 0 && (
                      <div style={S.card}>
                        <div style={S.sec}>AI Reasoning</div>
                        {aiResult.reasons.map((r,i) => (
                          <div key={i} style={{ fontSize:'var(--text-xs)', color:'var(--muted)', lineHeight:1.65, marginBottom:'.35rem' }}>• {r}</div>
                        ))}
                      </div>
                    )}

                    {/* Suggested broker reply */}
                    {aiResult.suggestedReply && (
                      <div style={{ ...S.card, border:'1px solid rgba(0,232,176,.15)', background:'rgba(0,232,176,.03)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'.6rem' }}>
                          <div style={S.sec as React.CSSProperties}>💬 Suggested Reply to Broker</div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(aiResult.suggestedReply)
                              setCopiedReply(true)
                              setTimeout(() => setCopiedReply(false), 2500)
                            }}
                            style={{ ...S.btn, padding:'.3rem .65rem', fontSize:'.65rem', background: copiedReply ? 'rgba(40,192,72,.1)' : 'var(--surface-2)', borderColor: copiedReply ? 'rgba(40,192,72,.35)' : 'var(--border)', color: copiedReply ? 'var(--success)' : 'var(--text)' }}
                          >
                            {copiedReply ? '✅ Copied!' : '📋 Copy'}
                          </button>
                        </div>
                        <div style={{ fontSize:'var(--text-xs)', color:'var(--text)', lineHeight:1.7, whiteSpace:'pre-wrap', background:'var(--surface-2)', borderRadius:10, padding:'.75rem .9rem', border:'1px solid var(--border)' }}>
                          {aiResult.suggestedReply}
                        </div>
                      </div>
                    )}

                    {/* CTA buttons */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.75rem' }}>
                      <button
                        onClick={() => { fillFromAI(); setTimeout(runBuild, 50) }}
                        disabled={!p.origin || !p.dest || !p.miles}
                        style={{ ...S.btnPri, padding:'.8rem', textAlign:'center', fontSize:'var(--text-sm)', opacity: (!p.origin || !p.dest || !p.miles) ? .5 : 1 }}
                      >
                        🗺 Build plan from AI
                      </button>
                      <button onClick={() => { setAiResult(null); setAiText('') }} style={{ ...S.btn, padding:'.8rem', textAlign:'center', fontSize:'var(--text-sm)' }}>
                        🔄 New analysis
                      </button>
                    </div>
                    {/* Export AI → Log Load (auto-populate as much as possible) */}
                    {(p.origin || p.dest || p.loadNum || p.miles) && (
                      <button
                        onClick={() => {
                          const cfg = loadSettings()
                          const params = new URLSearchParams()
                          if (p.origin)    params.set('origin',        p.origin)
                          if (p.dest)      params.set('destination',   p.dest)
                          if (p.loadNum)   params.set('loadNumber',    p.loadNum)
                          if (p.broker)    params.set('broker',        p.broker)
                          if (p.miles)     params.set('dispatchMiles', String(p.miles))
                          if (p.weight)    params.set('weight',        String(p.weight))
                          if (p.commodity) params.set('commodity',     p.commodity)
                          const cpmToUse = p.cpm ?? cfg.cpmReceived ?? cfg.defaultCpm
                          if (cpmToUse)   params.set('cpmRate',        String(cpmToUse))
                          if (f.grossPay) params.set('totalPay',       String(f.grossPay))
                          params.set('new', '1')
                          router.push(`/loads?${params}`)
                        }}
                        style={{ ...S.btnPri, width:'100%', padding:'.8rem', textAlign:'center', fontSize:'var(--text-sm)', background:'linear-gradient(135deg,#f5c200,#d4a017)', borderColor:'#d4a017', color:'#1a0f00', boxShadow:'0 3px 12px rgba(245,194,0,.25)' }}
                      >
                        📦 Export AI → Log Load
                      </button>
                    )}
                  </>
                )
              })()}
            </div>
          )}

          {/* ─ Scale / Weight tab ─ */}
          {tab === 'scale' && <ScaleWeightTab truck={truck} origin={origin} dest={dest} />}

          {/* ─ Playbooks tab ─ */}
          {tab === 'playbooks' && <PlaybooksTab plan={plan} origin={origin} dest={dest} />}

        </div>

        {/* ── RIGHT PANEL ── */}
        <div>
          {!plan ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:480, gap:'1rem', color:'var(--muted)', textAlign:'center' }}>
              <div style={{ fontSize:'3.5rem' }}>🗺</div>
              <div style={{ fontSize:'var(--text-lg)', fontWeight:800, color:'var(--text)' }}>Plan your route</div>
              <div style={{ fontSize:'var(--text-sm)', maxWidth:380, lineHeight:1.65 }}>
                Enter route details or paste dispatch info. Builds a DOT-compliant timeline with HOS breaks, fuel stops, legal checks, and profit analysis.
              </div>
            </div>
          ) : (
            <div style={{ display:'grid', gap:'1.2rem' }}>

              {/* Route header */}
              <div style={{ ...S.card, background:'linear-gradient(135deg,var(--surface-2),var(--surface))' }}>
                <div style={{ display:'flex', alignItems:'start', justifyContent:'space-between', gap:'1rem', flexWrap:'wrap' }}>
                  <div>
                    <div style={{ fontSize:'var(--text-xs)', color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>
                      {plan.loadNum ? `Load #${plan.loadNum} · ` : ''}{plan.broker}{plan.commodity ? ` · ${plan.commodity}` : ''}
                    </div>
                    <div style={{ fontWeight:900, fontSize:'var(--text-lg)', letterSpacing:'-.02em' }}>{plan.origin}</div>
                    <div style={{ fontSize:'var(--text-sm)', color:'var(--muted)', margin:'.25rem 0' }}>↓ {plan.total_miles} mi · {plan.drive_time} drive · {plan.trip_time} total</div>
                    <div style={{ fontWeight:900, fontSize:'var(--text-lg)', letterSpacing:'-.02em' }}>{plan.dest}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:'var(--text-xs)', color:'var(--muted)', fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>ETA</div>
                    <div style={{ fontSize:'1.5rem', fontWeight:900, color:'var(--primary)', fontVariantNumeric:'tabular-nums' }}>{plan.eta}</div>
                    <div style={{ marginTop:6, padding:'.3rem .65rem', borderRadius:6, display:'inline-block', fontSize:'var(--text-xs)', fontWeight:800, background: plan.hos_compliant ? 'rgba(109,170,69,.12)' : 'rgba(221,105,116,.12)', color: plan.hos_compliant ? 'var(--success)' : 'var(--error)' }}>
                      {plan.hos_compliant ? '✓ DOT Compliant' : '⚠ HOS Warnings'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Countdown timer to departure */}
              {plan.depart_display && (() => {
                const today = new Date().toISOString().slice(0,10)
                const [h,m] = (() => {
                  const match = plan.depart_display.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
                  if (!match) return [6, 0]
                  let hr = parseInt(match[1]); const mn = parseInt(match[2])
                  if (match[3].toUpperCase() === 'PM' && hr < 12) hr += 12
                  if (match[3].toUpperCase() === 'AM' && hr === 12) hr = 0
                  return [hr, mn]
                })()
                const iso = `${today}T${String(h).padStart(2,'00')}:${String(m).padStart(2,'00')}:00`
                return <CountdownTimer targetISO={iso} label="Pickup" />
              })()}

              {/* KPI chips */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(min(140px,100%),1fr))', gap:'.7rem' }}>
                {([
                  ['Total miles',   String(plan.total_miles), ''],
                  ['ETA',           plan.eta,                  'var(--primary)'],
                  ['Est. pay',      money(plan.est_pay),       'var(--success)'],
                  ['Fuel cost',     money(plan.fuel_cost),     'var(--warn)'],
                  ...(plan.deadhead > 0 ? [['Deadhead cost', money(plan.deadheadCost), 'var(--warn)']] as [string,string,string][] : []),
                  ['Net (fuel out)',money(plan.net),            plan.net>0?'var(--success)':'var(--error)'],
                  ['CPM',          `$${plan.cpm.toFixed(3)}`,  ''],
                  ['Drive time',    plan.drive_time,            ''],
                  ...(() => {
                    const cfg = loadSettings()
                    const myPay = Math.round(plan.total_miles * cfg.cpmReceived * 100) / 100
                    return cfg.cpmReceived > 0 ? [['Pay @ my CPM', `$${myPay.toFixed(2)}`, myPay > plan.est_pay ? 'var(--success)' : myPay < plan.est_pay ? 'var(--error)' : 'var(--text)']] as [string,string,string][] : []
                  })(),
                ] as [string,string,string][]).map(([label,value,color]) => (
                  <div key={label} style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:12, padding:'.85rem' }}>
                    <div style={{ fontSize:'var(--text-xs)', color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:5 }}>{label}</div>
                    <div style={{ fontSize:'1.2rem', fontWeight:900, fontVariantNumeric:'tabular-nums', color: color||'var(--text)' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Profitability meter */}
              {(() => {
                const score = plan.est_pay > 0 ? Math.min(100, Math.max(0, plan.net / plan.est_pay * 100)) : 0
                const col   = score > 70 ? 'var(--success)' : score > 40 ? 'var(--warn)' : 'var(--error)'
                const lbl   = score > 70 ? '🟢 Strong' : score > 40 ? '🟡 Average' : '🔴 Thin margin'
                return (
                  <div style={S.card}>
                    <div style={S.sec}>Profitability Score</div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                      <span style={{ fontWeight:700, fontSize:'var(--text-sm)' }}>{lbl}</span>
                      <span style={{ fontWeight:800, fontSize:'var(--text-sm)', color:col }}>{Math.round(score)}%</span>
                    </div>
                    <div style={{ height:10, borderRadius:5, background:'var(--surface-2)', overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${score}%`, background:col, borderRadius:5, transition:'width .5s cubic-bezier(.16,1,.3,1)' }} />
                    </div>
                    <div style={{ fontSize:'var(--text-xs)', color:'var(--muted)', marginTop:'.6rem' }}>
                      Net after fuel: {money(plan.net)} on {money(plan.est_pay)} gross
                      {plan.deadhead > 0 ? ` · ${money(plan.deadheadCost)} deadhead cost` : ''}
                    </div>
                  </div>
                )
              })()}

              {/* HOS warnings */}
              {plan.warnings.length > 0 && (
                <div style={{ background:'rgba(221,105,116,.08)', border:'1px solid rgba(221,105,116,.2)', borderRadius:12, padding:'.9rem 1rem' }}>
                  <div style={{ fontWeight:800, fontSize:'var(--text-sm)', color:'var(--error)', marginBottom:'.4rem' }}>⚠ HOS Warnings</div>
                  {plan.warnings.map((w,i) => <div key={i} style={{ fontSize:'var(--text-xs)', color:'var(--error)', opacity:.85, lineHeight:1.6 }}>• {w}</div>)}
                </div>
              )}

              {/* Legal route check */}
              {plan.legalChecks && (
                <div style={S.card}>
                  <div style={S.sec}>Legal Route Check</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(min(130px,100%),1fr))', gap:'.65rem' }}>
                    {plan.legalChecks.map(c => (
                      <div key={c.label} style={{ background: c.ok&&!c.warn?'rgba(109,170,69,.08)':c.warn?'rgba(253,171,67,.08)':'rgba(221,105,116,.08)', border:`1px solid ${c.ok&&!c.warn?'rgba(109,170,69,.2)':c.warn?'rgba(253,171,67,.2)':'rgba(221,105,116,.2)'}`, borderRadius:10, padding:'.75rem', textAlign:'center' }}>
                        <div style={{ fontSize:'1.2rem', marginBottom:4 }}>{c.ok&&!c.warn?'✅':c.warn?'⚠️':'🚫'}</div>
                        <div style={{ fontWeight:800, fontSize:'var(--text-sm)', color:c.ok&&!c.warn?'var(--success)':c.warn?'var(--warn)':'var(--error)' }}>{c.val}</div>
                        <div style={{ fontSize:'var(--text-xs)', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginTop:2 }}>{c.label}</div>
                        <div style={{ fontSize:'var(--text-xs)', color:'var(--faint)', marginTop:2 }}>{c.legal}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* DOT timeline */}
              <div style={S.card}>
                <div style={S.sec}>DOT-Compliant Route Timeline</div>
                {plan.stops.map((s,i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'76px 30px 1fr', gap:'.65rem', position:'relative' }}>
                    <div style={{ textAlign:'right', paddingTop:2 }}>
                      <div style={{ fontWeight:800, fontSize:'var(--text-xs)', fontVariantNumeric:'tabular-nums', color: ['rest10','break30'].includes(s.type) ? 'var(--error)' : 'var(--text)' }}>{s.eta}</div>
                      {s.dur !== '—' && s.dur && <div style={{ fontSize:'.6rem', color:'var(--muted)' }}>{s.dur}</div>}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                      <div style={{ width:30, height:30, borderRadius:'50%', background:s.color, display:'grid', placeItems:'center', fontSize:'.85rem', flexShrink:0, boxShadow:`0 0 0 3px var(--bg,#0f0e0d)` }}>{s.icon}</div>
                      {i < plan.stops.length-1 && <div style={{ width:2, flex:1, minHeight:14, background:s.color, opacity:.25, marginTop:3 }} />}
                    </div>
                    <div style={{ paddingBottom:'1.1rem', borderBottom: i < plan.stops.length-1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ fontWeight:800, fontSize:'var(--text-xs)', color: s.type==='rest10'||s.type==='break30' ? 'var(--error)' : s.type==='delivery' ? 'var(--success)' : 'var(--text)' }}>{s.label}</div>
                      <div style={{ fontSize:'var(--text-xs)', color:'var(--primary)', margin:'2px 0 5px' }}>{s.location}</div>
                      <div style={{ fontSize:'.68rem', color:'var(--muted)', lineHeight:1.55 }}>{s.note}</div>
                      {s.tag && <span style={{ display:'inline-block', marginTop:5, padding:'.2rem .55rem', borderRadius:5, fontSize:'.62rem', fontWeight:700, background:'rgba(221,105,116,.1)', color:'var(--error)', border:'1px solid rgba(221,105,116,.2)' }}>{s.tag}</span>}
                      <div style={{ fontSize:'.62rem', color:'var(--faint)', marginTop:5 }}>HOS: {s.hosStr} · Mile {s.mi}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Trucker's Path / GPS plan */}
              {plan.gpsStops.length > 0 && (
                <div style={{ ...S.card, border:'1px solid rgba(79,152,163,.22)', background:'linear-gradient(135deg,rgba(79,152,163,.04),var(--surface))' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom:'.5rem', borderBottom:'1px solid var(--border)', marginBottom:'.9rem' }}>
                    <div style={S.sec as React.CSSProperties}>🗺 Trucker&#39;s Path / GPS Plan</div>
                    <button onClick={copyGPS} style={{ ...S.btn, padding:'.35rem .75rem', fontSize:'.65rem', background: copiedGPS ? 'rgba(109,170,69,.1)' : 'var(--surface-2)', borderColor: copiedGPS ? 'rgba(109,170,69,.4)' : 'var(--border)', color: copiedGPS ? 'var(--success)' : 'var(--text)' }}>
                      {copiedGPS ? '✅ Copied!' : '📋 Copy for GPS'}
                    </button>
                  </div>
                  <p style={{ fontSize:'var(--text-xs)', color:'var(--muted)', marginBottom:'.85rem', lineHeight:1.55 }}>
                    Tap &ldquo;Copy for GPS&rdquo; to paste addresses into Trucker&#39;s Path, Google Maps, or any nav app. Stretch breaks excluded.
                  </p>
                  <div style={{ display:'grid', gap:'.5rem' }}>
                    {plan.gpsStops.map(s => (
                      <div key={s.order} style={{ display:'grid', gridTemplateColumns:'32px 1fr', gap:'.6rem', alignItems:'start', background:'var(--surface-2)', borderRadius:10, padding:'.65rem .85rem', border: s.tag ? '1px solid rgba(221,105,116,.2)' : '1px solid var(--border)' }}>
                        <div style={{ width:32, height:32, borderRadius:'50%', background: s.typeLabel==='DESTINATION'?'var(--success)':s.typeLabel==='ORIGIN'?'var(--primary)':s.typeLabel.includes('REST')?'var(--error)':s.typeLabel.includes('BREAK')?'rgba(221,105,116,.7)':'var(--warn)', display:'grid', placeItems:'center', fontSize:'.85rem', flexShrink:0 }}>{s.icon}</div>
                        <div>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:'.5rem', marginBottom:2 }}>
                            <div>
                              <span style={{ fontSize:'.58rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', marginRight:5 }}>Stop {s.order}</span>
                              <span style={{ fontSize:'.62rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color: s.typeLabel==='DESTINATION'?'var(--success)':s.typeLabel==='ORIGIN'?'var(--primary)':s.tag?'var(--error)':'var(--text)' }}>{s.typeLabel}</span>
                            </div>
                            <span style={{ fontSize:'.6rem', color:'var(--muted)', fontVariantNumeric:'tabular-nums', flexShrink:0 }}>{s.eta} · mi {s.mi}</span>
                          </div>
                          <div style={{ fontWeight:700, fontSize:'var(--text-xs)', lineHeight:1.4 }}>{s.name}</div>
                          {s.address && <div style={{ fontSize:'.65rem', color:'var(--primary)', marginTop:2, fontStyle:'italic' }}>{s.address}</div>}
                          {s.tag && <span style={{ display:'inline-block', marginTop:4, padding:'.18rem .5rem', borderRadius:4, fontSize:'.58rem', fontWeight:700, background:'rgba(221,105,116,.1)', color:'var(--error)', border:'1px solid rgba(221,105,116,.2)' }}>{s.tag}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:'.75rem', padding:'.5rem .75rem', background:'rgba(79,152,163,.05)', borderRadius:8, fontSize:'.65rem', color:'var(--muted)', lineHeight:1.6 }}>
                    💡 Addresses are real NV corridor stops. Verify availability before departure. Live fuel prices &amp; shower status via API integration coming soon.
                  </div>
                </div>
              )}

              {/* ─── Mission Stops ─── */}
              <div style={{ padding: '.9rem 1rem', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
                  <span style={{ fontSize: 'var(--cc-meta)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>
                    Mission Stops
                    {mission && (
                      <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>
                        — {mission.loadNumber || 'Active Load'}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => setShowTripAddStop(true)}
                    disabled={!mission}
                    style={{
                      fontSize: '.72rem', fontWeight: 800, padding: '.28rem .7rem', borderRadius: 7,
                      border: '1px dashed rgba(0,232,176,.45)', background: 'rgba(0,232,176,.06)',
                      color: mission ? 'var(--primary)' : 'var(--muted)',
                      cursor: mission ? 'pointer' : 'not-allowed',
                    }}
                  >
                    + Add Stop
                  </button>
                </div>

                {mission ? (
                  mission.stops && mission.stops.length > 0 ? (
                    <StopTimeline
                      stops={mission.stops}
                      onComplete={id => updateStop(id, { completed: true, completedAt: new Date().toISOString() })}
                      onUndo={id => updateStop(id, { completed: false, completedAt: undefined })}
                      onAddStop={() => setShowTripAddStop(true)}
                    />
                  ) : (
                    <div style={{ fontSize: '.82rem', color: 'var(--muted)', textAlign: 'center', padding: '.75rem 0' }}>
                      No stops added yet.{' '}
                      <button
                        onClick={() => setShowTripAddStop(true)}
                        style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: '.82rem' }}
                      >
                        Add first stop →
                      </button>
                    </div>
                  )
                ) : (
                  <div style={{ fontSize: '.82rem', color: 'var(--muted)', textAlign: 'center', padding: '.75rem 0' }}>
                    No active mission. Accept a load to manage stops.
                  </div>
                )}
              </div>

              {/* Route Map */}
              <RouteMap
                origin={plan.origin}
                dest={plan.dest}
                stops={plan.stops.map(s => ({
                  type:     s.type,
                  label:    s.label,
                  location: s.location,
                  address:  s.address,
                  mi:       s.mi,
                  eta:      s.eta,
                }))}
                totalMiles={plan.total_miles}
              />

              {/* Actions */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'.65rem' }}>
                <button onClick={acceptLoad} style={{ ...S.btnPri, padding:'.85rem .5rem', textAlign:'center', background:'var(--success)', borderColor:'var(--success)', boxShadow:'0 3px 12px rgba(40,192,72,.25)', fontSize:'var(--text-xs)' }}>
                  ✅ Accept → Load Log
                </button>
                <button onClick={printSummary} style={{ ...S.btnPri, padding:'.85rem .5rem', textAlign:'center', fontSize:'var(--text-xs)', background:'linear-gradient(135deg,#0ea5e9,#0284c7)', borderColor:'#0284c7', boxShadow:'0 3px 12px rgba(14,165,233,.25)' }}>
                  📄 Summary / PDF
                </button>
                <button onClick={emailSummary} style={{ ...S.btnPri, padding:'.85rem .5rem', textAlign:'center', fontSize:'var(--text-xs)', background:'linear-gradient(135deg,#8b5cf6,#6d28d9)', borderColor:'#6d28d9', boxShadow:'0 3px 12px rgba(109,40,217,.25)' }}>
                  ✉ Email Summary
                </button>
              </div>
              <button onClick={copyFullPlan} style={{ ...S.btn, padding:'.65rem', textAlign:'center', fontSize:'var(--text-xs)', width:'100%' }}>
                📋 Copy full plan to clipboard
              </button>

            </div>
          )}
        </div>
      </main>
    </>
  )
}
