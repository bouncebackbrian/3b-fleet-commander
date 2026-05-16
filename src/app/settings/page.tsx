'use client'
import { useState, useEffect, useCallback } from 'react'
import TopBar from '@/components/layout/TopBar'
import { loadSettings, persistSettings, DEFAULT_SETTINGS, type AppSettings } from '@/lib/settings'
import { createClient } from '@/lib/supabase-browser'

// ── shared styles ──────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', padding: '.75rem 1rem', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: 'var(--text-sm)', outline: 'none', boxSizing: 'border-box',
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

type Tab = 'personal' | 'vehicle' | 'pay' | 'fuel' | 'system'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'personal', label: 'Personal',  icon: '👤' },
  { id: 'vehicle',  label: 'Vehicle',   icon: '🚛' },
  { id: 'pay',      label: 'Pay & CPM', icon: '💵' },
  { id: 'fuel',     label: 'Fuel',      icon: '⛽' },
  { id: 'system',   label: 'System',    icon: '⚙️' },
]

type Profile = { full_name: string; role: string; three_b_id: string; three_b_biz_id: string; cdl_number: string; cdl_state: string; phone: string }
const EMPTY_PROFILE: Profile = { full_name: '', role: '', three_b_id: '', three_b_biz_id: '', cdl_number: '', cdl_state: '', phone: '' }

