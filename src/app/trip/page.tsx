'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '@/components/layout/TopBar'

// ─── Types ──────────────────────────────────────────────────────────────────
type InputTab = 'form' | 'paste' | 'file'
type StopType = 'start' | 'delivery' | 'fuel' | 'break30' | 'rest10' | 'stretch' | 'pet'

type VehicleSetup = {
  truckNum: string; year: string; make: string; model: string
  vin: string; hp: string
  mpgLoaded: number; mpgEmpty: number; tankGal: number; fuelPrice: number
  truckHeight: number; trailerNum: string; trailerType: string
  trailerLen: number; trailerHeight: number; axles: string
  maxWeight: number; gvwr: number; cdlClass: string; endorsements: string
}
type TripOpts = { pet: boolean; team: boolean; haz: boolean }
type LegalCheck = { label: string; val: string; legal: string; ok: boolean; warn: boolean }
type HOSStop = {
  type: StopType; icon: string; color: string; label: string
  location: string; address?: string; eta: string; dur: string; mi: number
  hosStr: string; note: string; tag?: string
}
type TruckerPathStop = {
  order: number; typeLabel: string; icon: string
  name: string; address: string; eta: string; mi: number; tag?: string
}
type TripPlan = {
  stops: HOSStop[]; warnings: string[]
  hos_compliant: boolean; total_miles: number
  drive_time: string; trip_time: string; eta: string
  fuel_cost: number; est_pay: number; net: number; cpm: number
  origin: string; dest: string; loadNum: string; broker: string
  commodity: string; weight: number; deadhead: number; deadheadCost: number
  legalChecks: LegalCheck[] | null; depart_display: string
  truckerPath: TruckerPathStop[]
}
type ParsedFields = {
  origin?: string; dest?: string; miles?: string; loadNum?: string
  cpm?: string; weight?: string; broker?: string; commodity?: string; depart?: string
}

// ─── Constants ───────────────────────────────────────────────────────────────
const SAVED_LANES = [
  { label: 'Amargosa → Walmart DC Sparks', origin: 'Amargosa Valley, NV', dest: 'Walmart DC Sparks, NV', miles: 335 },
  { label: 'PetSmart DC41 → Spice Island', origin: 'PetSmart DC41, McCarran, NV', dest: 'Spice Island / Star Yard, Sparks, NV', miles: 20 },
]
const LEGAL_LIMITS = { maxHeight: 13.5, maxLength: 53, grossWeight: 80000 }
type FuelStopDef = { name: string; loc: string; address: string; range: [number, number] }
const NV_FUEL_STOPS: FuelStopDef[] = [
  { name: "Love's #478", loc: 'Tonopah, NV', address: '1170 US-95, Tonopah, NV 89049', range: [70, 100] },
  { name: "Love's #255", loc: 'Winnemucca, NV', address: '4844 W Winnemucca Blvd, Winnemucca, NV 89445', range: [200, 240] },
  { name: 'Pilot Flying J #347', loc: 'Battle Mountain, NV', address: '650 W Front St, Battle Mountain, NV 89820', range: [245, 275] },
  { name: 'TA Travel Center #188', loc: 'Fernley, NV', address: '1451 Newlands Dr E, Fernley, NV 89408', range: [280, 300] },
  { name: 'Petro Iron Skillet', loc: 'Sparks, NV', address: '1015 Greg St, Sparks, NV 89431', range: [320, 350] },
  { name: 'Pilot Flying J', loc: 'Las Vegas, NV', address: '5390 Boulder Hwy, Las Vegas, NV 89122', range: [120, 145] },
]
const DEFAULT_VEHICLE: VehicleSetup = {
  truckNum: '', year: '', make: '', model: '', vin: '', hp: '',
  mpgLoaded: 6.2, mpgEmpty: 8.0, tankGal: 120, fuelPrice: 3.85,
  truckHeight: 13.5, trailerNum: '', trailerType: '53dry',
  trailerLen: 53, trailerHeight: 13.5, axles: '5',
  maxWeight: 80000, gvwr: 80000, cdlClass: 'A', endorsements: '',
}

// ─── HOS Engine ──────────────────────────────────────────────────────────────
function fmtD(m: number) {
  return m < 60 ? `${Math.round(m)}m` : `${Math.floor(m / 60)}h${Math.round(m % 60) > 0 ? ` ${Math.round(m % 60)}m` : ''}`
}
function fmtMinsToTime(m: number) {
  const norm = ((m % 1440) + 1440) % 1440
  const h = Math.floor(norm / 60), min = Math.floor(norm % 60)
  const ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12
  return `${h12}:${String(min).padStart(2, '0')} ${ap}`
}
function hosLabel(hosMin: number) {
  return `${Math.floor(hosMin / 60)}h ${Math.round(hosMin % 60)}m / 11h`
}
function getFuelStop(mi: number): { label: string; address: string } {
  const m = NV_FUEL_STOPS.find(s => mi >= s.range[0] && mi <= s.range[1])
  return m
    ? { label: `${m.name} — ${m.loc}`, address: m.address }
    : { label: `Mile ~${Math.round(mi)} — verify on Trucker Path`, address: '' }
}

