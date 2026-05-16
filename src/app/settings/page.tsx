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

type Tab = 'personal' | 'vehicle' | 'pay' | 'fuel'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'personal', label: 'Personal',  icon: '👤' },
  { id: 'vehicle',  label: 'Vehicle',   icon: '🚛' },
  { id: 'pay',      label: 'Pay & CPM', icon: '💵' },
  { id: 'fuel',     label: 'Fuel',      icon: '⛽' },
]

type Profile = { full_name: string; role: string; three_b_id: string; three_b_biz_id: string }
const EMPTY_PROFILE: Profile = { full_name: '', role: '', three_b_id: '', three_b_biz_id: '' }

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
  const supabase = createClient()

  useEffect(() => { setS(loadSettings()) }, [])

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

      </main>
    </>
  )
}