export default function Settings() {
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
  const supabase = createClient()

  useEffect(() => {
    setS(loadSettings())
    setSamsaraToken(localStorage.getItem('samsara-api-token') ?? '')
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: prof } = await supabase
        .from('profiles').select('full_name,role,three_b_id,three_b_biz_id')
        .eq('id', data.user.id).single()
      if (prof) setProfile({
        full_name:      prof.full_name      ?? '',
        role:           prof.role           ?? '',
        three_b_id:     prof.three_b_id     ?? '',
        three_b_biz_id: prof.three_b_biz_id ?? '',
        cdl_number:     (prof as Record<string, string>).cdl_number ?? '',
        cdl_state:      (prof as Record<string, string>).cdl_state  ?? '',
        phone:          (prof as Record<string, string>).phone       ?? '',
      })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── field helpers ───────────────────────────────────────────────────────────
  function set(k: keyof AppSettings, v: string) {
    setS(prev => ({ ...prev, [k]: typeof prev[k] === 'number' ? (parseFloat(v) || 0) : v }))
    setSaved(false)
  }
  function setP(k: keyof Profile, v: string) {
    setProfile(prev => ({ ...prev, [k]: v }))
    setProfSaved(false); setProfErr('')
  }

  // ── save local settings ────────────────────────────────────────────────────
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
      id: user.id, email: user.email,
      full_name:      profile.full_name      || null,
      role:           profile.role           || null,
      three_b_id:     profile.three_b_id     || null,
      three_b_biz_id: profile.three_b_biz_id || null,
      cdl_number:     profile.cdl_number     || null,
      cdl_state:      profile.cdl_state      || null,
      phone:          profile.phone          || null,
      updated_at:     new Date().toISOString(),
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

  // ── field components (defined outside render to avoid focus loss) ──────────
  const Inp = ({ k, type = 'text', ph, step }: { k: keyof AppSettings; type?: string; ph?: string; step?: string }) => (
    <input style={inp} type={type} step={step} placeholder={ph}
      value={String(s[k])}
      onChange={e => set(k, e.target.value)} />
  )

  return (
    <>
      <TopBar title="Settings" module="sys" subtitle="Personal · Vehicle · Pay · Fuel" />
      <main style={{ padding: '1.2rem', maxWidth: 680, display: 'grid', gap: '1.2rem' }}>

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '.4rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '.35rem' }}>
          {TABS.map(t => (
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

        {/* ══ PERSONAL TAB ════════════════════════════════════════════════════ */}
        {tab === 'personal' && (
          <>
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
                  <Inp k="driverName" ph="3B Transport LLC" />
                </div>
                <div>
                  <label style={lbl}>Dispatcher name</label>
                  <Inp k="dispatcher" ph="Trev" />
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
                  <Inp k="truckNum" ph="T-001" />
                </div>
                <div>
                  <label style={lbl}>Year</label>
                  <Inp k="year" type="number" ph="2022" />
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
                  <Inp k="model" ph="389, T680, Cascadia" />
                </div>
                <div>
                  <label style={lbl}>VIN (last 8)</label>
                  <Inp k="vin" ph="optional" />
                </div>
                <div>
                  <label style={lbl}>Horsepower</label>
                  <Inp k="hp" ph="550" />
                </div>
                <div>
                  <label style={lbl}>Truck height (ft)</label>
                  <Inp k="truckHeight" type="number" step="0.1" />
                </div>
                <div>
                  <label style={lbl}>CDL class</label>
                  <select style={inp} value={s.cdlClass} onChange={e => set('cdlClass', e.target.value)}>
                    {['A','B','C'].map(c => <option key={c}>Class {c}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Endorsements</label>
                  <Inp k="endorsements" ph="H, N, T, X…" />
                </div>
              </div>
            </div>

            <div style={card}>
              {secHead('Trailer')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.85rem' }}>
                <div>
                  <label style={lbl}>Trailer number</label>
                  <Inp k="trailerNum" ph="260692" />
                </div>
                <div>
                  <label style={lbl}>Trailer type</label>
                  <select style={inp} value={s.trailerType} onChange={e => set('trailerType', e.target.value)}>
                    {[['53dry',"53′ Dry Van"],['48dry',"48′ Dry Van"],['53reefer',"53′ Reefer"],['flatbed','Flatbed'],['stepdeck','Step Deck'],['lowboy','Lowboy'],['tanker','Tanker'],['doubles','Doubles/Pups']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Trailer length (ft)</label>
                  <Inp k="trailerLen" type="number" />
                </div>
                <div>
                  <label style={lbl}>Trailer height (ft)</label>
                  <Inp k="trailerHeight" type="number" step="0.1" />
                </div>
                <div>
                  <label style={lbl}>Axles</label>
                  <select style={inp} value={s.axles} onChange={e => set('axles', e.target.value)}>
                    {[['5','5-axle (std)'],['6','6-axle'],['7','7-axle'],['3','3-axle bobtail']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Max legal weight (lbs)</label>
                  <Inp k="maxWeight" type="number" />
                </div>
                <div>
                  <label style={lbl}>GVWR (lbs)</label>
                  <Inp k="gvwr" type="number" />
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
                <Inp k="cpmReceived" type="number" step="0.001" ph="0.55" />
                <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 4 }}>Used by MIS to calculate underpayments vs what you were actually paid per mile.</div>
              </div>

              {secHead('Analysis range')}
              <div>
                <label style={lbl}>Default CPM (pre-fills new loads)</label>
                <Inp k="defaultCpm" type="number" step="0.001" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={lbl}>Low CPM (floor)</label>
                  <Inp k="cpmLow" type="number" step="0.001" />
                </div>
                <div>
                  <label style={lbl}>High CPM (target)</label>
                  <Inp k="cpmHigh" type="number" step="0.001" />
                </div>
              </div>
              <div style={{ padding: '.7rem .9rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '.7rem', color: 'var(--muted)' }}>
                Dashboard shows: <strong style={{ color: 'var(--text)' }}>@ ${s.cpmLow.toFixed(3)} CPM</strong> and <strong style={{ color: 'var(--text)' }}>@ ${s.cpmHigh.toFixed(3)} CPM</strong>
              </div>

              {secHead('Other')}
              <div>
                <label style={lbl}>Detention rate ($/hr)</label>
                <Inp k="detentionRate" type="number" step="0.01" />
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

              {secHead('Fuel price')}
              <div>
                <label style={lbl}>Diesel price ($/gal)</label>
                <Inp k="fuelPrice" type="number" step="0.001" />
                <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 4 }}>Update this whenever you fuel up for accurate cost tracking.</div>
              </div>

              {secHead('MPG')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.85rem' }}>
                <div>
                  <label style={lbl}>Loaded MPG</label>
                  <Inp k="mpgLoaded" type="number" step="0.1" />
                </div>
                <div>
                  <label style={lbl}>Empty MPG</label>
                  <Inp k="mpgEmpty" type="number" step="0.1" />
                </div>
                <div>
                  <label style={lbl}>Tank (gal)</label>
                  <Inp k="tankGal" type="number" step="1" />
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
    </>
  )
}