function buildHOSPlan(inputs: {
  origin: string; dest: string; totalMiles: number; departMin: number; cpm: number
  hasPet: boolean; vehicle: VehicleSetup | null
}): TripPlan {
  const { origin, dest, totalMiles, departMin, cpm, hasPet, vehicle } = inputs
  const mpg = vehicle?.mpgLoaded ?? 6.2
  const fuelPrice = vehicle?.fuelPrice ?? 3.85
  const tankGal = vehicle?.tankGal ?? 120
  const AVG_SPEED = 58
  const mpm = 60 / AVG_SPEED

  const stops: HOSStop[] = []
  const warnings: string[] = []
  let clock = departMin, drive = 0, hos = 0, onDuty = 0, miles = 0
  let nextStretch = 120, nextPet = hasPet ? 120 : 999999

  const rangePerTank = tankGal * mpg
  const numFuel = Math.max(1, Math.ceil(totalMiles / (rangePerTank * 0.85)))
  const fuelMiles = Array.from({ length: numFuel }, (_, i) => Math.round(totalMiles / (numFuel + 1) * (i + 1)))

  stops.push({
    type: 'start', icon: '🚛', color: 'var(--primary)',
    label: 'Departure — Pre-trip inspection', location: origin,
    eta: fmtMinsToTime(clock), dur: '—', mi: 0, hosStr: '0h driving',
    note: 'Check lights, tires, brakes, fluids, cargo securement. Log on-duty not driving.',
  })

  while (miles < totalMiles) {
    const rem = totalMiles - miles
    const candidates = [
      nextStretch - drive, 480 - drive, 660 - hos, 840 - onDuty,
      hasPet ? (nextPet - drive) : 999999, rem * mpm,
    ].filter(x => x > 0)
    const dt = Math.min(...candidates)
    const dm = Math.min(dt / mpm, rem)
    miles += dm; clock += dt; drive += dt; hos += dt; onDuty += dt
    if (miles >= totalMiles - 0.5) break

    const fuelIdx = fuelMiles.findIndex(f => Math.abs(f - miles) < 15)
    if (fuelIdx !== -1) {
      fuelMiles.splice(fuelIdx, 1)
      const fs = getFuelStop(miles)
      stops.push({
        type: 'fuel', icon: '⛽', color: 'var(--warn)',
        label: '⛽ Fuel Stop', location: fs.label, address: fs.address,
        eta: fmtMinsToTime(clock), dur: '15–20 min', mi: Math.round(miles), hosStr: hosLabel(hos),
        note: `Fill up. Check oil/coolant. Verify tire pressure. Price: ~$${fuelPrice.toFixed(3)}/gal.`,
      })
      clock += 18; onDuty += 18; continue
    }

    if (drive >= 480) {
      stops.push({
        type: 'break30', icon: '⏸', color: 'var(--error)',
        label: '⏸ Mandatory 30-min Break', location: `Mile ~${Math.round(miles)} — rest area or truck stop`,
        eta: fmtMinsToTime(clock), dur: '30 min', mi: Math.round(miles), hosStr: hosLabel(hos),
        note: 'FMCSA §395.3(a)(3): Required before 8 consecutive hours of driving. Log as off-duty or sleeper berth.',
        tag: 'DOT REQUIRED — log in ELD',
      })
      clock += 30; onDuty += 30; drive = 0; nextStretch = 120; if (hasPet) nextPet = 120; continue
    }
    if (hos >= 660) {
      warnings.push(`11-hour HOS limit reached at mile ~${Math.round(miles)}. 10-hr rest required.`)
      stops.push({
        type: 'rest10', icon: '🛑', color: 'var(--error)',
        label: '🛑 10-Hour Rest — 11h Driving Limit', location: `Mile ~${Math.round(miles)} — secure truck stop`,
        eta: fmtMinsToTime(clock), dur: '10 hrs minimum', mi: Math.round(miles), hosStr: '11h — LIMIT',
        note: 'FMCSA §395.3: 11 hours driving reached. Must rest 10 consecutive off-duty hours before driving again.',
        tag: 'HOS VIOLATION RISK',
      })
      clock += 600; hos = 0; drive = 0; onDuty = 0; nextStretch = 120; if (hasPet) nextPet = 120; continue
    }
    if (onDuty >= 840) {
      warnings.push(`14-hour on-duty window at mile ~${Math.round(miles)}.`)
      stops.push({
        type: 'rest10', icon: '🛑', color: 'var(--error)',
        label: '🛑 14-Hour Window Reached', location: `Mile ~${Math.round(miles)} — secure parking`,
        eta: fmtMinsToTime(clock), dur: '10 hrs minimum', mi: Math.round(miles), hosStr: '14h window — STOP',
        note: 'FMCSA §395.3(b): 14-hour on-duty window expired. No driving until 10-hr off-duty complete.',
        tag: '14-HR WINDOW EXPIRED',
      })
      clock += 600; hos = 0; drive = 0; onDuty = 0; nextStretch = 120; if (hasPet) nextPet = 120; continue
    }
    if (drive >= nextStretch) {
      stops.push({
        type: 'stretch', icon: '🚶', color: '#e8af34',
        label: '🚶 Stretch Break', location: `Mile ~${Math.round(miles)} — exit or rest area`,
        eta: fmtMinsToTime(clock), dur: '10–15 min', mi: Math.round(miles), hosStr: hosLabel(hos),
        note: 'Recommended every 2h: stretch, hydrate, walk the trailer. Quick visual inspection of cargo.',
      })
      clock += 12; onDuty += 12; nextStretch = drive + 120; if (hasPet) nextPet = drive + 60; continue
    }
    if (hasPet && drive >= nextPet) {
      stops.push({
        type: 'pet', icon: '🐾', color: '#fdab43',
        label: '🐾 Pet Break', location: `Mile ~${Math.round(miles)} — pet-friendly rest area`,
        eta: fmtMinsToTime(clock), dur: '15–20 min', mi: Math.round(miles), hosStr: hosLabel(hos),
        note: 'Walk, water, waste stop. Never leave pet in cab above 70°F ambient. Use rest areas with grass areas.',
      })
      clock += 20; onDuty += 20; nextPet = drive + 120; continue
    }
    break
  }

  const totalFuel = (totalMiles / mpg) * fuelPrice
  const estPay = totalMiles * cpm
  const driveMin = Math.round(totalMiles / AVG_SPEED * 60)
  const tripMin = clock - departMin

  stops.push({
    type: 'delivery', icon: '✅', color: 'var(--success)',
    label: '✅ Arrival — Delivery', location: dest,
    eta: fmtMinsToTime(clock), dur: '—', mi: totalMiles, hosStr: hosLabel(hos),
    note: 'Check in with guard shack. Document arrival time — detention clock starts if not unloaded in 2 hours. Get lumper receipt.',
  })

  // Build Trucker's Path stop list (only actionable stops — skip stretch breaks)
  const INCLUDE: StopType[] = ['start', 'fuel', 'break30', 'rest10', 'delivery']
  const truckerPath: TruckerPathStop[] = stops
    .filter(s => INCLUDE.includes(s.type))
    .map((s, i) => ({
      order: i + 1,
      typeLabel: s.type === 'start' ? 'ORIGIN' : s.type === 'delivery' ? 'DESTINATION'
        : s.type === 'fuel' ? 'FUEL STOP' : s.type === 'break30' ? 'MANDATORY 30-MIN BREAK' : '10-HR REST',
      icon: s.icon,
      name: s.location,
      address: s.address ?? '',
      eta: s.eta,
      mi: s.mi,
      tag: s.tag,
    }))

  return {
    stops, warnings, hos_compliant: warnings.length === 0,
    total_miles: totalMiles, drive_time: fmtD(driveMin), trip_time: fmtD(tripMin),
    eta: fmtMinsToTime(clock), fuel_cost: totalFuel, est_pay: estPay,
    net: estPay - totalFuel, cpm,
    origin, dest, loadNum: '', broker: '', commodity: '',
    weight: 0, deadhead: 0, deadheadCost: 0,
    legalChecks: null, depart_display: fmtMinsToTime(departMin),
    truckerPath,
  }
}

