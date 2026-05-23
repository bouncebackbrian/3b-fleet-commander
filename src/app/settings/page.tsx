'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import TopBar from '@/components/layout/TopBar'
import { loadSettings, persistSettings, DEFAULT_SETTINGS, type AppSettings } from '@/lib/settings'
import { createClient } from '@/lib/supabase-browser'
import { logTimelineEvent } from '@/lib/timeline'
import { readUserMode, MODE_CONFIG, type UserMode } from '@/lib/userMode'
import UserModeSelectorSheet from '@/components/layout/UserModeSelectorSheet'

// ── Compliance doc types ───────────────────────────────────────────────────────
type LicenseScan = {
  full_name: string | null; address: string | null; city: string | null
  state: string | null; zip: string | null; dob: string | null
  cdl_number: string | null; cdl_class: string | null
  endorsements: string | null; restrictions: string | null
  issued_state: string | null; expiry: string | null; scannedAt: string
}
type RegistrationScan = {
  vin: string | null; year: string | null; make: string | null; model: string | null
  plate: string | null; plate_state: string | null; owner_name: string | null
  owner_address: string | null; expiry: string | null
  registered_weight: number | null; scannedAt: string
}
type InsuranceScan = {
  policy_number: string | null; insurer: string | null
  effective: string | null; expiry: string | null
  named_insured: string | null; vin: string | null
  coverage_type: string | null; coverage_limit: string | null
  agent_name: string | null; agent_phone: string | null; scannedAt: string
}
type MedicalCardScan = {
  card_number: string | null; examiner_name: string | null; examiner_npi: string | null
  examiner_address: string | null; issued: string | null; expiry: string | null
  driver_name: string | null; dob: string | null; restrictions: string | null
  vision_waiver: boolean; hearing_waiver: boolean; skill_performance: boolean; scannedAt: string
}
type ComplianceDocs = { license?: LicenseScan; registration?: RegistrationScan; insurance?: InsuranceScan; medical?: MedicalCardScan }

// ── Deadhead / empty-trailer log ───────────────────────────────────────────────
type DeadheadEntry = {
  id: string; type: 'bobtail' | 'empty'; date: string
  miles: number | null; duration_hrs: number | null; notes: string
}
const DH_KEY = '3b-deadhead-log'

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  return Math.floor(diff / 86_400_000)
}
function expiryColor(days: number | null): string {
  if (days === null) return 'var(--muted)'
  if (days < 0)    return 'var(--error)'
  if (days < 30)   return 'var(--error)'
  if (days < 90)   return 'var(--warn)'
  return 'var(--success)'
}
function expiryLabel(days: number | null, iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (days === null) return date
  if (days < 0)    return `EXPIRED ${Math.abs(days)}d ago · ${date}`
  if (days === 0)  return `Expires TODAY · ${date}`
  return `${days}d · ${date}`
}

// ── shared styles ──────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', padding: '.75rem 1rem', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  // iOS Safari: must be ≥16px or the browser auto-zooms → maximum-scale=1 blocks
  // the zoom → keyboard never opens. 'max(1rem,16px)' is the safe floor.
  color: 'var(--text)', fontSize: 'max(1rem,16px)', outline: 'none', boxSizing: 'border-box',
}

// ── Module-scope input — prevents focus-loss from inline component re-creation.
// Uses local rawNum state for number fields so "0." doesn't collapse to "0" mid-typing.
function SettingsInp({ k, type = 'text', ph, s, set }: {
  k: keyof AppSettings; type?: string; ph?: string
  s: AppSettings; set: (k: keyof AppSettings, v: string) => void
}) {
  // Keep a raw string during number-field editing so the decimal point isn't eaten
  const [rawNum, setRawNum] = useState<string | null>(null)
  const isNum = type === 'number'
  const display = isNum && rawNum !== null ? rawNum : String(s[k])

  return (
    <input
      style={inp}
      type="text"
      inputMode={isNum ? 'decimal' : 'text'}
      placeholder={ph}
      value={display}
      onChange={e => {
        const v = e.target.value
        if (isNum) setRawNum(v)
        set(k, v)
      }}
      onBlur={() => { if (isNum) setRawNum(null) }}
    />
  )
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: '.68rem', color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 5,
}
const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 20, padding: '1.6rem', display: 'grid', gap: '1rem',
}
const secHead = (label: string) => (
  <div style={{ fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--primary)', paddingBottom: '.5rem', borderBottom: '1px solid var(--border)' }}>
    {label}
  </div>
)
const badge = (text: string, color = 'teal') => (
  <div style={{ padding: '.25rem .6rem', borderRadius: 7, fontSize: '.58rem', fontWeight: 800, letterSpacing: '.06em', whiteSpace: 'nowrap', flexShrink: 0,
    background: color === 'teal' ? 'rgba(0,232,176,.08)' : 'rgba(245,194,0,.07)',
    border: color === 'teal' ? '1px solid rgba(0,232,176,.2)' : '1px solid rgba(245,194,0,.18)',
    color: color === 'teal' ? 'var(--primary)' : '#f5c200',
  }}>
    {text}
  </div>
)

type Tab = 'personal' | 'vehicle' | 'pay' | 'fuel' | 'compliance' | 'system'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'personal',   label: 'Personal',   icon: '👤' },
  { id: 'vehicle',    label: 'Vehicle',    icon: '🚛' },
  { id: 'pay',        label: 'Pay & CPM',  icon: '💵' },
  { id: 'fuel',       label: 'Fuel',       icon: '⛽' },
  { id: 'compliance', label: 'Compliance', icon: '📋' },
  { id: 'system',     label: 'System',     icon: '⚙️' },
]

type Profile = { full_name: string; role: string; three_b_id: string; three_b_biz_id: string; cdl_number: string; cdl_state: string; phone: string }
const EMPTY_PROFILE: Profile = { full_name: '', role: '', three_b_id: '', three_b_biz_id: '', cdl_number: '', cdl_state: '', phone: '' }

