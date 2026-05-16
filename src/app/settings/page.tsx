'use client'
import { useState, useEffect } from 'react'
import TopBar from '@/components/layout/TopBar'
import { loadSettings, persistSettings, DEFAULT_SETTINGS, type AppSettings } from '@/lib/settings'
import { createClient } from '@/lib/supabase-browser'

const inp: React.CSSProperties = { width: '100%', padding: '.8rem 1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', outline: 'none', fontSize: 'var(--text-sm)', color: 'var(--text)' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }

type Profile = {
  full_name: string
  role: string
  three_b_id: string
  three_b_biz_id: string
}

const EMPTY_PROFILE: Profile = { full_name: '', role: '', three_b_id: '', three_b_biz_id: '' }

export default function Settings() {
  const [s,        setS]        = useState<AppSettings>(DEFAULT_SETTINGS)
  const [profile,  setProfile]  = useState<Profile>(EMPTY_PROFILE)
  const [saved,    setSaved]    = useState(false)
  const [profSaved,setProfSaved]= useState(false)
  const [profErr,  setProfErr]  = useState('')
  const [profLoading, setProfLoading] = useState(false)
  const supabase = createClient()

  // Load localStorage settings
  useEffect(() => { setS(loadSettings()) }, [])

  // Load Supabase profile
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name,role,three_b_id,three_b_biz_id')
        .eq('id', data.user.id)
        .single()
      if (prof) setProfile({
        full_name:     prof.full_name    ?? '',
        role:          prof.role         ?? '',
        three_b_id:    prof.three_b_id   ?? '',
        three_b_biz_id:prof.three_b_biz_id ?? '',
      })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function set(k: keyof AppSettings, v: string) {
    setS(prev => ({ ...prev, [k]: typeof prev[k] === 'number' ? Number(v) || 0 : v }))
    setSaved(false)
  }

  function setP(k: keyof Profile, v: string) {
    setProfile(prev => ({ ...prev, [k]: v }))
    setProfSaved(false)
    setProfErr('')
  }

  // Save localStorage settings
  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    persistSettings(s)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function handleReset() {
    setS(DEFAULT_SETTINGS)
    persistSettings(DEFAULT_SETTINGS)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // Save Supabase profile
  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault()
    setProfLoading(true)
    setProfErr('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setProfErr('Not signed in.'); setProfLoading(false); return }

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id:             user.id,
        email:          user.email,
        full_name:      profile.full_name     || null,
        role:           profile.role          || null,
        three_b_id:     profile.three_b_id    || null,
        three_b_biz_id: profile.three_b_biz_id || null,
        updated_at:     new Date().toISOString(),
      })

    setProfLoading(false)
    if (error) {
      setProfErr(error.message)
    } else {
      setProfSaved(true)
      setTimeout(() => setProfSaved(false), 2500)
    }
  }

  return (
    <>
      <TopBar title="Settings" module="sys" subtitle="Identity · pay defaults · CPM rates" />
      <main style={{ padding: '1.4rem', display: 'grid', gap: '1.4rem', maxWidth: 640 }}>

        {/* ── SUPABASE PROFILE (saved to DB) ── */}
        <form onSubmit={handleProfileSave} style={{ display: 'grid', gap: '1.4rem' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.8rem', display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Your identity</h2>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', marginTop: 3 }}>
                  Saved to your account — shows in the sidebar and on every device.
                </p>
              </div>
              <div style={{ padding: '.3rem .65rem', borderRadius: 8, background: 'rgba(0,232,176,.08)', border: '1px solid rgba(0,232,176,.15)', fontSize: 'var(--text-xs)', color: 'var(--primary)', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                ☁ Supabase
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Full name</label>
                <input value={profile.full_name} onChange={e => setP('full_name', e.target.value)} placeholder="e.g. Brandon B." style={inp} />
              </div>
              <div>
                <label style={lbl}>Role</label>
                <input value={profile.role} onChange={e => setP('role', e.target.value)} placeholder="e.g. Owner-Operator" style={inp} />
              </div>
              <div>
                <label style={lbl}>3B Driver ID</label>
                <input value={profile.three_b_id} onChange={e => setP('three_b_id', e.target.value)} placeholder="e.g. 3B-0042" style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>3B Business ID</label>
                <input value={profile.three_b_biz_id} onChange={e => setP('three_b_biz_id', e.target.value)} placeholder="e.g. 3BBIZ-001" style={inp} />
              </div>
            </div>

            {profErr && (
              <div style={{ padding: '.75rem 1rem', borderRadius: 12, background: 'rgba(255,80,80,.08)', border: '1px solid rgba(255,80,80,.2)', color: 'var(--error)', fontSize: 'var(--text-sm)' }}>
                {profErr}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={profLoading}
                style={{ padding: '.8rem 2rem', borderRadius: 12, background: profSaved ? 'var(--success)' : 'var(--primary)', color: '#061210', fontWeight: 700, fontSize: 'var(--text-sm)', transition: '200ms', opacity: profLoading ? .6 : 1 }}>
                {profLoading ? 'Saving…' : profSaved ? '✓ Saved to account!' : 'Save identity'}
              </button>
            </div>
          </div>
        </form>

        {/* ── LOCAL SETTINGS (saved to localStorage) ── */}
        <form onSubmit={handleSave} style={{ display: 'grid', gap: '1.4rem' }}>

          {/* Driver profile (local) */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.8rem', display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Driver &amp; dispatch</h2>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', marginTop: 3 }}>Used in dispute scripts and AI load analysis.</p>
              </div>
              <div style={{ padding: '.3rem .65rem', borderRadius: 8, background: 'rgba(245,194,0,.07)', border: '1px solid rgba(245,194,0,.15)', fontSize: 'var(--text-xs)', color: '#f5c200', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                ⚡ Local
              </div>
            </div>
            <div>
              <label style={lbl}>Company / DBA name</label>
              <input value={s.driverName} onChange={e => set('driverName', e.target.value)} placeholder="e.g. 3B Transport LLC" style={inp} />
            </div>
            <div>
              <label style={lbl}>Dispatcher name</label>
              <input value={s.dispatcher} onChange={e => set('dispatcher', e.target.value)} placeholder="e.g. Trev" style={inp} />
            </div>
          </div>

          {/* CPM defaults */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.8rem', display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>CPM &amp; pay defaults</h2>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', marginTop: 3 }}>Drives the pay analysis and default rate on new loads.</p>
              </div>
              <div style={{ padding: '.3rem .65rem', borderRadius: 8, background: 'rgba(245,194,0,.07)', border: '1px solid rgba(245,194,0,.15)', fontSize: 'var(--text-xs)', color: '#f5c200', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                ⚡ Local
              </div>
            </div>
            <div>
              <label style={lbl}>Default CPM rate</label>
              <input value={s.defaultCpm} onChange={e => set('defaultCpm', e.target.value)} type="number" step="0.001" style={inp} />
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 4 }}>Pre-filled on every new load entry</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={lbl}>Pay analysis — low CPM</label>
                <input value={s.cpmLow} onChange={e => set('cpmLow', e.target.value)} type="number" step="0.001" style={inp} />
              </div>
              <div>
                <label style={lbl}>Pay analysis — high CPM</label>
                <input value={s.cpmHigh} onChange={e => set('cpmHigh', e.target.value)} type="number" step="0.001" style={inp} />
              </div>
            </div>
            <div style={{ padding: '.75rem 1rem', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
              Dashboard pay analysis will show: <strong style={{ color: 'var(--text)' }}>@ ${s.cpmLow.toFixed(3)} CPM</strong> and <strong style={{ color: 'var(--text)' }}>@ ${s.cpmHigh.toFixed(3)} CPM</strong>
            </div>
            <div>
              <label style={lbl}>Detention rate ($/hr)</label>
              <input value={s.detentionRate} onChange={e => set('detentionRate', e.target.value)} type="number" step="0.01" style={inp} />
            </div>
          </div>

          {/* Fuel & MPG */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.8rem', display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Fuel &amp; MPG</h2>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', marginTop: 3 }}>Used by MIS to estimate fuel cost and net pay per load.</p>
              </div>
              <div style={{ padding: '.3rem .65rem', borderRadius: 8, background: 'rgba(245,194,0,.07)', border: '1px solid rgba(245,194,0,.15)', fontSize: 'var(--text-xs)', color: '#f5c200', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                ⚡ Local
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={lbl}>Truck MPG</label>
                <input value={s.mpg} onChange={e => set('mpg', e.target.value)} type="number" step="0.1" style={inp} />
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 4 }}>Typical semi: 6–7 MPG</div>
              </div>
              <div>
                <label style={lbl}>Avg diesel price ($/gal)</label>
                <input value={s.fuelPrice} onChange={e => set('fuelPrice', e.target.value)} type="number" step="0.01" style={inp} />
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 4 }}>Check current price at pump</div>
              </div>
            </div>
            <div style={{ padding: '.75rem 1rem', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
              Estimated fuel cost per mile: <strong style={{ color: 'var(--text)' }}>${s.mpg > 0 ? (s.fuelPrice / s.mpg).toFixed(3) : '—'}</strong>
            </div>
          </div>

          {/* Supabase connection (read-only) */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.8rem', display: 'grid', gap: '1rem' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>Supabase connection</h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>Set these in Vercel → Settings → Environment Variables (not editable here).</p>
            {(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const).map(k => (
              <div key={k}>
                <label style={lbl}>{k}</label>
                <div style={{ padding: '.8rem 1rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', fontFamily: 'ui-monospace,monospace', fontSize: 'var(--text-xs)', color: 'var(--faint)', wordBreak: 'break-all' }}>
                  {typeof window !== 'undefined' && process.env[k] ? process.env[k] : '(set in Vercel)'}
                </div>
              </div>
            ))}
            <div style={{ padding: '1rem', borderRadius: 14, background: 'rgba(85,145,199,.08)', border: '1px solid rgba(85,145,199,.15)', fontSize: 'var(--text-sm)' }}>
              Get your keys at <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 700 }}>supabase.com/dashboard</a> → Project Settings → API
            </div>
          </div>

          {/* Save bar (local settings) */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
            <button type="button" onClick={handleReset}
              style={{ padding: '.8rem 1.2rem', borderRadius: 12, background: 'var(--surface-off)', border: '1px solid var(--border)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--muted)', cursor: 'pointer' }}>
              Reset to defaults
            </button>
            <button type="submit"
              style={{ padding: '.8rem 2rem', borderRadius: 12, background: saved ? 'var(--success)' : 'var(--primary)', color: '#061210', fontWeight: 700, fontSize: 'var(--text-sm)', transition: '200ms', cursor: 'pointer' }}>
              {saved ? '✓ Saved!' : 'Save local settings'}
            </button>
          </div>
        </form>

      </main>
    </>
  )
}