function checkLegal(vehicle: VehicleSetup, weight: number, hazmat: boolean): LegalCheck[] {
  const maxH = Math.max(vehicle.truckHeight, vehicle.trailerHeight)
  const checks: LegalCheck[] = [
    {
      label: 'Height', val: `${maxH}′`, legal: `${LEGAL_LIMITS.maxHeight}′ max`,
      ok: maxH <= LEGAL_LIMITS.maxHeight, warn: maxH > 13.0 && maxH <= LEGAL_LIMITS.maxHeight,
    },
    {
      label: 'Trailer length', val: `${vehicle.trailerLen}′`, legal: `${LEGAL_LIMITS.maxLength}′ max`,
      ok: vehicle.trailerLen <= LEGAL_LIMITS.maxLength, warn: false,
    },
  ]
  if (weight > 0) checks.push({
    label: 'Gross weight', val: `${weight.toLocaleString()} lbs`, legal: `${LEGAL_LIMITS.grossWeight.toLocaleString()} lbs max`,
    ok: weight <= LEGAL_LIMITS.grossWeight, warn: weight > 75000 && weight <= LEGAL_LIMITS.grossWeight,
  })
  if (hazmat) checks.push({ label: 'Hazmat routing', val: 'Active', legal: 'Restricted tunnels/routes', ok: false, warn: true })
  return checks
}