export default function Settings() {
  const [userMode,    setUserMode]    = useState<UserMode | null>(null)
  const [showModeSelector, setShowModeSelector] = useState(false)
  const [tab,         setTab]         = useState<Tab>('personal')
  const [s,           setS]           = useState<AppSettings>(DEFAULT_SETTINGS)
  const [profile,     setProfile]     = useState<Profile>(EMPTY_PROFILE)
  const [saved,       setSaved]       = useState(false)
  const [profSaved,   setProfSaved]   = useState(false)
  const [profErr,     setProfErr]     = useState('')
  const [profLoading, setProfLoading] = useState(false)
  const [fuelLoading, setFuelLoading] = useState(false)
  const [fuelMsg,     setFuelMsg]     = useState('')
  // System tab
  const [samsaraToken,    setSamsaraToken]    = useState('')
  const [showToken,       setShowToken]       = useState(false)
  const [tokenSaved,      setTokenSaved]      = useState(false)
  const [tokenTesting,    setTokenTesting]    = useState(false)
  const [tokenTestMsg,    setTokenTestMsg]    = useState('')
  const [clearTarget,     setClearTarget]     = useState('')
  const [clearConfirm,    setClearConfirm]    = useState(false)
  // Compliance / scan state
  const [compliance,      setCompliance]      = useState<ComplianceDocs>({})
  const [scanMsg,         setScanMsg]         = useState<Record<string, string>>({})
  const [scanning,        setScanning]        = useState<Record<string, boolean>>({})
  const licenseInputRef      = useRef<HTMLInputElement>(null)
  const registrationInputRef = useRef<HTMLInputElement>(null)
  const insuranceInputRef    = useRef<HTMLInputElement>(null)
  const medicalInputRef      = useRef<HTMLInputElement>(null)
  // Deadhead log
  const [dhLog,    setDhLog]    = useState<DeadheadEntry[]>([])
  const [dhForm,   setDhForm]   = useState<Omit<DeadheadEntry,'id'>>({ type: 'bobtail', date: new Date().toISOString().slice(0,10), miles: null, duration_hrs: null, notes: '' })
  const [dhAdding, setDhAdding] = useState(false)
  const supabase = createClient()

  // ── persistCompliance: localStorage-first → Supabase async ──────────────
  async function persistCompliance(docs: ComplianceDocs) {
    // Detect newly added doc types for timeline (compare against current state)
    const added = (['license', 'registration', 'insurance', 'medical'] as const)
      .filter(k => docs[k] && !compliance[k])
    if (added.length > 0) {
      void logTimelineEvent('document_uploaded', 'compliance_scanner', { docTypes: added })
    }
    setCompliance(docs)
    try { localStorage.setItem('3b-compliance-docs', JSON.stringify(docs)) } catch { /* storage full */ }
    // Supabase async — non-blocking, silently absorbed
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      let businessId: string | null = null
      try {
        const { data: prof } = await supabase.from('profiles').select('business_id').eq('id', user.id).single()
        businessId = (prof as Record<string, string> | null)?.business_id ?? null
      } catch { /* ignore */ }
      await supabase.from('driver_compliance').upsert({
        user_id:     user.id,
        business_id: businessId,
        license:     docs.license     ?? null,
        registration: docs.registration ?? null,
        insurance:   docs.insurance   ?? null,
        medical:     docs.medical     ?? null,
        updated_at:  new Date().toISOString(),
      }, { onConflict: 'user_id' })
    } catch { /* offline or unauthenticated — local record is sufficient */ }
  }

  useEffect(() => {
    setS(loadSettings())
    setUserMode(readUserMode())
    setSamsaraToken(localStorage.getItem('samsara-api-token') ?? '')
    // Load compliance: Supabase first (source of truth), localStorage as instant fallback
    try {
      const raw = localStorage.getItem('3b-compliance-docs')
      if (raw) setCompliance(JSON.parse(raw))
    } catch { /* ignore */ }
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      try {
        const { data: row } = await supabase
          .from('driver_compliance')
          .select('license,registration,insurance,medical')
          .eq('user_id', data.user.id)
          .single()
        if (row) {
          const docs: ComplianceDocs = {
            ...(row.license      ? { license:      row.license      as LicenseScan      } : {}),
            ...(row.registration ? { registration: row.registration as RegistrationScan } : {}),
            ...(row.insurance    ? { insurance:    row.insurance    as InsuranceScan    } : {}),
            ...(row.medical      ? { medical:      row.medical      as MedicalCardScan  } : {}),
          }
          setCompliance(docs)
          // Sync latest DB state back to localStorage
          try { localStorage.setItem('3b-compliance-docs', JSON.stringify(docs)) } catch { /* ignore */ }
        }
      } catch { /* table empty or network — localStorage value already shown */ }
    })
    try {
      const raw = localStorage.getItem(DH_KEY)
      if (raw) setDhLog(JSON.parse(raw))
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: prof } = await supabase
        .from('profiles').select('full_name,role,three_b_id,business_id,cdl_number,cdl_state,phone')
        .eq('id', data.user.id).single()
      if (prof) setProfile({
        full_name:      (prof as Record<string, string>).full_name    ?? '',
        role:           (prof as Record<string, string>).role         ?? '',
        three_b_id:     (prof as Record<string, string>).three_b_id  ?? '',
        three_b_biz_id: (prof as Record<string, string>).business_id ?? '',
        cdl_number:     (prof as Record<string, string>).cdl_number  ?? '',
        cdl_state:      (prof as Record<string, string>).cdl_state   ?? '',
        phone:          (prof as Record<string, string>).phone        ?? '',
      })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── field helpers ───────────────────────────────────────────────────────────
  function set(k: keyof AppSettings, v: string) {
    setS(prev => {
      if (typeof prev[k] !== 'number') return { ...prev, [k]: v }
      // Don't snap to 0 while the user is mid-typing a decimal ("0.", "", "-")
      if (v === '' || v === '-' || v.endsWith('.')) return prev
      const n = parseFloat(v)
      return { ...prev, [k]: isNaN(n) ? prev[k] : n }
    })
    setSaved(false)
  }
  function setP(k: keyof Profile, v: string) {
    setProfile(prev => ({ ...prev, [k]: v }))
    setProfSaved(false); setProfErr('')
  }

  // ── save local settings ────────────────────────────────────────────────────
  // ── License scan ──────────────────────────────────────────────────────────
  async function handleLicenseScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(p => ({ ...p, license: true })); setScanMsg(p => ({ ...p, license: '' }))
    try {
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch('/api/scan-license', { method: 'POST', body: fd })
      const data = await res.json() as LicenseScan & { error?: string }
      if (data.error) { setScanMsg(p => ({ ...p, license: `❌ ${data.error}` })); return }
      // Auto-populate profile fields
      setProfile(prev => ({
        ...prev,
        full_name:  data.full_name  ?? prev.full_name,
        cdl_number: data.cdl_number ?? prev.cdl_number,
        cdl_state:  data.issued_state ?? data.state ?? prev.cdl_state,
      }))
      // Save to compliance store (localStorage + Supabase)
      const next = { ...compliance, license: data }
      await persistCompliance(next)
      setScanMsg(p => ({ ...p, license: `✅ License scanned — ${data.full_name ?? 'name not read'}` }))
    } catch { setScanMsg(p => ({ ...p, license: '❌ Scan failed — check connection' })) }
    finally   { setScanning(p => ({ ...p, license: false })); if (licenseInputRef.current) licenseInputRef.current.value = '' }
  }

  // ── Registration scan ──────────────────────────────────────────────────────
  async function handleRegistrationScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(p => ({ ...p, registration: true })); setScanMsg(p => ({ ...p, registration: '' }))
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('docType', 'registration')
      const res  = await fetch('/api/scan-compliance', { method: 'POST', body: fd })
      const data = await res.json() as RegistrationScan & { error?: string }
      if (data.error) { setScanMsg(p => ({ ...p, registration: `❌ ${data.error}` })); return }
      // Auto-populate vehicle fields
      setS(prev => ({
        ...prev,
        vin:               data.vin               ?? prev.vin,
        year:              data.year              ?? prev.year,
        make:              data.make              ?? prev.make,
        model:             data.model             ?? prev.model,
        tractorPlate:      data.plate             ?? prev.tractorPlate,
        tractorPlateState: data.plate_state       ?? prev.tractorPlateState,
      }))
      setSaved(false)
      const next = { ...compliance, registration: data }
      await persistCompliance(next)
      setScanMsg(p => ({ ...p, registration: `✅ Registration scanned — ${data.year ?? ''} ${data.make ?? ''} ${data.model ?? ''}`.trim() }))
    } catch { setScanMsg(p => ({ ...p, registration: '❌ Scan failed — check connection' })) }
    finally   { setScanning(p => ({ ...p, registration: false })); if (registrationInputRef.current) registrationInputRef.current.value = '' }
  }

  // ── Insurance scan ─────────────────────────────────────────────────────────
  async function handleInsuranceScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(p => ({ ...p, insurance: true })); setScanMsg(p => ({ ...p, insurance: '' }))
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('docType', 'insurance')
      const res  = await fetch('/api/scan-compliance', { method: 'POST', body: fd })
      const data = await res.json() as InsuranceScan & { error?: string }
      if (data.error) { setScanMsg(p => ({ ...p, insurance: `❌ ${data.error}` })); return }
      const next = { ...compliance, insurance: data }
      await persistCompliance(next)
      setScanMsg(p => ({ ...p, insurance: `✅ Insurance scanned — ${data.insurer ?? 'policy saved'}` }))
    } catch { setScanMsg(p => ({ ...p, insurance: '❌ Scan failed — check connection' })) }
    finally   { setScanning(p => ({ ...p, insurance: false })); if (insuranceInputRef.current) insuranceInputRef.current.value = '' }
  }

  // ── Medical card scan ──────────────────────────────────────────────────────
  async function handleMedicalScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(p => ({ ...p, medical: true })); setScanMsg(p => ({ ...p, medical: '' }))
    try {
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch('/api/scan-medical', { method: 'POST', body: fd })
      const data = await res.json() as MedicalCardScan & { error?: string }
      if (data.error) { setScanMsg(p => ({ ...p, medical: `❌ ${data.error}` })); return }
      const next = { ...compliance, medical: data }
      await persistCompliance(next)
      const exp = data.expiry ? ` · Exp ${data.expiry}` : ''
      setScanMsg(p => ({ ...p, medical: `✅ Medical card scanned${exp}` }))
    } catch { setScanMsg(p => ({ ...p, medical: '❌ Scan failed — check connection' })) }
    finally   { setScanning(p => ({ ...p, medical: false })); if (medicalInputRef.current) medicalInputRef.current.value = '' }
  }

  // ── Deadhead log helpers ───────────────────────────────────────────────────
  function addDhEntry() {
    const entry: DeadheadEntry = { ...dhForm, id: crypto.randomUUID() }
    const next = [entry, ...dhLog]
    setDhLog(next)
    localStorage.setItem(DH_KEY, JSON.stringify(next))
    setDhAdding(false)
    setDhForm({ type: 'bobtail', date: new Date().toISOString().slice(0,10), miles: null, duration_hrs: null, notes: '' })
  }
  function deleteDhEntry(id: string) {
    const next = dhLog.filter(e => e.id !== id)
    setDhLog(next)
    localStorage.setItem(DH_KEY, JSON.stringify(next))
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    // sync mpg alias so MIS gets the right value
    const merged = { ...s, mpg: s.mpgLoaded }
    persistSettings(merged)
    // also sync vehicle to 3b-vehicle key for Trip Planner compatibility
    const vehicle = {
      truckNum: s.truckNum, year: s.year, make: s.make, model: s.model,
      vin: s.vin, hp: s.hp, truckHeight: s.truckHeight,
      trailerNum: s.trailerNum, trailerType: s.trailerType,
      trailerLen: s.trailerLen, trailerHeight: s.trailerHeight,
      axles: s.axles, maxWeight: s.maxWeight, gvwr: s.gvwr,
      cdlClass: s.cdlClass, endorsements: s.endorsements,
      mpgLoaded: s.mpgLoaded, mpgEmpty: s.mpgEmpty,
      tankGal: s.tankGal, fuelPrice: s.fuelPrice,
    }
    localStorage.setItem('3b-vehicle', JSON.stringify(vehicle))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // ── save Supabase profile ──────────────────────────────────────────────────
  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault()
    setProfLoading(true); setProfErr('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setProfErr('Not signed in.'); setProfLoading(false); return }
    const { error } = await supabase.from('profiles').upsert({
      id:          user.id,
      full_name:   profile.full_name      || null,
      role:        profile.role           || null,
      three_b_id:  profile.three_b_id     || null,
      business_id: profile.three_b_biz_id || null,
      cdl_number:  profile.cdl_number     || null,
      cdl_state:   profile.cdl_state      || null,
      phone:       profile.phone          || null,
      updated_at:  new Date().toISOString(),
    })
    setProfLoading(false)
    if (error) { setProfErr(error.message) }
    else { setProfSaved(true); setTimeout(() => setProfSaved(false), 2500) }
  }

  // ── fetch diesel price from Love's near me ─────────────────────────────────
  const fetchFuelPrice = useCallback(async () => {
    setFuelLoading(true); setFuelMsg('')
    if (!navigator.geolocation) {
      setFuelMsg('Geolocation not supported by this browser.')
      setFuelLoading(false); return
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude: lat, longitude: lng } = pos.coords
        const res = await fetch(`/api/loves-fuel?lat=${lat}&lng=${lng}`)
        const data = await res.json()
        if (data.error === 'not_configured') {
          setFuelMsg("Love's API not configured — enter price manually or add LOVES_API_URL to Vercel env vars.")
          setFuelLoading(false); return
        }
        // data is array of stores sorted by distance; find first with diesel price
        const store = Array.isArray(data) ? data.find((d: { diesel: number | null }) => d.diesel != null) : null
        if (store) {
          setS(prev => ({ ...prev, fuelPrice: store.diesel, mpg: prev.mpgLoaded }))
          setSaved(false)
          setFuelMsg(`✅ Got $${store.diesel.toFixed(3)}/gal from ${store.name} (${store.miles != null ? `${store.miles.toFixed(1)} mi away` : store.city})`)
        } else {
          setFuelMsg("No Love's diesel prices found near you. Enter manually.")
        }
      } catch {
        setFuelMsg('Could not fetch fuel prices. Check your connection.')
      }
      setFuelLoading(false)
    }, () => {
      setFuelMsg('Location access denied. Allow GPS to fetch nearby fuel prices.')
      setFuelLoading(false)
    }, { enableHighAccuracy: false, timeout: 10000 })
  }, [])

  // ── Samsara token save + test ──────────────────────────────────────────────
  const saveSamsaraToken = () => {
    localStorage.setItem('samsara-api-token', samsaraToken.trim())
    setTokenSaved(true); setTokenTestMsg('')
    setTimeout(() => setTokenSaved(false), 2000)
  }
  const testSamsaraToken = async () => {
    const tok = samsaraToken.trim()
    if (!tok) { setTokenTestMsg('Enter your token first.'); return }
    setTokenTesting(true); setTokenTestMsg('')
    try {
      const res = await fetch('/api/samsara', { headers: { 'x-samsara-token': tok } })
      const data = await res.json()
      if (data.error === 'not_configured') setTokenTestMsg('❌ Token not accepted by the server.')
      else if (data.error)                  setTokenTestMsg(`❌ API error: ${data.error}`)
      else                                  setTokenTestMsg(`✅ Connected! Driver: ${data.hos?.driverName ?? 'unknown'}`)
    } catch { setTokenTestMsg('❌ Could not reach server.') }
    finally { setTokenTesting(false) }
  }

  // ── Data export / clear ────────────────────────────────────────────────────
  const DATA_STORES = [
    { key: '3b-expenses',    label: 'Expenses',     emoji: '💵' },
    { key: '3b-active-trip', label: 'Active trip',  emoji: '🗺' },
    { key: '3b-hos-data',    label: 'HOS data',     emoji: '⏱' },
    { key: '3b-fleet-settings', label: 'Local settings', emoji: '⚙️' },
    { key: '3b-vehicle',     label: 'Vehicle data', emoji: '🚛' },
  ]

  const exportAllData = () => {
    const out: Record<string, unknown> = {}
    DATA_STORES.forEach(({ key }) => {
      try { const v = localStorage.getItem(key); if (v) out[key] = JSON.parse(v) }
      catch { /* ignore */ }
    })
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `3b-fleet-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click()
  }

  const exportExpensesCSV = () => {
    try {
      const raw = localStorage.getItem('3b-expenses')
      if (!raw) return
      const expenses = JSON.parse(raw) as Array<Record<string, unknown>>
      const rows = [
        ['Date','Category','Amount','Deduct%','Deductible$','Description','Location','Load#'],
        ...expenses.map(e => [
          e.date, e.category, String(e.amount),
          String(e.deductPct),
          String(((e.amount as number) * (e.deductPct as number) / 100).toFixed(2)),
          String(e.description ?? ''), String(e.location ?? ''), String(e.loadNumber ?? ''),
        ])
      ]
      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `3b-expenses-${new Date().toISOString().slice(0,10)}.csv`
      a.click()
    } catch { /* ignore */ }
  }

  const clearData = (key: string) => {
    localStorage.removeItem(key)
    setClearTarget(''); setClearConfirm(false)
  }

  // SettingsInp is at module scope above — see function SettingsInp.

  return (
    <>
      <TopBar title="Settings" module="sys" subtitle="Personal · Vehicle · Pay · Fuel" />
      <main style={{ padding: '1.2rem', maxWidth: 680, display: 'grid', gap: '1.2rem' }}>

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '.4rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '.35rem' }}>
          {TABS.filter(t => !(s.driverMode && t.id === 'pay')).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '.55rem .5rem', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 'clamp(.65rem,2vw,.8rem)',
              transition: 'all 160ms',
              background: tab === t.id ? 'rgba(0,232,176,.1)' : 'transparent',
              color: tab === t.id ? 'var(--primary)' : 'var(--muted)',
              boxShadow: tab === t.id ? '0 0 0 1px rgba(0,232,176,.2)' : 'none',
            }}>
              <span style={{ marginRight: '.3rem' }}>{t.icon}</span>
              <span className="hide-xs">{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── Command Role card — always visible ── */}
        {userMode && (() => {
          const cfg = MODE_CONFIG[userMode]
          return (
            <div style={{
              padding: '1rem 1.1rem', borderRadius: 14,
              border: `1.5px solid color-mix(in srgb, ${cfg.color} 30%, var(--border))`,
              background: `color-mix(in srgb, ${cfg.color} 6%, var(--surface))`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `color-mix(in srgb, ${cfg.color} 18%, transparent)`,
                border: `1.5px solid ${cfg.color}`,
                display: 'grid', placeItems: 'center', fontSize: '1.4rem', flexShrink: 0,
              }}>
                {cfg.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: '.9rem', color: cfg.color }}>{cfg.label}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 1 }}>{cfg.tagline}</div>
              </div>
              <button
                onClick={() => setShowModeSelector(true)}
                style={{
                  padding: '.35rem .8rem', borderRadius: 8, flexShrink: 0,
                  border: `1px solid ${cfg.color}50`, background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
                  color: cfg.color, fontSize: '.76rem', fontWeight: 800, cursor: 'pointer',
                }}
              >
                Switch
              </button>
            </div>
          )
        })()}

        {/* ══ PERSONAL TAB ════════════════════════════════════════════════════ */}
        {tab === 'personal' && (
          <>
            {/* ── Driver Mode toggle ── */}
            <div style={{ ...card, padding: '1.2rem 1.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>🚛 Driver Mode</span>
                    {s.driverMode && <span style={{ fontSize: '.6rem', fontWeight: 800, padding: '.18rem .55rem', borderRadius: 6, background: 'rgba(0,232,176,.1)', border: '1px solid rgba(0,232,176,.25)', color: 'var(--primary)', letterSpacing: '.06em' }}>ON</span>}
                  </div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>
                    {s.driverMode
                      ? 'Execution view — rates, margins, and financial analysis are hidden. Compliance, HOS, stops, and route are always visible.'
                      : 'Owner-operator view — all financial analysis, CPM settings, and margin data are visible.'}
                  </div>
                </div>
                <button type="button"
                  onClick={() => {
                    const next = { ...s, driverMode: !s.driverMode }
                    setS(next)
                    persistSettings({ ...next, mpg: next.mpgLoaded })
                    setSaved(false)
                  }}
                  style={{
                    flexShrink: 0, width: 52, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: s.driverMode ? 'var(--primary)' : 'var(--surface-2)',
                    boxShadow: s.driverMode ? '0 0 8px rgba(0,232,176,.4)' : 'inset 0 1px 3px rgba(0,0,0,.3)',
                    position: 'relative', transition: 'background 200ms',
                  }}>
                  <span style={{
                    position: 'absolute', top: 3, width: 22, height: 22, borderRadius: '50%', background: '#fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,.3)', transition: 'left 200ms',
                    left: s.driverMode ? 27 : 3,
                  }} />
                </button>
              </div>
            </div>

            {/* Supabase identity */}
            <form onSubmit={handleProfileSave}>
              <div style={{ ...card }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>Your identity</div>
                    <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>Saved to your account — shows in the sidebar on every device.</div>
                  </div>
                  {badge('☁ Supabase')}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={lbl}>Full name</label>
                    <input style={inp} value={profile.full_name} onChange={e => setP('full_name', e.target.value)} placeholder="e.g. Brandon B." />
                  </div>
                  <div>
                    <label style={lbl}>Role</label>
                    <input style={inp} value={profile.role} onChange={e => setP('role', e.target.value)} placeholder="Owner-Operator" />
                  </div>
                  <div>
                    <label style={lbl}>3B Driver ID</label>
                    <input style={inp} value={profile.three_b_id} onChange={e => setP('three_b_id', e.target.value)} placeholder="3B-0042" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={lbl}>3B Business ID</label>
                    <input style={inp} value={profile.three_b_biz_id} onChange={e => setP('three_b_biz_id', e.target.value)} placeholder="3BBIZ-001" />
                  </div>
                  <div>
                    <label style={lbl}>CDL number</label>
                    <input style={inp} value={profile.cdl_number} onChange={e => setP('cdl_number', e.target.value)} placeholder="License number" />
                  </div>
                  <div>
                    <label style={lbl}>CDL state</label>
                    <input style={inp} maxLength={2} value={profile.cdl_state} onChange={e => setP('cdl_state', e.target.value.toUpperCase())} placeholder="TX" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={lbl}>Phone (for dispatch messages)</label>
                    <input style={inp} type="tel" value={profile.phone} onChange={e => setP('phone', e.target.value)} placeholder="+1 (555) 000-0000" />
                  </div>
                </div>

                {/* ── Scan license ── */}
                <div style={{ padding: '1rem', borderRadius: 12, background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '.78rem', color: 'var(--primary)' }}>📷 Scan your CDL</div>
                    <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 2 }}>Auto-fills name, CDL number &amp; state from a photo.</div>
                  </div>
                  <button type="button"
                    onClick={() => licenseInputRef.current?.click()}
                    disabled={scanning.license}
                    style={{ padding: '.6rem 1.2rem', borderRadius: 9, border: 'none', background: scanning.license ? 'rgba(0,232,176,.12)' : 'var(--primary)', color: scanning.license ? 'var(--primary)' : '#061210', fontWeight: 800, fontSize: '.78rem', cursor: scanning.license ? 'wait' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {scanning.license ? '⏳ Scanning…' : '📷 Scan or Upload'}
                  </button>
                </div>
                {scanMsg.license && (
                  <div style={{ fontSize: '.72rem', padding: '.45rem .75rem', borderRadius: 9, background: scanMsg.license.startsWith('✅') ? 'rgba(40,192,72,.07)' : 'rgba(232,64,0,.07)', border: `1px solid ${scanMsg.license.startsWith('✅') ? 'rgba(40,192,72,.2)' : 'rgba(232,64,0,.2)'}`, color: scanMsg.license.startsWith('✅') ? 'var(--success)' : 'var(--error)' }}>
                    {scanMsg.license}
                  </div>
                )}

                {profErr && (
                  <div style={{ padding: '.6rem .85rem', borderRadius: 10, background: 'rgba(232,64,0,.07)', border: '1px solid rgba(232,64,0,.2)', color: 'var(--error)', fontSize: '.78rem' }}>
                    {profErr}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" disabled={profLoading} style={{ padding: '.75rem 1.8rem', borderRadius: 10, background: profSaved ? 'var(--success)' : 'var(--primary)', color: '#061210', fontWeight: 800, fontSize: '.85rem', border: 'none', cursor: 'pointer', opacity: profLoading ? .6 : 1 }}>
                    {profLoading ? 'Saving…' : profSaved ? '✓ Saved to account!' : 'Save identity'}
                  </button>
                </div>
              </div>
            </form>

            {/* Local driver prefs */}
            <form onSubmit={handleSave}>
              <div style={{ ...card }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>Driver &amp; dispatch</div>
                  {badge('⚡ Local', 'yellow')}
                </div>
                <div>
                  <label style={lbl}>Company / DBA name</label>
                  <SettingsInp k="driverName" ph="3B Transport LLC"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>Dispatcher name</label>
                  <SettingsInp k="dispatcher" ph="Trev"  s={s} set={set} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" style={{ padding: '.75rem 1.8rem', borderRadius: 10, background: saved ? 'var(--success)' : 'var(--primary)', color: '#061210', fontWeight: 800, fontSize: '.85rem', border: 'none', cursor: 'pointer' }}>
                    {saved ? '✓ Saved!' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          </>
        )}

        {/* ══ VEHICLE TAB ═════════════════════════════════════════════════════ */}
        {tab === 'vehicle' && (
          <form onSubmit={handleSave} style={{ display: 'grid', gap: '1rem' }}>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>Tractor</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>Auto-fills dispatch messages and trip plans.</div>
                </div>
                {badge('⚡ Local', 'yellow')}
              </div>

              {secHead('Identification')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.85rem' }}>
                <div>
                  <label style={lbl}>Truck number</label>
                  <SettingsInp k="truckNum" ph="T-001"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>Year</label>
                  <SettingsInp k="year" type="number" ph="2022"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>Make</label>
                  <select style={inp} value={s.make} onChange={e => set('make', e.target.value)}>
                    <option value="">Select make</option>
                    {['Peterbilt','Kenworth','Freightliner','International','Mack','Volvo','Western Star','Other'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Model</label>
                  <SettingsInp k="model" ph="389, T680, Cascadia"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>VIN (last 8)</label>
                  <SettingsInp k="vin" ph="optional"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>Horsepower</label>
                  <SettingsInp k="hp" ph="550"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>Truck height (ft)</label>
                  <SettingsInp k="truckHeight" type="number"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>Tractor plate #</label>
                  <SettingsInp k="tractorPlate" ph="ABC1234"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>Plate state</label>
                  <input style={inp} maxLength={2} value={s.tractorPlateState} onChange={e => set('tractorPlateState', e.target.value.toUpperCase())} placeholder="TX" />
                </div>
                <div>
                  <label style={lbl}>CDL class</label>
                  <select style={inp} value={s.cdlClass} onChange={e => set('cdlClass', e.target.value)}>
                    {['A','B','C'].map(c => <option key={c}>Class {c}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Endorsements</label>
                  <SettingsInp k="endorsements" ph="H, N, T, X…"  s={s} set={set} />
                </div>
              </div>

              {/* ── Scan registration ── */}
              <div style={{ padding: '1rem', borderRadius: 12, background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '.78rem', color: 'var(--primary)' }}>📷 Scan Registration</div>
                  <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 2 }}>Auto-fills VIN, year, make &amp; model from your registration card.</div>
                </div>
                <button type="button"
                  onClick={() => registrationInputRef.current?.click()}
                  disabled={scanning.registration}
                  style={{ padding: '.6rem 1.2rem', borderRadius: 9, border: 'none', background: scanning.registration ? 'rgba(0,232,176,.12)' : 'var(--primary)', color: scanning.registration ? 'var(--primary)' : '#061210', fontWeight: 800, fontSize: '.78rem', cursor: scanning.registration ? 'wait' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {scanning.registration ? '⏳ Scanning…' : '📷 Scan or Upload'}
                </button>
              </div>
              {scanMsg.registration && (
                <div style={{ fontSize: '.72rem', padding: '.45rem .75rem', borderRadius: 9, background: scanMsg.registration.startsWith('✅') ? 'rgba(40,192,72,.07)' : 'rgba(232,64,0,.07)', border: `1px solid ${scanMsg.registration.startsWith('✅') ? 'rgba(40,192,72,.2)' : 'rgba(232,64,0,.2)'}`, color: scanMsg.registration.startsWith('✅') ? 'var(--success)' : 'var(--error)' }}>
                  {scanMsg.registration}
                </div>
              )}
            </div>

            <div style={card}>
              {secHead('Trailer')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.85rem' }}>
                <div>
                  <label style={lbl}>Trailer number</label>
                  <SettingsInp k="trailerNum" ph="260692"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>Trailer type</label>
                  <select style={inp} value={s.trailerType} onChange={e => set('trailerType', e.target.value)}>
                    {[['53dry',"53′ Dry Van"],['48dry',"48′ Dry Van"],['53reefer',"53′ Reefer"],['flatbed','Flatbed'],['stepdeck','Step Deck'],['lowboy','Lowboy'],['tanker','Tanker'],['doubles','Doubles/Pups']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Trailer length (ft)</label>
                  <SettingsInp k="trailerLen" type="number"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>Trailer height (ft)</label>
                  <SettingsInp k="trailerHeight" type="number"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>Trailer plate #</label>
                  <SettingsInp k="trailerPlate" ph="TR12345"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>Plate state</label>
                  <input style={inp} maxLength={2} value={s.trailerPlateState} onChange={e => set('trailerPlateState', e.target.value.toUpperCase())} placeholder="TX" />
                </div>
                <div>
                  <label style={lbl}>Axles</label>
                  <select style={inp} value={s.axles} onChange={e => set('axles', e.target.value)}>
                    {[['5','5-axle (std)'],['6','6-axle'],['7','7-axle'],['3','3-axle bobtail']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Max legal weight (lbs)</label>
                  <SettingsInp k="maxWeight" type="number"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>GVWR (lbs)</label>
                  <SettingsInp k="gvwr" type="number"  s={s} set={set} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setS(DEFAULT_SETTINGS); setSaved(false) }}
                style={{ padding: '.7rem 1.2rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontWeight: 600, fontSize: '.82rem', color: 'var(--muted)', cursor: 'pointer' }}>
                Reset
              </button>
              <button type="submit"
                style={{ padding: '.75rem 1.8rem', borderRadius: 10, background: saved ? 'var(--success)' : 'var(--primary)', color: '#061210', fontWeight: 800, fontSize: '.85rem', border: 'none', cursor: 'pointer' }}>
                {saved ? '✓ Saved!' : 'Save vehicle'}
              </button>
            </div>
          </form>
        )}

        {/* ══ PAY TAB ═════════════════════════════════════════════════════════ */}
        {tab === 'pay' && (
          <form onSubmit={handleSave} style={{ display: 'grid', gap: '1rem' }}>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>Pay &amp; CPM</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>Drives MIS pay accuracy, AI load analysis, and settlement audits.</div>
                </div>
                {badge('⚡ Local', 'yellow')}
              </div>

              {secHead('What you receive')}
              <div>
                <label style={lbl}>CPM I receive (contracted rate)</label>
                <SettingsInp k="cpmReceived" type="number" ph="0.55"  s={s} set={set} />
                <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 4 }}>Used by MIS to calculate underpayments vs what you were actually paid per mile.</div>
              </div>

              {secHead('Analysis range')}
              <div>
                <label style={lbl}>Default CPM (pre-fills new loads)</label>
                <SettingsInp k="defaultCpm" type="number"  s={s} set={set} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={lbl}>Low CPM (floor)</label>
                  <SettingsInp k="cpmLow" type="number"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>High CPM (target)</label>
                  <SettingsInp k="cpmHigh" type="number"  s={s} set={set} />
                </div>
              </div>
              <div style={{ padding: '.7rem .9rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '.7rem', color: 'var(--muted)' }}>
                Dashboard shows: <strong style={{ color: 'var(--text)' }}>@ ${s.cpmLow.toFixed(3)} CPM</strong> and <strong style={{ color: 'var(--text)' }}>@ ${s.cpmHigh.toFixed(3)} CPM</strong>
              </div>

              {secHead('Other')}
              <div>
                <label style={lbl}>Detention rate ($/hr)</label>
                <SettingsInp k="detentionRate" type="number"  s={s} set={set} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit"
                style={{ padding: '.75rem 1.8rem', borderRadius: 10, background: saved ? 'var(--success)' : 'var(--primary)', color: '#061210', fontWeight: 800, fontSize: '.85rem', border: 'none', cursor: 'pointer' }}>
                {saved ? '✓ Saved!' : 'Save pay settings'}
              </button>
            </div>
          </form>
        )}

        {/* ══ FUEL TAB ════════════════════════════════════════════════════════ */}
        {tab === 'fuel' && (
          <form onSubmit={handleSave} style={{ display: 'grid', gap: '1rem' }}>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>Fuel &amp; MPG</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>Used by MIS and Trip Planner for fuel cost and net pay calculations.</div>
                </div>
                {badge('⚡ Local', 'yellow')}
              </div>

              {/* Love's live price fetch */}
              <div style={{ padding: '1rem', borderRadius: 12, background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.15)' }}>
                <div style={{ fontWeight: 700, fontSize: '.78rem', color: 'var(--primary)', marginBottom: 6 }}>⛽ Live diesel price from Love&apos;s near you</div>
                <button type="button" onClick={fetchFuelPrice} disabled={fuelLoading}
                  style={{ padding: '.65rem 1.2rem', borderRadius: 9, background: 'var(--primary)', color: '#061210', fontWeight: 800, fontSize: '.8rem', border: 'none', cursor: fuelLoading ? 'not-allowed' : 'pointer', opacity: fuelLoading ? .7 : 1 }}>
                  {fuelLoading ? '📡 Fetching…' : '📍 Fetch Price Near Me'}
                </button>
                {fuelMsg && (
                  <div style={{ marginTop: 8, fontSize: '.7rem', color: fuelMsg.startsWith('✅') ? 'var(--success)' : 'var(--muted)', lineHeight: 1.5 }}>
                    {fuelMsg}
                  </div>
                )}
              </div>

              {secHead('Diesel price')}
              <div>
                <label style={lbl}>Diesel price ($/gal)</label>
                <SettingsInp k="fuelPrice" type="number"  s={s} set={set} />
                <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 4 }}>Update this whenever you fuel up for accurate cost tracking.</div>
              </div>

              {secHead('MPG')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.85rem' }}>
                <div>
                  <label style={lbl}>Loaded MPG</label>
                  <SettingsInp k="mpgLoaded" type="number"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>Empty MPG</label>
                  <SettingsInp k="mpgEmpty" type="number"  s={s} set={set} />
                </div>
                <div>
                  <label style={lbl}>Tank (gal)</label>
                  <SettingsInp k="tankGal" type="number"  s={s} set={set} />
                </div>
              </div>

              {/* Summary box */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem' }}>
                {[
                  ['Cost/mi (loaded)', `$${s.mpgLoaded > 0 ? (s.fuelPrice / s.mpgLoaded).toFixed(3) : '—'}`],
                  ['Cost/mi (empty)',  `$${s.mpgEmpty  > 0 ? (s.fuelPrice / s.mpgEmpty ).toFixed(3) : '—'}`],
                  ['Range (loaded)',   `${s.mpgLoaded > 0 ? Math.round(s.tankGal * s.mpgLoaded) : '—'} mi`],
                  ['Range (empty)',    `${s.mpgEmpty  > 0 ? Math.round(s.tankGal * s.mpgEmpty ) : '—'} mi`],
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: '.55rem .8rem', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>{k}</div>
                    <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '.95rem', marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit"
                style={{ padding: '.75rem 1.8rem', borderRadius: 10, background: saved ? 'var(--success)' : 'var(--primary)', color: '#061210', fontWeight: 800, fontSize: '.85rem', border: 'none', cursor: 'pointer' }}>
                {saved ? '✓ Saved!' : 'Save fuel settings'}
              </button>
            </div>
          </form>
        )}

        {/* ══ COMPLIANCE TAB ══════════════════════════════════════════════════ */}
        {tab === 'compliance' && (
          <div style={{ display: 'grid', gap: '1rem' }}>

            {/* ── CDL / Driver License ── */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>👤 Driver&apos;s License / CDL</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>Scanned from your physical CDL — auto-populates identity fields.</div>
                </div>
                {compliance.license ? (
                  <div style={{ padding: '.28rem .65rem', borderRadius: 7, fontSize: '.6rem', fontWeight: 800, letterSpacing: '.05em',
                    background: `${expiryColor(daysUntil(compliance.license.expiry))}18`,
                    border: `1px solid ${expiryColor(daysUntil(compliance.license.expiry))}44`,
                    color: expiryColor(daysUntil(compliance.license.expiry)) }}>
                    {expiryLabel(daysUntil(compliance.license.expiry), compliance.license.expiry)}
                  </div>
                ) : <div style={{ fontSize: '.65rem', color: 'var(--muted)' }}>Not scanned</div>}
              </div>

              {compliance.license ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                  {([
                    ['Name',         compliance.license.full_name],
                    ['CDL #',        compliance.license.cdl_number],
                    ['Class',        compliance.license.cdl_class ? `Class ${compliance.license.cdl_class}` : null],
                    ['State',        compliance.license.issued_state],
                    ['Endorsements', compliance.license.endorsements],
                    ['Restrictions', compliance.license.restrictions],
                    ['DOB',          compliance.license.dob],
                    ['Expires',      compliance.license.expiry],
                  ] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} style={{ padding: '.5rem .7rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>{k}</div>
                      <div style={{ fontWeight: 700, fontSize: '.78rem', marginTop: 2, color: k === 'Expires' ? expiryColor(daysUntil(compliance.license!.expiry)) : 'var(--text)' }}>{v}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '.75rem', color: 'var(--muted)', padding: '.8rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', textAlign: 'center' }}>
                  No license scanned yet. Go to the <strong style={{ color: 'var(--text)' }}>Personal</strong> tab to scan your CDL.
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button"
                  onClick={() => licenseInputRef.current?.click()}
                  disabled={scanning.license}
                  style={{ padding: '.6rem 1.2rem', borderRadius: 9, border: 'none', background: scanning.license ? 'rgba(0,232,176,.12)' : 'var(--primary)', color: scanning.license ? 'var(--primary)' : '#061210', fontWeight: 800, fontSize: '.78rem', cursor: scanning.license ? 'wait' : 'pointer' }}>
                  {scanning.license ? '⏳ Scanning…' : compliance.license ? '🔄 Rescan / Upload' : '📷 Scan or Upload'}
                </button>
                {compliance.license && (
                  <button type="button"
                    onClick={() => { const next = { ...compliance }; delete next.license; void persistCompliance(next) }}
                    style={{ padding: '.6rem .9rem', borderRadius: 9, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontWeight: 600, fontSize: '.75rem', cursor: 'pointer' }}>
                    Clear
                  </button>
                )}
              </div>
              {scanMsg.license && (
                <div style={{ fontSize: '.72rem', padding: '.45rem .75rem', borderRadius: 9, background: scanMsg.license.startsWith('✅') ? 'rgba(40,192,72,.07)' : 'rgba(232,64,0,.07)', border: `1px solid ${scanMsg.license.startsWith('✅') ? 'rgba(40,192,72,.2)' : 'rgba(232,64,0,.2)'}`, color: scanMsg.license.startsWith('✅') ? 'var(--success)' : 'var(--error)' }}>
                  {scanMsg.license}
                </div>
              )}
            </div>

            {/* ── Vehicle Registration ── */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>🚛 Vehicle Registration</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>Scanned from your registration card — auto-fills VIN, year, make &amp; model.</div>
                </div>
                {compliance.registration ? (
                  <div style={{ padding: '.28rem .65rem', borderRadius: 7, fontSize: '.6rem', fontWeight: 800, letterSpacing: '.05em',
                    background: `${expiryColor(daysUntil(compliance.registration.expiry))}18`,
                    border: `1px solid ${expiryColor(daysUntil(compliance.registration.expiry))}44`,
                    color: expiryColor(daysUntil(compliance.registration.expiry)) }}>
                    {expiryLabel(daysUntil(compliance.registration.expiry), compliance.registration.expiry)}
                  </div>
                ) : <div style={{ fontSize: '.65rem', color: 'var(--muted)' }}>Not scanned</div>}
              </div>

              {compliance.registration ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                  {([
                    ['Year',       compliance.registration.year],
                    ['Make',       compliance.registration.make],
                    ['Model',      compliance.registration.model],
                    ['VIN',        compliance.registration.vin],
                    ['Plate',      compliance.registration.plate ? `${compliance.registration.plate}${compliance.registration.plate_state ? ' · ' + compliance.registration.plate_state : ''}` : null],
                    ['Reg. Weight', compliance.registration.registered_weight ? `${compliance.registration.registered_weight.toLocaleString()} lbs` : null],
                    ['Owner',      compliance.registration.owner_name],
                    ['Expires',    compliance.registration.expiry],
                  ] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} style={{ padding: '.5rem .7rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>{k}</div>
                      <div style={{ fontWeight: 700, fontSize: '.78rem', marginTop: 2, color: k === 'Expires' ? expiryColor(daysUntil(compliance.registration!.expiry)) : 'var(--text)' }}>{v}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '.75rem', color: 'var(--muted)', padding: '.8rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', textAlign: 'center' }}>
                  No registration scanned yet. Go to the <strong style={{ color: 'var(--text)' }}>Vehicle</strong> tab to scan your registration card.
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button"
                  onClick={() => registrationInputRef.current?.click()}
                  disabled={scanning.registration}
                  style={{ padding: '.6rem 1.2rem', borderRadius: 9, border: 'none', background: scanning.registration ? 'rgba(0,232,176,.12)' : 'var(--primary)', color: scanning.registration ? 'var(--primary)' : '#061210', fontWeight: 800, fontSize: '.78rem', cursor: scanning.registration ? 'wait' : 'pointer' }}>
                  {scanning.registration ? '⏳ Scanning…' : compliance.registration ? '🔄 Rescan / Upload' : '📷 Scan or Upload'}
                </button>
                {compliance.registration && (
                  <button type="button"
                    onClick={() => { const next = { ...compliance }; delete next.registration; void persistCompliance(next) }}
                    style={{ padding: '.6rem .9rem', borderRadius: 9, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontWeight: 600, fontSize: '.75rem', cursor: 'pointer' }}>
                    Clear
                  </button>
                )}
              </div>
              {scanMsg.registration && (
                <div style={{ fontSize: '.72rem', padding: '.45rem .75rem', borderRadius: 9, background: scanMsg.registration.startsWith('✅') ? 'rgba(40,192,72,.07)' : 'rgba(232,64,0,.07)', border: `1px solid ${scanMsg.registration.startsWith('✅') ? 'rgba(40,192,72,.2)' : 'rgba(232,64,0,.2)'}`, color: scanMsg.registration.startsWith('✅') ? 'var(--success)' : 'var(--error)' }}>
                  {scanMsg.registration}
                </div>
              )}
            </div>

            {/* ── Insurance ── */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>🛡 Insurance</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>Scanned from your insurance card or declaration page.</div>
                </div>
                {compliance.insurance ? (
                  <div style={{ padding: '.28rem .65rem', borderRadius: 7, fontSize: '.6rem', fontWeight: 800, letterSpacing: '.05em',
                    background: `${expiryColor(daysUntil(compliance.insurance.expiry))}18`,
                    border: `1px solid ${expiryColor(daysUntil(compliance.insurance.expiry))}44`,
                    color: expiryColor(daysUntil(compliance.insurance.expiry)) }}>
                    {expiryLabel(daysUntil(compliance.insurance.expiry), compliance.insurance.expiry)}
                  </div>
                ) : <div style={{ fontSize: '.65rem', color: 'var(--muted)' }}>Not scanned</div>}
              </div>

              {compliance.insurance ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                  {([
                    ['Insurer',       compliance.insurance.insurer],
                    ['Policy #',      compliance.insurance.policy_number],
                    ['Coverage',      compliance.insurance.coverage_type],
                    ['Limit',         compliance.insurance.coverage_limit],
                    ['Named Insured', compliance.insurance.named_insured],
                    ['Effective',     compliance.insurance.effective],
                    ['Expires',       compliance.insurance.expiry],
                    ['Agent',         compliance.insurance.agent_name],
                    ['Agent Phone',   compliance.insurance.agent_phone],
                  ] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} style={{ padding: '.5rem .7rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>{k}</div>
                      <div style={{ fontWeight: 700, fontSize: '.78rem', marginTop: 2, color: k === 'Expires' ? expiryColor(daysUntil(compliance.insurance!.expiry)) : 'var(--text)' }}>{v}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '.75rem', color: 'var(--muted)', padding: '.8rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', textAlign: 'center' }}>
                  No insurance scanned yet. Tap the button below to scan your insurance card.
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button"
                  onClick={() => insuranceInputRef.current?.click()}
                  disabled={scanning.insurance}
                  style={{ padding: '.6rem 1.2rem', borderRadius: 9, border: 'none', background: scanning.insurance ? 'rgba(0,232,176,.12)' : 'var(--primary)', color: scanning.insurance ? 'var(--primary)' : '#061210', fontWeight: 800, fontSize: '.78rem', cursor: scanning.insurance ? 'wait' : 'pointer' }}>
                  {scanning.insurance ? '⏳ Scanning…' : compliance.insurance ? '🔄 Rescan / Upload' : '📷 Scan or Upload'}
                </button>
                {compliance.insurance && (
                  <button type="button"
                    onClick={() => { const next = { ...compliance }; delete next.insurance; void persistCompliance(next) }}
                    style={{ padding: '.6rem .9rem', borderRadius: 9, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontWeight: 600, fontSize: '.75rem', cursor: 'pointer' }}>
                    Clear
                  </button>
                )}
              </div>
              {scanMsg.insurance && (
                <div style={{ fontSize: '.72rem', padding: '.45rem .75rem', borderRadius: 9, background: scanMsg.insurance.startsWith('✅') ? 'rgba(40,192,72,.07)' : 'rgba(232,64,0,.07)', border: `1px solid ${scanMsg.insurance.startsWith('✅') ? 'rgba(40,192,72,.2)' : 'rgba(232,64,0,.2)'}`, color: scanMsg.insurance.startsWith('✅') ? 'var(--success)' : 'var(--error)' }}>
                  {scanMsg.insurance}
                </div>
              )}
            </div>

            {/* ── DOT Medical Card ── */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>🩺 DOT Medical Card</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>DOT Medical Examiner&apos;s Certificate — required for CDL operation.</div>
                </div>
                {compliance.medical ? (
                  <div style={{ padding: '.28rem .65rem', borderRadius: 7, fontSize: '.6rem', fontWeight: 800, letterSpacing: '.05em',
                    background: `${expiryColor(daysUntil(compliance.medical.expiry))}18`,
                    border: `1px solid ${expiryColor(daysUntil(compliance.medical.expiry))}44`,
                    color: expiryColor(daysUntil(compliance.medical.expiry)) }}>
                    {expiryLabel(daysUntil(compliance.medical.expiry), compliance.medical.expiry)}
                  </div>
                ) : <div style={{ fontSize: '.65rem', color: 'var(--muted)' }}>Not scanned</div>}
              </div>

              {compliance.medical ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                  {([
                    ['Card #',    compliance.medical.card_number],
                    ['Examiner',  compliance.medical.examiner_name],
                    ['NPI',       compliance.medical.examiner_npi],
                    ['Driver',    compliance.medical.driver_name],
                    ['Issued',    compliance.medical.issued],
                    ['Expires',   compliance.medical.expiry],
                    ['Restrictions', compliance.medical.restrictions],
                    ['Waivers',   [compliance.medical.vision_waiver && 'Vision', compliance.medical.hearing_waiver && 'Hearing'].filter(Boolean).join(', ') || null],
                  ] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} style={{ padding: '.5rem .7rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', ...(k === 'Restrictions' || k === 'Waivers' || k === 'Examiner' ? { gridColumn: '1 / -1' } : {}) }}>
                      <div style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>{k}</div>
                      <div style={{ fontWeight: 700, fontSize: '.78rem', marginTop: 2, color: k === 'Expires' ? expiryColor(daysUntil(compliance.medical!.expiry)) : 'var(--text)' }}>{v}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '.75rem', color: 'var(--muted)', padding: '.8rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', textAlign: 'center' }}>
                  No medical card scanned yet. Take a photo of your DOT Medical Examiner&apos;s Certificate.
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button"
                  onClick={() => medicalInputRef.current?.click()}
                  disabled={scanning.medical}
                  style={{ padding: '.6rem 1.2rem', borderRadius: 9, border: 'none', background: scanning.medical ? 'rgba(0,232,176,.12)' : 'var(--primary)', color: scanning.medical ? 'var(--primary)' : '#061210', fontWeight: 800, fontSize: '.78rem', cursor: scanning.medical ? 'wait' : 'pointer' }}>
                  {scanning.medical ? '⏳ Scanning…' : compliance.medical ? '🔄 Rescan / Upload' : '📷 Scan or Upload'}
                </button>
                {compliance.medical && (
                  <button type="button"
                    onClick={() => { const next = { ...compliance }; delete next.medical; void persistCompliance(next) }}
                    style={{ padding: '.6rem .9rem', borderRadius: 9, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontWeight: 600, fontSize: '.75rem', cursor: 'pointer' }}>
                    Clear
                  </button>
                )}
              </div>
              {scanMsg.medical && (
                <div style={{ fontSize: '.72rem', padding: '.45rem .75rem', borderRadius: 9, background: scanMsg.medical.startsWith('✅') ? 'rgba(40,192,72,.07)' : 'rgba(232,64,0,.07)', border: `1px solid ${scanMsg.medical.startsWith('✅') ? 'rgba(40,192,72,.2)' : 'rgba(232,64,0,.2)'}`, color: scanMsg.medical.startsWith('✅') ? 'var(--success)' : 'var(--error)' }}>
                  {scanMsg.medical}
                </div>
              )}
            </div>

            {/* ── Bobtail / Empty Miles Log ── */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>🛣 Bobtail &amp; Empty Log</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>Track non-revenue miles &amp; time — bobtail (no trailer) and empty (no load).</div>
                </div>
                <button type="button" onClick={() => setDhAdding(v => !v)}
                  style={{ padding: '.5rem .95rem', borderRadius: 9, border: dhAdding ? '1px solid var(--border)' : 'none', background: dhAdding ? 'none' : 'var(--primary)', color: dhAdding ? 'var(--muted)' : '#061210', fontWeight: 800, fontSize: '.75rem', cursor: 'pointer', flexShrink: 0 }}>
                  {dhAdding ? 'Cancel' : '+ Log Entry'}
                </button>
              </div>

              {/* ── Add entry form ── */}
              {dhAdding && (
                <div style={{ display: 'grid', gap: '.75rem', padding: '1rem', borderRadius: 12, background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.15)' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['bobtail', 'empty'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setDhForm(p => ({ ...p, type: t }))}
                        style={{ flex: 1, padding: '.55rem', borderRadius: 9, border: `1px solid ${dhForm.type === t ? 'rgba(0,232,176,.4)' : 'var(--border)'}`, background: dhForm.type === t ? 'rgba(0,232,176,.1)' : 'none', color: dhForm.type === t ? 'var(--primary)' : 'var(--muted)', fontWeight: 800, fontSize: '.78rem', cursor: 'pointer' }}>
                        {t === 'bobtail' ? '🚛 Bobtail' : '📦 Empty Trailer'}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.65rem' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={lbl}>Date</label>
                      <input style={inp} type="date" value={dhForm.date} onChange={e => setDhForm(p => ({ ...p, date: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Miles</label>
                      <input style={inp} type="text" inputMode="numeric" placeholder="0" value={dhForm.miles ?? ''} onChange={e => setDhForm(p => ({ ...p, miles: parseFloat(e.target.value) || null }))} />
                    </div>
                    <div>
                      <label style={lbl}>Hours</label>
                      <input style={inp} type="text" inputMode="decimal" placeholder="0.0" value={dhForm.duration_hrs ?? ''} onChange={e => setDhForm(p => ({ ...p, duration_hrs: parseFloat(e.target.value) || null }))} />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Notes (optional)</label>
                    <input style={inp} type="text" placeholder="e.g. yard move, swap trailer, deadhead to shipper" value={dhForm.notes} onChange={e => setDhForm(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                  <button type="button" onClick={addDhEntry}
                    style={{ padding: '.65rem', borderRadius: 9, border: 'none', background: 'var(--primary)', color: '#061210', fontWeight: 800, fontSize: '.82rem', cursor: 'pointer' }}>
                    Save Entry
                  </button>
                </div>
              )}

              {/* ── Monthly summary ── */}
              {dhLog.length > 0 && (() => {
                const now   = new Date()
                const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
                const thisMonth = dhLog.filter(e => e.date.startsWith(month))
                const bobtailMi = thisMonth.filter(e=>e.type==='bobtail').reduce((s,e)=>s+(e.miles??0),0)
                const emptyMi   = thisMonth.filter(e=>e.type==='empty').reduce((s,e)=>s+(e.miles??0),0)
                const bobtailHr = thisMonth.filter(e=>e.type==='bobtail').reduce((s,e)=>s+(e.duration_hrs??0),0)
                const emptyHr   = thisMonth.filter(e=>e.type==='empty').reduce((s,e)=>s+(e.duration_hrs??0),0)
                if (!thisMonth.length) return null
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                    {[
                      ['🚛 Bobtail mi',  bobtailMi > 0 ? bobtailMi.toLocaleString() : '—'],
                      ['📦 Empty mi',    emptyMi   > 0 ? emptyMi.toLocaleString()   : '—'],
                      ['🚛 Bobtail hrs', bobtailHr > 0 ? bobtailHr.toFixed(1)       : '—'],
                      ['📦 Empty hrs',   emptyHr   > 0 ? emptyHr.toFixed(1)         : '—'],
                    ].map(([k,v]) => (
                      <div key={k} style={{ padding: '.5rem .7rem', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>{k} <span style={{ color: 'var(--primary)' }}>this mo.</span></div>
                        <div style={{ fontWeight: 800, fontSize: '.95rem', color: 'var(--primary)', marginTop: 2 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* ── Log entries ── */}
              {dhLog.length === 0 ? (
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', textAlign: 'center', padding: '.6rem' }}>No entries yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', maxHeight: 320, overflowY: 'auto' }}>
                  {dhLog.map(e => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '.55rem .75rem', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <div style={{ flexShrink: 0, fontSize: '.75rem' }}>{e.type === 'bobtail' ? '🚛' : '📦'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '.75rem', color: 'var(--text)' }}>
                          {e.type === 'bobtail' ? 'Bobtail' : 'Empty'} · {new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                        <div style={{ fontSize: '.65rem', color: 'var(--muted)' }}>
                          {[e.miles != null && `${e.miles} mi`, e.duration_hrs != null && `${e.duration_hrs}h`, e.notes].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <button type="button" onClick={() => deleteDhEntry(e.id)}
                        style={{ flexShrink: 0, padding: '.25rem .5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontSize: '.65rem', cursor: 'pointer' }}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Compliance overview banner ── */}
            {(compliance.license || compliance.registration || compliance.insurance || compliance.medical) && (
              <div style={{ padding: '1rem 1.2rem', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', display: 'grid', gap: '.65rem' }}>
                {secHead('Expiry Summary')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                  {[
                    ['CDL',          compliance.license?.expiry],
                    ['Medical Card', compliance.medical?.expiry],
                    ['Registration', compliance.registration?.expiry],
                    ['Insurance',    compliance.insurance?.expiry],
                  ].map(([label, expiry]) => {
                    const days = daysUntil(expiry as string | undefined)
                    const color = expiryColor(days)
                    return (
                      <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.75rem', padding: '.4rem .6rem', borderRadius: 8, background: expiry ? `${color}0a` : 'transparent', border: `1px solid ${expiry ? `${color}22` : 'var(--border)'}` }}>
                        <span style={{ fontWeight: 700, color: 'var(--text)' }}>{label as string}</span>
                        <span style={{ fontWeight: 800, color: expiry ? color : 'var(--muted)' }}>{expiry ? expiryLabel(days, expiry as string) : '—'}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ SYSTEM TAB ══════════════════════════════════════════════════════ */}
        {tab === 'system' && (
          <div style={{ display: 'grid', gap: '1rem' }}>

            {/* ── Samsara / ELD Integration ── */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>Samsara ELD Integration</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>Live HOS, GPS location, and today&apos;s miles on the Command Center.</div>
                </div>
                {badge('📡 Live')}
              </div>

              {secHead('Personal API Token')}
              <div style={{ fontSize: '.7rem', color: 'var(--muted)', lineHeight: 1.6, padding: '.6rem .8rem', borderRadius: 9, background: 'rgba(0,232,176,.04)', border: '1px solid rgba(0,232,176,.1)' }}>
                <strong style={{ color: 'var(--text)' }}>How to get your token:</strong><br />
                1. Log in to <strong>cloud.samsara.com</strong><br />
                2. Go to <strong>Settings → API Tokens → Personal API Tokens</strong><br />
                3. Create a token with <em>read:fleet</em> scope<br />
                4. Paste it below — stored locally on this device only
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type={showToken ? 'text' : 'password'}
                  placeholder="samsara_api_…"
                  value={samsaraToken}
                  onChange={e => { setSamsaraToken(e.target.value); setTokenSaved(false); setTokenTestMsg('') }}
                  style={{ ...inp, flex: 1, fontFamily: showToken ? 'inherit' : 'monospace', fontSize: '.78rem' }}
                />
                <button onClick={() => setShowToken(v => !v)}
                  style={{ padding: '.6rem .8rem', borderRadius: 9, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.75rem' }}>
                  {showToken ? '🙈' : '👁'}
                </button>
              </div>

              {tokenTestMsg && (
                <div style={{ fontSize: '.72rem', padding: '.45rem .7rem', borderRadius: 8, background: tokenTestMsg.startsWith('✅') ? 'rgba(40,192,72,.08)' : 'rgba(232,64,0,.07)', border: `1px solid ${tokenTestMsg.startsWith('✅') ? 'rgba(40,192,72,.2)' : 'rgba(232,64,0,.2)'}`, color: tokenTestMsg.startsWith('✅') ? 'var(--success)' : 'var(--error)' }}>
                  {tokenTestMsg}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={testSamsaraToken} disabled={tokenTesting || !samsaraToken}
                  style={{ padding: '.6rem 1.1rem', borderRadius: 9, border: '1px solid rgba(0,232,176,.3)', background: 'rgba(0,232,176,.06)', color: 'var(--primary)', fontWeight: 700, fontSize: '.78rem', cursor: tokenTesting ? 'wait' : 'pointer', opacity: !samsaraToken ? .5 : 1 }}>
                  {tokenTesting ? '📡 Testing…' : '📡 Test connection'}
                </button>
                <button onClick={saveSamsaraToken} disabled={!samsaraToken}
                  style={{ padding: '.6rem 1.4rem', borderRadius: 9, border: 'none', background: tokenSaved ? 'var(--success)' : 'var(--primary)', color: '#061210', fontWeight: 800, fontSize: '.78rem', cursor: 'pointer', opacity: !samsaraToken ? .5 : 1 }}>
                  {tokenSaved ? '✓ Saved!' : 'Save token'}
                </button>
                {samsaraToken && (
                  <button onClick={() => { setSamsaraToken(''); localStorage.removeItem('samsara-api-token') }}
                    style={{ padding: '.6rem .9rem', borderRadius: 9, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontWeight: 600, fontSize: '.78rem', cursor: 'pointer' }}>
                    Clear
                  </button>
                )}
              </div>

              {secHead('Server-side token (Vercel env)')}
              <div style={{ fontSize: '.7rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                For a permanent setup (all devices), add <code style={{ background: 'rgba(0,232,176,.08)', padding: '.1rem .3rem', borderRadius: 4, color: 'var(--primary)' }}>SAMSARA_API_TOKEN</code> to your Vercel project environment variables. The server-side token takes priority over the personal token above.
              </div>
            </div>

            {/* ── Spotify Integration ── */}
            <SpotifySettingsSection />

            {/* ── Data Management ── */}
            <div style={card}>
              <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>Data Management</div>

              {secHead('Export')}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={exportAllData}
                  style={{ padding: '.65rem 1.1rem', borderRadius: 9, border: '1px solid rgba(0,232,176,.3)', background: 'rgba(0,232,176,.06)', color: 'var(--primary)', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer' }}>
                  📦 Export all data (JSON)
                </button>
                <button onClick={exportExpensesCSV}
                  style={{ padding: '.65rem 1.1rem', borderRadius: 9, border: '1px solid rgba(0,232,176,.2)', background: 'transparent', color: 'var(--primary)', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer' }}>
                  📊 Export expenses (CSV)
                </button>
              </div>
              <div style={{ fontSize: '.65rem', color: 'var(--muted)' }}>
                JSON backup includes all local data — expenses, settings, vehicle, active trip, HOS. Import coming soon.
              </div>

              {secHead('Clear individual data')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {DATA_STORES.map(({ key, label, emoji }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.5rem .7rem', borderRadius: 9, background: 'rgba(0,0,0,.15)', gap: 8 }}>
                    <span style={{ fontSize: '.78rem', fontWeight: 600 }}>{emoji} {label}</span>
                    {clearTarget === key && !clearConfirm ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setClearConfirm(true) }}
                          style={{ padding: '.28rem .7rem', borderRadius: 6, border: '1px solid rgba(232,64,0,.4)', background: 'rgba(232,64,0,.1)', color: 'var(--error)', fontWeight: 700, fontSize: '.68rem', cursor: 'pointer' }}>
                          Confirm clear
                        </button>
                        <button onClick={() => setClearTarget('')}
                          style={{ padding: '.28rem .6rem', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontSize: '.68rem', cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    ) : clearTarget === key && clearConfirm ? (
                      <button onClick={() => clearData(key)}
                        style={{ padding: '.28rem .7rem', borderRadius: 6, border: 'none', background: 'var(--error)', color: '#fff', fontWeight: 800, fontSize: '.68rem', cursor: 'pointer' }}>
                        ⚠️ Clear now
                      </button>
                    ) : (
                      <button onClick={() => { setClearTarget(key); setClearConfirm(false) }}
                        style={{ padding: '.28rem .65rem', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontWeight: 600, fontSize: '.68rem', cursor: 'pointer' }}>
                        Clear
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── App Info ── */}
            <div style={{ ...card, gap: '.6rem' }}>
              <div style={{ fontWeight: 800, fontSize: 'var(--text-base)' }}>App Info</div>
              {[
                ['App', '3B Fleet Commander'],
                ['Version', '1.0.0 (PWA)'],
                ['Mode', typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches ? '📱 Installed (standalone)' : '🌐 Browser'],
                ['Data', 'localStorage + Supabase cloud'],
                ['Offline', 'Service worker active'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '.4rem' }}>
                  <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{k}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>{v}</span>
                </div>
              ))}
            </div>

          </div>
        )}

      </main>

      {/* ── Hidden file inputs — no capture= so iOS shows: Take Photo / Library / Browse ── */}
      <input ref={licenseInputRef}      type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleLicenseScan}      />
      <input ref={registrationInputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleRegistrationScan} />
      <input ref={insuranceInputRef}    type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleInsuranceScan}    />
      <input ref={medicalInputRef}      type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleMedicalScan}      />

      <UserModeSelectorSheet
        open={showModeSelector}
        onClose={() => { setShowModeSelector(false); setUserMode(readUserMode()) }}
      />
    </>
  )
}

// ── Spotify Settings Section ──────────────────────────────────────────────────
const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? ''
const SPOTIFY_LS = {
  accessToken:  'spotify_access_token',
  refreshToken: 'spotify_refresh_token',
  expiresAt:    'spotify_expires_at',
  clientId:     'spotify_client_id',
}

function SpotifySettingsSection() {
  const [isConnected,   setIsConnected]   = useState(false)
  const [trackName,     setTrackName]     = useState('')

  useEffect(() => {
    // Seed client ID from env var
    if (CLIENT_ID && !localStorage.getItem(SPOTIFY_LS.clientId)) {
      localStorage.setItem(SPOTIFY_LS.clientId, CLIENT_ID)
    }
    const tok = localStorage.getItem(SPOTIFY_LS.accessToken) ?? ''
    setIsConnected(!!tok)
    if (tok) {
      fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { Authorization: `Bearer ${tok}` },
      })
        .then(r => r.status === 200 ? r.json() : null)
        .then(data => { if (data?.item?.name) setTrackName(data.item.name) })
        .catch(() => {})
    }
  }, [])

  function handleConnect() {
    const cid = CLIENT_ID || localStorage.getItem(SPOTIFY_LS.clientId) || ''
    if (!cid) return
    const params = new URLSearchParams({
      client_id:     cid,
      response_type: 'code',
      redirect_uri:  `${window.location.origin}/api/spotify/callback`,
      scope:         'user-read-playback-state user-modify-playback-state user-read-currently-playing',
    })
    window.location.href = `https://accounts.spotify.com/authorize?${params}`
  }

  function handleDisconnect() {
    Object.values(SPOTIFY_LS).forEach(k => localStorage.removeItem(k))
    setIsConnected(false)
    setTrackName('')
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)', border: `1px solid ${isConnected ? 'rgba(30,215,96,.3)' : 'var(--border)'}`,
    borderRadius: 16, padding: '1.1rem 1.1rem .9rem',
    display: 'flex', flexDirection: 'column', gap: '.8rem',
  }

  return (
    <div id="spotify" style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.3rem' }}>🎵</span> Spotify
          </div>
          <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>
            Play/pause, skip &amp; see what&apos;s playing on the driving dashboard
          </div>
        </div>
        {isConnected && (
          <span style={{ fontSize: '.6rem', fontWeight: 800, color: '#1ed760', background: 'rgba(30,215,96,.1)', border: '1px solid rgba(30,215,96,.3)', borderRadius: 6, padding: '.2rem .5rem', whiteSpace: 'nowrap' }}>
            ✓ Connected
          </span>
        )}
      </div>

      {/* Now playing */}
      {isConnected && trackName && (
        <div style={{ padding: '.5rem .75rem', borderRadius: 10, background: 'rgba(30,215,96,.06)', border: '1px solid rgba(30,215,96,.2)', fontSize: '.78rem', color: '#1ed760', fontWeight: 700 }}>
          🎵 Now playing: {trackName}
        </div>
      )}

      {/* Connect / disconnect */}
      {!isConnected ? (
        <button
          onClick={handleConnect}
          style={{ padding: '.7rem 1.2rem', borderRadius: 10, border: 'none', background: '#1ed760', color: '#000', fontWeight: 800, fontSize: '.88rem', cursor: 'pointer' }}
        >
          Connect Spotify →
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, fontSize: '.65rem', color: 'var(--faint)' }}>
            Tokens stored · auto-refreshes
          </div>
          <button
            onClick={handleDisconnect}
            style={{ padding: '.45rem .9rem', borderRadius: 8, border: '1px solid rgba(232,64,0,.3)', background: 'rgba(232,64,0,.06)', color: 'var(--error)', fontWeight: 700, fontSize: '.72rem', cursor: 'pointer' }}
          >
            Disconnect
          </button>
        </div>
      )}

      <div style={{ fontSize: '.62rem', color: 'var(--faint)', lineHeight: 1.5 }}>
        ℹ️ Reading current track works on free Spotify. Play/pause and skip require <strong>Spotify Premium</strong>.
      </div>
    </div>
  )
}