function extractFromText(txt: string): ParsedFields {
  const r: ParsedFields = {}
  const mi = txt.match(/(\d[\d,]+)\s*(loaded\s+)?miles?/i)
  if (mi) r.miles = mi[1].replace(/,/g, '')
  const ln = txt.match(/(?:load|order|load\s*#|order\s*#|ref\s*#)\s*[:#]?\s*([A-Z0-9\-]{4,20})/i)
  if (ln) r.loadNum = ln[1]
  const cp = txt.match(/\$?\s*([0-9]+\.[0-9]+)\s*(?:\/\s*mi|cpm|per\s+mile)/i)
  if (cp) r.cpm = cp[1]
  const wt = txt.match(/([\d,]+)\s*(?:lbs?|pounds?)/i)
  if (wt) r.weight = wt[1].replace(/,/g, '')
  for (const p of [/pickup\s*[:\-]\s*([^\n;—]+(?:,\s*[A-Z]{2})?)/i, /from\s*[:\-]?\s*([^\n;—]+(?:,\s*[A-Z]{2})?)/i, /origin\s*[:\-]\s*([^\n;—]+)/i]) {
    const m = txt.match(p); if (m) { r.origin = m[1].trim(); break }
  }
  for (const p of [/deliver(?:y|to)?\s*[:\-]\s*([^\n;—]+(?:,\s*[A-Z]{2})?)/i, /to\s*[:\-]?\s*([^\n;—]+(?:,\s*[A-Z]{2})?)/i, /destination\s*[:\-]\s*([^\n;—]+)/i]) {
    const m = txt.match(p); if (m) { r.dest = m[1].trim(); break }
  }
  const brk = txt.match(/(?:broker|carrier|shipper)\s*[:\-]\s*([^\n]{2,40})/i)
  if (brk) r.broker = brk[1].trim()
  const com = txt.match(/(?:commodity|freight|cargo|product)\s*[:\-]\s*([^\n]{2,50})/i)
  if (com) r.commodity = com[1].trim()
  const tm = txt.match(/(?:pickup\s+time|depart|departure)[:\s]+(\d{1,2}:\d{2}\s*[ap]m?|\d{1,2}\s*[ap]m)/i)
  if (tm) {
    const hm = tm[1].trim().toLowerCase().match(/(\d{1,2}):?(\d{2})?\s*([ap]m?)/)
    if (hm) {
      let h = parseInt(hm[1]); const m = hm[2] || '00'
      if (hm[3] === 'pm' && h < 12) h += 12; if (hm[3] === 'am' && h === 12) h = 0
      r.depart = `${String(h).padStart(2, '0')}:${m}`
    }
  }
  return r
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: '100%', padding: '.55rem .85rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 'var(--text-sm)', outline: 'none' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }
const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.2rem', boxShadow: '0 2px 8px rgba(0,0,0,.2)' }
const secLabel: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--primary)', paddingBottom: '.5rem', borderBottom: '1px solid var(--border)', marginBottom: '.9rem' }
const btn: React.CSSProperties = { padding: '.6rem 1rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 700, fontSize: 'var(--text-xs)', cursor: 'pointer' }
const btnPrimary: React.CSSProperties = { ...btn, background: 'var(--primary)', color: '#fff', border: '1px solid var(--primary)', boxShadow: '0 3px 12px rgba(79,152,163,.35)' }
const fmtMoney = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ─── Component ────────────────────────────────────────────────────────────────
export default function TripPlanner() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Input state
  const [inputTab, setInputTab] = useState<InputTab>('form')
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [miles, setMiles] = useState('')
  const [depart, setDepart] = useState('07:00')
  const [loadNum, setLoadNum] = useState('')
  const [broker, setBroker] = useState('')
  const [commodity, setCommodity] = useState('')
  const [weight, setWeight] = useState('')
  const [cpm, setCpm] = useState('0.55')
  const [deadhead, setDeadhead] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [filePreview, setFilePreview] = useState<ParsedFields | null>(null)
  const [fileName, setFileName] = useState('')

  // App state
  const [opts, setOpts] = useState<TripOpts>({ pet: false, team: false, haz: false })
  const [vehicle, setVehicle] = useState<VehicleSetup | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [vForm, setVForm] = useState<VehicleSetup>(DEFAULT_VEHICLE)
  const [plan, setPlan] = useState<TripPlan | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('3b-vehicle')
      if (raw) { const v = JSON.parse(raw); setVehicle(v); setVForm(v) }
    } catch { /* ignore */ }
  }, [])

  const fillForm = useCallback((f: ParsedFields) => {
    if (f.origin) setOrigin(f.origin)
    if (f.dest) setDest(f.dest)
    if (f.miles) setMiles(f.miles)
    if (f.loadNum) setLoadNum(f.loadNum)
    if (f.cpm) setCpm(f.cpm)
    if (f.weight) setWeight(f.weight)
    if (f.broker) setBroker(f.broker)
    if (f.commodity) setCommodity(f.commodity)
    if (f.depart) setDepart(f.depart)
  }, [])

  const buildPlan = useCallback(() => {
    const totalMiles = parseFloat(miles)
    if (!origin || !dest || !totalMiles) return
    const [dh, dm] = depart.split(':').map(Number)
    const p = buildHOSPlan({
      origin, dest, totalMiles, departMin: dh * 60 + (dm || 0),
      cpm: parseFloat(cpm) || 0.55, hasPet: opts.pet, vehicle,
    })
    p.loadNum = loadNum; p.broker = broker; p.commodity = commodity
    p.weight = parseFloat(weight) || 0; p.deadhead = parseFloat(deadhead) || 0
    p.deadheadCost = p.deadhead * p.cpm
    p.legalChecks = vehicle ? checkLegal(vehicle, p.weight, opts.haz) : null

    // Build depart ISO for localStorage
    const today = new Date().toISOString().slice(0, 10)
    const departISO = `${today}T${depart}:00`
    const arriveMin = (dh * 60 + (dm || 0)) + Math.round((totalMiles / 58) * 60)
    const arriveH = Math.floor(((arriveMin % 1440) + 1440) % 1440 / 60)
    const arriveM = Math.floor(((arriveMin % 1440) + 1440) % 1440 % 60)
    const arriveDate = new Date(departISO)
    arriveDate.setHours(arriveH, arriveM, 0, 0)
    if (arriveDate < new Date(departISO)) arriveDate.setDate(arriveDate.getDate() + 1)
    localStorage.setItem('3b-active-trip', JSON.stringify({
      origin: { query: origin }, destination: { query: dest },
      totalMiles, departTime: departISO, estArrival: arriveDate.toISOString(),
      estDriveHours: (totalMiles / 58).toFixed(1), loadNumber: loadNum || null,
      stops: p.stops.filter(s => s.type === 'fuel').map(s => ({
        name: s.location, city: '', state: '', miFromOrigin: s.mi,
        eta: arriveDate.toISOString(), stopType: s.type, diesel: null,
        showers: null, recommended: false,
      })),
    }))
    setPlan(p)
  }, [origin, dest, miles, depart, cpm, loadNum, broker, commodity, weight, deadhead, opts, vehicle])

  const handleParsePaste = () => {
    const f = extractFromText(pasteText)
    fillForm(f); setInputTab('form'); buildPlan()
  }

  const handleFile = (text: string, name: string) => {
    const f = extractFromText(text)
    setFilePreview(f); setFileName(name)
  }

  const handleSaveVehicle = () => {
    setVehicle(vForm)
    localStorage.setItem('3b-vehicle', JSON.stringify(vForm))
    setShowModal(false)
  }

  const pushToLoadLog = () => {
    if (!plan) return
    const params = new URLSearchParams({
      origin: plan.origin, destination: plan.dest,
      loadNumber: plan.loadNum, broker: plan.broker,
      dispatchMiles: String(plan.total_miles),
      cpmRate: String(plan.cpm),
    })
    router.push(`/loads?new=1&${params}`)
  }

  const copyPlan = () => {
    if (!plan) return
    const txt = [
      '3B FLEET COMMANDER — TRIP PLAN',
      '━'.repeat(40),
      `${plan.origin} → ${plan.dest}`,
      `Load #: ${plan.loadNum || '—'} | Broker: ${plan.broker || '—'}`,
      `Miles: ${plan.total_miles} | Drive: ${plan.drive_time} | ETA: ${plan.eta}`,
      `Est. pay: ${fmtMoney(plan.est_pay)} | Fuel: ${fmtMoney(plan.fuel_cost)} | Net: ${fmtMoney(plan.net)}`,
      `HOS: ${plan.hos_compliant ? '✓ Compliant' : '⚠ Warnings'}`,
      '', 'TIMELINE:',
      ...plan.stops.map(s => `  ${s.eta.padEnd(10)} ${s.label.padEnd(35)} ${s.location}`),
      '', plan.warnings.length ? 'WARNINGS:\n' + plan.warnings.map(w => '  ⚠ ' + w).join('\n') : 'No HOS warnings.',
    ].join('\n')
    navigator.clipboard.writeText(txt)
  }

  const copyTruckerPath = () => {
    if (!plan?.truckerPath.length) return
    const lines = [
      "TRUCKER'S PATH / GPS STOP PLAN",
      `${plan.origin} → ${plan.dest}`,
      `${plan.total_miles} miles · Depart ${plan.depart_display} · ETA ${plan.eta}`,
      plan.loadNum ? `Load #${plan.loadNum}` : '',
      '━'.repeat(44),
      '',
      ...plan.truckerPath.map(s => [
        `STOP ${s.order}: ${s.typeLabel}`,
        `  Name:    ${s.name}`,
        s.address ? `  Address: ${s.address}` : '',
        `  ETA:     ${s.eta}  |  Mile: ${s.mi}`,
        s.tag ? `  ⚠ ${s.tag}` : '',
        '',
      ].filter(l => l !== '').join('\n')),
      '━'.repeat(44),
      'Generated by 3B Fleet Commander',
    ].filter(l => l !== '').join('\n')
    navigator.clipboard.writeText(lines)
  }

  const vehLabel = vehicle
    ? `${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Truck'} · #${vehicle.truckNum || '—'}`
    : null

  return (
    <>
      {/* Vehicle setup modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '1.6rem', width: '100%', maxWidth: 620, maxHeight: '90dvh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.5)', display: 'grid', gap: '.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 'var(--text-lg)' }}>Truck &amp; Trailer Setup</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 3 }}>Used for legal route verification, fuel calc, and HOS planning</div>
              </div>
              <button onClick={() => setShowModal(false)} style={btn}>✕</button>
            </div>

            <div style={secLabel}>Tractor</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              {([['Truck number', 'truckNum', 'text', 'e.g. T-001'], ['Year', 'year', 'number', 'e.g. 2022']] as [string, keyof VehicleSetup, string, string][]).map(([label, key, type, ph]) => (
                <div key={key}><label style={lbl}>{label}</label>
                  <input style={inp} type={type} placeholder={ph} value={String(vForm[key])} onChange={e => setVForm(p => ({ ...p, [key]: type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value }))} /></div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <div><label style={lbl}>Make</label>
                <select style={inp} value={vForm.make} onChange={e => setVForm(p => ({ ...p, make: e.target.value }))}>
                  <option value="">Select make</option>
                  {['Peterbilt', 'Kenworth', 'Freightliner', 'International', 'Mack', 'Volvo', 'Western Star', 'Other'].map(m => <option key={m}>{m}</option>)}
                </select></div>
              <div><label style={lbl}>Model</label><input style={inp} placeholder="e.g. 389, T680" value={vForm.model} onChange={e => setVForm(p => ({ ...p, model: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.75rem' }}>
              {([['Avg MPG (loaded)', 'mpgLoaded', '0.1'], ['Avg MPG (empty)', 'mpgEmpty', '0.1'], ['Fuel tank (gal)', 'tankGal', '1']] as [string, keyof VehicleSetup, string][]).map(([label, key, step]) => (
                <div key={key}><label style={lbl}>{label}</label>
                  <input style={inp} type="number" step={step} value={String(vForm[key])} onChange={e => setVForm(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))} /></div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <div><label style={lbl}>Fuel price ($/gal)</label><input style={inp} type="number" step="0.01" value={vForm.fuelPrice} onChange={e => setVForm(p => ({ ...p, fuelPrice: parseFloat(e.target.value) || 3.85 }))} /></div>
              <div><label style={lbl}>Truck height (ft)</label><input style={inp} type="number" step="0.1" value={vForm.truckHeight} onChange={e => setVForm(p => ({ ...p, truckHeight: parseFloat(e.target.value) || 13.5 }))} /></div>
            </div>

            <div style={{ ...secLabel, marginTop: '.5rem' }}>Trailer</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <div><label style={lbl}>Trailer number</label><input style={inp} placeholder="e.g. 260692" value={vForm.trailerNum} onChange={e => setVForm(p => ({ ...p, trailerNum: e.target.value }))} /></div>
              <div><label style={lbl}>Trailer type</label>
                <select style={inp} value={vForm.trailerType} onChange={e => setVForm(p => ({ ...p, trailerType: e.target.value }))}>
                  {[['53dry', "53' Dry Van"], ['48dry', "48' Dry Van"], ['53reefer', "53' Reefer"], ['flatbed', 'Flatbed'], ['stepdeck', 'Step Deck'], ['lowboy', 'Lowboy'], ['tanker', 'Tanker'], ['doubles', 'Doubles/Pups']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.75rem' }}>
              <div><label style={lbl}>Trailer length (ft)</label><input style={inp} type="number" value={vForm.trailerLen} onChange={e => setVForm(p => ({ ...p, trailerLen: parseFloat(e.target.value) || 53 }))} /></div>
              <div><label style={lbl}>Trailer height (ft)</label><input style={inp} type="number" step="0.1" value={vForm.trailerHeight} onChange={e => setVForm(p => ({ ...p, trailerHeight: parseFloat(e.target.value) || 13.5 }))} /></div>
              <div><label style={lbl}>Axles</label>
                <select style={inp} value={vForm.axles} onChange={e => setVForm(p => ({ ...p, axles: e.target.value }))}>
                  {[['5', '5-axle (standard)'], ['6', '6-axle'], ['7', '7-axle'], ['3', '3-axle bobtail']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <div><label style={lbl}>Max legal weight (lbs)</label><input style={inp} type="number" value={vForm.maxWeight} onChange={e => setVForm(p => ({ ...p, maxWeight: parseFloat(e.target.value) || 80000 }))} /></div>
              <div><label style={lbl}>GVWR (lbs)</label><input style={inp} type="number" value={vForm.gvwr} onChange={e => setVForm(p => ({ ...p, gvwr: parseFloat(e.target.value) || 80000 }))} /></div>
            </div>

            <div style={{ ...secLabel, marginTop: '.5rem' }}>Licensing</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <div><label style={lbl}>CDL class</label>
                <select style={inp} value={vForm.cdlClass} onChange={e => setVForm(p => ({ ...p, cdlClass: e.target.value }))}>
                  <option value="A">Class A</option><option value="B">Class B</option>
                </select></div>
              <div><label style={lbl}>Endorsements</label><input style={inp} placeholder="e.g. H, N, T, X" value={vForm.endorsements} onChange={e => setVForm(p => ({ ...p, endorsements: e.target.value }))} /></div>
            </div>
            <button onClick={handleSaveVehicle} style={{ ...btnPrimary, padding: '.85rem', fontSize: 'var(--text-sm)', marginTop: '.5rem' }}>💾 Save truck &amp; trailer</button>
          </div>
        </div>
      )}

      <TopBar title="Trip Planner" module="ops"
        subtitle={vehLabel ?? 'Set up your truck for legal & fuel checks'} />

      <main style={{ display: 'grid', gridTemplateColumns: 'minmax(0,420px) 1fr', gap: '1.4rem', padding: '1.4rem', alignItems: 'start' }}>

        {/* ── LEFT: Input panel ── */}
        <div style={{ display: 'grid', gap: '.75rem' }}>
          {/* Truck setup button */}
          <button onClick={() => setShowModal(true)}
            style={{ ...btn, display: 'flex', alignItems: 'center', gap: 8, padding: '.7rem 1rem', borderRadius: 12, background: vehicle ? 'rgba(79,152,163,.08)' : 'var(--surface)', borderColor: vehicle ? 'rgba(79,152,163,.3)' : 'var(--border)' }}>
            <span style={{ fontSize: '1.3rem' }}>🚛</span>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800 }}>{vehicle ? vehLabel : 'Set up your truck'}</div>
              <div style={{ fontSize: '.65rem', color: 'var(--muted)' }}>{vehicle ? `${vehicle.trailerType} · ${vehicle.mpgLoaded} mpg · $${vehicle.fuelPrice}/gal` : 'Required for legal checks & fuel calculation'}</div>
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--primary)' }}>⚙ Edit</span>
          </button>

          {/* Input tabs */}
          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, gap: 2 }}>
            {(['form', 'paste', 'file'] as InputTab[]).map(t => (
              <button key={t} onClick={() => setInputTab(t)}
                style={{ flex: 1, padding: '.45rem', borderRadius: 8, fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', border: inputTab === t ? '1px solid var(--border)' : '1px solid transparent', background: inputTab === t ? 'var(--surface-2)' : 'transparent', color: inputTab === t ? 'var(--text)' : 'var(--muted)', cursor: 'pointer', boxShadow: inputTab === t ? '0 1px 4px rgba(0,0,0,.2)' : 'none' }}>
                {t === 'form' ? '📋 Route form' : t === 'paste' ? '📝 Paste text' : '📂 Upload file'}
              </button>
            ))}
          </div>

          {/* ── Form tab ── */}
          {inputTab === 'form' && (
            <>
              <div style={card}>
                <div style={secLabel}>Route Details</div>
                <div style={{ display: 'grid', gap: '.75rem' }}>
                  <div><label style={lbl}>Origin *</label><input style={inp} value={origin} onChange={e => setOrigin(e.target.value)} placeholder="Amargosa Valley, NV" /></div>
                  <div><label style={lbl}>Destination *</label><input style={inp} value={dest} onChange={e => setDest(e.target.value)} placeholder="Walmart DC Sparks, NV" /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
                    <div><label style={lbl}>Total miles *</label><input style={inp} type="number" value={miles} onChange={e => setMiles(e.target.value)} placeholder="335" /></div>
                    <div><label style={lbl}>Departure time</label><input style={inp} type="time" value={depart} onChange={e => setDepart(e.target.value)} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
                    <div><label style={lbl}>Load # / Order</label><input style={inp} value={loadNum} onChange={e => setLoadNum(e.target.value)} placeholder="0241482" /></div>
                    <div><label style={lbl}>Broker / Carrier</label><input style={inp} value={broker} onChange={e => setBroker(e.target.value)} placeholder="e.g. Walmart Fleet" /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
                    <div><label style={lbl}>Commodity</label><input style={inp} value={commodity} onChange={e => setCommodity(e.target.value)} placeholder="General merchandise" /></div>
                    <div><label style={lbl}>Load weight (lbs)</label><input style={inp} type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="42000" /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
                    <div><label style={lbl}>CPM rate ($)</label><input style={inp} type="number" step="0.01" value={cpm} onChange={e => setCpm(e.target.value)} /></div>
                    <div><label style={lbl}>Deadhead miles</label><input style={inp} type="number" value={deadhead} onChange={e => setDeadhead(e.target.value)} placeholder="0" /></div>
                  </div>
                </div>
              </div>

              <div style={card}>
                <div style={secLabel}>Driver Options</div>
                <div style={{ display: 'grid', gap: '.75rem' }}>
                  {([['pet', '🐾 Pet aboard — add pet breaks every 2h'], ['team', '👥 Team driving — split HOS'], ['haz', '⚠ Hazmat — restricted routes apply']] as [keyof TripOpts, string][]).map(([k, label]) => (
                    <label key={k} onClick={() => setOpts(p => ({ ...p, [k]: !p[k] }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
                      <div style={{ width: 40, height: 22, background: opts[k] ? 'var(--primary)' : 'var(--border)', borderRadius: 11, position: 'relative', flexShrink: 0, transition: 'background .18s' }}>
                        <div style={{ position: 'absolute', top: 3, left: opts[k] ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .18s', boxShadow: '0 1px 4px rgba(0,0,0,.4)' }} />
                      </div>
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div style={card}>
                <div style={secLabel}>Saved Lanes</div>
                <div style={{ display: 'grid', gap: '.5rem' }}>
                  {SAVED_LANES.map(l => (
                    <button key={l.label} onClick={() => { setOrigin(l.origin); setDest(l.dest); setMiles(String(l.miles)); setInputTab('form') }}
                      style={{ ...btn, textAlign: 'left', padding: '.6rem .85rem' }}>
                      <strong style={{ fontSize: 'var(--text-xs)' }}>{l.label}</strong>
                      <span style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)', marginLeft: 8 }}>{l.miles} mi</span>
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={buildPlan} style={{ ...btnPrimary, width: '100%', padding: '.85rem', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
                🗺 Build trip plan
              </button>
            </>
          )}

          {/* ── Paste tab ── */}
          {inputTab === 'paste' && (
            <div style={card}>
              <div style={secLabel}>Paste dispatch info</div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: '.85rem', lineHeight: 1.65 }}>
                Paste anything — load board text, dispatch message, rate confirmation, broker email. Extracts origin, destination, miles, and load number.
              </p>
              <textarea style={{ ...inp, resize: 'vertical', minHeight: 180, lineHeight: 1.6 }} value={pasteText} onChange={e => setPasteText(e.target.value)}
                placeholder={'Example:\nLoad #0241482\nPickup: Amargosa Valley, NV — 6:00 AM\nDeliver: Walmart DC Sparks, NV\n335 loaded miles\nRate: $0.55/mi'} />
              <button onClick={handleParsePaste} style={{ ...btnPrimary, width: '100%', padding: '.75rem', marginTop: '.75rem' }}>Parse &amp; build plan →</button>
            </div>
          )}

          {/* ── File tab ── */}
          {inputTab === 'file' && (
            <div style={card}>
              <div style={secLabel}>Upload load file</div>
              <input ref={fileInputRef} type="file" accept=".txt,.md,.csv" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => handleFile(ev.target?.result as string, f.name); r.readAsText(f) }} />
              <div onClick={() => fileInputRef.current?.click()} style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '1.5rem', textAlign: 'center', cursor: 'pointer', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📂</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Drop or click to upload<br /><strong>.txt · .md · .csv</strong><br />Rate con, dispatch sheet, route notes</div>
              </div>
              {filePreview && (
                <div style={{ marginTop: '.75rem' }}>
                  <div style={secLabel}>Extracted from {fileName}</div>
                  {Object.entries({ Origin: filePreview.origin, Destination: filePreview.dest, Miles: filePreview.miles, 'Load #': filePreview.loadNum, CPM: filePreview.cpm ? `$${filePreview.cpm}` : undefined, Weight: filePreview.weight ? `${Number(filePreview.weight).toLocaleString()} lbs` : undefined }).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '.3rem 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{k}</span>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: v ? 'var(--text)' : 'var(--faint)' }}>{v || 'Not found'}</span>
                    </div>
                  ))}
                  <button onClick={() => { fillForm(filePreview); setInputTab('form'); buildPlan() }} style={{ ...btnPrimary, width: '100%', padding: '.75rem', marginTop: '.75rem' }}>Build plan from file →</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: Output panel ── */}
        <div>
          {!plan ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 440, gap: '1rem', color: 'var(--muted)', textAlign: 'center' }}>
              <div style={{ fontSize: '3.5rem' }}>🗺</div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text)' }}>Plan your route</div>
              <div style={{ fontSize: 'var(--text-sm)', maxWidth: 360, lineHeight: 1.65 }}>Enter your route details or paste dispatch info. Builds a DOT-compliant timeline with HOS breaks, fuel stops, legal weight/height checks, and full profit analysis.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '1.2rem' }}>

              {/* Route header */}
              <div style={{ ...card, background: 'linear-gradient(135deg,var(--surface-2),var(--surface))' }}>
                <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>
                      {plan.loadNum ? `Load #${plan.loadNum} · ` : ''}{plan.broker}{plan.commodity ? ` · ${plan.commodity}` : ''}
                    </div>
                    <div style={{ fontWeight: 900, fontSize: 'var(--text-lg)', letterSpacing: '-.02em' }}>{plan.origin}</div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', margin: '.25rem 0' }}>↓ {plan.total_miles} miles · {plan.drive_time} drive · {plan.trip_time} trip</div>
                    <div style={{ fontWeight: 900, fontSize: 'var(--text-lg)', letterSpacing: '-.02em' }}>{plan.dest}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>ETA</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>{plan.eta}</div>
                    <div style={{ marginTop: 6, padding: '.3rem .65rem', borderRadius: 6, display: 'inline-block', fontSize: 'var(--text-xs)', fontWeight: 800, background: plan.hos_compliant ? 'rgba(109,170,69,.12)' : 'rgba(221,105,116,.12)', color: plan.hos_compliant ? 'var(--success)' : 'var(--error)' }}>
                      {plan.hos_compliant ? '✓ DOT Compliant' : '⚠ HOS Warnings'}
                    </div>
                  </div>
                </div>
              </div>

              {/* KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(140px,100%),1fr))', gap: '.75rem' }}>
                {[
                  ['Total miles', String(plan.total_miles), ''],
                  ['ETA arrival', plan.eta, 'var(--primary)'],
                  ['Est. pay', fmtMoney(plan.est_pay), 'var(--success)'],
                  ['Fuel cost', fmtMoney(plan.fuel_cost), 'var(--warn)'],
                  ...(plan.deadhead > 0 ? [['Deadhead cost', fmtMoney(plan.deadheadCost), 'var(--warn)']] as [string, string, string][] : []),
                  ['Net (fuel out)', fmtMoney(plan.net), plan.net > 0 ? 'var(--success)' : 'var(--error)'],
                  ['CPM rate', `$${plan.cpm.toFixed(3)}`, ''],
                  ['Drive time', plan.drive_time, ''],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '.85rem' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }}>{label}</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: color || 'var(--text)' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Profitability meter */}
              {(() => {
                const score = Math.min(100, Math.max(0, (plan.net / plan.est_pay) * 100))
                const color = score > 70 ? 'var(--success)' : score > 40 ? 'var(--warn)' : 'var(--error)'
                const label = score > 70 ? '🟢 Strong' : score > 40 ? '🟡 Average' : '🔴 Weak'
                return (
                  <div style={card}>
                    <div style={secLabel}>Profitability Score</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{label}</span>
                      <span style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color }}>{Math.round(score)}%</span>
                    </div>
                    <div style={{ height: 10, borderRadius: 5, background: 'var(--surface-2)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 5, transition: 'width .5s cubic-bezier(.16,1,.3,1)' }} />
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: '.6rem' }}>
                      Net margin after fuel: {fmtMoney(plan.net)} on {fmtMoney(plan.est_pay)} gross
                      {plan.deadhead > 0 ? ` · Deadhead adds ${fmtMoney(plan.deadheadCost)} cost` : ''}
                    </div>
                  </div>
                )
              })()}

              {/* HOS warnings */}
              {plan.warnings.length > 0 && (
                <div style={{ background: 'rgba(221,105,116,.08)', border: '1px solid rgba(221,105,116,.2)', borderRadius: 12, padding: '.9rem 1rem' }}>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: 'var(--error)', marginBottom: '.4rem' }}>⚠ HOS Warnings</div>
                  {plan.warnings.map((w, i) => <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--error)', opacity: .85, lineHeight: 1.6 }}>• {w}</div>)}
                </div>
              )}

              {/* Legal checks */}
              {plan.legalChecks && (
                <div style={card}>
                  <div style={secLabel}>Legal Route Check</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem' }}>
                    {plan.legalChecks.map(c => (
                      <div key={c.label} style={{ background: c.ok && !c.warn ? 'rgba(109,170,69,.08)' : c.warn ? 'rgba(253,171,67,.08)' : 'rgba(221,105,116,.08)', border: `1px solid ${c.ok && !c.warn ? 'rgba(109,170,69,.2)' : c.warn ? 'rgba(253,171,67,.2)' : 'rgba(221,105,116,.2)'}`, borderRadius: 10, padding: '.75rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>{c.ok && !c.warn ? '✅' : c.warn ? '⚠️' : '🚫'}</div>
                        <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: c.ok && !c.warn ? 'var(--success)' : c.warn ? 'var(--warn)' : 'var(--error)' }}>{c.val}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>{c.label}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--faint)', marginTop: 2 }}>{c.legal}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div style={card}>
                <div style={secLabel}>DOT-Compliant Route Timeline</div>
                <div>
                  {plan.stops.map((s, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '78px 30px 1fr', gap: '.65rem', position: 'relative' }}>
                      <div style={{ textAlign: 'right', paddingTop: 2 }}>
                        <div style={{ fontWeight: 800, fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums', color: s.type === 'rest10' || s.type === 'break30' ? 'var(--error)' : 'var(--text)' }}>{s.eta}</div>
                        {s.dur !== '—' && s.dur && <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>{s.dur}</div>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: s.color, display: 'grid', placeItems: 'center', fontSize: '.85rem', flexShrink: 0, boxShadow: `0 0 0 3px var(--bg, #0f0e0d)` }}>{s.icon}</div>
                        {i < plan.stops.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 14, background: s.color, opacity: .25, marginTop: 3 }} />}
                      </div>
                      <div style={{ paddingBottom: '1.1rem', borderBottom: i < plan.stops.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontWeight: 800, fontSize: 'var(--text-xs)', color: s.type === 'rest10' || s.type === 'break30' ? 'var(--error)' : s.type === 'delivery' ? 'var(--success)' : 'var(--text)' }}>{s.label}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--primary)', margin: '2px 0 5px' }}>{s.location}</div>
                        <div style={{ fontSize: '.68rem', color: 'var(--muted)', lineHeight: 1.55 }}>{s.note}</div>
                        {s.tag && <span style={{ display: 'inline-block', marginTop: 5, padding: '.2rem .55rem', borderRadius: 5, fontSize: '.62rem', fontWeight: 700, background: 'rgba(221,105,116,.1)', color: 'var(--error)', border: '1px solid rgba(221,105,116,.2)' }}>{s.tag}</span>}
                        <div style={{ fontSize: '.62rem', color: 'var(--faint)', marginTop: 5 }}>HOS: {s.hosStr} · Mile {s.mi}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trucker's Path / GPS Setup */}
              {plan.truckerPath.length > 0 && (
                <div style={{ ...card, border: '1px solid rgba(79,152,163,.25)', background: 'linear-gradient(135deg,rgba(79,152,163,.04),var(--surface))' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '.5rem', borderBottom: '1px solid var(--border)', marginBottom: '.9rem' }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--primary)' }}>
                      🗺 Trucker&#39;s Path / GPS Stop Plan
                    </div>
                    <button onClick={copyTruckerPath} style={{ ...btn, padding: '.35rem .75rem', fontSize: '.65rem', letterSpacing: '.04em' }}>
                      📋 Copy for GPS
                    </button>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: '.85rem', lineHeight: 1.55 }}>
                    Tap &ldquo;Copy for GPS&rdquo; to paste into Trucker&#39;s Path, Google Maps, or any navigation app. Actionable stops only — stretch breaks excluded.
                  </div>
                  <div style={{ display: 'grid', gap: '.55rem' }}>
                    {plan.truckerPath.map(s => (
                      <div key={s.order} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: '.6rem', alignItems: 'start', background: 'var(--surface-2)', borderRadius: 10, padding: '.65rem .85rem', border: s.tag ? '1px solid rgba(221,105,116,.2)' : '1px solid var(--border)' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: s.typeLabel === 'DESTINATION' ? 'var(--success)' : s.typeLabel === 'ORIGIN' ? 'var(--primary)' : s.typeLabel.includes('REST') ? 'var(--error)' : s.typeLabel.includes('BREAK') ? 'rgba(221,105,116,.7)' : 'var(--warn)', display: 'grid', placeItems: 'center', fontSize: '.8rem', flexShrink: 0 }}>
                          {s.icon}
                        </div>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.5rem', marginBottom: 2 }}>
                            <div>
                              <span style={{ fontSize: '.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', marginRight: 5 }}>Stop {s.order}</span>
                              <span style={{ fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: s.typeLabel === 'DESTINATION' ? 'var(--success)' : s.typeLabel === 'ORIGIN' ? 'var(--primary)' : s.tag ? 'var(--error)' : 'var(--text)' }}>{s.typeLabel}</span>
                            </div>
                            <span style={{ fontSize: '.6rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{s.eta} · mi {s.mi}</span>
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--text)', lineHeight: 1.4 }}>{s.name}</div>
                          {s.address && (
                            <div style={{ fontSize: '.65rem', color: 'var(--primary)', marginTop: 2, fontStyle: 'italic' }}>{s.address}</div>
                          )}
                          {s.tag && <span style={{ display: 'inline-block', marginTop: 4, padding: '.18rem .5rem', borderRadius: 4, fontSize: '.58rem', fontWeight: 700, background: 'rgba(221,105,116,.1)', color: 'var(--error)', border: '1px solid rgba(221,105,116,.2)' }}>{s.tag}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '.75rem', padding: '.5rem .75rem', background: 'rgba(79,152,163,.06)', borderRadius: 8, fontSize: '.65rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                    💡 Addresses are real NV corridor stops. Verify availability in app before departure. API integration coming soon for live fuel prices &amp; shower availability.
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
                <button onClick={pushToLoadLog} style={{ ...btnPrimary, padding: '.85rem', textAlign: 'center', background: 'var(--success)', borderColor: 'var(--success)', boxShadow: '0 3px 12px rgba(109,170,69,.3)' }}>
                  ✅ Accept — push to Load Log
                </button>
                <button onClick={copyPlan} style={{ ...btn, padding: '.85rem', textAlign: 'center' }}>
                  📋 Copy plan text
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
